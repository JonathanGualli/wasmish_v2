import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { listNotifications, markNotificationsSeen } from "../controllers/notification.controller.js";
import { notificationsSeenSchema } from "../schemas/notification.schema.js";

const router = Router();

// La campanita (avisos de la asignación): cualquier rol, cada persona los
// suyos. Solo con sesión: una API key no es una persona.
router.get('/notifications', authRequired, listNotifications);
router.post('/notifications/seen', authRequired, validateSchema(notificationsSeenSchema), markNotificationsSeen);

export default router;
