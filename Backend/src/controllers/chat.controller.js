import User from "../models/user.model.js";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import { decrypt }  from "../utils/crypto.js";
import { sendTextMessage } from "../libs/whatsapp.js";
import { sendUser } from './stream.controller.js';

export const sendMessageControllerOld = async (req, res) => {
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

// Enviar mensajes simplificado
export const processMessageSending = async ({
    user,
    conversation, 
    text, 
    temporalId, 
    destinationNumber,
    contactName}) => {    

    const token = decrypt (user.tokenWhatsapp);
    const phoneNumberId = conversation?.phoneNumberId || user.phoneNumberId;

    if(!phoneNumberId) throw new Error("Phone number ID is required");

    // Enviar mensaje a Whatsapp 
    const apiRes = await sendTextMessage({
        token, 
        phoneNumberId, 
        to: conversation?.contactPhone || destinationNumber,
        text
    });

    const waMessageId = apiRes?.data?.messages?.[0]?.id || null;

    // Si no hay conversación (es un mensaje nuevo), lo creamos
    let targetConversation = conversation; 
    if(!targetConversation) {
        targetConversation = await Conversation.create({
            userId: user._id,
            contactPhone: destinationNumber,
            phoneNumberId,
            lastMessage: text,
            lastMessageAt: new Date(),
            unreadCount: 1,
            contactName: contactName || null,
        })
    } else { 
        targetConversation.lastMessage = text;
        targetConversation.updatedAt = new Date();
        await targetConversation.save();
    }

    // Crear el mensaje en DB
    const msg = await Message.create({
        conversationId: targetConversation._id,
        direction: 'outbound',
        sender: 'me',
        waMessageId,
        text,
        timestamp: new Date(),
        temporalId,
    });

    // Notificar via socket
    sendUser(String(user._id), 'message_created', {
        id: String(msg._id),
        conversationId: String(targetConversation._id),
        sender: 'me',
        text, 
        timestamp: msg.timestamp.toISOString(),
        status: 'delivered',
        temporalId,
    }); 

    return {msg, waMessageId}
};

export const sendMessageController = async (req, res) => {
    try {
        const { id } = req.params; // Puede ser undefined si es un chat nuevo
        const { text, temporalId, destinationNumber, contactName } = req.body;

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json([{ message: "User not found" }]);

        let conversation = null;

        // Si hay ID, buscamos la conversación
        if (id) {
            conversation = await Conversation.findById(id);
            if (!conversation) return res.status(404).json([{ message: "Conversation not found" }]);
        } 
        // Si no hay ID, pero hay número, intentamos buscar si ya existe una con ese número
        else if (destinationNumber) {
            conversation = await Conversation.findOne({ 
                userId: user._id, 
                contactPhone: destinationNumber 
            });
        } 
        else {
            return res.status(400).json([{ message: "Conversation ID or Destination Number is required" }]);
        }

        // Llamamos al servicio (que ahora sabe qué hacer si conversation es null)
        const { msg, waMessageId } = await processMessageSending({ 
            user, 
            conversation, 
            text, 
            temporalId, 
            destinationNumber ,
            contactName,
        });

        return res.status(201).json({ ...msg._doc, waMessageId, status: 'sent' });

    } catch (error) {
        res.status(500).json([{ message: error.message }]);
    }
};


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

export const sendTemplateController = async (req, res) => {
    try {
        const { 
            userId,
            destinationNumber, 
            templateName, 
            language = 'es', 
            parameters = [], // Puede ser ["Juan", "100"] O [{name: "nombre", value: "Juan"}]
            contactName 
        } = req.body;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json([{ message: "User not found" }]);

        const token = decrypt(user.tokenWhatsapp);
        const phoneNumberId = user.phoneNumberId;

        if (!phoneNumberId) return res.status(400).json([{ message: "Phone number ID is required" }]);

        // -----------------------------------------------------
        // 1. LÓGICA INTELIGENTE DE PARÁMETROS (Posicional vs Nombrado)
        // -----------------------------------------------------
        let components = [];
        let storedParamsString = ""; // Para guardar en BD un resumen bonito

        if (parameters && parameters.length > 0) {
            let bodyParams = [];

            // DETECTAR TIPO DE PARÁMETRO
            const isNamed = typeof parameters[0] === 'object' && parameters[0] !== null;

            if (isNamed) {
                // CASO 2: Parámetros NOMBRADOS (Según doc oficial: "parameter_name")
                // Entrada esperada: [ { name: "first_name", value: "Jessica" }, ... ]
                bodyParams = parameters.map(p => ({
                    type: "text",
                    parameter_name: p.name, // Clave que pide Meta
                    text: String(p.value)
                }));
                storedParamsString = parameters.map(p => `${p.name}: ${p.value}`).join(', ');
            } else {
                // CASO 1: Parámetros POSICIONALES (Estilo C# antiguo: {{1}}, {{2}})
                // Entrada esperada: [ "Jessica", "12345" ]
                bodyParams = parameters.map(p => ({
                    type: "text",
                    text: String(p)
                }));
                storedParamsString = parameters.join(', ');
            }

            // Agregamos al componente 'body'
            components.push({
                type: "body",
                parameters: bodyParams
            });
        }

        // -----------------------------------------------------
        // 2. ENVIAR A META
        // -----------------------------------------------------
        // Nota: La doc dice que si usas Header multimedia, deberías agregarlo a components aquí.
        // Por ahora nos enfocamos en el Body (texto).

        const apiRes = await sendTemplateMessage({
            token,
            phoneNumberId,
            to: destinationNumber,
            templateName,
            language,
            components
        });

        const waMessageId = apiRes?.data?.messages?.[0]?.id || null;

        // -----------------------------------------------------
        // 3. GUARDAR EN BD
        // -----------------------------------------------------
        let conversation = await Conversation.findOne({ 
            userId: user._id, 
            contactPhone: destinationNumber 
        });

        const storedText = `Plantilla: ${templateName} | Datos: [${storedParamsString}]`;

        if (!conversation) {
            conversation = await Conversation.create({
                userId: user._id,
                contactPhone: destinationNumber,
                phoneNumberId,
                lastMessage: storedText,
                lastMessageAt: new Date(),
                unreadCount: 0,
                contactName: contactName || null,
            });
        } else {
            conversation.lastMessage = storedText;
            conversation.updatedAt = new Date();
            await conversation.save();
        }

        const msg = await Message.create({
            conversationId: conversation._id,
            direction: 'outbound',
            sender: 'me',
            waMessageId,
            text: storedText, 
            timestamp: new Date(),
            status: 'sent'
        });

        return res.status(200).json({ success: true, waMessageId });

    } catch (error) {
        // Mejor manejo de error basado en la respuesta de Meta
        const errorDetail = error.response?.data?.error || error.message;
        console.error("Meta API Error:", errorDetail);
        return res.status(500).json({ message: "Error enviando plantilla", detail: errorDetail });
    }
};