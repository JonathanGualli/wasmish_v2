// Las reacciones con emoji (spec 2026-10-20-citas-reacciones-design.md). Una
// reacción no es un mensaje: se pega a su original, una por lado (`them`, el
// contacto; `me`, el negocio). No crea mensajes ni toca no leídos, ventana,
// avisos push ni bot: solo el original, la bandeja y el aviso por SSE.

import Message from '../models/message.model.js';
import Conversation from '../models/conversation.model.js';
import { sendToAccount } from '../controllers/stream.controller.js';
import { findWebhookTarget } from './message.change.service.js';
import { serializeMessageUpdate } from '../utils/message.change.js';
import { reactionPreview } from '../utils/message.actions.js';

// Los ids de reacción que recuerda cada mensaje para no reaplicar un reintento.
const SEEN_LIMIT = 20;

/**
 * La bandeja con una reacción: su texto y su hora, solo si no hay algo más
 * nuevo (todo el que escribe la vista previa pone `lastMessageAt` = la hora de
 * lo suyo). La UI, con `lastMessage`, vuelve a pedir la bandeja y la reordena.
 *
 * @returns {Promise<boolean>} si la escribió.
 */
export const writeReactionPreview = async ({ accountId, conversation, at, text }) => {
    const result = await Conversation.updateOne(
        { _id: conversation._id, $or: [{ lastMessageAt: null }, { lastMessageAt: { $lte: at } }] },
        { $set: { lastMessage: text, lastMessageAt: at } },
    );
    if (result.matchedCount === 0) return false;
    sendToAccount(String(accountId), 'conversation_updated', { id: String(conversation._id), lastMessage: text },
        { lineId: conversation.lineId ?? null });
    return true;
};

/** Avisa por SSE del mensaje como queda, releído después de escribir. */
const emitMessageUpdated = async (accountId, messageId, conversation) => {
    const updated = await Message.findById(messageId).lean();
    if (!updated) return null;
    sendToAccount(String(accountId), 'message_updated', serializeMessageUpdate(updated), { lineId: conversation.lineId ?? null });
    return updated;
};

/**
 * Pega una reacción que llega de Meta (`describeReaction`) a su original: del
 * contacto (`side: 'them'`) o del negocio desde la app (`side: 'me'`, un eco,
 * con `origin: 'businessApp'`).
 *
 * Solo avanza, con una escritura condicionada: aplica si no había, o si la
 * guardada es igual de vieja o más, y nunca si su id ya se aplicó (un
 * reintento de Meta, aunque después haya llegado otra del mismo segundo).
 * Quitarla guarda `emoji: null` con su hora: una vieja no la resucita.
 *
 * `line` = `{ accountId, lineId, phoneNumberId }` (la del webhook),
 * `identity` = `{ phone, waUserId }` del contacto del webhook.
 *
 * @returns {Promise<'applied'|'unchanged'|'not_found'|'rejected'>} Solo
 *          `'applied'` avisa. `not_found` / `rejected`: el original no es de
 *          esa cuenta, línea o contacto (quien llama decide qué hacer).
 */
export const applyReaction = async ({ line, reaction, side, identity, origin = null }) => {
    const found = await findWebhookTarget({ line, waMessageId: reaction.targetWaMessageId, identity });
    if (found.status !== 'found') return found.status;
    const { message, conversation } = found;

    const { waMessageId, emoji, timestamp: at } = reaction;
    const path = `reactions.${side}`;
    const value = side === 'me'
        ? { emoji, previousEmoji: null, at, waMessageId, status: 'sent', sentBy: null, sentByName: null, origin: origin ?? 'chat' }
        : { emoji, at, waMessageId };

    const result = await Message.updateOne(
        {
            _id: message._id,
            'reactions.seen': { $ne: waMessageId },
            // `null` también encuentra un mensaje sin el campo.
            $or: [{ [path]: null }, { [`${path}.at`]: { $lte: at } }],
        },
        {
            $set: { [path]: value },
            $push: { 'reactions.seen': { $each: [waMessageId], $slice: -SEEN_LIMIT } },
            $inc: { changeVersion: 1 },
        },
    );
    if (result.modifiedCount === 0) return 'unchanged';

    const updated = await emitMessageUpdated(line.accountId, message._id, conversation);
    if (updated && emoji) {
        await writeReactionPreview({
            accountId: line.accountId, conversation, at, text: reactionPreview({ side, emoji, original: updated }),
        });
    }
    return 'applied';
};

/**
 * El acuse de una reacción NUESTRA (`procesarEstado` no encontró un mensaje con
 * ese `waMessageId`). Meta solo manda `sent` o, si no la entregó, `failed`
 * (131009: el mensaje es de más de 30 días, se borró…). `failed` la marca a
 * ella, con rutas `reactions.me.*`: nunca el estado del mensaje, que es el del
 * original (revisión de Codex del plan, 2). Si ya se reemplazó por otra, nada.
 *
 * @returns {Promise<boolean>} si el acuse era de una reacción nuestra de esta cuenta.
 */
export const applyReactionStatus = async ({ line, statusData }) => {
    const waMessageId = statusData?.id;
    if (!waMessageId) return false;

    // El predicado del índice parcial va repetido: sin él, Mongo no lo usa.
    const message = await Message.findOne({ $and: [
        { 'reactions.me.waMessageId': waMessageId },
        { 'reactions.me.waMessageId': { $type: 'string' } },
    ] }).select('_id conversationId').lean();
    if (!message) return false;
    const conversation = await Conversation.findOne({ _id: message.conversationId, userId: line.accountId })
        .select('_id lineId').lean();
    if (!conversation) return false;
    if (statusData.status !== 'failed') return true;

    const error = statusData.errors?.[0];
    const result = await Message.updateOne(
        { _id: message._id, 'reactions.me.waMessageId': waMessageId, 'reactions.me.status': 'sent' },
        {
            $set: {
                'reactions.me.status': 'failed',
                'reactions.me.errorCode': error?.code != null ? String(error.code) : null,
                'reactions.me.errorDetail': error?.error_data?.details ?? error?.title ?? null,
            },
            $inc: { changeVersion: 1 },
        },
    );
    if (result.modifiedCount > 0) await emitMessageUpdated(line.accountId, message._id, conversation);
    return true;
};
