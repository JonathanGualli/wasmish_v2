import { WHATSAPP_VERIFY_TOKEN } from '../config.js';
import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import Conversation from "../models/conversation.model.js";
import { sendUser } from './stream.controller.js';
import { resolveStatusTransition } from '../utils/message.status.js';
import { getWindowExpiry } from '../utils/whatsapp.window.js';
import { describeInboundMessage } from '../utils/inbound.message.js';
import { TIPOS_CON_ARCHIVO, nombreDeArchivo, guardarArchivo } from '../utils/media.storage.js';
import { getMediaInfo, downloadMedia } from '../libs/whatsapp.js';
import { decrypt } from '../utils/crypto.js';
import { MEDIA_DIR, MEDIA_MAX_BYTES } from '../config.js';

// Baja el adjunto y lo deja en disco. Devuelve SIEMPRE un objeto: si algo falla
// —token caducado, archivo enorme, Meta caída— sale con mediaFile en null y el
// mensaje se guarda igual con su etiqueta. Perder la foto es un problema;
// perder el mensaje entero sería mucho peor.
const descargarAdjunto = async (user, entrante) => {
    const vacio = { mediaFile: null, mediaFilename: null, mediaSize: null, mimeType: entrante.mimeType };

    if (!entrante.mediaId || !TIPOS_CON_ARCHIVO.has(entrante.type)) return vacio;

    try {
        const token = decrypt(user.tokenWhatsapp);
        if (!token) return vacio;

        const info = await getMediaInfo({ token, mediaId: entrante.mediaId });

        // El tamaño se comprueba ANTES de bajar: si no, el tope solo actuaría
        // después de habernos tragado los bytes.
        const tamano = Number(info?.file_size ?? 0);
        if (tamano > MEDIA_MAX_BYTES) {
            console.warn('Adjunto omitido por tamaño:', { mediaId: entrante.mediaId, tamano, tope: MEDIA_MAX_BYTES });
            return vacio;
        }

        // El mime de la descarga manda sobre el del webhook: es el que Meta usa
        // de verdad para el archivo.
        const mimeType = info?.mime_type ?? entrante.mimeType;
        const nombre = nombreDeArchivo(entrante.mediaId, mimeType);
        if (!nombre) return vacio;

        const contenido = await downloadMedia({ token, url: info.url, maxBytes: MEDIA_MAX_BYTES });
        await guardarArchivo(MEDIA_DIR, nombre, contenido);

        return { mediaFile: nombre, mediaFilename: entrante.filename ?? null, mediaSize: contenido.length, mimeType };
    } catch (error) {
        console.error('No se pudo descargar el adjunto:', {
            mediaId: entrante.mediaId, type: entrante.type,
            error: error.waErrorDetail ?? error.message,
        });
        return vacio;
    }
};

export const verifyWebhook = (req, res) => { 
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) { 
        return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
}

// Procesa UN mensaje entrante: lo guarda, actualiza la conversación y avisa por
// SSE. Vive fuera de handleWebhook para poder envolver cada mensaje en su
// propio try/catch — ver el comentario del bucle.
const procesarEntrante = async (user, phoneNumberId, messageData) => {
    // Traduce la forma que manda Meta (image.caption, button.text…)
    // a { type, text, mediaId, mimeType }. Devuelve null en los que
    // no son mensajes de la conversación, como los 'system'.
    const entrante = describeInboundMessage(messageData);
    if(!entrante) return;

    const from = messageData.from;
    const timestamp = messageData.timestamp ? new Date(parseInt(messageData.timestamp) * 1000) : new Date();

    let conversation = await Conversation.findOne({ userId: user._id, contactPhone: from });

    // Create conversation if it doesn't exist 
    if(!conversation) {
        conversation = await Conversation.create({
            userId: user._id,
            contactPhone: from,
            phoneNumberId: phoneNumberId,
            contactName: null,
            lastMessage: entrante.text,
            lastMessageAt: timestamp,
            lastInboundAt: timestamp,
            // 0, no 1: el incremento de más abajo corre también para la
            // conversación recién creada y la dejaba en 2 con un solo mensaje.
            unreadCount: 0,
        });
    }

    // La ventana nunca retrocede: Meta no garantiza el orden de los
    // webhooks, y un entrante viejo que llegue tarde la cerraría antes
    // de tiempo. Mismo criterio que resolveStatusTransition.
    if(!conversation.lastInboundAt || timestamp > conversation.lastInboundAt) {
        conversation.lastInboundAt = timestamp;
    }

    // El archivo se baja ANTES de crear el mensaje para que, cuando este llegue
    // por SSE, la foto ya se pueda pintar. Añade unos cientos de ms al webhook; a
    // cambio no hace falta ni cola ni un segundo evento avisando de que ya está.
    const adjunto = await descargarAdjunto(user, entrante);

    // Create message inbound
    const messageCreated = await Message.create({
        conversationId: conversation._id,
        direction: 'inbound',
        sender: 'them',
        waMessageId: messageData.id,
        type: entrante.type,
        text: entrante.text, 
        mediaId: entrante.mediaId,
        mimeType: adjunto.mimeType,
        mediaFile: adjunto.mediaFile,
        mediaFilename: adjunto.mediaFilename,
        mediaSize: adjunto.mediaSize,
        caption: entrante.caption,
        timestamp,
        status: 'delivered',
        deliveredAt: timestamp,
    });

    // Update conversation
    conversation.lastMessage = entrante.text;
    conversation.lastMessageAt = timestamp;
    conversation.unreadCount = (conversation.unreadCount || 0) + 1;
    await conversation.save();

    sendUser(
        String(user._id),
        'message_created', {
            id: String(messageCreated._id),
            conversationId: String(conversation._id),
            sender: 'them',
            type: entrante.type,
            text: entrante.text, 
            hasMedia: Boolean(adjunto.mediaFile),
            caption: entrante.caption,
            mediaFilename: adjunto.mediaFilename,
            mediaSize: adjunto.mediaSize,
            timestamp: timestamp.toISOString(),
            status: 'delivered',
            unreadCount: conversation.unreadCount,
            windowExpiresAt: getWindowExpiry(conversation.lastInboundAt)?.toISOString() ?? null,
        }
    );

    // Log the created message
    console.log("Inbound message processed:", {
        id: String(messageCreated._id),
        conversationId: String(messageCreated.conversationId),
        sender: messageCreated.sender,
        type: messageCreated.type,
        text: messageCreated.text,
        unreadCount: conversation.unreadCount,
        timestamp: messageCreated.timestamp.toISOString(),
        status: messageCreated.status,
        waMessageId: messageCreated.waMessageId,
    });
};

// Procesa UN acuse de recibo (entregado / leído / fallido).
const procesarEstado = async (user, statusData) => {

    const waMessageId = statusData.id;
    const status = statusData.status; // 'send' | 'delivered' | 'read' | 'failed'
    const timestamp = statusData.timestamp ? new Date(parseInt(statusData.timestamp) * 1000) : new Date();

    if(!waMessageId) return;

    const message = await Message.findOne({ waMessageId });
    if(!message) return;

    // Estado desconocido, repetido o que retrocede → lo ignoramos
    const changes = resolveStatusTransition({
        currentStatus: message.status,
        incomingStatus: status,
        timestamp,
        hasDeliveredAt: Boolean(message.deliveredAt),
    });

    if (!changes) return;

    Object.assign(message, changes);

    if (status === 'failed') {
        const errors = statusData?.errors ?? [];
        if (!message.errorCode && errors.length > 0) {
            message.errorCode = errors[0]?.code;
            message.errorDetail = errors[0]?.error_data?.details;
        }
    }

    await message.save();

    sendUser(
        String(user._id),
        'message_status', {
            id: String(message._id),
            conversationId: String(message.conversationId),
            waMessageId, 
            status: message.status,
            deliveredAt: message.deliveredAt ? message.deliveredAt.toISOString() : null,
            readAt: message.readAt ? message.readAt.toISOString() : null,
            failedAt: message.failedAt ? message.failedAt.toISOString() : null,
            errorCode: message.errorCode,
            errorDetail: message.errorDetail,

        }
    );

    // Log the status update
    console.log("Message status updated:", {
        id: String(message._id),
        waMessageId: message.waMessageId,
        newStatus: message.status,
        errors: statusData.errors,
    });
};

export const handleWebhook = async (req, res) => {
    try {
        const body = req.body;

        if(!body.entry) return res.sendStatus(200);

        for(const entry of body.entry) {
            for(const change of entry.changes ?? []){
                const value = change.value;
                const phoneNumberId = value?.metadata?.phone_number_id;

                if(!phoneNumberId) continue;

                const user = await User.findOne({ phoneNumberId });
                if (!user) continue;

                const messages = value?.messages ?? [];

                for(const messageData of messages) {
                    // Cada mensaje va en su propio try/catch a propósito. Si dejáramos
                    // subir el error, handleWebhook respondería 500 y Meta reintentaría
                    // el LOTE ENTERO: como no hay índice único en waMessageId, los que
                    // sí se guardaron se duplicarían en el chat del cliente. Ahora Meta
                    // recibe 200 y como mucho se pierde el mensaje que venía roto.
                    try {
                        await procesarEntrante(user, phoneNumberId, messageData);
                    } catch (error) {
                        console.error("Entrante descartado por error:", {
                            waMessageId: messageData?.id,
                            type: messageData?.type,
                            error: error.message,
                        });
                    }
                }

                // Delivery/read status updates
                const statuses = value?.statuses ?? [];
                for(const statusData of statuses) {
                    try {
                        await procesarEstado(user, statusData);
                    } catch (error) {
                        console.error("Acuse descartado por error:", {
                            waMessageId: statusData?.id,
                            status: statusData?.status,
                            error: error.message,
                        });
                    }
                }
            }
        }

        res.sendStatus(200);
    } catch (error) {
        console.error("Error handling webhook:", error);
        res.sendStatus(500);
    }
};