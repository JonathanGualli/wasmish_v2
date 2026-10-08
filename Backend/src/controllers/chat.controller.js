import User from "../models/user.model.js";
import Conversation from "../models/conversation.model.js";
import Contact from "../models/contact.model.js";
import Message from "../models/message.model.js";
import { decrypt }  from "../utils/crypto.js";
import { sendMediaMessage, sendTextMessage, uploadMedia } from "../libs/whatsapp.js";
import { sendUser } from './stream.controller.js';
import { freeTextBlockReason, getWindowExpiry } from "../utils/whatsapp.window.js";
import { processTemplateSending } from "./template.controller.js";
import { getSendingRecipient, getSendingConversation } from "./contact.controller.js";
import { contactDisplayName } from "../utils/contact.identity.js";
import {
    CAPTION_MAX, buildMediaObject, captionAllowed, outboundMediaIssue, outboundMediaKind, outboundMediaText,
} from "../utils/outbound.media.js";
import { mimeBase, saveByContentHash } from "../utils/media.storage.js";
import { cleanFilename } from "../services/template.media.service.js";
import { MEDIA_DIR } from "../config.js";

/**
 * Un mensaje tal como lo ve el frontend: la lista del chat, la respuesta de un
 * envío y su `message_created`. Del archivo solo se dice si lo hay: se pide por
 * /api/media/<id del mensaje>, que comprueba de quién es.
 */
export const serializeMessage = (msg) => ({
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
});

// A Meta: un texto o, si hay archivo, el archivo. El archivo se sube primero
// (el id que devuelve es del número que lo subió) y se envía por ese id.
const sendToMeta = async ({ token, phoneNumberId, recipient, text, attachment }) => {
    if (!attachment) return sendTextMessage({ token, phoneNumberId, recipient, text });

    const { kind, buffer, mimeType, filename, caption } = attachment;
    const mediaId = await uploadMedia({ token, phoneNumberId, buffer, mimeType, filename });
    const media = buildMediaObject(kind, { mediaId, caption, filename });
    return sendMediaMessage({ token, phoneNumberId, recipient, kind, media });
};

// Lo que guarda el `Message` de un archivo enviado: lo mismo que el de uno
// recibido, así el chat lo pinta igual.
const attachmentFields = ({ kind, mimeType, file, filename, size, caption }) => ({
    type: kind,
    mimeType,
    mediaFile: file,
    mediaFilename: kind === 'document' ? filename : null,
    mediaSize: size,
    caption: caption || null,
});

/**
 * Envía un mensaje libre (un texto o, con `attachment`, un archivo) y lo
 * persiste. El destinatario es `conversation` o, si no la hay,
 * `destinationNumber` (mismo criterio que processTemplateSending). Si Meta lo
 * rechaza no se aborta: el mensaje se guarda como fallido (con su archivo),
 * para que se vea qué no salió y por qué.
 *
 * `attachment` = `{ kind, buffer, mimeType, file, filename, size, caption }`:
 * ya validado (`outboundMediaIssue`) y guardado en MEDIA_DIR (`file`).
 */
export const processMessageSending = async ({
    user,
    conversation,
    text,
    temporalId,
    destinationNumber,
    contactName,
    attachment = null }) => {

    const token = decrypt(user.tokenWhatsapp);
    const phoneNumberId = conversation?.phoneNumberId || user.phoneNumberId;

    if (!phoneNumberId) throw new Error("Phone number ID is required");

    const recipient = await getSendingRecipient(conversation, destinationNumber);

    let waMessageId = null;
    let status = 'sent';
    let errorCode = null;
    let errorDetail = null;

    try {
        const apiRes = await sendToMeta({ token, phoneNumberId, recipient, text, attachment });
        waMessageId = apiRes?.data?.messages?.[0]?.id || null;
    } catch (error) {
        status = 'failed';
        errorCode = error.waErrorCode ? String(error.waErrorCode) : null;
        errorDetail = error.waErrorDetail || error.message;
    }

    // Lo que se ve en la bandeja: el texto, o lo escrito junto al archivo (o su etiqueta).
    const messageText = attachment ? outboundMediaText(attachment.kind, attachment) : text;

    // Si no hay conversación (mensaje nuevo), la creamos; si existe, la actualizamos
    const now = new Date();
    const targetConversation = await getSendingConversation({
        userId: user._id, conversation, recipient, phoneNumberId, contactName, source: 'manual',
    });
    targetConversation.lastMessage = messageText;
    targetConversation.lastMessageAt = now;
    await targetConversation.save();

    // Creamos el mensaje con su estado REAL (sent o failed)
    const msg = await Message.create({
        conversationId: targetConversation._id,
        direction: 'outbound',
        sender: 'me',
        waMessageId,
        text: messageText,
        ...(attachment && attachmentFields(attachment)),
        timestamp: now,
        temporalId,
        status,
        errorCode,
        errorDetail,
        failedAt: status === 'failed' ? now : null,
    });

    sendUser(String(user._id), 'message_created', serializeMessage(msg));

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

// Pone a cero los no leídos de una conversación y avisa por SSE a todas las
// pestañas. Leer es abrir el chat o responder desde él: que un mensaje llegue
// con el chat a la vista no basta. El filtro `unreadCount > 0` evita escribir y
// emitir si ya estaba leída. Nunca lanza: quien la llama ya hizo lo suyo (cargó
// los mensajes, envió la respuesta) y un fallo aquí solo deja el contador igual.
const markConversationRead = async (userId, conversationId) => {
    try {
        const result = await Conversation.updateOne(
            { _id: conversationId, userId, unreadCount: { $gt: 0 } },
            { $set: { unreadCount: 0 } }
        );
        if (result.modifiedCount > 0) {
            sendUser(String(userId), 'conversation_updated', {
                id: String(conversationId),
                unreadCount: 0,
            });
        }
    } catch (error) {
        console.error('No se pudo marcar la conversación como leída:', error.message);
    }
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
        const { msg } = await processMessageSending({
            user,
            conversation,
            text,
            temporalId,
            destinationNumber,
            contactName,
        });

        // Responder desde el chat es haberlo leído, aunque Meta lo rechace: se
        // leyó y se intentó contestar.
        await markConversationRead(user._id, msg.conversationId);

        return res.status(201).json(serializeMessage(msg));
    } catch (error) {
        console.error("Error enviando mensaje:", error.response?.data || error.message || error);
        res.status(500).json([{ message: error.message }]);
    }
};

// Un texto que llega en una cabecera HTTP, codificado (`encodeURIComponent`)
// para que quepan tildes y emojis.
const decodeHeader = (raw) => {
    try {
        return decodeURIComponent(String(raw ?? '')).trim();
    } catch {
        return '';
    }
};

/**
 * POST /chats/:id/media — enviar un archivo a una conversación. El cuerpo es
 * el archivo crudo (Content-Type = su tipo); el nombre, el texto que lo
 * acompaña y el `temporalId` van en cabeceras (`X-Filename`, `X-Caption`,
 * `X-Temporal-Id`), y `X-Send-As: document` manda una imagen como documento.
 *
 * Es texto libre para WhatsApp: fuera de la ventana de 24 h, 409 como el texto.
 * El archivo se valida (tipo, tamaño y firma de bytes) y se guarda antes de
 * llamar a Meta, así el chat lo enseña aunque Meta lo rechace.
 */
export const sendMediaMessageController = async (req, res) => {
    try {
        const userId = req.user.id;
        // Filtrar por userId es la comprobación de propiedad.
        const conversation = await Conversation.findOne({ _id: req.params.id, userId });
        if (!conversation) return res.status(404).json([{ message: "Conversation not found" }]);

        const user = await User.findById(userId);
        if (!user) return res.status(404).json([{ message: "User not found" }]);

        const blocked = freeTextBlockReason(await lastInboundOf(conversation));
        if (blocked) return res.status(409).json([{ message: WINDOW_BLOCK_MESSAGES[blocked], code: 'window_closed' }]);

        const buffer = Buffer.isBuffer(req.body) ? req.body : null;
        const mimeType = mimeBase(req.headers['content-type']);
        const asDocument = req.headers['x-send-as'] === 'document';
        const issue = outboundMediaIssue({ mimeType, size: buffer?.length ?? 0, buffer, asDocument });
        if (issue) return res.status(400).json([{ message: issue }]);

        const kind = outboundMediaKind(mimeType, { asDocument });
        const caption = captionAllowed(kind) ? decodeHeader(req.headers['x-caption']) || null : null;
        if (caption && caption.length > CAPTION_MAX) {
            return res.status(400).json([{ message: `El texto que acompaña al archivo admite hasta ${CAPTION_MAX} caracteres.` }]);
        }

        const file = await saveByContentHash(MEDIA_DIR, 'outbound', buffer, mimeType);
        const { msg } = await processMessageSending({
            user,
            conversation,
            temporalId: String(req.headers['x-temporal-id'] ?? '').slice(0, 64) || undefined,
            attachment: {
                kind, buffer, mimeType, file, caption,
                filename: cleanFilename(req.headers['x-filename']),
                size: buffer.length,
            },
        });

        // Responder con un archivo también es haberlo leído.
        await markConversationRead(userId, conversation._id);

        return res.status(201).json(serializeMessage(msg));
    } catch (error) {
        console.error("Error enviando archivo:", error.message);
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
                // La ficha del contacto en el chat. `null` en una conversación
                // anterior a los contactos que aún no se enlazó.
                contactId: item.contactId?._id ? String(item.contactId._id) : null,
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
        
        const items = msgs.map(serializeMessage);

        // Solo marcamos como leído al ABRIR la conversación (primera página, sin cursor)
        if (!hasCursor) await markConversationRead(userId, conversation._id);

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

        // Responder con una plantilla también es haberlo leído.
        await markConversationRead(userId, conversation._id);
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
