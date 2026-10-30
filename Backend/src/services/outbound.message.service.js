// El final común de los dos caminos de envío, `processMessageSending` (texto y
// archivos) y `processTemplateSending` (plantillas, campañas y API pública):
// lo que pasa después de llamar a Meta, haya salido o no. Antes cada uno lo
// tenía copiado, y el `message_created` de las plantillas se armaba a mano y se
// había quedado sin campos que sí lleva `serializeMessage`.

import Message from '../models/message.model.js';
import { sendConversationEvent } from './assignment.service.js';
import { applyHeldStatuses } from './message.status.service.js';
import { getSendingConversation } from '../controllers/contact.controller.js';
import { serializeMessage } from '../utils/message.serialize.js';

/**
 * Guarda un saliente ya enviado (o rechazado): la conversación (la crea si no
 * la hay), el `Message` con su estado real, los acuses que se le adelantaron
 * (`PendingStatus`) y su `message_created`.
 *
 * - `line`: la línea por la que salió; su cuenta es la dueña de lo que se guarda.
 * - `conversation`, `contact`, `recipient`, `contactName`, `source`: dónde se
 *   guarda, como en `getSendingConversation`.
 * - `text`: lo que se ve en el chat y en la bandeja.
 * - `outcome`: lo que devolvió `metaSendOutcome`.
 * - `fields`: lo propio de cada envío en el `Message` (quién, de dónde, el
 *   archivo, la plantilla, la cita…).
 * - `quoted`: el citado, para el resumen de la cita (`quotedMapOf`).
 * - `eventExtra`: lo que el evento lleva además del mensaje (`campaignId`).
 *
 * Devuelve `{ msg, serialized, conversation }`; `serialized` es lo que se emitió.
 */
export const recordOutboundMessage = async ({
    line,
    conversation = null,
    contact = null,
    recipient,
    contactName,
    source = null,
    text,
    outcome,
    fields = {},
    quoted = null,
    eventExtra = {},
}) => {
    const { waMessageId, status, errorCode, errorDetail } = outcome;

    // Un único `now` para los dos: el orden de la bandeja sale de
    // conversation.lastMessageAt y el cursor de paginación de message.timestamp;
    // con dos relojes distintos quedan desfasados unos milisegundos.
    const now = new Date();

    const targetConversation = await getSendingConversation({
        userId: line.accountId, conversation, contact, recipient, line, contactName, source,
    });
    targetConversation.lastMessage = text;
    targetConversation.lastMessageAt = now;
    await targetConversation.save();

    let msg = await Message.create({
        conversationId: targetConversation._id,
        direction: 'outbound',
        sender: 'me',
        text,
        timestamp: now,
        waMessageId,
        status,
        errorCode,
        errorDetail,
        failedAt: status === 'failed' ? now : null,
        ...fields,
    });
    // Un acuse que se adelantó a este mensaje (`PendingStatus`): antes de avisar.
    if (await applyHeldStatuses(waMessageId)) msg = await Message.findById(msg._id);

    const serialized = serializeMessage(msg, { quoted });
    await sendConversationEvent(line.accountId, targetConversation._id, 'message_created', { ...serialized, ...eventExtra });

    return { msg, serialized, conversation: targetConversation };
};
