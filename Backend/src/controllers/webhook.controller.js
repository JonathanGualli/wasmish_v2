import { WHATSAPP_VERIFY_TOKEN } from '../config.js';
import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import Conversation from "../models/conversation.model.js";
import { sendUser } from './stream.controller.js';
import { resolveStatusTransition } from '../utils/message.status.js';
import { getWindowExpiry } from '../utils/whatsapp.window.js';

export const verifyWebhook = (req, res) => { 
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) { 
        return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
}

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
                    const from = messageData.from;
                    const timestamp = messageData.timestamp ? new Date(parseInt(messageData.timestamp) * 1000) : new Date();

                    // Cualquier entrante abre la ventana de 24 h para Meta, sea texto
                    // o no. Por eso el tipo ya no descarta el mensaje entero: solo
                    // decide si además lo persistimos como Message.
                    const isText = messageData.type === 'text';
                    const text = isText ? (messageData.text?.body || '') : '';

                    let conversation = await Conversation.findOne({ userId: user._id, contactPhone: from });

                    // Create conversation if it doesn't exist 
                    if(!conversation) {
                        conversation = await Conversation.create({
                            userId: user._id,
                            contactPhone: from,
                            phoneNumberId: phoneNumberId,
                            contactName: null,
                            lastMessage: text,
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

                    const windowExpiresAt = getWindowExpiry(conversation.lastInboundAt)?.toISOString() ?? null;

                    // Audio, imagen, documento, ubicación… todavía no se muestran en el
                    // hilo, pero la ventana sí se abre. Sellamos y avisamos por SSE sin
                    // tocar unreadCount: un badge sin mensaje que leer no se apaga nunca.
                    if(!isText) {
                        await conversation.save();

                        sendUser(
                            String(user._id),
                            'conversation_updated', {
                                id: String(conversation._id),
                                unreadCount: conversation.unreadCount || 0,
                                windowExpiresAt,
                            }
                        );

                        console.log("Inbound no-texto: ventana sellada", {
                            conversationId: String(conversation._id),
                            type: messageData.type,
                            windowExpiresAt,
                        });
                        continue;
                    }

                    // Create message inbound
                    const messageCreated = await Message.create({
                        conversationId: conversation._id,
                        direction: 'inbound',
                        sender: 'them',
                        waMessageId: messageData.id,
                        text, 
                        timestamp,
                        status: 'delivered',
                        deliveredAt: timestamp,
                    });

                    // Update conversation
                    conversation.lastMessage = text;
                    conversation.lastMessageAt = timestamp;
                    conversation.unreadCount = (conversation.unreadCount || 0) + 1;
                    await conversation.save();
                
                    sendUser(
                        String(user._id),
                        'message_created', {
                            id: String(messageCreated._id),
                            conversationId: String(conversation._id),
                            sender: 'them',
                            text, 
                            timestamp: timestamp.toISOString(),
                            status: 'delivered',
                            unreadCount: conversation.unreadCount,
                            windowExpiresAt,
                        }
                    );

                    // Log the created message
                    console.log("Inbound message processed:", {
                        id: String(messageCreated._id),
                        conversationId: String(messageCreated.conversationId),
                        sender: messageCreated.sender,
                        text: messageCreated.text,
                        unreadCount: conversation.unreadCount,
                        timestamp: messageCreated.timestamp.toISOString(),
                        status: messageCreated.status,
                        waMessageId: messageCreated.waMessageId,
                    });
                }

                // Delivery/read status updates
                const statuses = value?.statuses ?? [];
                for(const statusData of statuses) {

                    const waMessageId = statusData.id;
                    const status = statusData.status; // 'send' | 'delivered' | 'read' | 'failed'
                    const timestamp = statusData.timestamp ? new Date(parseInt(statusData.timestamp) * 1000) : new Date();

                    if(!waMessageId) continue;

                    const message = await Message.findOne({ waMessageId });
                    if(!message) continue;

                    // Estado desconocido, repetido o que retrocede → lo ignoramos
                    const changes = resolveStatusTransition({
                        currentStatus: message.status,
                        incomingStatus: status,
                        timestamp,
                        hasDeliveredAt: Boolean(message.deliveredAt),
                    });

                    if (!changes) continue;

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
                }
            }
        }

        res.sendStatus(200);
    } catch (error) {
        console.error("Error handling webhook:", error);
        res.sendStatus(500);
    }
};