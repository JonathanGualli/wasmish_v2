import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { connectWhatsappSchema } from "../schemas/whatsapp.schema.js";
import { connectWhatsappEmbedded } from "../controllers/whatsapp.controller.js";
import { requirePermission } from "../middlewares/require.permission.middleware.js";

const router = Router();

router.post('/whatsapp/connect', authRequired, requirePermission('lines.manage'), validateSchema(connectWhatsappSchema), connectWhatsappEmbedded);

export default router;
