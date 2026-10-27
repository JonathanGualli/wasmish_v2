import Conversation from '../models/conversation.model.js';
import { sendToAccount } from '../controllers/stream.controller.js';
import { conversationMeta } from '../utils/permissions.js';

// ---------------------------------------------------------------------------
// La asignación de conversaciones (Fase 4 de multi-línea). Las reglas puras
// están en utils/assignment.js y utils/permissions.js; aquí, lo que lee y
// escribe la BD y avisa por SSE.
// ---------------------------------------------------------------------------

/**
 * La `meta` de los eventos de una conversación, leída AHORA: entre leer la
 * conversación y emitir pueden pasar segundos (la llamada a Meta, descargar un
 * adjunto) y en ese tiempo cambiar de manos. Con la del principio, el evento le
 * llegaría a quien ya la perdió (revisión de Codex del plan de la Fase 4, 2).
 * `null` si ya no existe.
 */
export const currentConversationMeta = async (conversationId) => {
    const conversation = await Conversation.findById(conversationId).select('lineId assignedTo').lean();
    return conversation ? conversationMeta(conversation) : null;
};

/**
 * Un evento de una conversación, a quien la ve en este momento. Nunca lanza:
 * quien emite ya hizo lo suyo (guardó el mensaje, el acuse), y un aviso que no
 * sale lo arregla el siguiente o recargar.
 */
export const sendConversationEvent = async (accountId, conversationId, event, data) => {
    try {
        const meta = await currentConversationMeta(conversationId);
        if (meta) sendToAccount(String(accountId), event, data, meta);
    } catch (error) {
        console.error('No se pudo avisar de un evento de conversación:', { event, error: error.message });
    }
};
