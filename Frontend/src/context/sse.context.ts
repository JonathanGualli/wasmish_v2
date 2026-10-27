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
    // Borrado, editado (coexistencia) o una reacción: el estado entero, con su changeVersion
    message_updated: Pick<Message, "id" | "conversationId" | "text">
        & Pick<Message, "caption" | "deletedAt" | "editedAt" | "previousVersions" | "reactions" | "canReact" | "canReply">
        & { changeVersion: number };
    // Solo los campos que cambiaron: no leídos, o la vista previa tras un borrado o una edición
    conversation_updated: { id: string; unreadCount?: number; lastMessage?: string };
    // Sin los campos de publicidad cuando es un cambio de número
    contact_updated: { id: string; marketingOptOut?: boolean; marketingOptOutAt?: string | null };
    // Muchos contactos a la vez (etiquetar en bloque, importar): sin ids, se refresca todo
    contacts_updated: Record<string, never>;
    // Las etiquetas de la cuenta (nueva, renombrada o borrada)
    tags_updated: Record<string, never>;
    campaign_progress: Campaign;
    // Se importaron mensajes del historial de la app de WhatsApp Business en esa conversación
    messages_imported: { conversationId: string };
    // Cambió el estado de los chats de la app de esa línea (solo a quien gestiona líneas)
    history_sync: { lineId: string };
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
