// Las citas (responder a un mensaje concreto, spec 2026-10-20-citas-reacciones-design.md).
// El citado se busca SIEMPRE dentro de su conversación: un `waMessageId` o un
// id de otra conversación nunca se enlaza, aunque sea de la misma cuenta.

import mongoose from 'mongoose';
import Message from '../models/message.model.js';
import { canReplyTo } from '../utils/message.actions.js';

// Lo que necesita el resumen de la cita (`serializeQuoted`).
const QUOTED_FIELDS = '_id sender type text mediaFile deletedAt sentBy sentByName origin campaignId';

/** El mensaje citado por un entrante o un eco (`context.id`), si es de esa conversación; si no, null. */
export const findQuotedMessage = (conversationId, waMessageId) =>
    waMessageId ? Message.findOne({ conversationId, waMessageId }).select(QUOTED_FIELDS).lean() : null;

/**
 * Los citados de una página de mensajes, de una vez: `Map` id → mensaje, para
 * `serializeMessage(msg, { quoted })`. Solo los de `conversationId`.
 */
export const loadQuotedMessages = async (msgs, conversationId) => {
    const ids = [...new Set(msgs.map(msg => msg.replyTo?.messageId).filter(Boolean).map(String))];
    if (ids.length === 0) return new Map();
    const quoted = await Message.find({ _id: { $in: ids }, conversationId }).select(QUOTED_FIELDS).lean();
    return new Map(quoted.map(msg => [String(msg._id), msg]));
};

/**
 * El mensaje que se cita al responder desde Wasmish (`replyToMessageId`): solo
 * de `conversation`, que quien llama ya comprobó que es de la sesión. Un id
 * inválido o de otra conversación es `not_found` (404, como lo ajeno);
 * `unavailable` (400): no se puede citar (`canReplyTo`: no salió, borrado o
 * una reacción suelta).
 *
 * @returns {Promise<{ status: 'ok', message }|{ status: 'not_found' }|{ status: 'unavailable' }>}
 */
export const findReplyTarget = async (conversation, messageId) => {
    if (!mongoose.isValidObjectId(messageId)) return { status: 'not_found' };
    const message = await Message.findOne({ _id: messageId, conversationId: conversation._id }).lean();
    if (!message) return { status: 'not_found' };
    if (!canReplyTo(message)) return { status: 'unavailable' };
    return { status: 'ok', message };
};

/** Un `Map` con un solo citado, para serializar un mensaje recién guardado. */
export const quotedMapOf = (quoted) => (quoted ? new Map([[String(quoted._id), quoted]]) : undefined);
