import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import {
    deletePushSubscription, getPushConfig, savePushSubscription, syncPushSubscription,
} from "../controllers/push.controller.js";
import { pushEndpointSchema, pushSubscriptionSchema } from "../schemas/push.schema.js";

const router = Router();

// Los avisos push de cada dispositivo (app móvil). Cualquier rol: cada persona
// recibe los de lo que ya puede ver.
router.get('/push/config', authRequired, getPushConfig);
router.post('/push/subscriptions', authRequired, validateSchema(pushSubscriptionSchema), savePushSubscription);
router.post('/push/subscriptions/sync', authRequired, validateSchema(pushSubscriptionSchema), syncPushSubscription);
router.delete('/push/subscriptions', authRequired, validateSchema(pushEndpointSchema), deletePushSubscription);

export default router;
