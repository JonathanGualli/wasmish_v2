import type { ConversationPerson } from "./conversation.mode";

/**
 * Un aviso de la campanita (avisos de la asignación, spec § 5.2): algo de la
 * asignación que le pasó a quien mira. Los sirve el backend ya pensados para
 * esa persona: `canOpen` y `canAnswer` son los suyos, leídos al servirlos.
 * `lost`: otra persona le quitó una conversación que atendía.
 */
export type NotificationType = 'assigned' | 'passed' | 'rejected' | 'requested' | 'lost';

export interface AppNotification {
    id: string;
    type: NotificationType;
    /** Quien lo hizo (asignó, pasó, rechazó o pidió). */
    actor: ConversationPerson | null;
    /** Solo en `lost`: quién la tiene ahora (`null`, si quedó sin asignar). */
    target: ConversationPerson | null;
    /** `null` si la conversación ya no existe: el aviso se pinta sin abrir. */
    conversation: {
        id: string;
        title: string;
        lineId: string | null;
        assignedTo: ConversationPerson | null;
        /** Si la conversación entra ahora en lo que ve quien mira. */
        canOpen: boolean;
    } | null;
    /** Solo en `requested`: si la solicitud sigue siendo esa y si quien mira la puede responder. */
    request: { requestId: string; pending: boolean; canAnswer: boolean } | null;
    /** Cómo terminó una solicitud (`requested`). */
    resolution: { status: 'passed' | 'rejected' | 'gone'; by: ConversationPerson | null } | null;
    seen: boolean;
    createdAt: string;
}

export interface NotificationsPage {
    items: AppNotification[];
    nextCursor: string | null;
    /** De todos los avisos de quien mira, no solo de la página. */
    unseenCount: number;
}
