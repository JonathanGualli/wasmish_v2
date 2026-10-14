import PushSubscription from "../models/push.subscription.model.js";
import { PUSH_ENABLED, VAPID_PUBLIC_KEY } from "../config.js";

// ---------------------------------------------------------------------------
// Los dispositivos que reciben avisos push (app móvil). Cada persona activa los
// avisos en cada navegador; el envío vive en `services/push.service.js`.
// ---------------------------------------------------------------------------

const PUSH_DISABLED = [{ message: 'Los avisos no están configurados', code: 'push_disabled' }];
const OWNED_BY_OTHER = [{ message: 'Este dispositivo recibe los avisos de otra persona', code: 'push_owned_by_other' }];
const USER_AGENT_MAX = 300;

const subscriptionFields = (req) => ({
    accountId: req.auth.accountId,
    memberId: req.auth.userId,
    keys: { p256dh: req.body.keys.p256dh, auth: req.body.keys.auth },
    userAgent: req.get('user-agent')?.slice(0, USER_AGENT_MAX) ?? null,
});

/** GET /push/config — la clave pública VAPID, o `null` si los avisos están apagados. */
export const getPushConfig = (req, res) => res.json({ publicKey: PUSH_ENABLED ? VAPID_PUBLIC_KEY : null });

/**
 * POST /push/subscriptions — la persona ACTIVA los avisos en este navegador (un
 * toque suyo). Si el navegador era de otra persona, pasa a ser suyo.
 */
export const savePushSubscription = async (req, res) => {
    if (!PUSH_ENABLED) return res.status(503).json(PUSH_DISABLED);

    const update = { $set: subscriptionFields(req) };
    try {
        await PushSubscription.updateOne({ endpoint: req.body.endpoint }, update, { upsert: true });
    } catch (error) {
        if (error.code !== 11000) throw error;
        // Dos activaciones a la vez del mismo navegador: la otra lo creó entre
        // medias, y ahora sí existe para actualizarlo.
        await PushSubscription.updateOne({ endpoint: req.body.endpoint }, update);
    }
    return res.json({ ok: true });
};

/**
 * POST /push/subscriptions/sync — automático (al abrir la app o al renovarse la
 * suscripción). Crea o actualiza la suscripción de la persona, pero NUNCA se
 * queda con la de otra: una sincronización vieja que llega tarde devolvía el
 * dispositivo a quien ya no lo usa (revisión de Codex del PR #41).
 */
export const syncPushSubscription = async (req, res) => {
    if (!PUSH_ENABLED) return res.status(503).json(PUSH_DISABLED);

    try {
        // Filtrar también por la persona: si el endpoint es de otra, el upsert
        // intenta crear otro documento y lo frena `push_endpoint_unique`.
        await PushSubscription.updateOne(
            { endpoint: req.body.endpoint, memberId: req.auth.userId },
            { $set: subscriptionFields(req) },
            { upsert: true },
        );
    } catch (error) {
        if (error.code === 11000) return res.status(409).json(OWNED_BY_OTHER);
        throw error;
    }
    return res.json({ ok: true });
};

/** DELETE /push/subscriptions — la persona apaga los avisos de este navegador (o cierra sesión). */
export const deletePushSubscription = async (req, res) => {
    const { deletedCount } = await PushSubscription.deleteOne({
        endpoint: req.body.endpoint,
        memberId: req.auth.userId,
        accountId: req.auth.accountId,
    });
    if (!deletedCount) return res.status(404).json([{ message: 'Suscripción no encontrada' }]);
    return res.sendStatus(204);
};
