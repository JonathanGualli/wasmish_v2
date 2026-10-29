import ConversationEvent from '../models/conversation.event.model.js';
import Notification from '../models/notification.model.js';
import Conversation from '../models/conversation.model.js';
import User from '../models/user.model.js';
import { populateConversation, sendConversationEvent, serializeConversation } from './assignment.service.js';
import { sendToUser } from '../controllers/stream.controller.js';
import { sessionAuthFor } from '../utils/account.js';
import { canSeeConversation } from '../utils/permissions.js';
import { canReassign } from '../utils/assignment.js';

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

/**
 * Los `revoked` de las conversaciones que soltó `releaseAssignments`
 * (`freed`: `[{ conversationId, at }]`), de una vez y sin SSE por evento:
 * quitar el acceso ya avisa con un solo `conversations_updated`, y pueden ser
 * cientos. El hilo los enseña al volver a cargarse. Nunca lanza.
 */
export const recordRevocations = async (accountId, memberId, freed) => {
    if (freed.length === 0) return;
    try {
        await ConversationEvent.insertMany(freed.map(({ conversationId, at }) => ({
            userId: accountId, conversationId, type: 'revoked', actorId: null, targetId: memberId, at,
        })));
    } catch (error) {
        console.error('No se pudieron guardar los eventos de quitar el acceso:', { error: error.message });
    }
};

// ---------------------------------------------------------------------------
// La campanita
// ---------------------------------------------------------------------------

const MEMBER_AUTH_FIELDS = 'accountId role lineIds status name isSuperadmin';

/** El `auth` de una persona leído ahora (rol, líneas, estado): `null` si ya no está activa. */
export const memberAuth = async (accountId, userId) =>
    sessionAuthFor(await User.findOne({ _id: userId, accountId }).select(MEMBER_AUTH_FIELDS).lean());

/** Cuántos avisos de una persona no ha visto, de todos (no solo de una página). */
export const unseenCountOf = (accountId, recipientId) =>
    Notification.countDocuments({ userId: accountId, recipientId, seenAt: null });

/**
 * Los avisos como los ve `auth` (spec § 5.2), de una tanda: la conversación
 * como en la bandeja, si la puede abrir ahora (`canOpen`), y en una solicitud
 * si sigue pendiente (mirando la conversación, no `resolution`) y si puede
 * responderla (`canAnswer`: también exige `canOpen`, porque `canReassign` no
 * mira la línea; revisión de Codex del spec, 7). Una conversación borrada sale
 * como `conversation: null`.
 */
export const serializeNotifications = async (auth, docs) => {
    if (docs.length === 0) return [];
    const conversationIds = [...new Set(docs.map(doc => String(doc.conversationId)))];
    const personIds = [...new Set(docs.flatMap(doc => [doc.actorId, doc.targetId, doc.resolution?.by]).filter(Boolean).map(String))];
    const [conversations, people] = await Promise.all([
        populateConversation(Conversation.find({ _id: { $in: conversationIds }, userId: auth.accountId })).lean(),
        User.find({ _id: { $in: personIds }, accountId: auth.accountId }).select(PERSON_FIELDS).lean(),
    ]);
    const conversationById = new Map(conversations.map(item => [String(item._id), item]));
    const personById = new Map(people.map(person => [String(person._id), personOf(person)]));
    const person = (id) => (id ? personById.get(String(id)) ?? { id: String(id), name: null } : null);

    return docs.map((doc) => {
        const raw = conversationById.get(String(doc.conversationId));
        const canOpen = Boolean(raw) && canSeeConversation(auth, raw);
        const shown = raw ? serializeConversation(raw) : null;
        const pending = Boolean(raw) && doc.requestId != null && String(raw.transferRequest?.id ?? '') === String(doc.requestId);
        return {
            id: String(doc._id),
            type: doc.type,
            actor: person(doc.actorId),
            // Solo en `lost`: quién la tiene ahora.
            target: person(doc.targetId),
            conversation: shown
                ? { id: shown.id, title: shown.title, lineId: shown.lineId, assignedTo: shown.assignedTo, canOpen }
                : null,
            request: doc.type === 'requested'
                ? { requestId: String(doc.requestId), pending, canAnswer: canOpen && pending && canReassign(auth, raw.assignedTo) }
                : null,
            resolution: doc.resolution ? { status: doc.resolution.status, by: person(doc.resolution.by) } : null,
            seen: doc.seenAt != null,
            createdAt: doc.createdAt.toISOString(),
        };
    });
};

/** Un SSE por destinatario, con el aviso serializado con SU `auth`. */
const emitToRecipients = async (accountId, docs, event, withCount) => {
    for (const doc of docs) {
        const auth = await memberAuth(accountId, doc.recipientId);
        if (!auth) continue;
        const [notification] = await serializeNotifications(auth, [doc]);
        const data = withCount
            ? { notification, unseenCount: await unseenCountOf(accountId, doc.recipientId) }
            : { notification };
        sendToUser(String(accountId), String(doc.recipientId), event, data);
    }
};

/** Crea los avisos sin emitirlos (una solicitud relee antes de emitir). Nunca lanza: `[]` si falla. */
export const createNotifications = async ({ accountId, recipientIds, type, actorId, conversationId, requestId = null, targetId = null }) => {
    if (recipientIds.length === 0) return [];
    try {
        const docs = await Notification.insertMany(recipientIds.map(recipientId => ({
            userId: accountId, recipientId, type, actorId, conversationId, requestId, targetId,
        })));
        return docs.map(doc => doc.toObject());
    } catch (error) {
        console.error('No se pudieron crear los avisos:', { type, error: error.message });
        return [];
    }
};

/** `notification_created { notification, unseenCount }` a cada destinatario. Nunca lanza. */
export const emitNotificationsCreated = async (accountId, docs) => {
    try {
        await emitToRecipients(accountId, docs, 'notification_created', true);
    } catch (error) {
        console.error('No se pudieron emitir los avisos:', { error: error.message });
    }
};

/** Crea los avisos y los emite. Todos los caminos menos `requestTransfer` (spec § 4). */
export const notifyMembers = async (args) => {
    const docs = await createNotifications(args);
    await emitNotificationsCreated(args.accountId, docs);
    return docs;
};

/**
 * Cómo terminó una solicitud, en sus avisos `requested` que aún no lo dicen:
 * `passed` o `rejected` con quién, o `gone`. Avisa a cada destinatario con
 * `notification_updated`. Nunca lanza.
 */
export const resolveRequest = async ({ accountId, conversationId, requestId, status, by = null }) => {
    if (!requestId) return;
    try {
        const filter = { userId: accountId, conversationId, requestId, resolution: null };
        const pending = await Notification.find(filter).select('_id').lean();
        if (pending.length === 0) return;
        await Notification.updateMany(filter, { $set: { resolution: { status, by, at: new Date() } } });
        const updated = await Notification.find({ _id: { $in: pending.map(doc => doc._id) } }).lean();
        await emitToRecipients(accountId, updated, 'notification_updated', false);
    } catch (error) {
        console.error('No se pudo resolver una solicitud en los avisos:', { status, error: error.message });
    }
};

