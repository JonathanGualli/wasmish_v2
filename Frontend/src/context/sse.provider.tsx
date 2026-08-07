import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { createSSEConnection } from "../services/api.service";
import { SSEContext, type SSEEventType, type SSEHandler } from "./sse.context";
import { useAuthContext } from "./auth.context";

export const SSEProvider = ({ children }: { children: ReactNode }) => {
    const { user } = useAuthContext();

    // Registro de suscriptores por tipo de evento. useRef para que NO se
    // recree en cada render y persista de forma estable.
    const subscribers = useRef<Record<SSEEventType, Set<SSEHandler>>>({
        message_created: new Set(),
        message_status: new Set(),
        conversation_updated: new Set(),
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

        const { close } = createSSEConnection("stream", {
            onMessageCreated: dispatch("message_created"),
            onMessageStatus: dispatch("message_status"),
            onConversationUpdated: dispatch("conversation_updated"),
        });

        return () => close(); // al cerrar sesión / desmontar, cerramos la conexión
    }, [user?.id]);

    // Función estable para suscribirse. Devuelve el "des-suscribir".
    const subscribe = useCallback((event: SSEEventType, handler: SSEHandler) => {
        subscribers.current[event].add(handler);
        return () => {
            subscribers.current[event].delete(handler);
        };
    }, []);

    return <SSEContext.Provider value={{ subscribe }}>{children}</SSEContext.Provider>;
};
