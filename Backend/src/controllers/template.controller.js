import User from "../models/user.model.js";
import Template from "../models/template.model.js";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import { decrypt } from "../utils/crypto.js";
import { getTemplates, sendTemplateMessage } from "../libs/whatsapp.js";
import { sendUser } from "./stream.controller.js";


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Trae las plantillas del WABA del usuario y las upsertea en la BD.
// La usan el sync manual (endpoint) y el sync just-in-time del envío.
// Devuelve cuántas plantillas se procesaron.
export const syncTemplatesForUser = async (user) => {
    const token = decrypt(user.tokenWhatsapp);
    const waBusinessId = user.waBusinessId;

    if (!token || !waBusinessId) {
        const error = new Error("Token or Business ID is required");
        error.statusCode = 400;
        throw error;
    }

    const dataMeta = await getTemplates({ token, waBusinessId });
    const templates = dataMeta?.data?.data;

    if (!templates) {
        const error = new Error("Templates could not be obtained");
        error.statusCode = 400;
        throw error;
    }

    const bulkOperations = templates.map(tpl => {
        // Solo guardamos el BODY: es el componente que se renderiza en el chat.
        const bodyComponent = tpl.components?.find(c => c.type === 'BODY');
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
                        bodyText: text,
                    }
                },
                upsert: true,
            }
        };
    });

    if (bulkOperations.length > 0) await Template.bulkWrite(bulkOperations);

    return bulkOperations.length;
}

// Reconstruye el body de la plantilla con los parámetros sustituidos, para guardar
// el mensaje tal y como lo recibe el contacto. Soporta posicionales ({{1}}) y
// nombrados ({{first_name}}). Un placeholder sin parámetro se deja intacto: así
// se ve que faltó un dato en vez de quedar un hueco silencioso.
export const renderTemplateBody = (bodyText, parameters) => {
    if (!bodyText) return null;
    if (!parameters || parameters.length === 0) return bodyText;

    const isNamed = typeof parameters[0] === 'object' && parameters[0] !== null;

    if (isNamed) {
        const byName = new Map(parameters.map(p => [String(p.name), String(p.value)]));
        return bodyText.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g,
            (match, key) => byName.has(key) ? byName.get(key) : match);
    }

    return bodyText.replace(/\{\{\s*(\d+)\s*\}\}/g, (match, index) => {
        const value = parameters[Number(index) - 1];
        return value === undefined ? match : String(value);
    });
}

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------



export const syncTemplatesController = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json([{ message: "User not found" }]);

        const total = await syncTemplatesForUser(user);

        return res.status(200).json({
            success: true,
            message: 'Templates successfully synchronized',
            totalSincronizadas: total,
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json([{ message: error.message }]);
    }
}

export const getTemplatesController = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json([{ message: "User not found" }]);

        const templates = await Template.find({ userId });
        return res.json(templates);
    } catch (error) {
        return res.status(500).json([{ message: error.message }]);
    }
}

/* export const sendTemplateController = async (req, res) => {
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

        let template = await Template.findOne({ userId: user._id, name: templateName });
        // Plantilla nueva que el cliente aún no sincronizó: la traemos ahora mismo
        if (!template) {
            await syncTemplateForUser(user);
            template = await Template.findOne({ userId: user._id, name: templateName });
        }


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
 */


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

        // 3. Texto real que recibe el contacto
        let template = await Template.findOne({ userId: user._id, name: templateName });

        // Plantilla que el cliente aún no sincronizó: la traemos ahora y reintentamos UNA vez.
        // Si el sync falla no abortamos: el mensaje puede estar ya entregado y no queremos perderlo.
        if (!template) {
            try {
                await syncTemplatesForUser(user);
                template = await Template.findOne({ userId: user._id, name: templateName });
            } catch (syncError) {
                console.error("Sync JIT de plantillas falló:", syncError.message);
            }
        }

        const storedText = renderTemplateBody(template?.bodyText, parameters)
            || `Plantilla: ${templateName}${storedParamsString ? ` | Datos: [${storedParamsString}]` : ''}`;

        // 4. Guardar conversación + mensaje
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
            templateName,
            templateParams: parameters.length > 0 ? parameters : undefined,
        });

        // 5. SSE en vivo → aparece en tu UI de wasmish
        sendUser(String(user._id), 'message_created', {
            id: String(msg._id), conversationId: String(conversation._id), sender: 'me',
            text: storedText, timestamp: msg.timestamp.toISOString(),
            status, errorCode, errorDetail,
        });

        // 6. Responder al cliente de la API
        if (status === 'failed') {
            return res.status(502).json([{ message: "Error enviando plantilla a WhatsApp", errorCode, errorDetail }]);
        }
        return res.status(200).json({ success: true, waMessageId, conversationId: String(conversation._id) });

    } catch (error) {
        return res.status(500).json([{ message: error.message }]);
    }
};