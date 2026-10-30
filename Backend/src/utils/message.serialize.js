import { messageOrigin, messageSender } from "./message.origin.js";
import { serializeMessageChange } from "./message.change.js";
import { canReactTo, canReplyTo, serializeQuoted, serializeReactions } from "./message.actions.js";

/**
 * Un mensaje tal como lo ve el frontend: la lista del chat, la respuesta de un
 * envío y su `message_created`. Del archivo solo se dice si lo hay: se pide por
 * /api/media/<id del mensaje>, que comprueba de quién es.
 */
// `campaignNames` (id → nombre): para decir de qué campaña salió (ver `messageOrigin`).
// `quoted` (id → mensaje, `loadQuotedMessages`): los citados, para el resumen de la cita.
export const serializeMessage = (msg, { campaignNames, quoted } = {}) => ({
    id: String(msg._id),
    conversationId: String(msg.conversationId),
    sender: msg.sender,
    // Los mensajes anteriores al campo no lo tienen: 'text' por defecto.
    type: msg.type || 'text',
    text: msg.text,
    hasMedia: Boolean(msg.mediaFile),
    caption: msg.caption ?? null,
    mediaFilename: msg.mediaFilename ?? null,
    mediaSize: msg.mediaSize ?? null,
    timestamp: (msg.timestamp || msg.createdAt).toISOString(),
    status: msg.status || 'sent',
    deliveredAt: msg.deliveredAt ? msg.deliveredAt.toISOString() : null,
    readAt: msg.readAt ? msg.readAt.toISOString() : null,
    failedAt: msg.failedAt ? msg.failedAt.toISOString() : null,
    errorCode: msg.errorCode,
    errorDetail: msg.errorDetail,
    waMessageId: msg.waMessageId || null,
    // Con él la UI pinta «Plantilla · nombre» y los botones de la plantilla.
    templateName: msg.templateName ?? null,
    // Con él la UI optimista reconoce su mensaje cuando vuelve por el SSE.
    temporalId: msg.temporalId ?? undefined,
    // Quién lo envió y de dónde salió (Fase 3): con varias personas, el chat lo dice.
    sentBy: messageSender(msg),
    origin: messageOrigin(msg, campaignNames),
    // Borrado o editado (coexistencia): lo mismo que trae `message_updated`.
    ...serializeMessageChange(msg),
    // Citas y reacciones (spec 2026-10-20): a qué responde (resumen leído al
    // servir), si es un reenvío, las reacciones y qué se puede hacer con él.
    replyTo: serializeQuoted(msg.replyTo, msg.replyTo?.messageId ? quoted?.get(String(msg.replyTo.messageId)) : null),
    forwarded: msg.forwarded ?? null,
    reactions: serializeReactions(msg),
    canReact: canReactTo(msg),
    canReply: canReplyTo(msg),
});
