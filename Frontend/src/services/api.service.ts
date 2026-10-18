import type { QueryFunctionContext } from '@tanstack/react-query';
import axios from 'axios';
import type { Template, TemplateButtonParam, TemplateHeaderMedia } from '../models/template.model';
import type { ContactFilter, ContactInput } from '../models/contact.model';
import type { ImportBatchResult, ImportInput, ImportPreview } from '../models/contactImport.model';
import type { BulkTagResult, Tag, TagSelectionSummary } from '../models/tag.model';
import type { CampaignAudienceInput, CampaignDraftInput, CampaignRecipientsInput, CreateCampaignInput, RecipientState } from '../models/campaign.model';
import type { Message } from '../models/message.mode';
import type { Line, LineUpdate, LinesResponse } from '../models/line.model';
import type { InvitationInfo, InvitationInput, MemberChange, TeamInvitation, TeamMember, TeamResponse } from '../models/team.model';
import type { User } from '../models/user.mode';
import type { AutoRepliesResponse, AutoReplyPreviewTurn, AutoReplySettings } from '../models/autoReply.model';

const API_URL = '/api'; // configuracion puesta en vite.config.ts
// const API_URL = 'https://wasmish-api.solventyc.com/api';

interface SSEHandlers {
    onMessageCreated?: (event: MessageEvent) => void;
    onMessageStatus?: (event: MessageEvent) => void;
    onConversationUpdated?: (event: MessageEvent) => void;
    onContactUpdated?: (event: MessageEvent) => void;
    onContactsUpdated?: (event: MessageEvent) => void;
    onTagsUpdated?: (event: MessageEvent) => void;
    onCampaignProgress?: (event: MessageEvent) => void;
    /** Le cambiaron el acceso (rol, líneas, estado): el servidor cierra justo después (Fase 3). */
    onAccessChanged?: () => void;
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
/**
 * Enviar un archivo a una conversación. Va crudo, con su tipo en el
 * Content-Type; el nombre y el texto que lo acompaña van en cabeceras
 * (codificados, para que quepan tildes y emojis).
 */
export const sendMediaMessageService = async (
    conversationId: string,
    { file, mimeType, caption, temporalId, asDocument }: {
        file: File;
        mimeType: string;
        caption: string;
        temporalId: string;
        asDocument: boolean;
    },
    { onProgress, signal }: { onProgress?: (loadedBytes: number) => void; signal?: AbortSignal } = {},
): Promise<Message> => {
    const headers: Record<string, string> = {
        'Content-Type': mimeType || 'application/octet-stream',
        'X-Filename': encodeURIComponent(file.name),
        'X-Temporal-Id': temporalId,
    };
    if (caption) headers['X-Caption'] = encodeURIComponent(caption);
    if (asDocument) headers['X-Send-As'] = 'document';

    const { data } = await axios.post(`${API_URL}/chats/${conversationId}/media`, file, {
        withCredentials: true,
        headers,
        onUploadProgress: (event) => onProgress?.(event.loaded),
        signal,
    });
    return data;
}

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
    if (handlers.onContactsUpdated) {
        source.addEventListener("contacts_updated", handlers.onContactsUpdated);
    }
    if (handlers.onTagsUpdated) {
        source.addEventListener("tags_updated", handlers.onTagsUpdated);
    }
    if (handlers.onCampaignProgress) {
        source.addEventListener("campaign_progress", handlers.onCampaignProgress);
    }
    if (handlers.onAccessChanged) {
        const onAccessChanged = handlers.onAccessChanged;
        source.addEventListener("access_changed", () => onAccessChanged());
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

// Un archivo para la cabecera de UN envío (una campaña), sin cambiar el de la
// plantilla. Se valida contra su formato y devuelve el archivo guardado. Un
// vídeo pesa hasta 16 MB: `onProgress` cuenta los bytes ya enviados y `signal`
// deja cancelarlo.
export const uploadHeaderMediaFileService = async (
    templateId: string,
    file: File,
    { onProgress, signal }: { onProgress?: (loadedBytes: number) => void; signal?: AbortSignal } = {},
): Promise<TemplateHeaderMedia> => {
    const { data } = await axios.post(`${API_URL}/templates/${templateId}/header-media/files`, file, {
        withCredentials: true,
        headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
        onUploadProgress: (event) => onProgress?.(event.loaded),
        signal,
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
// `businessApp`: el número sigue en la app de WhatsApp Business (coexistencia).
// Ahí Meta no da el número y el backend lo deduce del WABA: `phoneNumberId` es null.
export const connectWhatsappService = async ({ code, waBusinessId, phoneNumberId, businessApp }: {
    code: string; waBusinessId: string; phoneNumberId: string | null; businessApp: boolean;
}) => {
    const body = { code, waBusinessId, ...(phoneNumberId && { phoneNumberId }), ...(businessApp && { businessApp: true }) };
    const { data } = await axios.post(`${API_URL}/whatsapp/connect`, body, { withCredentials: true });
    return data;
};

// Las líneas de WhatsApp de la cuenta (Fase 2c).
export const getLinesService = async (): Promise<LinesResponse> => {
    const { data } = await axios.get(`${API_URL}/lines`, { withCredentials: true });
    return data;
};

export const updateLineService = async (id: string, update: LineUpdate): Promise<Line> => {
    const { data } = await axios.patch(`${API_URL}/lines/${id}`, update, { withCredentials: true });
    return data;
};

/** El PIN de dos pasos de una línea; `null` si Wasmish no lo guardó. Se pide solo cuando se va a enseñar. */
export const getLinePinService = async (id: string): Promise<string | null> => {
    const { data } = await axios.get(`${API_URL}/lines/${id}/pin`, { withCredentials: true });
    return (data as { pin: string | null }).pin;
};

export const disconnectLineService = async (id: string): Promise<Line> => {
    const { data } = await axios.post(`${API_URL}/lines/${id}/disconnect`, {}, { withCredentials: true });
    return data;
};

// Cuántas líneas y personas puede tener una cuenta (superadmin). Lo que no se manda no cambia.
export const updateAccountLimitsService = async (accountId: string, limits: { maxLines?: number; maxUsers?: number }) => {
    const { data } = await axios.patch(`${API_URL}/admin/accounts/${accountId}/limits`, limits, { withCredentials: true });
    return data as { accountId: string; maxLines: number; maxUsers: number };
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
    lineId?: string,
) => {
    const { data } = await axios.post(
        `${API_URL}/chats/template`,
        { destinationNumber, contactName, templateName, parameters, language, buttons, lineId },
        { withCredentials: true },
    );
    return data;
}

// --- Contactos ---------------------------------------------------------------

export const getContactsService = async (page: number, limit: number, search: string, filter: ContactFilter, tagIds: string[] = []) => {
    const { data } = await axios.get(`${API_URL}/contacts`, {
        params: { page, limit, search: search || undefined, filter, tags: tagIds.length ? tagIds.join(',') : undefined },
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

// --- Importar contactos ------------------------------------------------------

/** Qué pasaría con el archivo entero. No escribe nada. */
export const previewContactImportService = async (input: ImportInput): Promise<ImportPreview> => {
    const { data } = await axios.post(`${API_URL}/contacts/import/preview`, input, { withCredentials: true });
    return data;
}

/** Una tanda. Repetirla no duplica: lo que ya está se queda igual. */
export const importContactsService = async (input: ImportInput & { consent: true }): Promise<ImportBatchResult> => {
    const { data } = await axios.post(`${API_URL}/contacts/import`, input, { withCredentials: true });
    return data;
}

// --- Etiquetas ---------------------------------------------------------------

export const getTagsService = async (): Promise<Tag[]> => {
    const { data } = await axios.get(`${API_URL}/tags`, { withCredentials: true });
    return data.tags;
}

/** Si ya hay una con ese nombre («vip» = «VIP»), devuelve esa. */
export const createTagService = async (name: string): Promise<Tag> => {
    const { data } = await axios.post(`${API_URL}/tags`, { name }, { withCredentials: true });
    return data;
}

export const renameTagService = async (id: string, name: string): Promise<Tag> => {
    const { data } = await axios.patch(`${API_URL}/tags/${id}`, { name }, { withCredentials: true });
    return data;
}

export const deleteTagService = async (id: string): Promise<{ removedFrom: number }> => {
    const { data } = await axios.delete(`${API_URL}/tags/${id}`, { withCredentials: true });
    return data;
}

export const bulkTagContactsService = async (
    selection: CampaignRecipientsInput, add: string[], remove: string[],
): Promise<BulkTagResult> => {
    const { data } = await axios.post(`${API_URL}/contacts/tags`, { selection, add, remove }, { withCredentials: true });
    return data;
}

export const tagSelectionSummaryService = async (selection: CampaignRecipientsInput): Promise<TagSelectionSummary> => {
    const { data } = await axios.post(`${API_URL}/contacts/tags/summary`, { selection }, { withCredentials: true });
    return data;
}

// --- Campañas ---------------------------------------------------------------

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

// --- Equipo (Fase 3) -----------------------------------------------------------

export const getTeamService = async (): Promise<TeamResponse> => {
    const { data } = await axios.get(`${API_URL}/team`, { withCredentials: true });
    return data;
};

/** El `token` sale una sola vez: el enlace se arma con él y no se puede volver a pedir. */
export const inviteMemberService = async (input: InvitationInput): Promise<{ invitation: TeamInvitation; token: string }> => {
    const { data } = await axios.post(`${API_URL}/team/invitations`, input, { withCredentials: true });
    return data;
};

export const revokeInvitationService = async (id: string): Promise<void> => {
    await axios.delete(`${API_URL}/team/invitations/${id}`, { withCredentials: true });
};

export const updateMemberService = async (id: string, change: MemberChange): Promise<TeamMember> => {
    const { data } = await axios.patch(`${API_URL}/team/members/${id}`, change, { withCredentials: true });
    return data;
};

/** Público: lo que dice la página de aceptar la invitación. */
export const getInvitationService = async (token: string): Promise<InvitationInfo> => {
    const { data } = await axios.get(`${API_URL}/invitations/${encodeURIComponent(token)}`, { withCredentials: true });
    return data;
};

/** Público: crea la persona y deja la sesión abierta (como el login). */
export const acceptInvitationService = async (token: string, input: { name: string; password: string }): Promise<User> => {
    const { data } = await axios.post(`${API_URL}/invitations/${encodeURIComponent(token)}/accept`, input, { withCredentials: true });
    return data;
};

// --- Avisos push (app móvil) ----------------------------------------------------

/** La clave pública VAPID; `null` si el servidor no tiene los avisos configurados. */
export const getPushConfigService = async (): Promise<{ publicKey: string | null }> => {
    const { data } = await axios.get(`${API_URL}/push/config`, { withCredentials: true });
    return data;
};

/** La persona ACTIVA los avisos en este navegador (un toque suyo): el dispositivo pasa a ser suyo. */
export const savePushSubscriptionService = async (subscription: PushSubscriptionJSON): Promise<void> => {
    await axios.post(`${API_URL}/push/subscriptions`, subscription, { withCredentials: true });
};

/** Automático, al abrir la app: nunca se queda con el dispositivo de otra persona (409 `push_owned_by_other`). */
export const syncPushSubscriptionService = async (subscription: PushSubscriptionJSON): Promise<void> => {
    await axios.post(`${API_URL}/push/subscriptions/sync`, subscription, { withCredentials: true });
};

/** Apagar los avisos de este navegador (o cerrar sesión). 404 si ya no estaba. */
export const deletePushSubscriptionService = async (endpoint: string): Promise<void> => {
    await axios.delete(`${API_URL}/push/subscriptions`, { data: { endpoint }, withCredentials: true });
};

// ---------------------------------------------------------------------------
// Respuestas automáticas (solo owner y admin: `autoReplies.manage`)
// ---------------------------------------------------------------------------

export const getAutoRepliesService = async (): Promise<AutoRepliesResponse> => {
    const { data } = await axios.get(`${API_URL}/auto-replies`, { withCredentials: true });
    return data;
};

/** Reemplaza la configuración entera; responde como el `GET`. */
export const saveAutoRepliesService = async (settings: AutoReplySettings): Promise<AutoRepliesResponse> => {
    const { data } = await axios.put(`${API_URL}/auto-replies`, settings, { withCredentials: true });
    return data;
};

/** Cómo respondería `settings` (sin guardarla) a una conversación de un contacto nuevo, mensaje a mensaje. */
export const previewAutoReplyService = async (settings: AutoReplySettings, messages: string[]): Promise<AutoReplyPreviewTurn[]> => {
    const { data } = await axios.post(`${API_URL}/auto-replies/preview`, { settings, messages }, { withCredentials: true });
    return data.turns;
};
