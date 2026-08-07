import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { connectWhatsappSchema } from "../schemas/whatsapp.schema.js";
import { connectWhatsappEmbedded } from "../controllers/whatsapp.controller.js";

const router = Router();

router.post('/whatsapp/connect', authRequired, validateSchema(connectWhatsappSchema), connectWhatsappEmbedded);

export default router;
