import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { readRawFile } from "../middlewares/raw.file.middleware.js";
import { validateApiKey } from "../middlewares/validate.api.key.middleware.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { sendTemplateSchema } from "../schemas/template.schema.js";
import {
    getTemplatesController, syncTemplatesController, sendTemplateController,
    uploadHeaderMediaController, uploadHeaderMediaFileController, removeHeaderMediaController, getHeaderMediaFileController,
} from "../controllers/template.controller.js";
import { publicApiIpLimiter, publicApiUserLimiter } from "../middlewares/rate.limit.middleware.js";

const router = Router();

router.get('/templates/sync', authRequired, syncTemplatesController);
router.get('/templates', authRequired, getTemplatesController);

router.put('/templates/:templateId/header-media', authRequired, readRawFile, uploadHeaderMediaController);
router.post('/templates/:templateId/header-media/files', authRequired, readRawFile, uploadHeaderMediaFileController);
router.delete('/templates/:templateId/header-media', authRequired, removeHeaderMediaController);
router.get('/templates/media/:id', authRequired, getHeaderMediaFileController);

// API pública para terceros — autenticada por API key
router.post('/v1/templates/send', 
    publicApiIpLimiter,
    validateApiKey, 
    publicApiUserLimiter,
    validateSchema(sendTemplateSchema), 
    sendTemplateController);

export default router;
 