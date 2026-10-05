import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createSSEConnection } from "../services/api.service";
import { SSEContext, type SSEEventType, type SSEHandler } from "./sse.context";
import { useAuthContext } from "./auth.context";

// Espera antes de reconectar: 1 s, 2 s, 4 s… hasta 30 s.
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30_000;

export const SSEProvider = ({ children }: { children: ReactNode }) => {
    const { user } = useAuthContext();
    const queryClient = useQueryClient();

    // Registro de suscriptores por tipo de evento. useRef para que NO se
    // recree en cada render y persista de forma estable.
    const subscribers = useRef<Record<SSEEventType, Set<SSEHandler>>>({
        message_created: new Set(),
        message_status: new Set(),
        conversation_updated: new Set(),
        contact_updated: new Set(),
        campaign_progress: new Set(),
    });

    // Abrir UNA conexión SSE, solo cuando hay sesión.
    useEffect(() => {
        if (!user?.id) return; // sin sesión no conectamos (/api/stream requiere auth)

        // Crea un despachador para un tipo de evento: parsea y reparte.
        const dispatch = (event: SSEEventType) => (e: MessageEvent) => {
            let data;
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

        const connect = () => {
            connection = createSSEConnection("stream", {
                onMessageCreated: dispatch("message_created"),
                onMessageStatus: dispatch("message_status"),
                onConversationUpdated: dispatch("conversation_updated"),
                onContactUpdated: dispatch("contact_updated"),
                onCampaignProgress: dispatch("campaign_progress"),
                onOpen: () => {
                    attempt = 0;
                    if (interrupted) {
                        interrupted = false;
                        queryClient.invalidateQueries(); // solo vuelve a pedir las que están a la vista
                    }
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
    }, [user?.id, queryClient]);

    // Función estable para suscribirse. Devuelve el "des-suscribir".
    const subscribe = useCallback((event: SSEEventType, handler: SSEHandler) => {
        subscribers.current[event].add(handler);
        return () => {
            subscribers.current[event].delete(handler);
        };
    }, []);

    return <SSEContext.Provider value={{ subscribe }}>{children}</SSEContext.Provider>;
};
