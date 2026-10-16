import Conversation from "../models/conversation.model.js";

// ---------------------------------------------------------------------------
// Respuestas automáticas: lo que necesita la BD fuera del worker. Lo que
// decide qué responder es puro y vive en utils/auto.reply.js.
// ---------------------------------------------------------------------------

/**
 * Una persona respondió a mano desde el chat: el bot se calla en esa
 * conversación durante `handoffHours`. Se llama ANTES de enviar, para que el
 * bot lo vea cuanto antes (`authorizeBotSend` lo comprueba de forma atómica).
 * Nunca lanza: si falla, el envío manual sigue igual.
 */
export const markHumanReply = async (conversationId) => {
    if (!conversationId) return;
    try {
        await Conversation.updateOne({ _id: conversationId }, { $set: { 'bot.humanRepliedAt': new Date() } });
    } catch (error) {
        console.error('No se pudo pausar el bot en la conversación:', { conversationId: String(conversationId), error: error.message });
    }
};
