import axios from "axios";

const BASE_URL = "https://graph.facebook.com/v20.0"; 

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
        const { response } = error;
        if (response) {
            const msg = response.data?.error?.message || JSON.stringify(response.data);
            return Promise.reject(new Error(`WhatsApp API Error (${response.status}): ${msg}`));
        }
        return Promise.reject(error);
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
                    code: languageA
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