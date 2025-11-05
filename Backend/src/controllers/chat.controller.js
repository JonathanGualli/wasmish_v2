import User from "../models/user.model.js";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import { decrypt }  from "../utils/crypto.js";
import { sendTextMessage } from "../libs/whatsapp.js";

export const sendMessageController = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { text } = req.body;

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
        });

        conversation.lastMessage = text;
        conversation.updatedAt = new Date();
        await conversation.save();

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
        res.status(500).json({ message: error.message });
    }
}
