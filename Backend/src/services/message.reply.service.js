// Las citas (responder a un mensaje concreto, spec 2026-10-20-citas-reacciones-design.md).
// El citado se busca SIEMPRE dentro de su conversación: un `waMessageId` o un
// id de otra conversación nunca se enlaza, aunque sea de la misma cuenta.

import Message from '../models/message.model.js';

// Lo que necesita el resumen de la cita (`serializeQuoted`).
const QUOTED_FIELDS = '_id sender type text mediaFile deletedAt';

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

/** Un `Map` con un solo citado, para serializar un mensaje recién guardado. */
export const quotedMapOf = (quoted) => (quoted ? new Map([[String(quoted._id), quoted]]) : undefined);
