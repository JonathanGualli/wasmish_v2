import axios from "axios";
import {META_APP_ID, META_APP_SECRET, META_GRAPH_VERSION } from "../config.js";

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

export const sendTextMessage = async ({ token, phoneNumberId, to, text }) => { 
    return whatsappApi.post(
        `/${phoneNumberId}/messages`,
        {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to,
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

export const sendTemplateMessage = async ({ token, phoneNumberId, to, templateName, language = "es", components }) => {
    return whatsappApi.post(
        `/${phoneNumberId}/messages`,
        {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to,
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
