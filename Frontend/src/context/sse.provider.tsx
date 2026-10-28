import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createSSEConnection } from "../services/api.service";
import { SSEContext, type SSEEventMap, type SSEEventType, type SSEHandler } from "./sse.context";
import { useAuthContext } from "./auth.context";
import { VERIFY_QUERY_KEY } from "../hooks/useVerifyLogin";

// Espera antes de reconectar: 1 s, 2 s, 4 s… hasta 30 s.
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30_000;

export const SSEProvider = ({ children }: { children: ReactNode }) => {
    const { user, isConfirmed, onAccessChanged } = useAuthContext();
    const sessionId = isConfirmed ? user?.id : undefined;
    // En un ref: la conexión no se rehace cada vez que cambia la función.
    const accessChanged = useRef(onAccessChanged);
    useEffect(() => { accessChanged.current = onAccessChanged; }, [onAccessChanged]);
    const queryClient = useQueryClient();

    // Registro de suscriptores por tipo de evento. useRef para que NO se
    // recree en cada render y persista de forma estable.
    const subscribers = useRef<{ [E in SSEEventType]: Set<SSEHandler<E>> }>({
        message_created: new Set(),
        message_status: new Set(),
        message_updated: new Set(),
        conversation_updated: new Set(),
        contact_updated: new Set(),
        contacts_updated: new Set(),
        tags_updated: new Set(),
        campaign_progress: new Set(),
        messages_imported: new Set(),
        history_sync: new Set(),
        conversation_assigned: new Set(),
        conversation_event: new Set(),
        conversation_revoked: new Set(),
        transfer_requested: new Set(),
        transfer_answered: new Set(),
        conversations_updated: new Set(),
    });

    // Abrir UNA conexión SSE, solo cuando hay sesión.
    useEffect(() => {
        if (!sessionId) return; // sin sesión confirmada no conectamos (/api/stream requiere auth)

        // Crea un despachador para un tipo de evento: parsea y reparte.
        const dispatch = <E extends SSEEventType>(event: E) => (e: MessageEvent) => {
            let data: SSEEventMap[E];
            try {
                data = JSON.parse(e.data);
            } catch {
                return; // no era JSON válido → ignorar
            }
            subscribers.current[event].forEach((handler) => handler(data));
        };

        // Si el servidor responde con error (un reinicio, un despliegue), el
        // navegador se rinde para siempre y la app se quedaba sin tiempo real
        // hasta recargar. Aquí se reconecta con espera creciente, y al volver
        // se refresca lo que haya en pantalla: los eventos del corte se perdieron.
        let connection: { close: () => void } | null = null;
        let retryTimer: ReturnType<typeof setTimeout> | undefined;
        let attempt = 0;
        let interrupted = false;
        let firstOpen = true;

        const connect = () => {
            connection = createSSEConnection("stream", {
                onMessageCreated: dispatch("message_created"),
                onMessageStatus: dispatch("message_status"),
                onMessageUpdated: dispatch("message_updated"),
                onConversationUpdated: dispatch("conversation_updated"),
                onContactUpdated: dispatch("contact_updated"),
                onContactsUpdated: dispatch("contacts_updated"),
                onTagsUpdated: dispatch("tags_updated"),
                onCampaignProgress: dispatch("campaign_progress"),
                onMessagesImported: dispatch("messages_imported"),
                onHistorySync: dispatch("history_sync"),
                onConversationAssigned: dispatch("conversation_assigned"),
                onConversationEvent: dispatch("conversation_event"),
                onConversationRevoked: dispatch("conversation_revoked"),
                onTransferRequested: dispatch("transfer_requested"),
                onTransferAnswered: dispatch("transfer_answered"),
                onConversationsUpdated: dispatch("conversations_updated"),
                onAccessChanged: () => accessChanged.current(),
                onOpen: () => {
                    attempt = 0;
                    if (interrupted) {
                        interrupted = false;
                        queryClient.invalidateQueries(); // solo vuelve a pedir las que están a la vista
                    } else if (firstOpen) {
                        // Con el usuario recordado, la página carga mientras se
                        // confirma la sesión, antes de esta conexión: lo que pasó
                        // entre su respuesta y ahora no llegó por aquí (revisión
                        // de Codex del PR #65). Se repite lo que ya tenía datos.
                        queryClient.invalidateQueries({
                            predicate: (query) => query.state.dataUpdatedAt > 0 && query.queryKey[0] !== VERIFY_QUERY_KEY[0],
                        });
                    }
                    firstOpen = false;
                },
                onError: () => {
                    interrupted = true;
                },
                onClosed: () => {
                    connection?.close();
                    retryTimer = setTimeout(connect, Math.min(RETRY_BASE_MS * 2 ** attempt++, RETRY_MAX_MS));
                },
            });
        };
        connect();

        // al cerrar sesión / desmontar, cerramos la conexión y no reintentamos
        return () => {
            clearTimeout(retryTimer);
            connection?.close();
        };
    }, [sessionId, queryClient]);

    // Función estable para suscribirse. Devuelve el "des-suscribir".
    const subscribe = useCallback(<E extends SSEEventType>(event: E, handler: SSEHandler<E>) => {
        subscribers.current[event].add(handler);
        return () => {
            subscribers.current[event].delete(handler);
        };
    }, []);

    return <SSEContext.Provider value={{ subscribe }}>{children}</SSEContext.Provider>;
};
