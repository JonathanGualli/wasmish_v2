// Aplica sobre el mensaje original un borrado o una edición de la coexistencia
// (`describeMessageChange`), del contacto o del negocio desde la app. No crea
// ningún mensaje ni toca no leídos, ventana, avisos push ni bot: solo el
// original, la vista previa de la bandeja si era el último, y el aviso por SSE.
// Spec: docs/superpowers/specs/2026-10-19-mensajes-eliminados-editados-design.md.

import Message from '../models/message.model.js';
import Conversation from '../models/conversation.model.js';
import { findContactByIdentity, conversationLineFilter } from '../controllers/contact.controller.js';
import { sendConversationEvent } from './assignment.service.js';
import { hasContactIdentity } from '../utils/contact.identity.js';
import { DELETED_PREVIEW, serializeMessageUpdate } from '../utils/message.change.js';
import { wamidMessageKey } from '../utils/wamid.js';

// Escrituras condicionadas que pierden contra otra entrega a la vez: se relee y
// se vuelve a intentar, hasta aquí.
const MAX_ATTEMPTS = 3;

// Hasta dónde busca el original por la clave del wamid (`findByMessageKey`).
const KEY_LOOKUP_DAYS = 30;

// Sin texto ni teléfonos, como el resto del webhook.
const warn = (reason, change) => console.warn('Cambio de mensaje no aplicado:', {
    reason, kind: change.kind, waMessageId: change.waMessageId, originalWaMessageId: change.originalWaMessageId,
});

/**
 * El original por la clave de su wamid (`wamidMessageKey`), cuando Meta lo
 * nombra con otro wamid que el guardado: la reacción del contacto a un eco de
 * la coexistencia (2026-10-22). Solo en la conversación del contacto del
 * webhook en esa línea, entre los mensajes de los últimos 30 días (lo que Meta
 * deja reaccionar), y solo si uno y nada más que uno tiene esa clave.
 */
const findByMessageKey = async ({ line, waMessageId, identity }) => {
    const key = wamidMessageKey(waMessageId);
    if (!key || !hasContactIdentity(identity)) return null;
    const contact = await findContactByIdentity(line.accountId, identity);
    if (!contact) return null;
    const conversation = await Conversation.findOne({
        userId: line.accountId, ...conversationLineFilter(line), contactId: contact._id,
    }).select('_id').lean();
    if (!conversation) return null;

    const since = new Date(Date.now() - KEY_LOOKUP_DAYS * 24 * 60 * 60 * 1000);
    const candidates = await Message.find({
        conversationId: conversation._id, timestamp: { $gte: since }, waMessageId: { $type: 'string' },
    }).select('_id waMessageId').lean();
    const matches = candidates.filter(msg => wamidMessageKey(msg.waMessageId) === key);
    if (matches.length !== 1) return null;

    // Confirma en producción que Meta usó otro wamid (solo ids, como el resto del webhook).
    console.warn('Original encontrado por la clave del wamid:', {
        waMessageId, savedWaMessageId: matches[0].waMessageId, messageId: String(matches[0]._id),
    });
    return Message.findById(matches[0]._id).lean();
};

/**
 * El mensaje al que apunta un aviso de Meta (un borrado, una edición, una
 * reacción), solo si es de la cuenta y la línea del webhook y de la
 * conversación del contacto del webhook (el remitente en un entrante, el
 * destinatario en un eco). El contacto se busca sin crearlo. Con `direction`,
 * además, de esa dirección; con null, de cualquiera (una reacción). Si el
 * wamid no está tal cual, lo busca por su clave (`findByMessageKey`).
 *
 * @returns {Promise<{ status: 'found', message, conversation }|{ status: 'not_found'|'rejected', reason: string }>}
 */
export const findWebhookTarget = async ({ line, waMessageId, identity, direction = null }) => {
    const message = await Message.findOne({ waMessageId }).lean()
        ?? await findByMessageKey({ line, waMessageId, identity });
    if (!message) return { status: 'not_found', reason: 'message' };

    const conversation = await Conversation.findOne({
        _id: message.conversationId, userId: line.accountId, ...conversationLineFilter(line),
    }).select('_id lineId contactId').lean();
    if (!conversation) return { status: 'not_found', reason: 'conversation' };

    if (direction && message.direction !== direction) return { status: 'rejected', reason: 'direction' };
    if (!hasContactIdentity(identity)) return { status: 'rejected', reason: 'no_identity' };
    const contact = await findContactByIdentity(line.accountId, identity);
    if (!contact || String(contact._id) !== String(conversation.contactId)) return { status: 'rejected', reason: 'contact' };

    return { status: 'found', message, conversation };
};

// Un reintento de Meta no cambia nada.
const applyRevoke = async (message, change) => {
    const result = await Message.updateOne(
        { _id: message._id, deletedAt: null },
        { $set: { deletedAt: change.timestamp }, $inc: { changeVersion: 1 } },
    );
    return result.modifiedCount > 0 ? 'applied' : 'unchanged';
};

// Solo avanza, como los estados (`resolveStatusTransition`): una edición igual
// o más vieja que la aplicada no hace nada. La escritura va condicionada a que
// `editedAt` siga valiendo lo leído; si otra entrega escribió entre medias, se
// relee y se reevalúa, para que una edición más nueva nunca se pierda porque
// su entrega se solapó con la de una más vieja (revisión de Codex del spec, 5).
const applyEdit = async (message, change) => {
    const { content } = change;
    let current = message;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (current.editedAt && change.timestamp <= current.editedAt) return 'unchanged';
        // Un texto solo se edita con texto, una foto con una foto.
        if (content.type !== (current.type || 'text')) return 'rejected';

        // Un documento al que le quitan el pie vuelve a su nombre de archivo.
        const text = content.caption ?? (current.type === 'document' ? current.mediaFilename : null) ?? content.text;
        const result = await Message.updateOne(
            // `null` también encuentra un mensaje guardado antes del campo.
            { _id: current._id, editedAt: current.editedAt ?? null },
            {
                $push: { previousVersions: {
                    text: current.text,
                    caption: current.caption ?? null,
                    editedAt: current.editedAt ?? current.timestamp ?? current.createdAt,
                } },
                $set: { text, caption: content.caption, editedAt: change.timestamp },
                $inc: { changeVersion: 1 },
            },
        );
        if (result.modifiedCount > 0) return 'applied';

        current = await Message.findById(current._id).lean();
        if (!current) return 'not_found';
    }
    return 'exhausted';
};

const previewOf = (message) => (message.deletedAt ? DELETED_PREVIEW : message.text);

const findLastMessage = (conversationId) =>
    Message.findOne({ conversationId }).sort({ timestamp: -1, _id: -1 }).lean();

const isSameState = (a, b) => String(a._id) === String(b._id) && (a.changeVersion ?? 0) === (b.changeVersion ?? 0);

// Si el mensaje es el último de la conversación, su vista previa en la bandeja,
// desde su estado final: eliminado manda aunque después llegue una edición. La
// escritura queda sin efecto si entretanto llegó un mensaje más nuevo (todo el
// que escribe la vista previa pone `lastMessageAt` = el `timestamp` de su
// mensaje). Después se relee el último mensaje: si otro cambio se cruzó (su
// `changeVersion` ya no es el escrito) o llegó otro mensaje del mismo segundo
// (los entrantes traen la hora en segundos y la condición lo deja pasar), se
// reescribe desde él. Así la última escritura es la del estado final
// (revisiones de Codex del plan, 1 y 2, y del PR #109, 1).
//
// El aviso lleva la vista previa LEÍDA de la BD justo antes de emitir, no la
// escrita: si dos cambios se cruzan, el último aviso no enseña la de antes
// (revisión de Codex del PR #109, 2). La UI, además, vuelve a pedir la bandeja.
const refreshPreview = async ({ accountId, conversation, message }) => {
    let last = await findLastMessage(conversation._id);
    if (!last || String(last._id) !== String(message._id)) return;

    let wrote = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const result = await Conversation.updateOne(
            { _id: conversation._id, lastMessageAt: { $lte: last.timestamp } },
            { $set: { lastMessage: previewOf(last) } },
        );
        if (result.matchedCount === 0) break;
        wrote = true;

        const now = await findLastMessage(conversation._id);
        if (!now || isSameState(now, last)) break;
        last = now;
    }
    if (!wrote) return;

    const { lastMessage = '' } = await Conversation.findById(conversation._id).select('lastMessage').lean() ?? {};
    await sendConversationEvent(accountId, conversation._id, 'conversation_updated', { id: String(conversation._id), lastMessage });
};

/**
 * Aplica un borrado o una edición (`describeMessageChange`) sobre su original.
 *
 * `line` = `{ accountId, lineId, phoneNumberId }` (la línea del webhook),
 * `direction` = `'inbound'` (lo hizo el contacto) u `'outbound'` (el negocio
 * desde la app), `identity` = `{ phone, waUserId }` del contacto del webhook.
 *
 * @returns {Promise<'applied'|'unchanged'|'not_found'|'rejected'>} Solo
 *          `'applied'` avisa por SSE. `not_found`: el original no existe o no
 *          es de esa cuenta y línea (anterior a la conexión, o el cambio llegó
 *          antes que el mensaje: limitación aceptada, spec § 2); `rejected`:
 *          otra dirección, otro contacto, otro tipo de contenido o intentos agotados.
 */
export const applyMessageChange = async ({ line, change, direction, identity }) => {
    const found = await findWebhookTarget({ line, waMessageId: change.originalWaMessageId, identity, direction });
    if (found.status !== 'found') {
        warn(found.reason ?? found.status, change);
        return found.status;
    }
    const { message, conversation } = found;

    let status = change.kind === 'revoke' ? await applyRevoke(message, change) : await applyEdit(message, change);
    if (status === 'exhausted') {
        warn('exhausted', change);
        status = 'rejected';
    } else if (status === 'rejected' || status === 'not_found') {
        warn(status === 'rejected' ? 'content_type' : status, change);
    }
    if (status !== 'applied') return status;

    const updated = await Message.findById(message._id).lean();
    if (!updated) return 'not_found';

    const accountId = String(line.accountId);
    await sendConversationEvent(accountId, conversation._id, 'message_updated', serializeMessageUpdate(updated));

    await refreshPreview({ accountId, conversation, message: updated });
    return 'applied';
};
