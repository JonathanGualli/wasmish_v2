import mongoose from 'mongoose';
import Conversation from '../models/conversation.model.js';
import { sendAssignmentChange, sendToAccount } from '../controllers/stream.controller.js';
import { conversationLineScope, conversationMeta } from '../utils/permissions.js';
import { replyAcquisition } from '../utils/assignment.js';
import { contactDisplayName } from '../utils/contact.identity.js';
import { getWindowExpiry } from '../utils/whatsapp.window.js';

// ---------------------------------------------------------------------------
// La asignación de conversaciones (Fase 4 de multi-línea). Las reglas puras
// están en utils/assignment.js y utils/permissions.js; aquí, lo que lee y
// escribe la BD y avisa por SSE. Es el único sitio que escribe `assignedTo`.
// ---------------------------------------------------------------------------

/**
 * La `meta` de los eventos de una conversación, leída AHORA: entre leer la
 * conversación y emitir pueden pasar segundos (la llamada a Meta, descargar un
 * adjunto) y en ese tiempo cambiar de manos. Con la del principio, el evento le
 * llegaría a quien ya la perdió (revisión de Codex del plan de la Fase 4, 2).
 * `null` si ya no existe.
 */
export const currentConversationMeta = async (conversationId) => {
    const conversation = await Conversation.findById(conversationId).select('lineId assignedTo').lean();
    return conversation ? conversationMeta(conversation) : null;
};

/**
 * Un evento de una conversación, a quien la ve en este momento. Nunca lanza:
 * quien emite ya hizo lo suyo (guardó el mensaje, el acuse), y un aviso que no
 * sale lo arregla el siguiente o recargar.
 */
export const sendConversationEvent = async (accountId, conversationId, event, data) => {
    try {
        const meta = await currentConversationMeta(conversationId);
        if (meta) sendToAccount(String(accountId), event, data, meta);
    } catch (error) {
        console.error('No se pudo avisar de un evento de conversación:', { event, error: error.message });
    }
};

// Una persona como la ven la bandeja y el chat (con `populate` de `name`).
const personOf = (user) => (user?._id ? { id: String(user._id), name: user.name ?? null } : null);

/**
 * Una conversación como la da la lista de la bandeja, y también el evento
 * `conversation_assigned` y las respuestas de asignar (Fase 4). `item` viene
 * de `populateConversation`.
 */
export const serializeConversation = (item) => {
    // `populate` deja el contacto en `contactId`. Una conversación anterior
    // a los contactos aún no lo tiene: se usa lo que ella misma guardaba.
    const contact = item.contactId ?? { name: item.contactName, phone: item.contactPhone };
    return {
        id: String(item._id),
        // La ficha del contacto en el chat. `null` en una conversación
        // anterior a los contactos que aún no se enlazó.
        contactId: item.contactId?._id ? String(item.contactId._id) : null,
        // La línea de la conversación (Fase 2c: la bandeja la enseña y filtra por ella).
        lineId: item.lineId ? String(item.lineId) : null,
        title: contactDisplayName(contact),
        phone: contact.phone ?? null,
        username: contact.username ?? null,
        lastMessage: item.lastMessage || '',
        updatedAt: (item.lastMessageAt || item.updatedAt).toISOString(),
        unreadCount: item.unreadCount || 0,
        windowExpiresAt: getWindowExpiry(item.lastInboundAt)?.toISOString() ?? null,
        // Quién la atiende y quién pidió que se la pasen (Fase 4).
        assignedTo: personOf(item.assignedTo),
        transferRequest: item.transferRequest?.requestedBy
            ? {
                id: String(item.transferRequest.id),
                requestedBy: personOf(item.transferRequest.requestedBy),
                requestedAt: item.transferRequest.requestedAt.toISOString(),
            }
            : null,
    };
};

/** Lo que `serializeConversation` necesita de una consulta de conversaciones. */
export const populateConversation = (query) => query
    .populate('contactId', 'name agendaName profileName username phone')
    .populate('assignedTo', 'name')
    .populate('transferRequest.requestedBy', 'name');

/**
 * Avisa de que una conversación cambió de manos: `before` es su
 * `conversationMeta` de antes; lo de después se lee ya escrito. Quien la sigue
 * viendo recibe la conversación entera; quien la pierde, `conversation_revoked`.
 */
export const emitAssignmentChange = async (accountId, before, conversationId) => {
    try {
        const updated = await populateConversation(Conversation.findById(conversationId)).lean();
        if (!updated) return;
        sendAssignmentChange(String(accountId), serializeConversation(updated), before, conversationMeta(updated));
    } catch (error) {
        console.error('No se pudo avisar de un cambio de asignación:', { error: error.message });
    }
};

const statusError = (statusCode, message, code = null, details = null) =>
    Object.assign(new Error(message), { statusCode, code, details });

/**
 * Antes de responder una conversación (y antes de llamar a Meta: spec § 2.2),
 * la adquiere quien responde. Una sola escritura condicional la toma si está
 * sin asignar: de dos personas a la vez, solo una la gana. Si ya tiene dueño
 * decide `replyAcquisition`: la suya, o quien supervisa, sigue; un agente en la
 * de un compañero recibe un 409 `assigned_to_other` sin haber enviado nada.
 * Con `strict` («Tomar»), un dueño ajeno es 409 para cualquiera.
 *
 * Busca con las líneas de `auth`, no con `conversationScope`: quien llama ya
 * comprobó que la ve, y así el que pierde la carrera recibe el 409 con el
 * nombre en lugar de un 404. Lanza 404 si no está a su alcance.
 */
export const acquireConversation = async (auth, conversationId, { strict = false } = {}) => {
    const me = new mongoose.Types.ObjectId(auth.userId);
    const base = { _id: conversationId, userId: auth.accountId, ...conversationLineScope(auth) };

    const previous = await Conversation.findOneAndUpdate(
        { ...base, assignedTo: null },
        { $set: { assignedTo: me, assignedAt: new Date(), assignedBy: me }, $unset: { transferRequest: 1 } },
        { new: false },
    ).lean();
    if (previous) {
        await emitAssignmentChange(auth.accountId, conversationMeta(previous), conversationId);
        return;
    }

    const current = await Conversation.findOne(base).select('assignedTo').populate('assignedTo', 'name').lean();
    if (!current) throw statusError(404, 'Conversation not found');
    const decision = replyAcquisition(auth, current.assignedTo);
    const isMine = String(current.assignedTo?._id) === auth.userId;
    if (decision === 'conflict' || (strict && !isMine)) {
        const assignedToName = current.assignedTo?.name ?? null;
        throw statusError(409, `Esta conversación la atiende ${assignedToName ?? 'otra persona'}.`, 'assigned_to_other',
            { assignedToName, conversationId: String(conversationId) });
    }
};

/**
 * La conversación que acaba de crear un envío (no había ninguna): la toma quien
 * envió. Si otra persona la creó a la vez y la tomó primero, se queda con ella:
 * es la carrera que el spec deja documentada (§ 4, Fase 4). Nunca lanza por eso.
 */
export const claimNewConversation = async (auth, conversationId) => {
    try {
        await acquireConversation(auth, conversationId);
    } catch (error) {
        if (error.code !== 'assigned_to_other') throw error;
    }
};

/** El cuerpo de error de un envío desde el chat: con el código y lo que haga falta para el 409 de la asignación. */
export const sendErrorBody = (error, extra = {}) =>
    [{ message: error.message, ...extra, ...(error.code && { code: error.code }), ...error.details }];
