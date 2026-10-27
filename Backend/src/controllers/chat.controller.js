import mongoose from "mongoose";
import Conversation from "../models/conversation.model.js";
import Contact from "../models/contact.model.js";
import Message from "../models/message.model.js";
import { decrypt }  from "../utils/crypto.js";
import { sendMediaMessage, sendTextMessage, uploadMedia } from "../libs/whatsapp.js";
import {
    acquireConversation, claimNewConversation, populateConversation, sendConversationEvent, sendErrorBody, serializeConversation,
} from '../services/assignment.service.js';
import { freeTextBlockReason } from "../utils/whatsapp.window.js";
import { processTemplateSending } from "./template.controller.js";
import { getSendingRecipient, getSendingConversation, conversationLineFilter } from "./contact.controller.js";
import {
    CAPTION_MAX, buildMediaObject, captionAllowed, outboundMediaIssue, outboundMediaKind, outboundMediaText,
} from "../utils/outbound.media.js";
import { mimeBase, saveByContentHash } from "../utils/media.storage.js";
import { cleanFilename } from "../services/template.media.service.js";
import { MEDIA_DIR } from "../config.js";
import { findConversationLine, findStartLine } from "../services/line.service.js";
import { canSeeConversation, conversationScope } from "../utils/permissions.js";
import { messageOrigin, messageSender } from "../utils/message.origin.js";
import { serializeMessageChange } from "../utils/message.change.js";
import { canReactTo, canReplyTo, serializeQuoted, serializeReactions } from "../utils/message.actions.js";
import { findReplyTarget, loadQuotedMessages, quotedMapOf } from "../services/message.reply.service.js";
import { sendReaction } from "../services/reaction.service.js";
import { applyHeldStatuses } from "../services/message.status.service.js";
import { markHumanReply } from "../services/auto.reply.service.js";
import Campaign from "../models/campaign.model.js";

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

// A Meta: un texto o, si hay archivo, el archivo. El archivo se sube primero
// (el id que devuelve es del número que lo subió) y se envía por ese id.
// `context` = `{ message_id }` si responde citando.
const sendToMeta = async ({ token, phoneNumberId, recipient, text, attachment, context }) => {
    if (!attachment) return sendTextMessage({ token, phoneNumberId, recipient, text, context });

    const { kind, buffer, mimeType, filename, caption } = attachment;
    const mediaId = await uploadMedia({ token, phoneNumberId, buffer, mimeType, filename });
    const media = buildMediaObject(kind, { mediaId, caption, filename });
    return sendMediaMessage({ token, phoneNumberId, recipient, kind, media, context });
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
 *
 * `line` es la línea por la que sale (`findSendingLine` o `findConversationLine`,
 * Fase 2b de multi-línea): su número, el token de su WABA y la cuenta dueña de
 * lo que se guarda. Ya comprobada: está conectada.
 *
 * `replyTarget`: el mensaje que cita (`findReplyTarget`, ya comprobado que es
 * de esta conversación). Va a Meta como `context` y se guarda en `replyTo`,
 * también si Meta lo rechaza. `serialized` es lo que se emite por SSE y lo que
 * debe responder quien llama: la misma cita en los dos (revisión de Codex del
 * plan de citas y reacciones, 7).
 */
export const processMessageSending = async ({
    line,
    conversation,
    text,
    temporalId,
    destinationNumber,
    contactName,
    attachment = null,
    // `{ userId, name }` de quien lo envía desde el chat (Fase 3).
    sender = null,
    // De dónde sale: el chat o el bot de respuestas automáticas.
    origin = 'chat',
    replyTarget = null }) => {

    const token = decrypt(line.tokenWhatsapp);
    const { phoneNumberId } = line;

    const recipient = await getSendingRecipient(conversation, destinationNumber);

    let waMessageId = null;
    let status = 'sent';
    let errorCode = null;
    let errorDetail = null;

    try {
        const context = replyTarget ? { message_id: replyTarget.waMessageId } : null;
        const apiRes = await sendToMeta({ token, phoneNumberId, recipient, text, attachment, context });
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
        userId: line.accountId, conversation, recipient, line, contactName, source: 'manual',
    });
    targetConversation.lastMessage = messageText;
    targetConversation.lastMessageAt = now;
    await targetConversation.save();

    // Creamos el mensaje con su estado REAL (sent o failed)
    let msg = await Message.create({
        conversationId: targetConversation._id,
        direction: 'outbound',
        sender: 'me',
        sentBy: sender?.userId ?? null,
        sentByName: sender?.name ?? null,
        origin,
        waMessageId,
        text: messageText,
        ...(attachment && attachmentFields(attachment)),
        ...(replyTarget && { replyTo: { waMessageId: replyTarget.waMessageId, messageId: replyTarget._id } }),
        timestamp: now,
        temporalId,
        status,
        errorCode,
        errorDetail,
        failedAt: status === 'failed' ? now : null,
    });
    // Un acuse que se adelantó a este mensaje (`PendingStatus`): antes de avisar.
    if (await applyHeldStatuses(waMessageId)) msg = await Message.findById(msg._id);

    const serialized = serializeMessage(msg, { quoted: quotedMapOf(replyTarget) });
    await sendConversationEvent(line.accountId, targetConversation._id, 'message_created', serialized);

    return { msg, serialized, waMessageId, status, errorCode, errorDetail };
};

// Lo que se le dice al usuario según `freeTextBlockReason`.
const WINDOW_BLOCK_MESSAGES = {
    closed: 'La ventana de 24 h está cerrada: el contacto no te escribió en las últimas 24 horas. Envíale una plantilla para retomar la conversación.',
    never: 'Este contacto todavía no te ha escrito: para empezar la conversación, envíale una plantilla.',
};

// La conversación de un número EN UNA LÍNEA, sin crear nada (el envío puede no
// salir): la ventana es de cada línea. Por el contacto, o por `contactPhone` si
// es anterior a los contactos y no se enlazó.
const findConversationByNumber = async (userId, phone, line) => {
    const contact = await Contact.findOne({ userId, phone }).select('_id').lean();
    return Conversation.findOne({
        userId,
        ...conversationLineFilter(line),
        $or: [...(contact ? [{ contactId: contact._id }] : []), { contactPhone: phone }],
    }).lean();
};

// El último mensaje del contacto. `lastInboundAt` lo tiene; si falta (una
// conversación anterior al campo, sin backfill) se busca, para no bloquear un
// envío válido. Una reacción suelta no cuenta: tampoco mueve `lastInboundAt`
// (revisión de Codex del plan de citas y reacciones, 1).
const lastInboundOf = async (conversation) => {
    if (!conversation) return null;
    if (conversation.lastInboundAt) return conversation.lastInboundAt;
    const last = await Message.findOne({ conversationId: conversation._id, direction: 'inbound', type: { $ne: 'reaction' } })
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
            await sendConversationEvent(userId, conversationId, 'conversation_updated', {
                id: String(conversationId),
                unreadCount: 0,
            });
        }
    } catch (error) {
        console.error('No se pudo marcar la conversación como leída:', error.message);
    }
};

// Una conversación de la cuenta de la sesión A SU ALCANCE (Fase 3: las de sus
// líneas). Filtrar por la cuenta es la comprobación de propiedad; por las
// líneas, la de acceso: lo que no ve responde 404, igual que lo ajeno.
// Quien envía desde el chat, para firmar el mensaje (Fase 3).
const senderOf = (auth) => ({ userId: auth.userId, name: auth.name ?? null });

// El citado de una respuesta, ya en su conversación: `{ replyTarget }`, o
// `{ error: [status, cuerpo] }` para responder (404 si no es de ella, 400 si
// no se puede citar).
const resolveReplyTarget = async (conversation, replyToMessageId) => {
    if (!replyToMessageId) return { replyTarget: null };
    const found = await findReplyTarget(conversation, replyToMessageId);
    if (found.status === 'not_found') return { error: [404, [{ message: 'Message not found' }]] };
    if (found.status === 'unavailable') {
        return { error: [400, [{ message: 'Ese mensaje no se puede citar.', code: 'reply_unavailable' }]] };
    }
    return { replyTarget: found.message };
};

const findOwnConversation = (auth, id) =>
    mongoose.isValidObjectId(id)
        ? Conversation.findOne({ _id: id, userId: auth.accountId, ...conversationScope(auth) })
        : null;

export const sendMessageController = async (req, res) => {
    try {
        const { id } = req.params; // Puede ser undefined si es un chat nuevo
        const { text, temporalId, destinationNumber, contactName, lineId, replyToMessageId } = req.body;

        const accountId = req.auth.accountId;

        if (!id && !destinationNumber) {
            return res.status(400).json([{ message: "Conversation ID or Destination Number is required" }]);
        }
        // Una conversación nueva no tiene qué citar.
        if (!id && replyToMessageId) {
            return res.status(400).json([{ message: 'Solo se puede citar dentro de una conversación.', code: 'reply_unavailable' }]);
        }

        // Con ID, la conversación tiene que ser de esta cuenta: filtrar por userId
        // es la comprobación de propiedad. Sin él, quien conociera el id de una
        // conversación ajena podía escribir en ella con el WhatsApp de su dueño.
        // Sin ID, processMessageSending reutiliza la del contacto de ese número.
        let conversation = null;
        if (id) {
            conversation = await findOwnConversation(req.auth, id);
            if (!conversation) return res.status(404).json([{ message: "Conversation not found" }]);
        }
        // El citado, de ESTA conversación, antes de la ventana y de pausar al bot.
        const { replyTarget, error: replyError } = conversation
            ? await resolveReplyTarget(conversation, replyToMessageId)
            : { replyTarget: null };
        if (replyError) return res.status(replyError[0]).json(replyError[1]);

        // Sin conversación, la línea va primero (la del cuerpo o la que toca
        // según sus líneas, `findStartLine`; 404 si no es suya): la ventana es
        // de la conversación del contacto EN ESA LÍNEA.
        let line = conversation ? null : await findStartLine(req.auth, lineId);

        // Fuera de la ventana de 24 h, Meta no entrega texto libre (131047): se
        // rechaza aquí, sin llamarla y sin dejar un mensaje fallido. La interfaz
        // ya lo frena; esto cubre lo que se cuele (otra pestaña, la ventana que
        // se cierra mientras se escribe). Lo que sí pasa al chat es el aviso.
        const target = conversation ?? await findConversationByNumber(accountId, destinationNumber, line);
        // La de un compañero (sin id, a un número): el 409 de la asignación
        // antes que nada, sin decir ni cómo está su ventana (Fase 4).
        if (target && !canSeeConversation(req.auth, target)) await acquireConversation(req.auth, target._id);
        const blocked = freeTextBlockReason(await lastInboundOf(target));
        if (blocked) return res.status(409).json([{ message: WINDOW_BLOCK_MESSAGES[blocked], code: 'window_closed' }]);
        // Con conversación, su línea: 409 si es de un número que ya no está conectado.
        line ??= await findConversationLine(conversation);

        // Responder la toma, antes de llamar a Meta (Fase 4): si la atiende
        // otro agente, 409 sin enviar nada. Sin id, la que ya exista de ese
        // número en esa línea (`target`).
        if (target) await acquireConversation(req.auth, target._id);

        // Una persona responde: el bot se calla en esa conversación.
        await markHumanReply(target?._id);

        // Llamamos al servicio (que ahora persiste incluso si el envío falla)
        const { msg, serialized } = await processMessageSending({
            line,
            conversation,
            text,
            temporalId,
            destinationNumber,
            contactName,
            sender: senderOf(req.auth),
            replyTarget,
        });
        // Y la que se creó con el envío, si no había.
        if (!target) await markHumanReply(msg.conversationId);

        // Responder desde el chat es haberlo leído, aunque Meta lo rechace: se
        // leyó y se intentó contestar.
        await markConversationRead(accountId, msg.conversationId);

        return res.status(201).json(serialized);
    } catch (error) {
        if (!error.statusCode) console.error("Error enviando mensaje:", error.response?.data || error.message || error);
        res.status(error.statusCode || 500).json(sendErrorBody(error));
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
        const userId = req.auth.accountId;
        const conversation = await findOwnConversation(req.auth, req.params.id);
        if (!conversation) return res.status(404).json([{ message: "Conversation not found" }]);
        // `X-Reply-To`: el id del mensaje que cita, de esta conversación.
        const replyToMessageId = String(req.headers['x-reply-to'] ?? '').trim() || null;
        const { replyTarget, error: replyError } = await resolveReplyTarget(conversation, replyToMessageId);
        if (replyError) return res.status(replyError[0]).json(replyError[1]);

        const blocked = freeTextBlockReason(await lastInboundOf(conversation));
        if (blocked) return res.status(409).json([{ message: WINDOW_BLOCK_MESSAGES[blocked], code: 'window_closed' }]);
        // Antes de guardar el archivo: si no puede salir, no se queda en disco.
        const line = await findConversationLine(conversation);

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

        // Responder la toma, antes de guardar el archivo y de llamar a Meta (Fase 4).
        await acquireConversation(req.auth, conversation._id);
        const file = await saveByContentHash(MEDIA_DIR, 'outbound', buffer, mimeType);
        await markHumanReply(conversation._id);
        const { serialized } = await processMessageSending({
            line,
            conversation,
            sender: senderOf(req.auth),
            replyTarget,
            temporalId: String(req.headers['x-temporal-id'] ?? '').slice(0, 64) || undefined,
            attachment: {
                kind, buffer, mimeType, file, caption,
                filename: cleanFilename(req.headers['x-filename']),
                size: buffer.length,
            },
        });

        // Responder con un archivo también es haberlo leído.
        await markConversationRead(userId, conversation._id);

        return res.status(201).json(serialized);
    } catch (error) {
        if (!error.statusCode) console.error("Error enviando archivo:", error.message);
        res.status(error.statusCode || 500).json(sendErrorBody(error));
    }
};

/**
 * PUT /chats/:id/messages/:messageId/reaction — reaccionar a un mensaje del
 * contacto (`{ emoji }`; vacío la quita). El mensaje tiene que ser de esa
 * conversación, y ella de la sesión y a su alcance: si no, 404. Que se pueda
 * (`canReactTo`, lo mismo que dice `canReact` a la UI): si no, 400. Un rechazo
 * de Meta: 502 con su código, sin guardar nada. Sin bloqueo por la ventana de
 * 24 h: Meta no dice que una reacción la necesite (spec § 5). Marca la
 * conversación como leída, pero no pausa al bot: reaccionar no es responder.
 */
export const setReactionController = async (req, res) => {
    try {
        const conversation = await findOwnConversation(req.auth, req.params.id);
        if (!conversation) return res.status(404).json([{ message: 'Conversation not found' }]);
        const message = mongoose.isValidObjectId(req.params.messageId)
            ? await Message.findOne({ _id: req.params.messageId, conversationId: conversation._id }).lean()
            : null;
        if (!message) return res.status(404).json([{ message: 'Message not found' }]);
        if (!canReactTo(message)) {
            return res.status(400).json([{ message: 'A ese mensaje no se puede reaccionar.', code: 'reaction_unavailable' }]);
        }

        const line = await findConversationLine(conversation);
        let updated;
        try {
            updated = await sendReaction({ line, conversation, message, emoji: req.body.emoji, sender: senderOf(req.auth) });
            // Un acuse que se adelantó a la reacción (`PendingStatus`): un `failed` la marca.
            if (await applyHeldStatuses(updated?.reactions?.me?.waMessageId)) updated = await Message.findById(updated._id).lean();
        } catch (error) {
            if (error.statusCode) throw error;
            const errorCode = error.waErrorCode != null ? String(error.waErrorCode) : null;
            console.error('Error enviando una reacción:', { errorCode, error: error.waErrorDetail ?? error.message });
            return res.status(502).json([{ message: 'No se pudo enviar la reacción a WhatsApp', errorCode, errorDetail: error.waErrorDetail ?? null }]);
        }

        await markConversationRead(req.auth.accountId, conversation._id);
        // Con su cita resuelta, como la lista (revisión de Codex del PR #116, 2).
        const quoted = await loadQuotedMessages([updated], conversation._id);
        return res.json(serializeMessage(updated, { quoted }));
    } catch (error) {
        if (!error.statusCode) console.error('Error reaccionando:', error.message);
        res.status(error.statusCode || 500).json([{ message: error.message, ...(error.code && { code: error.code }) }]);
    }
};

export const listConversations = async (req, res) => {
    const userId = req.auth.accountId;
    try{
        const items = await populateConversation(Conversation.find({ userId, ...conversationScope(req.auth) }))
            .sort({ lastMessageAt: -1 })
            .lean();

        return res.json(items.map(serializeConversation));
    }catch(error){
        res.status(500).json([{ message: error.message }]);
    }
};

export const listMessages = async (req, res) => {
    const userId = req.auth.accountId;
    const conversationId = req.params.id;
    const { before, limit } = req.query;

    try {
        const conversation = await findOwnConversation(req.auth, conversationId);
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
        
        // El nombre de las campañas de esta página, de una vez (para «Campaña «…»»).
        const campaignIds = [...new Set(msgs.filter(msg => msg.campaignId).map(msg => String(msg.campaignId)))];
        const campaigns = campaignIds.length > 0
            ? await Campaign.find({ _id: { $in: campaignIds }, userId }).select('name').lean()
            : [];
        const campaignNames = new Map(campaigns.map(campaign => [String(campaign._id), campaign.name]));
        // Los citados de esta página, de una vez y solo de esta conversación.
        const quoted = await loadQuotedMessages(msgs, conversation._id);
        const items = msgs.map(msg => serializeMessage(msg, { campaignNames, quoted }));

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
    return res.status(status).json(sendErrorBody(error, { errorCode: error.waErrorCode ?? null }));
};

export const sendConversationTemplateController = async (req, res) => {
    try {
        const userId = req.auth.accountId;
        const { id } = req.params;

        // Sin `findOwnConversation`, cualquier sesión podría enviar en la
        // conversación de otro, o en una de una línea que no es suya.
        const conversation = await findOwnConversation(req.auth, id);
        if (!conversation) return res.status(404).json([{ message: "Conversation not found" }]);

        // La línea de la conversación: 409 si es de un número que ya no está conectado.
        const line = await findConversationLine(conversation);

        // Responder la toma, antes de llamar a Meta (Fase 4).
        await acquireConversation(req.auth, conversation._id);
        await markHumanReply(conversation._id);
        const resultado = await processTemplateSending({
            line,
            conversation,
            sender: senderOf(req.auth),
            origin: 'chat',
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
// contacto de ese número, y ya
// la filtra por la cuenta de la sesión: no hay conversación ajena que comprobar.
export const startConversationTemplateController = async (req, res) => {
    try {
        // La del cuerpo o la que toca según sus líneas; 404 si no es suya.
        const line = await findStartLine(req.auth, req.body.lineId);

        // «Nueva» puede ser una que ya existe para ese número en esa línea: el
        // bot se calla en ella antes de enviar, y en la que quede después.
        const existing = await findConversationByNumber(req.auth.accountId, req.body.destinationNumber, line);
        // Si ya existe, la toma antes de llamar a Meta; si la atiende otro
        // agente, 409 con su nombre y su id, para pedir que se la pasen (Fase 4).
        if (existing) await acquireConversation(req.auth, existing._id);
        await markHumanReply(existing?._id);

        const resultado = await processTemplateSending({
            line,
            sender: senderOf(req.auth),
            origin: 'chat',
            destinationNumber: req.body.destinationNumber,
            contactName: req.body.contactName || undefined,
            source: 'manual',
            templateName: req.body.templateName,
            language: req.body.language,
            parameters: req.body.parameters ?? [],
            buttons: req.body.buttons ?? [],
        });
        // La que creó el envío, de quien la envió.
        if (!existing && resultado.conversation) {
            await claimNewConversation(req.auth, resultado.conversation._id);
            await markHumanReply(resultado.conversation._id);
        }

        return responderEnvioPlantilla(res, resultado);
    } catch (error) {
        return responderErrorPlantilla(res, error);
    }
};
