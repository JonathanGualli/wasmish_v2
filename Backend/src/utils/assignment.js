import mongoose from 'mongoose';
import { sessionAuthFor } from './account.js';
import { can, inLineScope, lineScope } from './permissions.js';

// ---------------------------------------------------------------------------
// La asignación de conversaciones (Fase 4 de multi-línea; spec § 3.3 y § 3.4).
// Quién ve qué está en `permissions.js` (`conversationScope`); aquí, lo que
// decide cada escritura: tomar al responder, transferir y liberar.
// ---------------------------------------------------------------------------

const idOf = (value) => (value == null ? null : String(value._id ?? value));

/**
 * Qué pasa con la asignación cuando `auth` responde una conversación que
 * atiende `assignedTo`: `'take'` (sin asignar: es suya), `'keep'` (la suya, o
 * quien responde supervisa y no se la queda: decisión del 2026-10-27) o
 * `'conflict'` (un agente, en la de un compañero: no se envía).
 */
export const replyAcquisition = (auth, assignedTo) => {
    const owner = idOf(assignedTo);
    if (owner === null) return 'take';
    if (owner === auth.userId || auth.role !== 'agent') return 'keep';
    return 'conflict';
};

/** Si `auth` puede pasar a otra persona una conversación que atiende `assignedTo`. */
export const canReassign = (auth, assignedTo) =>
    can(auth, 'conversations.assign') || (assignedTo != null && idOf(assignedTo) === auth.userId);

/** Si `member` (un `User` leído de la BD) puede atender una conversación de la línea `lineId`. */
export const isValidAssignee = (member, lineId) => {
    const auth = sessionAuthFor(member);
    return Boolean(auth) && inLineScope(auth, lineId);
};

/**
 * Qué conversaciones suyas hay que soltar después de cambiarle el acceso a
 * `member` (el `User` ya cambiado): desactivado, todas (`{}`); sin límite de
 * líneas, ninguna (`null`); si no, las de las líneas que ya no tiene.
 */
export const releaseFilter = (member) => {
    const auth = sessionAuthFor(member);
    if (!auth) return {};
    const scope = lineScope(auth);
    if (scope === null) return null;
    return { lineId: { $nin: scope.map(id => new mongoose.Types.ObjectId(id)) } };
};

/**
 * A quién le llega el aviso de una solicitud de transferencia (avisos de la
 * asignación, spec § 4): a quien la atiende, si todavía puede atenderla, y a
 * quienes pueden responderla (`conversations.assign` con esa línea: owner,
 * admin y el supervisor de la línea). Solo activos de la cuenta, sin repetir,
 * y nunca al que la pide. `members` son `User` leídos de la BD; devuelve sus
 * `_id` como texto.
 */
export const requestRecipients = (members, conversation, requesterId) => {
    const assignedTo = idOf(conversation.assignedTo);
    const recipients = new Set();
    for (const member of members) {
        const auth = sessionAuthFor(member);
        if (!auth || auth.userId === String(requesterId)) continue;
        const attends = auth.userId === assignedTo && isValidAssignee(member, conversation.lineId);
        const answers = can(auth, 'conversations.assign') && inLineScope(auth, conversation.lineId);
        if (attends || answers) recipients.add(auth.userId);
    }
    return [...recipients];
};

