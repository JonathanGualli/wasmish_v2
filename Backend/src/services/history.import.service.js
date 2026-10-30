// Importar una pieza del historial de la app de WhatsApp Business: su contacto,
// su conversación y sus mensajes. Lo llama el worker (`workers/history.worker.js`).
// Lo traído nunca suma no leídos, mueve la ventana de 24 h, avisa por push,
// despierta al bot ni lo pausa: solo puede adelantar la vista previa.
// Spec: docs/superpowers/specs/2026-10-23-historial-coexistencia-design.md (§ 5 y 6).

import Line from '../models/line.model.js';
import Waba from '../models/waba.model.js';
import Message from '../models/message.model.js';
import Conversation from '../models/conversation.model.js';
import HistoryMedia from '../models/history.media.model.js';
import { resolveContact, findOrCreateConversation } from '../controllers/contact.controller.js';
import { descargarAdjunto, advanceConversationPreview } from '../controllers/webhook.controller.js';
import { serializeMessage } from '../utils/message.serialize.js';
import { sendConversationEvent } from './assignment.service.js';
import { applyReaction } from './reaction.service.js';
import { findQuotedMessage } from './message.reply.service.js';
import { describeInboundMessage, describeMessageContext, describeReaction } from '../utils/inbound.message.js';
import { describeHistoryMessage, HISTORY_PLACEHOLDER_TEXT } from '../utils/history.sync.js';
import { isMessageChange, serializeMessageUpdate } from '../utils/message.change.js';
import { wamidMessageKey } from '../utils/wamid.js';

// La identidad de un archivo de 14 días: la clave del wamid o, si el wamid no
// tiene la forma conocida, el wamid literal (la misma que guarda `storeHistoryMedia`).
const mediaKeyOf = (waMessageId) => wamidMessageKey(waMessageId) ?? `id:${waMessageId}`;

// Un archivo sin contenido: Meta no dice qué tipo era.
const PLACEHOLDER = { type: 'unsupported', text: HISTORY_PLACEHOLDER_TEXT, mediaId: null, mimeType: null, caption: null };

/**
 * La línea de la pieza con el token de su WABA (baja los archivos), como
 * `findInboundLine` pero por id y también si ya está desconectada: lo que ya se
 * recibió se termina de importar.
 */
const historyLine = async (piece) => {
    const line = await Line.findOne({ _id: piece.lineId, accountId: piece.userId }).lean();
    if (!line) return null;
    const waba = line.wabaId ? await Waba.findById(line.wabaId).select('tokenWhatsapp').lean() : null;
    return { accountId: line.accountId, lineId: line._id, phoneNumberId: line.phoneNumberId, tokenWhatsapp: waba?.tokenWhatsapp ?? null };
};

/**
 * Las claves de los mensajes de la conversación guardados antes de
 * `waMessageKey`: para ellos la clave se calcula de su wamid, una vez por pieza
 * (y sin el límite de 30 días de `findWebhookTarget`).
 */
const legacyKeysOf = async (conversationId) => {
    const legacy = await Message.find({ conversationId, waMessageKey: null, waMessageId: { $type: 'string' } })
        .select('_id waMessageId').lean();
    const byKey = new Map();
    for (const message of legacy) {
        const key = wamidMessageKey(message.waMessageId);
        if (key) byKey.set(key, message._id);
    }
    return byKey;
};

/** El mensaje que ya está en la conversación con ese wamid o con su clave. */
const findExisting = async (conversationId, waMessageId, legacyKeys) => {
    const key = wamidMessageKey(waMessageId);
    const found = await Message.findOne({ conversationId, $or: [{ waMessageId }, ...(key ? [{ waMessageKey: key }] : [])] }).lean();
    if (found) return found;
    return key && legacyKeys.has(key) ? Message.findById(legacyKeys.get(key)).lean() : null;
};

/**
 * Aplica a su mensaje el archivo de 14 días que llegó aparte (`HistoryMedia`):
 * el tipo, el pie y el archivo descargado. Solo sobre el placeholder del
 * historial; otro mensaje con esa identidad ya tiene su contenido. Idempotente:
 * lo pueden llamar a la vez el worker (después de crear el mensaje) y el webhook
 * (después de guardar el archivo). Avisa por SSE **quien cambia el mensaje** (la
 * escritura condicionada al placeholder solo la gana uno), sea o no quien marca
 * `applied` (revisión de Codex del PR #130). Si la vista previa de la
 * conversación era ese placeholder, pasa a decir lo del archivo.
 *
 * @param {{ line: { accountId, lineId, tokenWhatsapp }, connectionAt: Date,
 *           message: { _id, conversationId, waMessageId, timestamp }, media?: object }} args
 * @returns {Promise<boolean>} si había un archivo pendiente para el mensaje.
 */
export const applyHistoryMedia = async ({ line, connectionAt, message, media = null }) => {
    const pending = media ?? await HistoryMedia.findOne({
        lineId: line.lineId, connectionAt, mediaKey: mediaKeyOf(message.waMessageId), applied: false,
    }).lean();
    if (!pending) return false;

    const entrante = describeInboundMessage(pending.messageData);
    let changed = false;
    if (entrante) {
        const adjunto = await descargarAdjunto(line, entrante);
        const result = await Message.updateOne(
            { _id: message._id, fromHistory: true, text: HISTORY_PLACEHOLDER_TEXT },
            {
                $set: {
                    type: entrante.type, text: entrante.text, caption: entrante.caption, mediaId: entrante.mediaId,
                    mimeType: adjunto.mimeType, mediaFile: adjunto.mediaFile, mediaFilename: adjunto.mediaFilename, mediaSize: adjunto.mediaSize,
                },
                // La UI descarta un `message_updated` que no suba la versión.
                $inc: { changeVersion: 1 },
            },
        );
        changed = result.modifiedCount > 0;
    }
    await HistoryMedia.updateOne({ _id: pending._id, applied: false }, { $set: { applied: true } });
    if (!changed) return true;

    const updated = await Message.findById(message._id).lean();
    // El mensaje entero (con su archivo) y lo de un cambio: la UI lo funde en su sitio.
    await sendConversationEvent(line.accountId, updated.conversationId, 'message_updated', { ...serializeMessage(updated), ...serializeMessageUpdate(updated) });
    // La vista previa, solo si sigue siendo este placeholder: no pisa nada posterior.
    const preview = await Conversation.updateOne(
        { _id: updated.conversationId, lastMessage: HISTORY_PLACEHOLDER_TEXT, lastMessageAt: updated.timestamp },
        { $set: { lastMessage: updated.text } },
    );
    if (preview.modifiedCount > 0) {
        await sendConversationEvent(line.accountId, updated.conversationId, 'conversation_updated', { id: String(updated.conversationId), lastMessage: updated.text });
    }
    return true;
};

/** Guarda un mensaje del historial, o devuelve el que ya estaba. */
const saveHistoryMessage = async ({ conversationId, messageData, info, legacyKeys }) => {
    const existing = await findExisting(conversationId, info.waMessageId, legacyKeys);
    if (existing) return { message: existing, created: false };

    const content = info.isPlaceholder ? PLACEHOLDER : describeInboundMessage(messageData);
    if (!content) return { message: null, created: false };
    const context = describeMessageContext(messageData);
    const quoted = await findQuotedMessage(conversationId, context.replyToWaMessageId);
    const inbound = info.direction === 'inbound';
    try {
        const message = await Message.create({
            conversationId,
            direction: info.direction,
            sender: inbound ? 'them' : 'me',
            ...(!inbound && { origin: 'businessApp' }),
            waMessageId: info.waMessageId,
            type: content.type,
            text: content.text,
            mediaId: content.mediaId,
            mimeType: content.mimeType,
            caption: content.caption,
            timestamp: info.timestamp,
            status: info.status,
            ...(inbound && { deliveredAt: info.timestamp }),
            fromHistory: true,
            ...(context.replyToWaMessageId && { replyTo: { waMessageId: context.replyToWaMessageId, messageId: quoted?._id ?? null } }),
            ...(context.forwarded && { forwarded: context.forwarded }),
        });
        return { message: message.toObject(), created: true };
    } catch (error) {
        if (error.code !== 11000) throw error;
        // Otro camino lo guardó a la vez (un eco en vivo), o ese wamid es de otra
        // conversación: en ese caso no se toca.
        const again = await findExisting(conversationId, info.waMessageId, legacyKeys);
        if (again) return { message: again, created: false };
        console.warn('Mensaje del historial con el wamid de otra conversación; se salta:', { waMessageId: info.waMessageId });
        return { message: null, created: false };
    }
};

/**
 * Importa una pieza. Se puede repetir (una pieza que se cortó a medias se
 * reintenta): lo ya guardado no se duplica, pero se sigue con él, para aplicar
 * sus archivos y la vista previa que quedaron pendientes.
 *
 * `hooks` solo lo usan los tests, para cortar el proceso en un punto concreto.
 * `changes` son las ediciones y los borrados, que se saltan a propósito.
 * @returns {Promise<{ created: number, skipped: number, changes: number }>}
 */
export const importHistoryPiece = async (piece, { hooks = {} } = {}) => {
    const line = await historyLine(piece);
    if (!line) throw new Error('La línea de la pieza no existe');

    const contact = await resolveContact(piece.userId, { phone: piece.contactPhone }, { source: 'businessApp' });
    const conversation = await findOrCreateConversation({ userId: piece.userId, contact, line });
    if (conversation.isModified()) await conversation.save();
    await hooks.beforeMessages?.();

    const described = [];
    let malformed = 0;
    let changes = 0;
    for (const messageData of piece.messages) {
        // Contarlos como mal formados era ruido: en la prueba con Meta de verdad,
        // los 54 «mal formados» eran todos ediciones.
        if (isMessageChange(messageData)) {
            changes += 1;
            continue;
        }
        const info = describeHistoryMessage(messageData, piece.contactPhone);
        if (info) described.push({ messageData, info });
        else malformed += 1;
    }
    if (malformed > 0) console.warn('Mensajes del historial mal formados; se saltan:', { pieceId: String(piece._id), mensajes: malformed });
    described.sort((a, b) => a.info.timestamp - b.info.timestamp);

    const legacyKeys = await legacyKeysOf(conversation._id);
    const stored = [];
    let created = 0;
    let skipped = 0;
    for (const { messageData, info } of described) {
        if (info.isReaction) continue;
        const result = await saveHistoryMessage({ conversationId: conversation._id, messageData, info, legacyKeys });
        if (result.created) created += 1;
        else skipped += 1;
        if (result.message) stored.push(result.message);
    }
    await hooks.afterMessages?.();

    // Las reacciones, con todos sus originales ya guardados. Sin original, nada:
    // nunca un «Reaccionó con 👍» suelto.
    for (const { messageData, info } of described) {
        if (!info.isReaction) continue;
        const reaction = describeReaction(messageData);
        if (!reaction) continue;
        const side = info.direction === 'inbound' ? 'them' : 'me';
        await applyReaction({
            line, reaction, side, identity: { phone: piece.contactPhone }, ...(side === 'me' && { origin: 'businessApp' }),
        });
    }

    // Los archivos de 14 días que ya llegaron, de una vez.
    const byMediaKey = new Map(stored.map(message => [mediaKeyOf(message.waMessageId), message]));
    const medias = byMediaKey.size === 0 ? [] : await HistoryMedia.find({
        lineId: line.lineId, connectionAt: piece.connectionAt, mediaKey: { $in: [...byMediaKey.keys()] }, applied: false,
    }).lean();
    for (const media of medias) {
        await applyHistoryMedia({ line, connectionAt: piece.connectionAt, message: byMediaKey.get(media.mediaKey), media });
    }
    await hooks.beforePreview?.();

    // El hilo abierto no se entera de lo creado por otro camino: que lo vuelva a
    // pedir. Sin tocar los no leídos (revisión de Codex del PR #130).
    if (created > 0) {
        await sendConversationEvent(line.accountId, conversation._id, 'messages_imported', { conversationId: String(conversation._id) });
    }

    // La vista previa con el más nuevo de la pieza que está en Mongo (creado o
    // ya existente), releído: su archivo pudo cambiarle el texto.
    const newest = stored.reduce((latest, message) => (!latest || message.timestamp > latest.timestamp ? message : latest), null);
    if (newest) {
        const current = await Message.findById(newest._id).select('text timestamp').lean();
        if (current && await advanceConversationPreview(conversation._id, { text: current.text, timestamp: current.timestamp })) {
            await sendConversationEvent(line.accountId, conversation._id, 'conversation_updated', { id: String(conversation._id), lastMessage: current.text });
        }
    }
    return { created, skipped, changes };
};
