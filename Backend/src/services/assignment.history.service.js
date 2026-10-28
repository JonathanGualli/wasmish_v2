import ConversationEvent from '../models/conversation.event.model.js';
import { sendConversationEvent } from './assignment.service.js';

// ---------------------------------------------------------------------------
// Los avisos de la asignación (spec docs/superpowers/specs/2026-10-28-avisos-
// asignacion-design.md): la historia de cada conversación y los avisos de la
// campanita. Lo llama `assignment.service.js`, el único que cambia
// `assignedTo`, después de cada escritura ganadora y confirmada. Nada de aquí
// hace fallar una asignación: todo atrapa sus errores y los deja en el log,
// sin datos del cliente.
// ---------------------------------------------------------------------------

const PERSON_FIELDS = 'name';

const personOf = (user) => (user?._id ? { id: String(user._id), name: user.name ?? null } : null);

/** Un evento como lo ven el hilo y el SSE (`doc` con `actorId` y `targetId` poblados). */
export const serializeEvent = (doc) => ({
    id: String(doc._id),
    type: doc.type,
    actor: personOf(doc.actorId),
    target: personOf(doc.targetId),
    timestamp: doc.at.toISOString(),
});

/**
 * Los eventos de una conversación en un tramo (`at >= from`, `at < to`; sin
 * límite si es `null`), del más nuevo al más viejo, con los nombres. Con
 * `limit`, como mucho esos.
 */
export const listPageEvents = (conversationId, { from, to }, limit = 0) => {
    const at = {};
    if (from) at.$gte = from;
    if (to) at.$lt = to;
    const query = ConversationEvent.find({ conversationId, ...(from || to ? { at } : {}) })
        .sort({ at: -1, _id: -1 })
        .populate('actorId', PERSON_FIELDS)
        .populate('targetId', PERSON_FIELDS)
        .lean();
    return limit ? query.limit(limit) : query;
};

/**
 * Guarda un evento y lo emite (`conversation_event`) a quien ve la
 * conversación ahora. `at` es la fecha de la escritura ganadora. Nunca lanza.
 */
export const recordEvent = async ({ accountId, conversationId, type, actorId = null, targetId = null, at }) => {
    try {
        const created = await ConversationEvent.create({ userId: accountId, conversationId, type, actorId, targetId, at });
        const event = await ConversationEvent.findById(created._id)
            .populate('actorId', PERSON_FIELDS).populate('targetId', PERSON_FIELDS).lean();
        await sendConversationEvent(accountId, conversationId, 'conversation_event', {
            conversationId: String(conversationId), event: serializeEvent(event),
        });
    } catch (error) {
        console.error('No se pudo guardar un evento de la conversación:', { type, error: error.message });
    }
};
