import crypto from 'crypto';
import { META_APP_SECRET } from '../config.js';

if (!META_APP_SECRET) {
    console.error('[webhook] FALTA META_APP_SECRET — se rechazarán todos los webhooks entrantes');
}

export const verifyWebhookSignature = (req, res, next) => {
    const signature = req.get('x-hub-signature-256');

    if (!signature || !req.rawBody || !META_APP_SECRET) {
        console.warn('[webhook] Petición sin firma rechazada');
        return res.sendStatus(401);
    }

    const expected = 'sha256=' + crypto
        .createHmac('sha256', META_APP_SECRET)
        .update(req.rawBody)
        .digest('hex');

    const received = Buffer.from(signature);
    const calculated = Buffer.from(expected);

    if (received.length !== calculated.length ||
        !crypto.timingSafeEqual(received, calculated)) {
        console.warn('[webhook] Firma inválida rechazada');
        return res.sendStatus(401);
    }

    next();
};
