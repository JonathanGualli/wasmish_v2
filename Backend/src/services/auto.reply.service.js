import Conversation from "../models/conversation.model.js";
import AutoReplySettings from "../models/auto.reply.settings.model.js";

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

// Una reacción (👍) no es un mensaje que contestar: ni deja trabajo.
const NO_JOB_TYPES = new Set(['reaction']);

/**
 * El trabajo que lleva un entrante nuevo (`Message.bot`), o null si la cuenta
 * no tiene las respuestas encendidas. `previousInboundAt` es el último entrante
 * del contacto en TODA la cuenta, leído de la BD antes de que el webhook guarde
 * la conversación con el nuevo: decide la bienvenida. Nunca lanza: si falla,
 * el entrante se guarda igual, solo sin respuesta automática.
 */
export const buildAutoReplyJob = async ({ accountId, contactId, type, now = new Date() }) => {
    if (NO_JOB_TYPES.has(type)) return null;
    try {
        const settings = await AutoReplySettings.findOne({ userId: accountId }).select('enabled').lean();
        if (!settings?.enabled) return null;

        const last = await Conversation.findOne({ userId: accountId, contactId, lastInboundAt: { $ne: null } })
            .sort({ lastInboundAt: -1 }).select('lastInboundAt').lean();
        return {
            status: 'waiting',
            active: true,
            previousInboundAt: last?.lastInboundAt ?? null,
            runAfter: now,
            attempts: 0,
        };
    } catch (error) {
        console.error('No se pudo preparar la respuesta automática:', { accountId: String(accountId), error: error.message });
        return null;
    }
};
