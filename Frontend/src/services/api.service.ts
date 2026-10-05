import type { QueryFunctionContext } from '@tanstack/react-query';
import axios from 'axios';
import type { Template, TemplateButtonParam } from '../models/template.model';
import type { ContactFilter, ContactInput } from '../models/contact.model';
import type { CampaignAudienceInput, CampaignDraftInput, CreateCampaignInput, RecipientState } from '../models/campaign.model';

const API_URL = '/api'; // configuracion puesta en vite.config.ts
// const API_URL = 'https://wasmish-api.solventyc.com/api';

interface SSEHandlers {
    onMessageCreated?: (event: MessageEvent) => void;
    onMessageStatus?: (event: MessageEvent) => void;
    onConversationUpdated?: (event: MessageEvent) => void;
    onContactUpdated?: (event: MessageEvent) => void;
    onCampaignProgress?: (event: MessageEvent) => void;
    onError?: (err: ErrorEvent) => void;
    /** La conexión se abrió (también al reconectar). */
    onOpen?: () => void;
    /**
     * El navegador dejó de reintentar: pasa cuando el servidor responde con
     * error (p. ej. el proxy de Vite mientras el backend reinicia). Volver a
     * conectar queda en manos de quien llama.
     */
    onClosed?: () => void;
}

// Servicio para iniciar sesión
export const loginService = async (email: string, password: string) => {
    const { data } = await axios.post(`${API_URL}/login`, { email, password }, { withCredentials: true });
    return data;
}

// Servicio para registrarse
export const signUpService = async (name: string, email: string, password: string) => {
    const { data } = await axios.post(`${API_URL}/register`, { name, email, password }, { withCredentials: true });
    return data;
}

// Servicio para cerrar sesión
export const logOutService = async () => {
    const { data } = await axios.post(`${API_URL}/logout`, {}, { withCredentials: true });
    return data;
}

// Servicio para verificar la autenticación
export const verifyService = async () => {
    const { data } = await axios.get(`${API_URL}/verify`, { withCredentials: true });
    return data;
}

// Servicio para actualizar el token de whatsapp
export const updateWhatsAppTokenService = async (tokenWhatsapp: string, phoneNumberId: string, waBusinessId: string) => {
    const { data } = await axios.put(`${API_URL}/users/update-user-token-whatsapp`, { tokenWhatsapp, phoneNumberId, waBusinessId }, { withCredentials: true });
    return data;
}

// Servicio para obtener las conversaciones
export const getConversationsService = async () => {
    const { data } = await axios.get(`${API_URL}/chats`, { withCredentials: true });
    return data;
}

// Servicio para obtener los mensajes de una conversación
export const getConversationsMessagesService = async (conversationId: string, context: QueryFunctionContext) => {
    const pageParam = context.pageParam as string || undefined;
    let query = '?limit=50';
    if (pageParam !== undefined) query += '&before=' + pageParam;
    console.log('pageParam', pageParam);
    const res = await axios.get(`${API_URL}/chats/${conversationId}/messages${query}`, { withCredentials: true });

    const { items = [], nextCursor } = res.data;
    console.log('Next cursor:', nextCursor);
    return { items, nextCursor };
}

// Servicio para enviar un mensaje en una conversación
export const sendMessageService = async (
    text: string,
    conversationId?: string,
    temporalId?: string,
    contactName?: string,
    destinationNumber?: string) => {

    let url = `${API_URL}/chats/messages`;;
    if (conversationId) {
        url = `${API_URL}/chats/${conversationId}/messages`;
    }
    const { data } = await axios.post(url, { text, temporalId, contactName, destinationNumber }, { withCredentials: true });
    return data;
}

// Servicio para conección SSE
export const createSSEConnection = (

    endpoint: string,
    handlers: SSEHandlers = {}
) => {

    const url = `${API_URL}/${endpoint}`;
    console.log("Creating SSE connection to:", url);

    const source = new EventSource(url, { withCredentials: true });

    if (handlers.onMessageCreated) {
        source.addEventListener("message_created", handlers.onMessageCreated);
    }
    if (handlers.onMessageStatus) {
        source.addEventListener("message_status", handlers.onMessageStatus);
    }
    if (handlers.onConversationUpdated) {
        source.addEventListener("conversation_updated", handlers.onConversationUpdated);
    }
    if (handlers.onContactUpdated) {
        source.addEventListener("contact_updated", handlers.onContactUpdated);
    }
    if (handlers.onCampaignProgress) {
        source.addEventListener("campaign_progress", handlers.onCampaignProgress);
    }

    source.onmessage = (event) => {
        console.debug("📨 Default message:", event.data);
    };

    source.onopen = () => handlers.onOpen?.();

    source.onerror = (err) => {
        console.error("SSE Error:", err);
        handlers.onError?.(err as ErrorEvent);
        if (source.readyState === EventSource.CLOSED) handlers.onClosed?.();
    };

    return {
        close: () => {
            console.log("Closing SSE connection to:", url);
            source.close();
        }
    };
};

// Servicio para syncronizar plantillasc
export const syncTemplatesService = async () => {
    const { data } = await axios.get(`${API_URL}/templates/sync`, { withCredentials: true });
    return data;
}

// Servicio para obtener las plantillas
export const getTemplatesService = async (): Promise<Template[]> => {
    const { data } = await axios.get(`${API_URL}/templates`, { withCredentials: true });
    return data;
}

// El archivo de la cabecera de una plantilla: va crudo, con su tipo en el
// Content-Type y el nombre en X-Filename (codificado: una cabecera HTTP no
// admite tildes). Devuelve la plantilla actualizada.
export const uploadTemplateHeaderMediaService = async (templateId: string, file: File): Promise<Template> => {
    const { data } = await axios.put(`${API_URL}/templates/${templateId}/header-media`, file, {
        withCredentials: true,
        headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
    });
    return data;
}

export const removeTemplateHeaderMediaService = async (templateId: string): Promise<Template> => {
    const { data } = await axios.delete(`${API_URL}/templates/${templateId}/header-media`, { withCredentials: true });
    return data;
}

// Servicio para generar una API key
export const generatePikeyService = async (nameApiKey: string) => {
    const { data } = await axios.post(`${API_URL}/api-key/generate`, { nameApiKey }, { withCredentials: true });
    return data;
}

// Servicio para listar las API keys del usuario
export const getApiKeysService = async () => {
    const { data } = await axios.get(`${API_URL}/api-key`, { withCredentials: true });
    return data;
}

// Servicio para revocar (eliminar) una API key
export const revokeApiKeyService = async (id: string) => {
    const { data } = await axios.delete(`${API_URL}/api-key/${id}`, { withCredentials: true });
    return data;
}

// Servicio para conectar WhatsApp vía Embedded Signup
export const connectWhatsappService = async (code: string, phoneNumberId: string, waBusinessId: string) => {
    const { data } = await axios.post(`${API_URL}/whatsapp/connect`, { code, phoneNumberId, waBusinessId }, { withCredentials: true });
    return data;
};

// Servicio para obtener metricas globales de la plataforma (superadmin)
export const getAdminStatsService = async () => {
    const { data } = await axios.get(`${API_URL}/admin/stats`, { withCredentials: true });
    return data;
}

// Servicio para lsitar clientes con sus agregados (superadmin)
export const getAdminClientsService = async (page: number, limit: number) => {
    const { data } = await axios.get(`${API_URL}/admin/clients?page=${page}&limit=${limit}`, { withCredentials: true });
    return data;
}

// Servicio para enviar una plantilla dentro de una conversación existente
export const sendConversationTemplateService = async (
    conversationId: string,
    templateName: string,
    parameters: (string | { name: string; value: string })[],
    language?: string,
    buttons?: TemplateButtonParam[],
) => {
    const { data } = await axios.post(
        `${API_URL}/chats/${conversationId}/template`,
        { templateName, parameters, language, buttons },
        { withCredentials: true },
    );
    return data;
}

// Servicio para iniciar una conversación nueva con una plantilla (a un número
// que todavía no está en la bandeja, o que nunca escribió)
export const startConversationTemplateService = async (
    destinationNumber: string,
    templateName: string,
    parameters: (string | { name: string; value: string })[],
    language?: string,
    buttons?: TemplateButtonParam[],
    contactName?: string,
) => {
    const { data } = await axios.post(
        `${API_URL}/chats/template`,
        { destinationNumber, contactName, templateName, parameters, language, buttons },
        { withCredentials: true },
    );
    return data;
}

// --- Contactos ---------------------------------------------------------------

export const getContactsService = async (page: number, limit: number, search: string, filter: ContactFilter) => {
    const { data } = await axios.get(`${API_URL}/contacts`, {
        params: { page, limit, search: search || undefined, filter },
        withCredentials: true,
    });
    return data;
}

export const getContactService = async (id: string) => {
    const { data } = await axios.get(`${API_URL}/contacts/${id}`, { withCredentials: true });
    return data;
}

export const createContactService = async (input: ContactInput) => {
    const { data } = await axios.post(`${API_URL}/contacts`, input, { withCredentials: true });
    return data;
}

export const updateContactService = async (id: string, input: ContactInput) => {
    const { data } = await axios.patch(`${API_URL}/contacts/${id}`, input, { withCredentials: true });
    return data;
}

export const deleteContactService = async (id: string) => {
    await axios.delete(`${API_URL}/contacts/${id}`, { withCredentials: true });
}

// --- Envíos masivos ----------------------------------------------------------

export const previewCampaignService = async (input: CampaignDraftInput) => {
    const { data } = await axios.post(`${API_URL}/campaigns/preview`, input, { withCredentials: true });
    return data;
}

export const previewCampaignAudienceService = async (input: CampaignAudienceInput, page: number, limit: number, search: string) => {
    const { data } = await axios.post(`${API_URL}/campaigns/preview/recipients`, input, {
        params: { page, limit, search: search || undefined },
        withCredentials: true,
    });
    return data;
}

export const createCampaignService = async (input: CreateCampaignInput) => {
    const { data } = await axios.post(`${API_URL}/campaigns`, input, { withCredentials: true });
    return data;
}

export const getCampaignsService = async (page: number, limit: number) => {
    const { data } = await axios.get(`${API_URL}/campaigns`, { params: { page, limit }, withCredentials: true });
    return data;
}

export const getCampaignService = async (id: string) => {
    const { data } = await axios.get(`${API_URL}/campaigns/${id}`, { withCredentials: true });
    return data;
}

export const getCampaignRecipientsService = async (id: string, page: number, limit: number, state: RecipientState | null) => {
    const { data } = await axios.get(`${API_URL}/campaigns/${id}/recipients`, {
        params: { page, limit, state: state ?? undefined },
        withCredentials: true,
    });
    return data;
}

export const getCampaignFailuresService = async (id: string) => {
    const { data } = await axios.get(`${API_URL}/campaigns/${id}/failures`, { withCredentials: true });
    return data;
}

/** Pausar, reanudar o cancelar. Sin cuerpo: el id va en la ruta. */
export const campaignActionService = async (id: string, action: 'pause' | 'resume' | 'cancel') => {
    const { data } = await axios.post(`${API_URL}/campaigns/${id}/${action}`, undefined, { withCredentials: true });
    return data;
}
