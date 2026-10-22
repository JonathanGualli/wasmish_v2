// Las reacciones con emoji (spec 2026-10-20-citas-reacciones-design.md). Una
// reacción no es un mensaje: se pega a su original, una por lado (`them`, el
// contacto; `me`, el negocio). No crea mensajes ni toca no leídos, ventana,
// avisos push ni bot: solo el original, la bandeja y el aviso por SSE.

import Message from '../models/message.model.js';
import Conversation from '../models/conversation.model.js';
import { sendToAccount } from '../controllers/stream.controller.js';
import { findWebhookTarget } from './message.change.service.js';
import { getSendingRecipient } from '../controllers/contact.controller.js';
import { sendReactionMessage } from '../libs/whatsapp.js';
import { decrypt } from '../utils/crypto.js';
import { serializeMessageUpdate } from '../utils/message.change.js';
import { reactionPreview } from '../utils/message.actions.js';

// Los ids de reacción que recuerda cada mensaje para no reaplicar un reintento.
const SEEN_LIMIT = 20;

// Reescrituras de la bandeja cuando otra reacción se cruza, hasta aquí.
const MAX_PREVIEW_ATTEMPTS = 3;

// Lo que un mensaje queda tomado mientras una reacción nuestra va a Meta: si el
// proceso muere a mitad, a los 15 s se puede reaccionar otra vez.
const SENDING_LOCK_MS = 15_000;

/**
 * La bandeja con la reacción VIGENTE de un lado del mensaje (no la que llamó:
 * otra del mismo segundo pudo ganarle). Se escribe con su hora, solo si no hay
 * algo más nuevo (todo el que escribe la vista previa pone `lastMessageAt` = la
 * hora de lo suyo), y después se relee: si otra reacción se cruzó entre medias,
 * se reescribe desde ella, como `refreshPreview` con las ediciones (revisión de
 * Codex del PR #115). Una reacción quitada no toca la bandeja. La UI, con
 * `lastMessage`, vuelve a pedir la bandeja y la reordena.
 */
export const syncReactionPreview = async ({ accountId, conversation, messageId, side }) => {
    let written = null;
    for (let attempt = 0; attempt < MAX_PREVIEW_ATTEMPTS; attempt++) {
        const message = await Message.findById(messageId).lean();
        const current = message?.reactions?.[side];
        if (!current?.emoji) break;
        if (written === current.waMessageId) break;

        const text = reactionPreview({ side, emoji: current.emoji, original: message });
        const result = await Conversation.updateOne(
            { _id: conversation._id, $or: [{ lastMessageAt: null }, { lastMessageAt: { $lte: current.at } }] },
            { $set: { lastMessage: text, lastMessageAt: current.at } },
        );
        if (result.matchedCount === 0) break;
        written = current.waMessageId;
    }
    if (!written) return;

    const { lastMessage = '' } = await Conversation.findById(conversation._id).select('lastMessage').lean() ?? {};
    sendToAccount(String(accountId), 'conversation_updated', { id: String(conversation._id), lastMessage },
        { lineId: conversation.lineId ?? null });
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
    if (found.status !== 'found') {
        // Sin el id del original no se puede saber después por qué no se pegó
        // (2026-10-22: tres reacciones a ecos quedaron sueltas sin rastro).
        console.warn('Reacción sin su original:', {
            side, status: found.status, reason: found.reason ?? null,
            waMessageId: reaction.waMessageId, targetWaMessageId: reaction.targetWaMessageId,
        });
        return found.status;
    }
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

    await emitMessageUpdated(line.accountId, message._id, conversation);
    if (emoji) await syncReactionPreview({ accountId: line.accountId, conversation, messageId: message._id, side });
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

/**
 * Reacciona desde Wasmish a un mensaje del contacto (`canReactTo`, ya
 * comprobado, de una conversación de la sesión); `emoji: ''` la quita.
 *
 * Una a la vez por mensaje (revisión de Codex del plan, 4): antes de llamar a
 * Meta se toma el mensaje (`reactions.sendingUntil`) y se suelta al guardar o
 * al fallar. Así lo guardado es siempre lo último que aceptó Meta: dos
 * respuestas en otro orden no dejan aquí una reacción distinta de la que ve el
 * contacto. Si otra está en curso, lanza un 409 `reaction_in_progress` sin
 * llamar a Meta. Si Meta la rechaza, no se guarda nada y se relanza su error
 * (`waErrorCode`). No pausa al bot: reaccionar no es responder.
 *
 * @returns {Promise<object>} el mensaje releído.
 */
export const sendReaction = async ({ line, conversation, message, emoji, sender }) => {
    const now = new Date();
    // `findOneAndUpdate` devuelve el de antes: su reacción es `previousEmoji`.
    const before = await Message.findOneAndUpdate(
        { _id: message._id, $or: [{ 'reactions.sendingUntil': null }, { 'reactions.sendingUntil': { $lt: now } }] },
        { $set: { 'reactions.sendingUntil': new Date(now.getTime() + SENDING_LOCK_MS) } },
        { new: false, projection: { reactions: 1 } },
    ).lean();
    if (!before) {
        throw Object.assign(new Error('Alguien de tu equipo está reaccionando a este mensaje.'), {
            statusCode: 409, code: 'reaction_in_progress',
        });
    }

    let waMessageId = null;
    try {
        const response = await sendReactionMessage({
            token: decrypt(line.tokenWhatsapp),
            phoneNumberId: line.phoneNumberId,
            recipient: await getSendingRecipient(conversation, null),
            targetWaMessageId: message.waMessageId,
            emoji,
        });
        waMessageId = response?.data?.messages?.[0]?.id ?? null;
    } catch (error) {
        await Message.updateOne({ _id: message._id }, { $unset: { 'reactions.sendingUntil': '' } });
        throw error;
    }

    // La que ve el contacto: si la última nuestra falló, nunca le llegó, y sigue
    // viendo la de antes de esa (revisión de Codex del PR #116, 1).
    const last = before.reactions?.me;
    const seenByContact = last?.status === 'failed' ? last.previousEmoji : last?.emoji;

    await Message.updateOne(
        { _id: message._id },
        {
            $set: { 'reactions.me': {
                emoji: emoji || null,
                previousEmoji: seenByContact ?? null,
                at: now,
                waMessageId,
                status: 'sent',
                errorCode: null,
                errorDetail: null,
                sentBy: sender?.userId ?? null,
                sentByName: sender?.name ?? null,
                origin: 'chat',
            } },
            $unset: { 'reactions.sendingUntil': '' },
            $inc: { changeVersion: 1 },
        },
    );

    const updated = await emitMessageUpdated(line.accountId, message._id, conversation);
    if (emoji) await syncReactionPreview({ accountId: line.accountId, conversation, messageId: message._id, side: 'me' });
    return updated;
};
