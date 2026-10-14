import webpush from 'web-push';
import PushSubscription from '../models/push.subscription.model.js';
import User from '../models/user.model.js';
import Line from '../models/line.model.js';
import { PUSH_ENABLED, VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT } from '../config.js';
import { buildInboundPush, isGonePushError, pushLineName, pushRecipientIds } from '../utils/push.js';

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
export const notifyInbound = async ({ accountId, lineId, conversationId, contact, text, type, caption }) => {
    if (!PUSH_ENABLED) return;
    try {
        const subscriptions = await PushSubscription.find({ accountId }).lean();
        if (subscriptions.length === 0) return;

        const memberIds = [...new Set(subscriptions.map(subscription => String(subscription.memberId)))];
        const members = await User.find({ _id: { $in: memberIds }, accountId })
            .select('accountId role lineIds status').lean();
        const recipients = new Set(pushRecipientIds(members, accountId, { lineId }));
        const targets = subscriptions.filter(subscription => recipients.has(String(subscription.memberId)));
        if (targets.length === 0) return;

        // Con varias líneas, la del mensaje va en el título.
        const activeLines = await Line.find({ accountId, status: 'active' })
            .select('name verifiedName displayPhoneNumber phoneNumberId').lean();
        const lineName = pushLineName(activeLines, lineId);
        const payload = JSON.stringify(buildInboundPush({ conversationId, contact, text, type, caption, lineName }));
        await Promise.allSettled(targets.map(subscription => sendOne(subscription, payload)));
    } catch (error) {
        console.error('No se pudieron enviar los avisos push de un entrante:', { error: error.message });
    }
};
