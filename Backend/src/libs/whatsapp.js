import axios from "axios";
import {META_APP_ID, META_APP_SECRET, META_GRAPH_VERSION } from "../config.js";
import { whatsappRecipient } from "../utils/contact.identity.js";

const BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`; 

export const whatsappApi = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 10000,
});

whatsappApi.interceptors.response.use(
    (res) => res,
    (error) => {
        const metaError = error.response?.data?.error;
        if (metaError) {
            const err = new Error(`WhatsApp API Error (${error.response.status}): ${metaError.message}`);
            err.waErrorCode = metaError.code;                                   // ej. 131030
            err.waErrorDetail = metaError.error_data?.details || metaError.message; // texto legible
            return Promise.reject(err);
        }
        return Promise.reject(error); // error de red / sin respuesta → se propaga tal cual
    }
);

// `recipient` es { phone, waUserId }: Meta recibe el teléfono en `to` o, si la
// persona solo se identificó con su nombre de usuario, el BSUID en `recipient`.
const recipientFields = (recipient) => {
    const fields = whatsappRecipient(recipient);
    if (!fields) throw new Error("El destinatario no tiene teléfono ni BSUID");
    return fields;
};

// `context` (opcional) = `{ message_id }`: responde citando ese mensaje.
export const sendTextMessage = async ({ token, phoneNumberId, recipient, text, context = null }) => { 
    return whatsappApi.post(
        `/${phoneNumberId}/messages`,
        {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            ...recipientFields(recipient),
            ...(context && { context }),
            type: "text",
            text: {
                body: text
            }
        }, 
        { 
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );
}

// Un archivo ya subido a Meta (`uploadMedia`). `kind` es el tipo de mensaje
// ('image', 'video', 'audio', 'document') y `media`, su objeto: el id y, si
// van, el texto y el nombre del documento (`buildMediaObject`). `context`,
// como en `sendTextMessage`.
export const sendMediaMessage = async ({ token, phoneNumberId, recipient, kind, media, context = null }) => {
    return whatsappApi.post(
        `/${phoneNumberId}/messages`,
        {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            ...recipientFields(recipient),
            ...(context && { context }),
            type: kind,
            [kind]: media,
        },
        { headers: { Authorization: `Bearer ${token}` } }
    );
};

// Una reacción con emoji a un mensaje del contacto; `emoji: ''` la quita. Meta
// solo deja reaccionar a lo recibido, de menos de 30 días, y si falla lo dice
// por el webhook (131009), no aquí: `applyReactionStatus`.
export const sendReactionMessage = async ({ token, phoneNumberId, recipient, targetWaMessageId, emoji }) => {
    return whatsappApi.post(
        `/${phoneNumberId}/messages`,
        {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            ...recipientFields(recipient),
            type: "reaction",
            reaction: { message_id: targetWaMessageId, emoji },
        },
        { headers: { Authorization: `Bearer ${token}` } }
    );
};

export const sendTemplateMessage = async ({ token, phoneNumberId, recipient, templateName, language = "es", components }) => {
    return whatsappApi.post(
        `/${phoneNumberId}/messages`,
        {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            ...recipientFields(recipient),
            type: "template",
            template: {
                name: templateName,
                language: {
                    code: language
                },
                components: components || [] 
            }
        },
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );
}

export const getTemplates = async ({token, waBusinessId}) => {
    return whatsappApi.get(
        `/${waBusinessId}/message_templates`,
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );
}

// Los números de un WABA, una página (`after` = cursor de la siguiente). Sirve para comprobar que un número es de ese WABA
// antes de conectarlo (ver `describeWabaPhoneNumber`).
export const getWabaPhoneNumbers = async ({ token, waBusinessId, after = null }) => {
    return whatsappApi.get(
        `/${waBusinessId}/phone_numbers`,
        {
            params: { fields: 'id,display_phone_number,verified_name,platform_type', limit: 100, ...(after && { after }) },
            headers: { Authorization: `Bearer ${token}` },
        }
    );
};

// Si el número también se usa en la app de WhatsApp Business (coexistencia):
// la consulta que indica la guía de Meta. Ver `describePhoneNumberPlatform`.
export const getPhoneNumberPlatform = async ({ token, phoneNumberId }) => {
    return whatsappApi.get(
        `/${phoneNumberId}`,
        {
            params: { fields: 'is_on_biz_app,platform_type' },
            headers: { Authorization: `Bearer ${token}` },
        }
    );
};

export const exchangeCodeForToken = async (code) => {
    const res = await whatsappApi.get('/oauth/access_token', {
        params: {
            client_id: META_APP_ID,
            client_secret: META_APP_SECRET,
            code,
        }
    });
    return res.data.access_token;
}

// Suscribe TU app a los webhooks del WhatsApp Business del cliente,
// para poder recibir sus mensajes entrantes y estados.
export const subscribeAppToWaba = async ({ token, waBusinessId }) => {
    return whatsappApi.post(
        `/${waBusinessId}/subscribed_apps`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
    );
};

// Cuánto se espera a `/register`: Meta tarda en registrar un número, y en
// producción pasó de los 10 s del resto de llamadas (2026-10-14).
export const REGISTER_TIMEOUT_MS = 60_000;

// Registra el número en la Cloud API: sin esto, uno recién conectado por el
// Embedded Signup no puede enviar (133010). `pin` (6 dígitos) pasa a ser el PIN
// de la verificación en dos pasos del número. Meta admite 10 intentos por
// número cada 72 h.
export const registerPhoneNumber = async ({ token, phoneNumberId, pin }) => {
    return whatsappApi.post(
        `/${phoneNumberId}/register`,
        { messaging_product: 'whatsapp', pin },
        { headers: { Authorization: `Bearer ${token}` }, timeout: REGISTER_TIMEOUT_MS }
    );
};

// Cuánto se espera al pedido de la sincronización: sin respuesta, el pedido
// queda incierto y no se repite solo (Meta lo da una sola vez), así que mejor
// esperar de más que darlo por perdido.
export const SMB_APP_DATA_TIMEOUT_MS = 30_000;

// Pide a Meta la agenda (`smb_app_state_sync`) o el historial (`history`) de un
// número que sigue en la app de WhatsApp Business. Solo dentro de las 24 h de
// la conexión y una sola vez; lo que manda llega después por el webhook.
// Devuelve el `request_id`, por si hay que escribir a su soporte.
export const requestSmbAppData = async ({ token, phoneNumberId, syncType }) => {
    const { data } = await whatsappApi.post(
        `/${phoneNumberId}/smb_app_data`,
        { messaging_product: 'whatsapp', sync_type: syncType },
        { headers: { Authorization: `Bearer ${token}` }, timeout: SMB_APP_DATA_TIMEOUT_MS }
    );
    return data?.request_id ?? null;
};

// --- Medios ---------------------------------------------------------------
// Meta no manda el archivo en el webhook, manda un id. `GET /{media-id}` da una
// URL temporal, y esa URL exige el token igual que el resto de la API.
//
// El webhook ya trae una `url` lista, pero caduca en horas; el id sirve durante
// los 30 días que Meta guarda el archivo. Se pasa siempre por el id para tener
// un solo camino, también cuando haya que reintentar una descarga vieja.
export const getMediaInfo = async ({ token, mediaId }) => {
    const { data } = await whatsappApi.get(`/${mediaId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    return data;   // { url, mime_type, sha256, file_size, id }
};

// La descarga NO va por whatsappApi: el host es lookaside.fbsbx.com, no la Graph
// API, y la respuesta son bytes, no JSON.
export const downloadMedia = async ({ token, url, maxBytes }) => {
    const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'arraybuffer',
        timeout: 30000,          // más que los 10 s del resto: aquí se bajan megas
        maxContentLength: maxBytes,
        maxBodyLength: maxBytes,
    });
    return Buffer.from(data);
};

// Sube un archivo a Meta para enviarlo después por su id (la cabecera de una
// plantilla). El id es del número que lo subió y dura 30 días.
//
// El Content-Type va explícito: la instancia lo fija en JSON y, con ese valor,
// axios convertiría el FormData en un JSON en vez de mandarlo como multipart.
export const uploadMedia = async ({ token, phoneNumberId, buffer, mimeType, filename }) => {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);
    form.append('file', new Blob([buffer], { type: mimeType }), filename || 'archivo');

    const { data } = await whatsappApi.post(`/${phoneNumberId}/media`, form, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
        timeout: 60000,          // un vídeo de 16 MB no sube en los 10 s del resto
        maxBodyLength: Infinity,
    });
    return data.id;
};
