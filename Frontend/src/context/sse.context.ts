import { createContext, useContext } from "react";

// Los 3 tipos de evento que emite tu backend
export type SSEEventType = "message_created" | "message_status" | "conversation_updated";

// Un suscriptor recibe el payload ya parseado (objeto), no el evento crudo
export type SSEHandler = (data: any) => void;

export interface SSEContextValue {
    // Devuelve una función para DES-suscribirse (se llama en el cleanup)
    subscribe: (event: SSEEventType, handler: SSEHandler) => () => void;
}

export const SSEContext = createContext<SSEContextValue | null>(null);

// Hook de conveniencia para consumir el contexto con seguridad
export const useSSE = () => {
    const ctx = useContext(SSEContext);
    if (!ctx) throw new Error("useSSE debe usarse dentro de <SSEProvider>");
    return ctx;
};
