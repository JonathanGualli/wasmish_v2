import type { Conversation, ConversationPerson } from "../models/conversation.mode";

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
