// La vista previa de la bandeja (`lastMessage`, `lastMessageAt`) para lo que
// llega de Meta: el entrante en vivo, el eco y lo traído del historial.

import Conversation from '../models/conversation.model.js';

/**
 * Adelanta la vista previa de la conversación con un mensaje que no es un
 * entrante en vivo (un eco, lo traído del historial). Nunca retrocede, porque
 * Meta no garantiza el orden: solo si el mensaje es más nuevo o si la
 * conversación acaba de nacer (sin vista previa, con `lastMessageAt` = ahora).
 * `sameTime` también la cambia con la misma hora: lo usa el entrante en vivo,
 * porque Meta da la hora en segundos y, de dos mensajes del mismo segundo
 * («hola», «necesito ayuda»), el último que se procesa es el que va.
 * @returns {Promise<boolean>} si la cambió.
 */
export const advanceConversationPreview = async (conversationId, { text, timestamp }, { sameTime = false } = {}) => {
    const result = await Conversation.updateOne(
        { _id: conversationId, $or: [{ lastMessage: { $in: ['', null] } }, { lastMessageAt: { [sameTime ? '$lte' : '$lt']: timestamp } }] },
        { $set: { lastMessage: text, lastMessageAt: timestamp } },
    );
    return result.modifiedCount > 0;
};
