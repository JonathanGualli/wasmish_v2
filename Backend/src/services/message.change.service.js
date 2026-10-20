// Aplica sobre el mensaje original un borrado o una edición de la coexistencia
// (`describeMessageChange`), del contacto o del negocio desde la app. No crea
// ningún mensaje ni toca no leídos, ventana, avisos push ni bot: solo el
// original, la vista previa de la bandeja si era el último, y el aviso por SSE.
// Spec: docs/superpowers/specs/2026-10-19-mensajes-eliminados-editados-design.md.

import Message from '../models/message.model.js';
import Conversation from '../models/conversation.model.js';
import { findContactByIdentity, conversationLineFilter } from '../controllers/contact.controller.js';
import { sendToAccount } from '../controllers/stream.controller.js';
import { hasContactIdentity } from '../utils/contact.identity.js';
import { DELETED_PREVIEW, serializeMessageChange } from '../utils/message.change.js';

// Escrituras condicionadas que pierden contra otra entrega a la vez: se relee y
// se vuelve a intentar, hasta aquí.
const MAX_ATTEMPTS = 3;

// Sin texto ni teléfonos, como el resto del webhook.
const warn = (reason, change) => console.warn('Cambio de mensaje no aplicado:', {
    reason, kind: change.kind, waMessageId: change.waMessageId, originalWaMessageId: change.originalWaMessageId,
});

// El original, solo si es de la cuenta y la línea del webhook, de la misma
// dirección y de la conversación del contacto del webhook (el remitente en un
// entrante, el destinatario en un eco). El contacto se busca sin crearlo.
const findOriginal = async ({ line, change, direction, identity }) => {
    const message = await Message.findOne({ waMessageId: change.originalWaMessageId }).lean();
    if (!message) return { status: 'not_found' };

    const conversation = await Conversation.findOne({
        _id: message.conversationId, userId: line.accountId, ...conversationLineFilter(line),
    }).select('_id lineId contactId').lean();
    if (!conversation) return { status: 'not_found' };

    if (message.direction !== direction) return { status: 'rejected', reason: 'direction' };
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

// Si el mensaje es el último de la conversación, su vista previa en la bandeja,
// desde su estado final: eliminado manda aunque después llegue una edición. La
// escritura queda sin efecto si entretanto llegó un mensaje más nuevo (todo el
// que escribe la vista previa pone `lastMessageAt` = el `timestamp` de su
// mensaje), y se repite si otro cambio del mismo mensaje se cruzó (su
// `changeVersion` ya no es el escrito): la última escritura es la del estado
// final (revisión de Codex del plan, 1 y 2).
const refreshPreview = async ({ accountId, conversation, message }) => {
    const last = await Message.findOne({ conversationId: conversation._id })
        .sort({ timestamp: -1, _id: -1 }).select('_id').lean();
    if (!last || String(last._id) !== String(message._id)) return;

    let current = message;
    let written = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const lastMessage = previewOf(current);
        const result = await Conversation.updateOne(
            { _id: conversation._id, lastMessageAt: { $lte: current.timestamp } },
            { $set: { lastMessage } },
        );
        if (result.matchedCount === 0) return;
        written = lastMessage;

        const reread = await Message.findById(message._id).lean();
        if (!reread || (reread.changeVersion ?? 0) === (current.changeVersion ?? 0)) break;
        current = reread;
    }

    sendToAccount(accountId, 'conversation_updated', { id: String(conversation._id), lastMessage: written },
        { lineId: conversation.lineId ?? null });
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
    const found = await findOriginal({ line, change, direction, identity });
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
    sendToAccount(accountId, 'message_updated', {
        id: String(updated._id),
        conversationId: String(updated.conversationId),
        text: updated.text,
        caption: updated.caption ?? null,
        ...serializeMessageChange(updated),
    }, { lineId: conversation.lineId ?? null });

    await refreshPreview({ accountId, conversation, message: updated });
    return 'applied';
};
