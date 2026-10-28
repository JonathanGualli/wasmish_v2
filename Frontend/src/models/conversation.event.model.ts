import type { ConversationPerson } from "./conversation.mode";

/**
 * Un cambio de manos en la historia de una conversación (avisos de la
 * asignación, spec § 5.1): no es un mensaje. Llega con cada página de
 * mensajes (`events=1`) y en vivo con `conversation_event`.
 */
export type ConversationEventType = 'take' | 'assign' | 'release' | 'request' | 'pass' | 'reject' | 'revoked';

export interface ConversationEvent {
    id: string;
    type: ConversationEventType;
    /** Quién lo hizo; `null` en `revoked`. */
    actor: ConversationPerson | null;
    /** A quién: el asignado, el solicitante o quien perdió el acceso. */
    target: ConversationPerson | null;
    timestamp: string;
}
