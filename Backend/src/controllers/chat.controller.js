import User from "../models/user.model.js";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import { decrypt }  from "../utils/crypto.js";
import { sendTextMessage } from "../libs/whatsapp.js";
import { sendUser } from './stream.controller.js';

export const sendMessageController = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { text, temporalId } = req.body;

        const conversation = await Conversation.findById(id);
        if (!conversation) return res.status(404).json([{message: "Conversation not found"}]);

        const user = await User.findById(userId);
        if (!user) return res.status(404).json([{message: "User not found"}]);

        const token = decrypt(user.tokenWhatsapp);
        const phoneNumberId = conversation.phoneNumberId || user.phoneNumberId;
        if (!phoneNumberId) return res.status(400).json([{message: "Phone number ID is required"}]);

        const apiRes = await sendTextMessage({token, phoneNumberId, to: conversation.contactPhone, text});
        const waMessageId = apiRes?.data?.messages?.[0]?.id || null;
        
        console.log("WhatsApp API Response:", waMessageId);

        const msg = await Message.create({
            conversationId: conversation._id,
            direction: 'outbound',
            sender: 'me',
            waMessageId,
            text,
            timestamp: new Date(),
            temporalId,
        });

        conversation.lastMessage = text;
        conversation.updatedAt = new Date();
        await conversation.save();

        sendUser(
            String(user._id),
            'message_created', {
                id: String(msg._id),
                conversationId: String(conversation._id),
                sender: 'me',
                text, 
                timestamp: msg.timestamp.toISOString(),
                status: 'delivered',
                temporalId,
            }
        );

        return res.status(201).json({
            id: String (msg._id),
            conversationId: String (msg.conversationId),
            sender: msg.sender,
            text: msg.text,
            timestamp: msg.timestamp.toISOString(),
            status: msg.status || 'sent',
            waMessageId, 
        });

    } catch (error) {
        res.status(500).json([{ message: error.message }]);
    }
}

export const listConversations = async (req, res) => {
    const userId = req.user.id;
    try{
        const items = await Conversation.find({ userId }).sort({ lastMessageAt: -1 }).lean();
        const result = items.map((item) => ({
            id: String(item._id),
            title: item.contactName || item.contactPhone,
            phone: item.contactPhone,
            lastMessage: item.lastMessage || '',
            updatedAt: (item.lastMessageAt || item.updatedAt).toISOString(),
            unreadCount: item.unreadCount || 0,
        }));

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
        console.log("limit:", limit);
        const pageLimit = Math.min(parseInt(limit, 10) || 20, 100);

        const cursorDate = before ? new Date(before) : null;
        const criteria = { conversationId: conversation._id };
        if (cursorDate && !isNaN(cursorDate.getTime())) {
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
                text: msg.text,
                timestamp: (msg.timestamp || msg.createdAt).toISOString(),
                status: msg.status || 'sent',
                deliveredAt: msg.deliveredAt ? msg.deliveredAt.toISOString() : null,
                readAt: msg.readAt ? msg.readAt.toISOString() : null,
                failedAt: msg.failedAt ? msg.failedAt.toISOString() : null,
                errorCode: msg.errorCode,
                errorDetail: msg.errorDetail,
                waMessageId: msg.waMessageId || null,
            }));

        await Conversation.updateOne(
            { _id: conversation._id, userId},
            { $set: { unreadCount: 0 } }
        );

        sendUser(
            String(user._id),
            'conversation_updated', {
                id: String(conversation._id),
                unreadCount: 0,
            }
        )

        return res.json({ items, nextCursor });

    } catch (error) {
        res.status(500).json([{ message: error.message }]);
    }
};


