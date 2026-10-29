import type { Conversation, ConversationPerson } from "../models/conversation.mode";
import type { ConversationEvent } from "../models/conversation.event.model";
import type { AppNotification } from "../models/notification.model";

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

/**
 * El aviso de arriba de un aviso nuevo de la campanita (diseño 7a, con el
 * contacto): «nuevo» con «Abrir», salvo el rechazo, que solo informa.
 */
export const notificationToast = (notification: AppNotification): { kind: 'new' | 'info'; text: string } => {
    const actor = firstName(notification.actor);
    const conversation = notification.conversation
        ? `la conversación con ${notification.conversation.title}`
        : 'una conversación';
    switch (notification.type) {
        case 'assigned':
            return { kind: 'new', text: `${actor} te asignó ${conversation}.` };
        case 'passed':
            return { kind: 'new', text: `${actor} te pasó ${conversation}.` };
        case 'rejected':
            return { kind: 'info', text: `${actor} no te pasó ${conversation}.` };
        case 'requested':
            return { kind: 'new', text: `${actor} pide ${conversation}.` };
        case 'lost': {
            const mode = lostMode(notification);
            if (mode === 'took') return { kind: 'info', text: `${actor} tomó ${conversation}.` };
            if (mode === 'passed') return { kind: 'info', text: `${actor} le pasó a ${firstName(notification.target)} ${conversation}.` };
            return { kind: 'info', text: `${actor} dejó sin asignar ${conversation}.` };
        }
    }
};

/**
 * Cómo perdió la conversación quien recibe un `lost`: se la quedó quien la
 * movió (`took`), se la dio a otra persona (`passed`) o la dejó sin asignar
 * (`released`). El mismo criterio que `lostMode` del backend.
 */
const lostMode = (notification: AppNotification): 'took' | 'passed' | 'released' => {
    if (!notification.target) return 'released';
    return notification.target.id === notification.actor?.id ? 'took' : 'passed';
};

/**
 * Lo que dice un aviso en la campanita según quién mira (diseño 5a y m2, el
 * `notifView` del prototipo): «**who** rest» y, debajo, la nota de cómo terminó
 * o de por qué ya no se puede abrir.
 */
export const notificationText = (notification: AppNotification, viewerId: string): { who: string; rest: string; note: string } => {
    const who = firstName(notification.actor);
    const { conversation, request, resolution } = notification;
    const assignee = conversation?.assignedTo ?? null;
    let rest = '';
    let note = '';
    switch (notification.type) {
        case 'assigned':
            rest = 'te asignó una conversación';
            break;
        case 'passed':
            rest = 'te pasó la conversación';
            note = 'Aceptó tu solicitud.';
            break;
        case 'rejected':
            rest = 'rechazó pasarte la conversación';
            break;
        case 'requested': {
            rest = assignee?.id === viewerId ? 'pide que le pases la conversación' : 'pide que le pasen la conversación';
            const byMe = resolution?.by?.id === viewerId;
            if (resolution?.status === 'passed') note = byMe ? `Se la pasaste a ${who}.` : `${firstName(resolution.by)} se la pasó a ${who}.`;
            else if (resolution?.status === 'rejected') note = byMe ? 'La rechazaste.' : `${firstName(resolution.by)} la rechazó.`;
            else if (resolution || !request?.pending) note = 'Ya no está pendiente.';
            break;
        }
        case 'lost': {
            const mode = lostMode(notification);
            if (mode === 'took') rest = 'tomó tu conversación';
            else if (mode === 'passed') rest = `le pasó tu conversación a ${firstName(notification.target)}`;
            else rest = 'dejó sin asignar tu conversación';
            break;
        }
    }
    if (!conversation?.canOpen) {
        const holder = assignee ? (assignee.id === viewerId ? 'tú' : firstName(assignee)) : null;
        if (notification.type === 'rejected') note = holder ? `La sigue atendiendo ${holder}.` : '';
        // Quien la tiene ya lo dice el texto («tomó tu conversación», «le pasó… a Ana»).
        else if (notification.type === 'lost' && assignee?.id === notification.target?.id) note = 'Ya no la puedes abrir.';
        else note = holder ? `Ahora la atiende ${holder}. Ya no la puedes abrir.` : 'Ya no la puedes abrir.';
    }
    return { who, rest, note };
};
