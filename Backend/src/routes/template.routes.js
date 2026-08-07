import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { validateApiKey } from "../middlewares/validate.api.key.middleware.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { sendTemplateSchema } from "../schemas/template.schema.js";
import { getTemplatesController, syncTemplatesController, sendTemplateController } from "../controllers/template.controller.js";

const router = Router();

router.get('/templates/sync', authRequired, syncTemplatesController);
router.get('/templates', authRequired, getTemplatesController);

// API pública para terceros — autenticada por API key
router.post('/v1/templates/send', validateApiKey, validateSchema(sendTemplateSchema), sendTemplateController);

export default router;
 