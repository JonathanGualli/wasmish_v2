import mongoose from 'mongoose';
import Conversation from '../models/conversation.model.js';
import User from '../models/user.model.js';
import { sendAssignmentChange, sendToAccount, sendToUser } from '../controllers/stream.controller.js';
import { conversationLineScope, conversationMeta, conversationScope } from '../utils/permissions.js';
import { canReassign, isValidAssignee, releaseFilter, replyAcquisition } from '../utils/assignment.js';
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

const INVALID_ASSIGNEE_MESSAGE = 'Esa persona no puede atender esta línea.';
const ASSIGNMENT_CHANGED_MESSAGE = 'La conversación cambió de manos. Vuelve a intentarlo.';

const MEMBER_FIELDS = 'name role lineIds status accountId';

/**
 * Después de cada escritura que asigna una conversación a `userId`, comprueba
 * que esa persona todavía puede atenderla y, si no, la suelta (con la
 * condición de que siga siendo suya). Cierra la carrera con quitarle el acceso
 * sin un candado: `updateMember` guarda el `User` ANTES de liberar sus
 * conversaciones, así que o la liberación encuentra esta asignación, o aquí se
 * lee el `User` ya cambiado (revisión de Codex del plan de la Fase 4, 1).
 * Devuelve si sigue valiendo; quien llama avisa del cambio y responde 409.
 */
export const confirmAssignee = async (accountId, conversationId, userId) => {
    const [member, conversation] = await Promise.all([
        User.findOne({ _id: userId, accountId }).select(MEMBER_FIELDS).lean(),
        Conversation.findById(conversationId).select('lineId').lean(),
    ]);
    if (conversation && isValidAssignee(member, conversation.lineId)) return true;
    await Conversation.updateOne(
        { _id: conversationId, assignedTo: userId },
        { $set: { assignedTo: null, assignedAt: new Date(), assignedBy: null }, $unset: { transferRequest: 1 } },
    );
    return false;
};

const invalidAssignee = () => statusError(409, INVALID_ASSIGNEE_MESSAGE, 'invalid_assignee');

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
        const valid = await confirmAssignee(auth.accountId, conversationId, auth.userId);
        await emitAssignmentChange(auth.accountId, conversationMeta(previous), conversationId);
        if (!valid) throw invalidAssignee();
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

// La conversación como la ve `auth` (404 si no): sus líneas y, el agente, sin asignar o suya.
const findVisibleConversation = async (auth, conversationId) => {
    const conversation = mongoose.isValidObjectId(conversationId)
        ? await Conversation.findOne({ _id: conversationId, userId: auth.accountId, ...conversationScope(auth) }).lean()
        : null;
    if (!conversation) throw statusError(404, 'Conversation not found');
    return conversation;
};

const serializedConversation = async (conversationId) =>
    serializeConversation(await populateConversation(Conversation.findById(conversationId)).lean());

/** «Tomar» (POST /chats/:id/take): suya si está sin asignar; si es de otro, 409 para cualquiera. */
export const takeConversation = async (auth, conversationId) => {
    await findVisibleConversation(auth, conversationId);
    await acquireConversation(auth, conversationId, { strict: true });
    return serializedConversation(conversationId);
};

/**
 * Asignar o pasar una conversación a `targetUserId` (null la deja sin
 * asignar). Con `conversations.assign`, cualquiera de sus líneas; el agente,
 * solo la suya (`canReassign`). La escritura lleva en el filtro el dueño leído:
 * si otro la movió entretanto, 409 y nada cambia.
 */
export const assignConversation = async (auth, conversationId, targetUserId) => {
    const conversation = await findVisibleConversation(auth, conversationId);
    if (!canReassign(auth, conversation.assignedTo)) {
        throw statusError(403, 'Solo puedes transferir las conversaciones que atiendes.', 'forbidden');
    }

    let target = null;
    if (targetUserId !== null) {
        const member = mongoose.isValidObjectId(targetUserId)
            ? await User.findOne({ _id: targetUserId, accountId: auth.accountId }).select(MEMBER_FIELDS).lean()
            : null;
        if (!isValidAssignee(member, conversation.lineId)) throw statusError(400, INVALID_ASSIGNEE_MESSAGE, 'invalid_assignee');
        target = member._id;
    }
    if (String(conversation.assignedTo ?? null) === String(target)) return serializedConversation(conversationId);

    const me = new mongoose.Types.ObjectId(auth.userId);
    const previous = await Conversation.findOneAndUpdate(
        { _id: conversation._id, userId: auth.accountId, assignedTo: conversation.assignedTo ?? null },
        { $set: { assignedTo: target, assignedAt: new Date(), assignedBy: me }, $unset: { transferRequest: 1 } },
        { new: false },
    ).lean();
    if (!previous) throw statusError(409, ASSIGNMENT_CHANGED_MESSAGE, 'assignment_changed');

    const valid = target === null || await confirmAssignee(auth.accountId, conversation._id, target);
    await emitAssignmentChange(auth.accountId, conversationMeta(previous), conversation._id);
    if (!valid) throw invalidAssignee();
    return serializedConversation(conversationId);
};

/** Quiénes pueden atender una conversación: los activos de la cuenta con su línea, en orden de alta. */
export const listAssignees = async (auth, conversationId) => {
    const conversation = await findVisibleConversation(auth, conversationId);
    const members = await User.find({ accountId: auth.accountId, status: { $ne: 'inactive' } })
        .select(MEMBER_FIELDS).sort({ createdAt: 1 }).lean();
    return members
        .filter(member => isValidAssignee(member, conversation.lineId))
        .map(member => ({ id: String(member._id), name: member.name ?? null, role: member.role }));
};

// La solicitud pendiente, a quien la ve: la persona que la atiende y quien supervisa.
const emitTransferRequest = async (accountId, conversationId) => {
    const { transferRequest } = await serializedConversation(conversationId);
    await sendConversationEvent(accountId, conversationId, 'transfer_requested', { id: String(conversationId), transferRequest });
};

/**
 * Pedir que te pasen una conversación que atiende otra persona. No hace falta
 * verla, solo que sea de sus líneas (spec § 4, Fase 4): por eso busca con
 * `conversationLineScope`. Una nueva reemplaza a la que hubiera, con otro `id`.
 */
export const requestTransfer = async (auth, conversationId) => {
    const conversation = mongoose.isValidObjectId(conversationId)
        ? await Conversation.findOne({ _id: conversationId, userId: auth.accountId, ...conversationLineScope(auth) })
            .select('assignedTo').lean()
        : null;
    if (!conversation) throw statusError(404, 'Conversation not found');
    if (!conversation.assignedTo) throw statusError(409, 'Nadie la atiende: respóndela y será tuya.', 'not_assigned');
    if (String(conversation.assignedTo) === auth.userId) throw statusError(409, 'Ya la atiendes tú.', 'already_yours');

    const request = {
        id: new mongoose.Types.ObjectId(),
        requestedBy: new mongoose.Types.ObjectId(auth.userId),
        requestedAt: new Date(),
    };
    const result = await Conversation.updateOne(
        { _id: conversation._id, assignedTo: conversation.assignedTo },
        { $set: { transferRequest: request } },
    );
    if (result.matchedCount === 0) throw statusError(409, ASSIGNMENT_CHANGED_MESSAGE, 'assignment_changed');
    await emitTransferRequest(auth.accountId, conversation._id);
};

/**
 * Aceptar (`accept`) o rechazar la solicitud `requestId` de una conversación:
 * quien la atiende, o quien tiene `conversations.assign`. `requestId` es la
 * que la persona tiene a la vista: si la reemplazó otra, 409 y nada cambia
 * (revisión de Codex del plan de la Fase 4, 5). Al solicitante se le avisa con
 * `transfer_answered`: sin la conversación, sus eventos no le llegan.
 */
export const answerTransfer = async (auth, conversationId, requestId, accept) => {
    const conversation = await findVisibleConversation(auth, conversationId);
    if (!canReassign(auth, conversation.assignedTo)) {
        throw statusError(403, 'Solo puedes responder las solicitudes de las conversaciones que atiendes.', 'forbidden');
    }
    const pending = conversation.transferRequest;
    if (!pending) throw statusError(404, 'Esta conversación no tiene ninguna solicitud pendiente.', 'no_transfer_request');
    if (String(pending.id) !== String(requestId)) {
        throw statusError(409, 'La solicitud cambió. Revísala de nuevo.', 'transfer_request_changed');
    }
    const requester = pending.requestedBy;
    const ofThisRequest = { _id: conversation._id, 'transferRequest.id': pending.id };
    const answered = (accepted) =>
        sendToUser(String(auth.accountId), String(requester), 'transfer_answered', { id: String(conversation._id), accepted });

    if (!accept) {
        const result = await Conversation.updateOne(ofThisRequest, { $unset: { transferRequest: 1 } });
        if (result.matchedCount === 0) throw statusError(409, 'La solicitud cambió. Revísala de nuevo.', 'transfer_request_changed');
        await emitTransferRequest(auth.accountId, conversation._id);
        answered(false);
        return null;
    }

    const member = await User.findOne({ _id: requester, accountId: auth.accountId }).select(MEMBER_FIELDS).lean();
    if (!isValidAssignee(member, conversation.lineId)) {
        await Conversation.updateOne(ofThisRequest, { $unset: { transferRequest: 1 } });
        await emitTransferRequest(auth.accountId, conversation._id);
        throw statusError(409, 'Quien la pidió ya no puede atender esta línea.', 'invalid_assignee');
    }

    const previous = await Conversation.findOneAndUpdate(
        { ...ofThisRequest, assignedTo: conversation.assignedTo ?? null },
        {
            $set: { assignedTo: requester, assignedAt: new Date(), assignedBy: new mongoose.Types.ObjectId(auth.userId) },
            $unset: { transferRequest: 1 },
        },
        { new: false },
    ).lean();
    if (!previous) throw statusError(409, ASSIGNMENT_CHANGED_MESSAGE, 'assignment_changed');

    const valid = await confirmAssignee(auth.accountId, conversation._id, requester);
    await emitAssignmentChange(auth.accountId, conversationMeta(previous), conversation._id);
    if (!valid) throw invalidAssignee();
    answered(true);
    return serializedConversation(conversation._id);
};

/**
 * Suelta las conversaciones de `member` (el `User` ya cambiado, con su
 * `accountId`) que ya no puede atender, y borra las solicitudes que pidió de
 * esas líneas. Sin límite de líneas no hay nada que soltar: un `null` no se
 * expande, que dejaría el filtro sin condición (revisión de Codex del plan, 3).
 * Las conversaciones soltadas pierden también la solicitud que tuvieran, de
 * quien fuera (4). Avisa con un solo `conversations_updated`: pueden ser cientos.
 */
export const releaseAssignments = async (accountId, member) => {
    const filter = releaseFilter(member);
    if (filter === null) return 0;
    const [freed, dropped] = await Promise.all([
        Conversation.updateMany(
            { userId: accountId, assignedTo: member._id, ...filter },
            { $set: { assignedTo: null, assignedAt: new Date(), assignedBy: null }, $unset: { transferRequest: 1 } },
        ),
        Conversation.updateMany(
            { userId: accountId, 'transferRequest.requestedBy': member._id, ...filter },
            { $unset: { transferRequest: 1 } },
        ),
    ]);
    if (freed.modifiedCount + dropped.modifiedCount > 0) sendToAccount(String(accountId), 'conversations_updated', {});
    return freed.modifiedCount;
};

/** El cuerpo de error de un envío desde el chat: con el código y lo que haga falta para el 409 de la asignación. */
export const sendErrorBody = (error, extra = {}) =>
    [{ message: error.message, ...extra, ...(error.code && { code: error.code }), ...error.details }];
