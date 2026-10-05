import User from "../models/user.model.js";
import Conversation from "../models/conversation.model.js";
import Contact from "../models/contact.model.js";
import Message from "../models/message.model.js";
import { decrypt }  from "../utils/crypto.js";
import { sendTextMessage } from "../libs/whatsapp.js";
import { sendUser } from './stream.controller.js';
import { freeTextBlockReason, getWindowExpiry } from "../utils/whatsapp.window.js";
import { processTemplateSending } from "./template.controller.js";
import { getSendingRecipient, getSendingConversation } from "./contact.controller.js";
import { contactDisplayName } from "../utils/contact.identity.js";

// Envía un texto libre y lo persiste. El destinatario es `conversation` o, si
// no la hay, `destinationNumber` (mismo criterio que processTemplateSending).
export const processMessageSending = async ({
    user,
    conversation,
    text,
    temporalId,
    destinationNumber,
    contactName }) => {

    const token = decrypt(user.tokenWhatsapp);
    const phoneNumberId = conversation?.phoneNumberId || user.phoneNumberId;

    if (!phoneNumberId) throw new Error("Phone number ID is required");

    const recipient = await getSendingRecipient(conversation, destinationNumber);

    // Intentamos enviar a Meta. Si falla, NO abortamos: marcamos el mensaje como fallido.
    let waMessageId = null;
    let status = 'sent';
    let errorCode = null;
    let errorDetail = null;

    try {
        const apiRes = await sendTextMessage({
            token,
            phoneNumberId,
            recipient,
            text
        });
        waMessageId = apiRes?.data?.messages?.[0]?.id || null;
    } catch (error) {
        status = 'failed';
        errorCode = error.waErrorCode ? String(error.waErrorCode) : null;
        errorDetail = error.waErrorDetail || error.message;
    }

    // Si no hay conversación (mensaje nuevo), la creamos; si existe, la actualizamos
    const now = new Date();
    const targetConversation = await getSendingConversation({
        userId: user._id, conversation, recipient, phoneNumberId, contactName, source: 'manual',
    });
    targetConversation.lastMessage = text;
    targetConversation.lastMessageAt = now;
    await targetConversation.save();

    // Creamos el mensaje con su estado REAL (sent o failed)
    const msg = await Message.create({
        conversationId: targetConversation._id,
        direction: 'outbound',
        sender: 'me',
        waMessageId,
        text,
        timestamp: now,
        temporalId,
        status,
        errorCode,
        errorDetail,
        failedAt: status === 'failed' ? now : null,
    });

    // Notificamos via SSE con el estado real
    sendUser(String(user._id), 'message_created', {
        id: String(msg._id),
        conversationId: String(targetConversation._id),
        sender: 'me',
        text,
        timestamp: msg.timestamp.toISOString(),
        status,
        errorCode,
        errorDetail,
        temporalId,
    });

    return { msg, waMessageId, status, errorCode, errorDetail };
};

// Lo que se le dice al usuario según `freeTextBlockReason`.
const WINDOW_BLOCK_MESSAGES = {
    closed: 'La ventana de 24 h está cerrada: el contacto no te escribió en las últimas 24 horas. Envíale una plantilla para retomar la conversación.',
    never: 'Este contacto todavía no te ha escrito: para empezar la conversación, envíale una plantilla.',
};

// La conversación de un número, sin crear nada (el envío puede no salir). Por
// el contacto, o por `contactPhone` si es anterior a los contactos y no se enlazó.
const findConversationByNumber = async (userId, phone) => {
    const contact = await Contact.findOne({ userId, phone }).select('_id').lean();
    return Conversation.findOne({
        userId,
        $or: [...(contact ? [{ contactId: contact._id }] : []), { contactPhone: phone }],
    }).lean();
};

// El último mensaje del contacto. `lastInboundAt` lo tiene; si falta (una
// conversación anterior al campo, sin backfill) se busca, para no bloquear un
// envío válido.
const lastInboundOf = async (conversation) => {
    if (!conversation) return null;
    if (conversation.lastInboundAt) return conversation.lastInboundAt;
    const last = await Message.findOne({ conversationId: conversation._id, direction: 'inbound' })
        .sort({ timestamp: -1 }).select('timestamp').lean();
    return last?.timestamp ?? null;
};

export const sendMessageController = async (req, res) => {
    try {
        const { id } = req.params; // Puede ser undefined si es un chat nuevo
        const { text, temporalId, destinationNumber, contactName } = req.body;

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json([{ message: "User not found" }]);

        if (!id && !destinationNumber) {
            return res.status(400).json([{ message: "Conversation ID or Destination Number is required" }]);
        }

        // Con ID, la conversación tiene que ser de esta cuenta: filtrar por userId
        // es la comprobación de propiedad. Sin él, quien conociera el id de una
        // conversación ajena podía escribir en ella con el WhatsApp de su dueño.
        // Sin ID, processMessageSending reutiliza la del contacto de ese número.
        let conversation = null;
        if (id) {
            conversation = await Conversation.findOne({ _id: id, userId: user._id });
            if (!conversation) return res.status(404).json([{ message: "Conversation not found" }]);
        }

        // Fuera de la ventana de 24 h, Meta no entrega texto libre (131047): se
        // rechaza aquí, sin llamarla y sin dejar un mensaje fallido. La interfaz
        // ya lo frena; esto cubre lo que se cuele (otra pestaña, la ventana que
        // se cierra mientras se escribe). Lo que sí pasa al chat es el aviso.
        const target = conversation ?? await findConversationByNumber(user._id, destinationNumber);
        const blocked = freeTextBlockReason(await lastInboundOf(target));
        if (blocked) return res.status(409).json([{ message: WINDOW_BLOCK_MESSAGES[blocked], code: 'window_closed' }]);

        // Llamamos al servicio (que ahora persiste incluso si el envío falla)
        const { msg, status, waMessageId, errorCode, errorDetail } = await processMessageSending({
            user,
            conversation,
            text,
            temporalId,
            destinationNumber,
            contactName,
        });

        return res.status(201).json({
            id: String(msg._id),
            conversationId: String(msg.conversationId),
            sender: msg.sender,
            text: msg.text,
            timestamp: msg.timestamp.toISOString(),
            status,
            waMessageId,
            errorCode,
            errorDetail,
            temporalId: msg.temporalId,
        });


    } catch (error) {
        console.error("Error enviando mensaje:", error.response?.data || error.message || error);
        res.status(500).json([{ message: error.message }]);
    }
};


export const listConversations = async (req, res) => {
    const userId = req.user.id;
    try{
        const items = await Conversation.find({ userId })
            .sort({ lastMessageAt: -1 })
            .populate('contactId', 'name profileName username phone')
            .lean();

        const result = items.map((item) => {
            // `populate` deja el contacto en `contactId`. Una conversación anterior
            // a los contactos aún no lo tiene: se usa lo que ella misma guardaba.
            const contact = item.contactId ?? { name: item.contactName, phone: item.contactPhone };
            return {
                id: String(item._id),
                title: contactDisplayName(contact),
                phone: contact.phone ?? null,
                username: contact.username ?? null,
                lastMessage: item.lastMessage || '',
                updatedAt: (item.lastMessageAt || item.updatedAt).toISOString(),
                unreadCount: item.unreadCount || 0,
                windowExpiresAt: getWindowExpiry(item.lastInboundAt)?.toISOString() ?? null,
            };
        });

        return res.json(result);
    }catch(error){
        res.status(500).json([{ message: error.message }]);
    }
};

export const listMessages = async (req, res) => {
    const userId = req.user.id;
    const conversationId = req.params.id;
    const { before, limit } = req.query;

    try {

        const user = await User.findById(userId);
        if (!user) return res.status(404).json([{message: "User not found"}]);

        const conversation = await Conversation.findOne({ _id: conversationId, userId });
        if (!conversation) return res.status(404).json([{ message: "Conversation not found" }]);
        const pageLimit = Math.min(parseInt(limit, 10) || 20, 100);

        const cursorDate = before ? new Date(before) : null;
        const hasCursor = Boolean(cursorDate && !isNaN(cursorDate.getTime()));

        const criteria = { conversationId: conversation._id };
       if (hasCursor) { 
            criteria.timestamp = { $lt: cursorDate };
       }

        const msgs = await Message.find(criteria)
            .sort({ timestamp: -1 })
            .limit(pageLimit)
            .lean();
        
        const nextCursor = msgs.length === pageLimit 
            ? msgs[msgs.length -1].timestamp.toISOString()
            : null;
        
        const items = msgs
            .map((msg) => ({
                id: String(msg._id),
                conversationId: String(msg.conversationId),
                sender: msg.sender,
                // Los mensajes anteriores al campo no lo tienen: 'text' por defecto.
                type: msg.type || 'text',
                text: msg.text,
                // El front no necesita saber dónde está el archivo, solo si lo
                // hay: lo pide por /api/media/<id del mensaje>.
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
            }));

        // Solo marcamos como leído al ABRIR la conversación (primera página, sin cursor)
        if (!hasCursor) {
            const result = await Conversation.updateOne(
                { _id: conversation._id, userId, unreadCount: { $gt: 0 } },
                { $set: { unreadCount: 0 } }
            );

            // Emitimos solo si de verdad cambió algo
            if (result.modifiedCount > 0) {
                sendUser(String(user._id), 'conversation_updated', {
                    id: String(conversation._id),
                    unreadCount: 0,
                })
            }
        }

        return res.json({ items, nextCursor });

    } catch (error) {
        res.status(500).json([{ message: error.message }]);
    }
};

// Respuesta común de los dos envíos de plantilla desde la UI (a una
// conversación existente, o a un número para iniciar una nueva).
//
// Devolvemos el mensaje normalizado, aunque en el chat lo va a insertar el
// SSE: sin UI optimista para plantillas, no hay riesgo de duplicado.
const responderEnvioPlantilla = (res, { msg, conversation, status, errorCode, errorDetail }) => {
    if (status === 'failed') {
        return res.status(502).json([{ message: "Error enviando plantilla a WhatsApp", errorCode, errorDetail }]);
    }
    return res.status(200).json({
        id: String(msg._id),
        conversationId: String(conversation._id),
        sender: 'me',
        text: msg.text,
        timestamp: msg.timestamp.toISOString(),
        status,
        templateName: msg.templateName ?? null,
    });
};

const responderErrorPlantilla = (res, error) => {
    const status = error.statusCode || (error.waErrorCode ? 502 : 500);
    if (status >= 500) console.error('Envío de plantilla desde el chat falló:', error.message);
    return res.status(status).json([{
        message: error.message,
        errorCode: error.waErrorCode ?? null,
    }]);
};

export const sendConversationTemplateController = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        // Filtrar por userId además del _id es la comprobación de propiedad:
        // sin eso, cualquier sesión podría enviar en la conversación de otro.
        const conversation = await Conversation.findOne({ _id: id, userId });
        if (!conversation) return res.status(404).json([{ message: "Conversation not found" }]);

        const user = await User.findById(userId);
        if (!user) return res.status(404).json([{ message: "User not found" }]);

        const resultado = await processTemplateSending({
            user,
            conversation,
            templateName: req.body.templateName,
            language: req.body.language,
            parameters: req.body.parameters ?? [],
            buttons: req.body.buttons ?? [],
        });

        return responderEnvioPlantilla(res, resultado);
    } catch (error) {
        return responderErrorPlantilla(res, error);
    }
};

// Iniciar una conversación desde la bandeja. A un número que nunca escribió
// WhatsApp solo le entrega plantillas aprobadas, así que la conversación nace
// con una. `processTemplateSending` la crea si no existe o reutiliza la del
// contacto de ese número (el índice { userId, contactId } no admite dos), y ya
// la filtra por el user de la sesión: no hay conversación ajena que comprobar.
export const startConversationTemplateController = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json([{ message: "User not found" }]);

        const resultado = await processTemplateSending({
            user,
            destinationNumber: req.body.destinationNumber,
            contactName: req.body.contactName || undefined,
            source: 'manual',
            templateName: req.body.templateName,
            language: req.body.language,
            parameters: req.body.parameters ?? [],
            buttons: req.body.buttons ?? [],
        });

        return responderEnvioPlantilla(res, resultado);
    } catch (error) {
        return responderErrorPlantilla(res, error);
    }
};
