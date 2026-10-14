import { z } from "zod";
import { isAllowedPushEndpoint } from "../utils/push.js";

const ENDPOINT_MAX = 2048;

// POST /push/subscriptions y /push/subscriptions/sync — lo que da
// `PushSubscription.toJSON()` en el navegador. Solo servicios de push conocidos:
// el backend hace un POST a ese endpoint.
export const pushSubscriptionSchema = z.object({
    endpoint: z.string().max(ENDPOINT_MAX).refine(isAllowedPushEndpoint, 'Servicio de avisos no admitido'),
    keys: z.object({
        p256dh: z.string().min(1).max(256),
        auth: z.string().min(1).max(64),
    }),
});

// DELETE /push/subscriptions
export const pushEndpointSchema = z.object({
    endpoint: z.string().max(ENDPOINT_MAX),
});
