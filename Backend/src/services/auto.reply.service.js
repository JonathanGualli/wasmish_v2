import Conversation from "../models/conversation.model.js";
import AutoReplySettings from "../models/auto.reply.settings.model.js";
import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";
import { pushRecipientIds } from "../utils/push.js";
import { conversationMeta } from "../utils/permissions.js";
import { sendToAccount } from "../controllers/stream.controller.js";
import { currentConversationMeta } from "./assignment.service.js";
import { createNotifications, emitNotificationsCreated } from "./assignment.history.service.js";
import { notifyHandoff } from "./push.service.js";

// ---------------------------------------------------------------------------
// Respuestas automáticas: lo que necesita la BD fuera del worker. Lo que
// decide qué responder es puro y vive en utils/auto.reply.js.
// ---------------------------------------------------------------------------

/**
 * Una persona respondió a mano desde el chat: el bot se calla en esa
 * conversación durante `handoffHours`. Se llama ANTES de enviar, para que el
 * bot lo vea cuanto antes (`authorizeBotSend` lo comprueba de forma atómica).
 * Si el contacto había pedido una persona, ya la tiene: se quita la marca
 * (`handoffRequest`) y la bandeja se entera. Nunca lanza: si falla, el envío
 * manual sigue igual.
 */
export const markHumanReply = async (conversationId) => {
    if (!conversationId) return;
    try {
        const before = await Conversation.findOneAndUpdate(
            { _id: conversationId },
            { $set: { 'bot.humanRepliedAt': new Date(), handoffRequest: null } },
            { projection: { userId: 1, handoffRequest: 1 } },
        ).lean();
        if (before?.handoffRequest) await emitHandoffRequest(before.userId, conversationId);
    } catch (error) {
        console.error('No se pudo pausar el bot en la conversación:', { conversationId: String(conversationId), error: error.message });
    }
};

/**
 * `conversation_updated` con la marca de «pide una persona» (`{ at }` o null),
 * a quien ve la conversación. Lo que se emite es lo que hay en la BD **ahora**,
 * leído con su línea y quién la atiende justo antes de enviar: quien pone la
 * marca y quien la quita pueden emitir cruzados, y una copia de antes volvía a
 * mostrar en la bandeja una marca ya quitada (revisión de Codex del PR #182, 3).
 * Nunca lanza.
 */
export const emitHandoffRequest = async (accountId, conversationId) => {
    try {
        const current = await Conversation.findOne({ _id: conversationId, userId: accountId })
            .select('lineId assignedTo handoffRequest').lean();
        if (!current) return;
        const at = current.handoffRequest?.at;
        sendToAccount(String(accountId), 'conversation_updated', {
            id: String(conversationId),
            handoffRequest: at ? { at: at.toISOString() } : null,
        }, conversationMeta(current));
    } catch (error) {
        console.error('No se pudo avisar de la marca de «pide una persona»:', { error: error.message });
    }
};

// Quiénes reciben el aviso de «pide una persona» ahora: los del push de un
// entrante (quien la atiende si está asignada; si no, quien ve la línea),
// tengan o no el push activado. Las personas primero y la asignación lo último,
// como en `notifyInbound`: si cambia de manos mientras se leen las personas, no
// le toca a quien la perdió (revisión de Codex del PR #182, 2).
const handoffRecipients = async (accountId, conversationId) => {
    const members = await User.find({ accountId }).select('accountId role lineIds status').lean();
    const meta = await currentConversationMeta(conversationId);
    if (!meta) return [];
    return pushRecipientIds(members, accountId, meta);
};

/**
 * El contacto tocó «hablar con una persona» (spec del bot con menús, § 4.5):
 * marca la conversación y avisa al equipo (campanita, push y bandeja).
 * Devuelve si la marcó. No la marca si ya lo estaba (un segundo toque no
 * repite nada) ni si alguien del equipo respondió DESPUÉS del toque (`tapAt`,
 * la hora de Meta), mientras el worker decidía: ya lo atendieron (revisión de
 * Codex del plan, 1). Una pausa anterior al toque no lo impide (decisión C).
 * Nunca lanza.
 */
export const requestHandoff = async ({ accountId, conversationId, messageId, tapAt, contact, now = new Date() }) => {
    try {
        const handoffRequest = { at: now, messageId };
        const marked = await Conversation.updateOne(
            {
                _id: conversationId, userId: accountId, handoffRequest: null,
                $or: [{ 'bot.humanRepliedAt': null }, { 'bot.humanRepliedAt': { $lte: tapAt } }],
            },
            { $set: { handoffRequest } },
        );
        if (marked.modifiedCount === 0) return false;

        // Quién lo recibe se vuelve a mirar justo antes de emitir: si entre
        // medias alguien perdió la línea o la conversación se asignó a otro, su
        // aviso se borra sin llegarle (revisión de Codex del plan, 2).
        const docs = await createNotifications({
            accountId, recipientIds: await handoffRecipients(accountId, conversationId), type: 'handoff', actorId: null, conversationId,
        });
        const still = new Set(await handoffRecipients(accountId, conversationId));
        const gone = docs.filter(doc => !still.has(String(doc.recipientId)));
        if (gone.length > 0) await Notification.deleteMany({ _id: { $in: gone.map(doc => doc._id) } });
        await emitNotificationsCreated(accountId, docs.filter(doc => still.has(String(doc.recipientId))));

        notifyHandoff({ accountId, conversationId, contact });
        await emitHandoffRequest(accountId, conversationId);
        return true;
    } catch (error) {
        console.error('No se pudo marcar que el contacto pide una persona:', { conversationId: String(conversationId), error: error.message });
        return false;
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
