import { WHATSAPP_VERIFY_TOKEN } from '../config.js';
import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import Conversation from "../models/conversation.model.js";
import { sendUser } from './stream.controller.js';

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
                    if(messageData.type !== 'text') continue;

                    const from = messageData.from;
                    const text = messageData.text?.body || '';
                    const timestamp = messageData.timestamp ? new Date(parseInt(messageData.timestamp) * 1000) : new Date();

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
                            unreadCount: 1,
                        });
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

                    if(status === 'delivered' && (!message.deliveredAt || message.status === 'sent')) {
                        message.status = 'delivered';
                        message.deliveredAt = timestamp;
                    } else if(status === 'read') {
                        message.status = 'read';
                        message.readAt = timestamp;
                    } else if(status === 'failed') {
                        message.status = 'failed';
                        message.failedAt = timestamp;
                    }

                    await message.save();

                    sendUser(
                        String(user._id),
                        'message_status', {
                            waMessageId, 
                            status: message.status,
                            deliveredAt: message.deliveredAt ? message.deliveredAt.toISOString() : null,
                            readAt: message.readAt ? message.readAt.toISOString() : null,
                        }
                    );

                    // Log the status update
                    console.log("Message status updated:", {
                        id: String(message._id),
                        waMessageId: message.waMessageId,
                        newStatus: message.status,
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