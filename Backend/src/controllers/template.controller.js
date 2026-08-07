import User from "../models/user.model.js";
import Template from "../models/template.model.js";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import { decrypt } from "../utils/crypto.js";
import { getTemplates, sendTemplateMessage } from "../libs/whatsapp.js";
import { sendUser } from "./stream.controller.js";


export const syncTemplatesController = async (req, res) => {
    
    try{
        const userId = req.user.id;
        // const userId = '698e0565953cb53c29313501';
        const user = await User.findById(userId);
        if (!user) return res.status(404).json([{message: "User not found"}]);

        const token = decrypt(user.tokenWhatsapp);
        const waBusinessId = user.waBusinessId;

        if (!token || !waBusinessId) return res.status(400).json([{message: "Token or Business ID is required"}]);
        
        const dataMeta = await getTemplates({token, waBusinessId});

        //console.log(dataMeta.data.data);

        if (!dataMeta.data) return res.status(400).json([{message: "Templates could not be obtained"}]);

        // 3. Mapeamos los datos y preparamos las operaciones de "Upsert" para la base de datos
        const bulkOperations = dataMeta.data.data.map(tpl => {
            // Extraemos solo el texto del componente BODY
            const bodyComponent = tpl.components.find(c => c.type === 'BODY');
            const text = bodyComponent ? bodyComponent.text : '';

            return {
                updateOne: {
                filter: { templateId: tpl.id },
                update: {
                    $set: {
                    userId: user._id,
                    name: tpl.name,
                    category: tpl.category,
                    status: tpl.status,
                    language: tpl.language,
                    bodyText: text
                    }
                },
                upsert: true 
                }
            };
        });

        // 4. Ejecutamos todas las operaciones en la base de datos de una vez
        if (bulkOperations.length > 0) {
        await Template.bulkWrite(bulkOperations);
        }

        res.status(200).json({ 
        success: true, 
        message: 'Templates successfully synchronized', 
        totalSincronizadas: bulkOperations.length 
        });

    } catch (error){
        res.status(500).json([{ message: error.message }]);
    }
}

export const getTemplatesController = async (req, res) => { 
    try {
        const userId = req.user.id;
        // const userId = '698e0565953cb53c29313501';
        const user = await User.findById(userId);
        if (!user) return res.status(404).json([{ message: "User not found" }]);

        const templates = await Template.find({ userId });
        return res.json(templates);
    } catch (error) {
        res.status(500).json([{ message: error.message }]);
    }
}


/* export const sendTemplateController = async (req, res) => {
    try {
        const { 
            email,
            destinationNumber, 
            templateName, 
            language = 'es', 
            parameters = [], // Puede ser ["Juan", "100"] O [{name: "nombre", value: "Juan"}]
            contactName 
        } = req.body;

        const user = await User.findOne({email});
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
}; */

export const sendTemplateController = async (req, res) => {
    try {
        const userId = req.user.id;   // ← viene de validateApiKey (o de authRequired)
        const {
            destinationNumber,
            templateName,
            language = 'es',
            parameters = [],
            contactName,
        } = req.body;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json([{ message: "User not found" }]);

        const token = decrypt(user.tokenWhatsapp);
        const phoneNumberId = user.phoneNumberId;
        if (!phoneNumberId) return res.status(400).json([{ message: "Phone number ID is required" }]);

        // 1. Parámetros: posicionales ["Juan"] o nombrados [{name, value}]
        let components = [];
        let storedParamsString = "";
        if (parameters.length > 0) {
            const isNamed = typeof parameters[0] === 'object' && parameters[0] !== null;
            const bodyParams = isNamed
                ? parameters.map(p => ({ type: "text", parameter_name: p.name, text: String(p.value) }))
                : parameters.map(p => ({ type: "text", text: String(p) }));
            storedParamsString = isNamed
                ? parameters.map(p => `${p.name}: ${p.value}`).join(', ')
                : parameters.join(', ');
            components.push({ type: "body", parameters: bodyParams });
        }

        // 2. Enviar a Meta (capturamos el fallo para persistirlo como 'failed')
        let waMessageId = null, status = 'sent', errorCode = null, errorDetail = null;
        try {
            const apiRes = await sendTemplateMessage({ token, phoneNumberId, to: destinationNumber, templateName, language, components });
            waMessageId = apiRes?.data?.messages?.[0]?.id || null;
        } catch (error) {
            status = 'failed';
            errorCode = error.waErrorCode ? String(error.waErrorCode) : null;
            errorDetail = error.waErrorDetail || error.message;
        }

        // 3. Guardar conversación + mensaje
        const storedText = `Plantilla: ${templateName}${storedParamsString ? ` | Datos: [${storedParamsString}]` : ''}`;
        let conversation = await Conversation.findOne({ userId: user._id, contactPhone: destinationNumber });
        if (!conversation) {
            conversation = await Conversation.create({
                userId: user._id, contactPhone: destinationNumber, phoneNumberId,
                lastMessage: storedText, lastMessageAt: new Date(), unreadCount: 0,
                contactName: contactName || null,
            });
        } else {
            conversation.lastMessage = storedText;
            conversation.lastMessageAt = new Date();
            await conversation.save();
        }

        const msg = await Message.create({
            conversationId: conversation._id, direction: 'outbound', sender: 'me',
            waMessageId, text: storedText, timestamp: new Date(),
            status, errorCode, errorDetail, failedAt: status === 'failed' ? new Date() : null,
        });

        // 4. SSE en vivo → aparece en tu UI de wasmish
        sendUser(String(user._id), 'message_created', {
            id: String(msg._id), conversationId: String(conversation._id), sender: 'me',
            text: storedText, timestamp: msg.timestamp.toISOString(),
            status, errorCode, errorDetail,
        });

        // 5. Responder al cliente de la API
        if (status === 'failed') {
            return res.status(502).json([{ message: "Error enviando plantilla a WhatsApp", errorCode, errorDetail }]);
        }
        return res.status(200).json({ success: true, waMessageId, conversationId: String(conversation._id) });

    } catch (error) {
        return res.status(500).json([{ message: error.message }]);
    }
};
