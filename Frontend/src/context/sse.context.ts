import { createContext, useContext } from "react";
import type { Message } from "../models/message.mode";
import type { Campaign } from "../models/campaign.model";

// Lo que trae cada evento que emite el backend (`sendUser`)
export interface SSEEventMap {
    // Solo los entrantes traen unreadCount y windowExpiresAt; campaignId, los de una campaña
    message_created: Message & { unreadCount?: number; windowExpiresAt?: string | null; campaignId?: string };
    message_status: Pick<Message, "id" | "conversationId" | "status">
        & Partial<Pick<Message, "waMessageId" | "deliveredAt" | "readAt" | "failedAt" | "errorCode" | "errorDetail">>
        & { campaignId?: string };
    conversation_updated: { id: string; unreadCount: number };
    // Sin los campos de publicidad cuando es un cambio de número
    contact_updated: { id: string; marketingOptOut?: boolean; marketingOptOutAt?: string | null };
    campaign_progress: Campaign;
}

export type SSEEventType = keyof SSEEventMap;

// Un suscriptor recibe el payload ya parseado (objeto), no el evento crudo
export type SSEHandler<E extends SSEEventType> = (data: SSEEventMap[E]) => void;

export interface SSEContextValue {
    // Devuelve una función para DES-suscribirse (se llama en el cleanup)
    subscribe: <E extends SSEEventType>(event: E, handler: SSEHandler<E>) => () => void;
}

export const SSEContext = createContext<SSEContextValue | null>(null);

// Hook de conveniencia para consumir el contexto con seguridad
export const useSSE = () => {
    const ctx = useContext(SSEContext);
    if (!ctx) throw new Error("useSSE debe usarse dentro de <SSEProvider>");
    return ctx;
};
