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
        const buttonsComponent = tpl.components?.find(c => c.type === 'BUTTONS');

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
                        buttons: buttonsComponent?.buttons ?? [],
                        parameterFormat: tpl.parameter_format,
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
// Botones
// ---------------------------------------------------------------------------

// Meta pide un formato de parámetro distinto según el tipo de botón.
// Quien llama a la API manda valores simples; aquí los envolvemos.
const BUTTON_PARAM_BUILDERS = {
    url:         (value) => ({ type: 'text',        text: String(value) }),
    quick_reply: (value) => ({ type: 'payload',     payload: String(value) }),
    copy_code:   (value) => ({ type: 'coupon_code', coupon_code: String(value) }),
};

// Qué sub_type le corresponde a cada tipo de botón de la definición de la
// plantilla. Es la fuente de verdad: el mismo botón «Copiar código» es OTP en
// una plantilla de autenticación y COPY_CODE en una de cupón, y Meta espera un
// formato distinto en cada caso — por fuera se ven idénticos.
const SUBTYPE_BY_BUTTON_TYPE = {
    OTP:         'url',
    URL:         'url',
    COPY_CODE:   'copy_code',
    QUICK_REPLY: 'quick_reply',
};

// Con la definición sincronizada deducimos el sub_type; si la plantilla nunca se
// sincronizó, caemos al subType que mande el cliente (comportamiento anterior).
const resolveSubType = (definition, button, index) => {
    if (!definition) return String(button.subType ?? '').toLowerCase();

    // URL fija = sin variable = no admite parámetros. Meta responde 132018;
    // atajarlo aquí ahorra la llamada y da un mensaje que se entiende.
    if (definition.type === 'URL' && !definition.url?.includes('{{')) {
        const error = new Error(
            `El botón "${definition.text}" (índice ${index}) tiene una URL fija y no admite parámetros.`
        );
        error.statusCode = 400;
        throw error;
    }

    return SUBTYPE_BY_BUTTON_TYPE[definition.type];
};

// Traduce los botones del body de la request a componentes de Meta.
// El index es posicional si no lo mandan, y va como string porque así lo pide Meta.
export const buildButtonComponents = (buttons = [], templateButtons = []) => {
    return buttons.map((button, position) => {
        const index = button.index ?? position;
        const values = button.parameters ?? [];

        if (values.length === 0) {
            const error = new Error(`El botón en el índice ${index} no tiene parámetros`);
            error.statusCode = 400;
            throw error;
        }

        // Si conocemos la plantilla, un índice fuera de rango es un error del
        // cliente: Meta lo ignora en silencio y el mensaje sale sin el dato.
        if (templateButtons.length > 0 && !templateButtons[index]) {
            const error = new Error(
                `La plantilla no tiene un botón en el índice ${index} (tiene ${templateButtons.length}).`
            );
            error.statusCode = 400;
            throw error;
        }

        const subType = resolveSubType(templateButtons[index], button, index);
        const buildParam = BUTTON_PARAM_BUILDERS[subType];

        if (!buildParam) {
            const error = new Error(
                `No se pudo determinar el tipo del botón en el índice ${index}. ` +
                `Sincroniza la plantilla o envía "subType" (${Object.keys(BUTTON_PARAM_BUILDERS).join(', ')}).`
            );
            error.statusCode = 400;
            throw error;
        }

        return {
            type: 'button',
            sub_type: subType,
            index: String(index),
            parameters: values.map(buildParam),
        };
    });
};


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
        // Sin este log, un 500 aquí es opaco: el motivo real (token de WhatsApp
        // caducado, WABA sin permisos) solo lo sabe Meta.
        console.error('Sync de plantillas falló:', error.message);

        // Que Meta rechace la llamada no es un fallo del servidor.
        const status = error.statusCode || (error.waErrorCode ? 502 : 500);
        return res.status(status).json([{
            message: error.message,
            errorCode: error.waErrorCode ?? null,
        }]);
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

export const sendTemplateController = async (req, res) => {
    try {
        const userId = req.user.id;   // ← viene de validateApiKey (o de authRequired)
        const { destinationNumber, templateName, contactName } = req.body;

        // El schema acepta null en estos campos (mandar null no debe romper),
        // pero de aquí en adelante trabajamos siempre sobre arrays.
        const parameters = req.body.parameters ?? [];
        const buttons = req.body.buttons ?? [];

        const user = await User.findById(userId);
        if (!user) return res.status(404).json([{ message: "User not found" }]);

        // Cuenta sin WhatsApp conectado: antes reventaba dentro de decrypt()
        // con un 500 opaco ("Cannot read properties of null (reading 'split')").
        if (!user.tokenWhatsapp || !user.phoneNumberId) {
            return res.status(409).json([{
                message: "La cuenta no tiene WhatsApp conectado. Conéctala desde Ajustes antes de enviar plantillas.",
            }]);
        }

        const token = decrypt(user.tokenWhatsapp);
        const phoneNumberId = user.phoneNumberId;

        // 1. Plantilla: la buscamos ANTES de enviar, para validar que existe
        //    y para saber en qué idioma está registrada.
        let template = await Template.findOne({ userId: user._id, name: templateName });
        let syncOk = true;

        if (!template) {
            try {
                await syncTemplatesForUser(user);
                template = await Template.findOne({ userId: user._id, name: templateName });
            } catch (syncError) {
                // Si el sync falló no podemos afirmar que la plantilla no exista:
                // dejamos que Meta decida, en vez de bloquear un envío válido.
                syncOk = false;
                console.error("Sync JIT de plantillas falló:", syncError.message);
            }
        }

        if (!template && syncOk) {
            return res.status(404).json([{
                message: `La plantilla "${templateName}" no existe en tu cuenta de WhatsApp o todavía no está aprobada.`,
            }]);
        }

        // 2. Idioma: el que tenga registrada la plantilla, salvo que lo fuercen.
        const language = req.body.language ?? template?.language ?? 'es';

        // 3. Componentes: cuerpo + botones.
        //    Parámetros del cuerpo: posicionales ["Juan"] o nombrados [{name, value}]
        const components = [];
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

        // Lanza 400 si el botón es inválido — antes de gastar la llamada a Meta.
        components.push(...buildButtonComponents(buttons, template?.buttons ?? []));

        // 4. Enviar a Meta (capturamos el fallo para persistirlo como 'failed')
        let waMessageId = null, status = 'sent', errorCode = null, errorDetail = null;
        try {
            const apiRes = await sendTemplateMessage({ token, phoneNumberId, to: destinationNumber, templateName, language, components });
            waMessageId = apiRes?.data?.messages?.[0]?.id || null;
        } catch (error) {
            status = 'failed';
            errorCode = error.waErrorCode ? String(error.waErrorCode) : null;
            errorDetail = error.waErrorDetail || error.message;
        }

        // 5. Texto real que recibe el contacto
        const storedText = renderTemplateBody(template?.bodyText, parameters)
            || `Plantilla: ${templateName}${storedParamsString ? ` | Datos: [${storedParamsString}]` : ''}`;

        // 6. Guardar conversación + mensaje
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

        // 7. SSE en vivo → aparece en la UI de wasmish
        sendUser(String(user._id), 'message_created', {
            id: String(msg._id), conversationId: String(conversation._id), sender: 'me',
            text: storedText, timestamp: msg.timestamp.toISOString(),
            status, errorCode, errorDetail,
        });

        // 8. Responder al cliente de la API
        if (status === 'failed') {
            return res.status(502).json([{ message: "Error enviando plantilla a WhatsApp", errorCode, errorDetail }]);
        }
        return res.status(200).json({ success: true, waMessageId, conversationId: String(conversation._id) });

    } catch (error) {
        const status = error.statusCode || (error.waErrorCode ? 502 : 500);

        // Los 4xx son errores de quien llama y ya viajan con su mensaje; en una
        // API pública loguearlos todos sería ruido. Solo dejamos rastro de lo
        // que es fallo nuestro o de Meta.
        if (status >= 500) console.error('Envío de plantilla falló:', error.message);

        return res.status(status).json([{
            message: error.message,
            errorCode: error.waErrorCode ?? null,
        }]);
    }
};
