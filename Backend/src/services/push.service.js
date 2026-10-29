import webpush from 'web-push';
import PushSubscription from '../models/push.subscription.model.js';
import User from '../models/user.model.js';
import Line from '../models/line.model.js';
import Conversation from '../models/conversation.model.js';
import { PUSH_ENABLED, VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT } from '../config.js';
import {
    assignmentPushTarget, buildAssignmentPush, buildInboundPush, isGonePushError, pushLineName, pushRecipientIds,
} from '../utils/push.js';
import { sessionAuthFor } from '../utils/account.js';
import { currentConversationMeta } from './assignment.service.js';

// ---------------------------------------------------------------------------
// Avisos push (app móvil): al llegar un mensaje, un aviso a cada dispositivo de
// quien lo recibiría por SSE. Las suscripciones las guarda `push.controller.js`.
// ---------------------------------------------------------------------------

if (PUSH_ENABLED) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

/**
 * Por dónde sale cada aviso: `web-push` firma con VAPID, cifra y hace el POST al
 * servicio de push del navegador. Mutable para que los tests lo reemplacen,
 * como `whatsappApi.defaults.adapter`: ningún test sale a la red.
 */
export const pushTransport = {
    send: (subscription, payload, options) => webpush.sendNotification(subscription, payload, options),
};

// Un aviso que el teléfono no pudo recibir en 12 h ya no sirve; `high` para que
// Android lo entregue aunque el teléfono esté en reposo.
const SEND_OPTIONS = { TTL: 12 * 60 * 60, urgency: 'high' };

// Para el log: el host dice qué servicio falló; el endpoint completo no se
// guarda (identifica el dispositivo).
const pushHost = (endpoint) => {
    try { return new URL(endpoint).hostname; } catch { return null; }
};

const sendOne = async (subscription, payload) => {
    try {
        await pushTransport.send({ endpoint: subscription.endpoint, keys: subscription.keys }, payload, SEND_OPTIONS);
    } catch (error) {
        // El navegador ya no tiene esa suscripción (la desinstalaron, quitaron
        // el permiso o cerraron sesión): no vuelve a servir.
        if (isGonePushError(error)) {
            await PushSubscription.deleteOne({ _id: subscription._id });
            return;
        }
        console.warn('No se pudo enviar un aviso push:', { statusCode: error?.statusCode ?? null, host: pushHost(subscription.endpoint) });
    }
};

/**
 * El aviso de un mensaje entrante a los dispositivos de quien puede verlo: la
 * misma regla que el `message_created` por SSE, con el rol, las líneas y el
 * estado de AHORA (se relee `User`, no lo de cuando se suscribió).
 *
 * El webhook la llama sin esperar: nunca rechaza, y ni el texto ni el endpoint
 * van al log (son conversaciones privadas de los clientes de nuestros clientes).
 */
export const notifyInbound = async ({ accountId, conversationId, contact, text, type, caption }) => {
    if (!PUSH_ENABLED) return;
    try {
        const subscriptions = await PushSubscription.find({ accountId }).lean();
        if (subscriptions.length === 0) return;

        const memberIds = [...new Set(subscriptions.map(subscription => String(subscription.memberId)))];
        const [members, activeLines] = await Promise.all([
            User.find({ _id: { $in: memberIds }, accountId }).select('accountId role lineIds status').lean(),
            // Con varias líneas, la del mensaje va en el título.
            Line.find({ accountId, status: 'active' }).select('name verifiedName displayPhoneNumber phoneNumberId').lean(),
        ]);
        // Su línea y quién la atiende, leídos lo ÚLTIMO, sin otra espera hasta
        // enviar: si cambia de manos mientras se lee lo demás, el push no le
        // llega a quien la perdió (revisión de Codex del PR #143). Si la atiende
        // alguien, solo a esa persona (decisión del 2026-10-27).
        const meta = await currentConversationMeta(conversationId);
        if (!meta) return;
        const recipients = new Set(pushRecipientIds(members, accountId, meta));
        const targets = subscriptions.filter(subscription => recipients.has(String(subscription.memberId)));
        if (targets.length === 0) return;

        const lineName = pushLineName(activeLines, meta.lineId);
        const payload = JSON.stringify(buildInboundPush({ conversationId, contact, text, type, caption, lineName }));
        await Promise.allSettled(targets.map(subscription => sendOne(subscription, payload)));
    } catch (error) {
        console.error('No se pudieron enviar los avisos push de un entrante:', { error: error.message });
    }
};

/**
 * Un aviso de la asignación (avisos de la asignación, spec § 7): `assigned` y
 * `passed` («te asignaron», «te la pasaron»), `requested` (te piden una),
 * `rejected` (no te la pasaron) y `lost` (te la quitaron), solo a los
 * dispositivos de `recipientId`. Si todavía le toca lo decide
 * `assignmentPushTarget` con la persona y la conversación leídas al enviar.
 * `requestId` va con `requested`; `targetId` y `targetName` (quién la tiene
 * ahora), con `lost`. Se llama sin esperar: nunca rechaza.
 */
export const notifyAssignment = async ({
    accountId, conversationId, recipientId, actorId = null, actorName, kind, requestId = null, targetId = null, targetName = null,
}) => {
    if (!PUSH_ENABLED) return;
    try {
        const subscriptions = await PushSubscription.find({ accountId, memberId: recipientId }).lean();
        if (subscriptions.length === 0) return;

        const [member, activeLines, conversation] = await Promise.all([
            User.findOne({ _id: recipientId, accountId }).select('accountId role lineIds status').lean(),
            Line.find({ accountId, status: 'active' }).select('name verifiedName displayPhoneNumber phoneNumberId').lean(),
            Conversation.findOne({ _id: conversationId, userId: accountId }).select('contactId contactName contactPhone')
                .populate('contactId', 'name agendaName profileName username phone').lean(),
        ]);
        if (!member || !conversation) return;
        // Leída lo último, como en `notifyInbound`.
        const current = await Conversation.findById(conversationId).select('lineId assignedTo transferRequest').lean();
        const target = assignmentPushTarget(kind, sessionAuthFor(member), current, { requestId });
        if (!target) return;

        const contact = conversation.contactId ?? { name: conversation.contactName, phone: conversation.contactPhone };
        const payload = JSON.stringify(buildAssignmentPush({
            conversationId, contact, lineName: pushLineName(activeLines, current.lineId), actorName, kind,
            actorId, targetId, targetName, open: target.open,
        }));
        await Promise.allSettled(subscriptions.map(subscription => sendOne(subscription, payload)));
    } catch (error) {
        console.error('No se pudo enviar el aviso push de una asignación:', { kind, error: error.message });
    }
};

