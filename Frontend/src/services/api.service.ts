import type { QueryFunctionContext } from '@tanstack/react-query';
import axios from 'axios';

const API_URL = 'http://localhost:4000/api';

interface SSEHandlers {
    onMessageCreated?: (event: MessageEvent) => void;
    onError?: (err: ErrorEvent) => void;
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
export const updateWhatsAppTokenService = async (tokenWhatsapp: string, phoneNumberId: string) => {
    const { data } = await axios.put(`${API_URL}/users/update-user-token-whatsapp`, { tokenWhatsapp, phoneNumberId }, { withCredentials: true });
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
    let query = '?limit=30';
    if (pageParam !== undefined) query += '&before=' + pageParam;
    console.log('pageParam', pageParam);
    const res = await axios.get(`${API_URL}/chats/${conversationId}/messages${query}`, { withCredentials: true });

    const { items = [], nextCursor } = res.data;
    console.log('Next cursor:', nextCursor);
    return { items, nextCursor };
}

// Servicio para enviar un mensaje en una conversación
export const sendMessageService = async (conversationId: string, text: string) => {
    const { data } = await axios.post(`${API_URL}/chats/${conversationId}/messages`, { text }, { withCredentials: true });
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

    source.onmessage = (event) => {
        console.debug("📨 Default message:", event.data);
    };

    source.onerror = (err) => {
        console.error("SSE Error:", err);
        handlers.onError?.(err as ErrorEvent);
    };

    return {
        close: () => {
            console.log("Closing SSE connection to:", url);
            source.close();
        }
    };
};