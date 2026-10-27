// Los acuses de Meta (entregado, leído, fallido) de lo que envía Wasmish.
//
// Un acuse puede llegar ANTES que su mensaje: el envío guarda el saliente
// después de que Meta responde con el wamid, y un `delivered` o un `failed`
// rápido se adelanta. Antes se descartaba, y un `failed` de una campaña dejaba
// el mensaje en «enviado» para siempre. Ahora se guarda (`PendingStatus`) y se
// aplica al guardar el saliente. Cada lado escribe antes de buscar al otro: el
// webhook guarda el acuse y vuelve a buscar el mensaje; el envío guarda el
// mensaje y busca sus acuses. Así uno de los dos siempre lo encuentra.

import Message from '../models/message.model.js';
import Conversation from '../models/conversation.model.js';
import PendingStatus from '../models/pending.status.model.js';
import { sendToAccount } from '../controllers/stream.controller.js';
import { getConversationContact, applyMarketingPreference } from '../controllers/contact.controller.js';
import { resolveStatusTransition } from '../utils/message.status.js';
import { isMarketingOptOutFailure } from '../utils/marketing.preference.js';
import { applyReactionStatus } from './reaction.service.js';

// Avisa a la UI de que un contacto se dio de baja o de alta de la publicidad.
// La ficha y la lista de Contactos se refrescan con él.
export const avisarPreferencia = (inbound, contact) => {
    sendToAccount(String(inbound.accountId), 'contact_updated', {
        id: String(contact._id),
        marketingOptOut: contact.marketingOptOut,
        marketingOptOutAt: contact.marketingOptOutAt ? contact.marketingOptOutAt.toISOString() : null,
    });
    // Sin teléfono ni nombre: basta el id para encontrarlo en la app.
    console.log('Preferencia de marketing:', {
        contactId: String(contact._id),
        marketingOptOut: contact.marketingOptOut,
    });
};

// El 131050 dice que la persona está dada de baja aunque el webhook de
// `user_preferences` no haya llegado (no estar suscrito a ese campo, o que se
// perdiera). Se marca con la hora del acuse.
const marcarBajaPorFallo = async (inbound, message, timestamp) => {
    const conversation = await Conversation.findOne({ _id: message.conversationId, userId: inbound.accountId });
    if (!conversation) return;

    const contact = await getConversationContact(conversation);
    const updated = await applyMarketingPreference(contact, { optOut: true, at: timestamp });
    if (updated) avisarPreferencia(inbound, updated);
};

/**
 * Aplica UN acuse a su mensaje, o a una reacción nuestra, de la cuenta `accountId`.
 * @returns {Promise<boolean>} false si no encontró de quién es: ni un mensaje ni
 *          una reacción de esta cuenta.
 */
const applyMessageStatus = async ({ accountId, statusData }) => {
    const inbound = { accountId };
    const waMessageId = statusData.id;
    const status = statusData.status; // 'send' | 'delivered' | 'read' | 'failed'
    const timestamp = statusData.timestamp ? new Date(parseInt(statusData.timestamp) * 1000) : new Date();

    const message = await Message.findOne({ waMessageId });
    // Si no es un mensaje, puede ser el acuse de una reacción nuestra.
    if (!message) return applyReactionStatus({ line: inbound, statusData });
    // El mensaje tiene que ser de la cuenta del número por el que llega el
    // acuse: si el número pasó de A a B, un acuse tardío de un mensaje de A no
    // lo toca ni se avisa a B (revisión de Codex del PR #35). De aquí sale
    // también la línea del aviso.
    const conversation = await Conversation.findOne({ _id: message.conversationId, userId: accountId })
        .select('lineId').lean();
    if (!conversation) return false;

    // Estado desconocido, repetido o que retrocede → lo ignoramos
    const changes = resolveStatusTransition({
        currentStatus: message.status,
        incomingStatus: status,
        timestamp,
        hasDeliveredAt: Boolean(message.deliveredAt),
    });

    if (!changes) return true;

    Object.assign(message, changes);

    if (status === 'failed') {
        const errors = statusData?.errors ?? [];
        if (!message.errorCode && errors.length > 0) {
            message.errorCode = errors[0]?.code;
            message.errorDetail = errors[0]?.error_data?.details;
        }
    }

    await message.save();

    sendToAccount(
        String(accountId),
        'message_status', {
            id: String(message._id),
            conversationId: String(message.conversationId),
            waMessageId,
            status: message.status,
            deliveredAt: message.deliveredAt ? message.deliveredAt.toISOString() : null,
            readAt: message.readAt ? message.readAt.toISOString() : null,
            failedAt: message.failedAt ? message.failedAt.toISOString() : null,
            errorCode: message.errorCode,
            errorDetail: message.errorDetail,
            // Si salió de una campaña: su detalle se refresca con esto,
            // porque las entregas y lecturas llegan horas después de enviar.
            ...(message.campaignId && { campaignId: String(message.campaignId) }),
        },
        // A quien ve la línea de su conversación (Fase 3; revisión de Codex
        // del plan): con estados, errores y campaña, no es de toda la cuenta.
        { lineId: conversation.lineId ?? null },
    );

    // Solo se registran los fallos. Cada mensaje enviado genera dos o tres acuses
    // (`delivered`, `read`), y anotarlos todos multiplicaba por tres el tamaño del
    // log sin decir nada: que un mensaje llegue es lo normal, y el estado ya queda
    // guardado en el propio Message y se ve en la UI. Lo que se busca en un log es
    // lo que salió mal, y eso sí se conserva entero, con el error de Meta.
    if (message.status === 'failed') {
        console.error("Message failed:", {
            id: String(message._id),
            waMessageId: message.waMessageId,
            errors: statusData.errors,
        });

        if (isMarketingOptOutFailure(statusData.errors)) {
            await marcarBajaPorFallo(inbound, message, timestamp);
        }
    }
    return true;
};

// Si ya hay algo con ese wamid: un mensaje o una reacción nuestra. El predicado
// del índice parcial de las reacciones va repetido: sin él, Mongo no lo usa.
const hasStatusTarget = async (waMessageId) =>
    Boolean(await Message.exists({ waMessageId }) || await Message.exists({ $and: [
        { 'reactions.me.waMessageId': waMessageId },
        { 'reactions.me.waMessageId': { $type: 'string' } },
    ] }));

// Aplica los acuses guardados de ese wamid, de uno en uno y en el orden en que
// llegaron. Cada uno se toma borrándolo: si los dos lados lo buscan a la vez,
// solo uno lo aplica. Solo se llama cuando el mensaje ya existe: uno de otra
// cuenta se borra sin aplicarse, porque nunca lo será.
// @returns {Promise<number>} cuántos tomó.
const drainHeldStatuses = async (waMessageId) => {
    for (let taken = 0; ; taken++) {
        const held = await PendingStatus.findOneAndDelete({ waMessageId }, { sort: { createdAt: 1 } }).lean();
        if (!held) return taken;
        await applyMessageStatus({ accountId: held.userId, statusData: held.statusData });
    }
};

/**
 * UN acuse del webhook (`procesarEstado`): se aplica o, si su mensaje todavía
 * no está, se guarda para cuando llegue. Lanza si falla la BD: el webhook pide
 * la reentrega.
 * @param {{ accountId, statusData }} args `accountId`, la cuenta del número por
 *        el que llega; `statusData`, un elemento de `value.statuses`.
 */
export const receiveStatus = async ({ accountId, statusData }) => {
    if (!statusData?.id || !statusData.status) return;
    if (await applyMessageStatus({ accountId, statusData })) return;

    try {
        await PendingStatus.create({ userId: accountId, waMessageId: statusData.id, status: String(statusData.status), statusData });
    } catch (error) {
        // Una reentrega de Meta: ya estaba guardado.
        if (error.code !== 11000) throw error;
    }
    // Después de guardarlo, buscar otra vez: el saliente pudo guardarse entre
    // la primera búsqueda y esta escritura, y su `applyHeldStatuses` ya no lo vio.
    if (await hasStatusTarget(statusData.id)) await drainHeldStatuses(statusData.id);
};

/**
 * Los acuses que llegaron antes que este saliente (o esta reacción): se llama
 * justo después de guardarlo con su wamid y ANTES de avisar a la UI, para que
 * el chat lo reciba ya con su estado. Nunca lanza: el mensaje ya salió, y un
 * fallo aquí no puede convertir el envío en un error.
 * @returns {Promise<number>} cuántos aplicó: si no es 0, quien llama relee el mensaje.
 */
export const applyHeldStatuses = async (waMessageId) => {
    if (!waMessageId) return 0;
    try {
        return await drainHeldStatuses(waMessageId);
    } catch (error) {
        console.error('No se pudieron aplicar los acuses adelantados:', { waMessageId, error: error.message });
        return 0;
    }
};
