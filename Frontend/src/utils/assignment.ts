import type { Conversation, ConversationPerson } from "../models/conversation.mode";
import type { ConversationEvent } from "../models/conversation.event.model";

// ---------------------------------------------------------------------------
// La asignación de conversaciones en la UI (Fase 4; diseño «Wasmish Chats -
// Asignar conversaciones»). La autoridad es el backend: esto solo decide qué
// se enseña. Con una sola persona en la cuenta no se enseña nada (`hasTeam`).
// ---------------------------------------------------------------------------

/** Las vistas de la bandeja, en el orden del diseño. */
export type AssignmentTab = 'mine' | 'unassigned' | 'all';

export const ASSIGNMENT_TABS: { key: AssignmentTab; label: string }[] = [
    { key: 'mine', label: 'Mías' },
    { key: 'unassigned', label: 'Sin asignar' },
    { key: 'all', label: 'Todas' },
];

/** Si la conversación va en esa vista para la persona `userId`. */
export const inAssignmentTab = (conversation: Conversation, tab: AssignmentTab, userId: string) => {
    if (tab === 'mine') return conversation.assignedTo?.id === userId;
    if (tab === 'unassigned') return !conversation.assignedTo;
    return true;
};

/** El nombre corto de una persona («Ana» de «Ana Vera»), como la nombra el diseño. */
export const firstName = (person: ConversationPerson | null | undefined) =>
    person?.name?.trim().split(/\s+/)[0] || 'Otra persona';

/**
 * Si puede pasarla a otra persona: con `conversations.assign`, cualquiera; el
 * agente, solo la suya (lo mismo que `canReassign` en el backend).
 */
export const canReassignConversation = (conversation: Conversation, userId: string, canAssignAny: boolean) =>
    canAssignAny || conversation.assignedTo?.id === userId;

/** Lo que dice el composer sobre a quién le queda la conversación al responder (diseño, 1a). */
export const replyHint = (conversation: Conversation, userId: string) => {
    if (!conversation.assignedTo) return 'Sin asignar. Si respondes, pasa a ser tuya.';
    if (conversation.assignedTo.id === userId) return null;
    const name = firstName(conversation.assignedTo);
    return `La atiende ${name}. Tu mensaje sale con tu nombre y la sigue atendiendo ${name}.`;
};

const TAB_STORAGE = 'wasmish:chats-tab:';

/** La vista elegida, por persona y en este navegador; la primera vez, «Todas». */
export const loadAssignmentTab = (userId: string): AssignmentTab => {
    try {
        const saved = localStorage.getItem(TAB_STORAGE + userId);
        return ASSIGNMENT_TABS.some(tab => tab.key === saved) ? saved as AssignmentTab : 'all';
    } catch {
        return 'all';
    }
};

export const saveAssignmentTab = (userId: string, tab: AssignmentTab) => {
    try {
        localStorage.setItem(TAB_STORAGE + userId, tab);
    } catch { /* sin almacenamiento: se recuerda solo mientras dure la página */ }
};

/**
 * Lo que dice una línea de la historia según quién mira (diseño «Avisos de la
 * asignación», 6b): «tú» si fue quien mira, su nombre si no.
 */
export const eventText = (event: ConversationEvent, viewerId: string): string => {
    const byMe = event.actor?.id === viewerId;
    const toMe = event.target?.id === viewerId;
    const actor = firstName(event.actor);
    const target = firstName(event.target);
    switch (event.type) {
        case 'take':
            return byMe ? 'Tomaste esta conversación' : `${actor} tomó esta conversación`;
        case 'assign':
            if (byMe) return `Le asignaste esta conversación a ${target}`;
            return toMe ? `${actor} te asignó esta conversación` : `${actor} le asignó esta conversación a ${target}`;
        case 'release':
            return byMe ? 'Dejaste esta conversación sin asignar' : `${actor} dejó esta conversación sin asignar`;
        case 'request':
            return byMe ? 'Pediste esta conversación' : `${actor} pidió esta conversación`;
        case 'pass':
            if (byMe) return `Se la pasaste a ${target}`;
            return toMe ? `${actor} te la pasó` : `${actor} se la pasó a ${target}`;
        case 'reject':
            if (byMe) return `Rechazaste pasársela a ${target}`;
            return toMe ? `${actor} rechazó pasártela` : `${actor} rechazó pasársela a ${target}`;
        case 'revoked':
            return toMe
                ? 'Esta conversación quedó sin asignar: ya no tienes acceso a la línea'
                : `Esta conversación quedó sin asignar: ${target} ya no tiene acceso a la línea`;
    }
};

