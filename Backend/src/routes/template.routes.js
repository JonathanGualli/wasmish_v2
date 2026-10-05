import express, { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { validateApiKey } from "../middlewares/validate.api.key.middleware.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { sendTemplateSchema } from "../schemas/template.schema.js";
import {
    getTemplatesController, syncTemplatesController, sendTemplateController,
    uploadHeaderMediaController, removeHeaderMediaController, getHeaderMediaFileController,
} from "../controllers/template.controller.js";
import { publicApiIpLimiter, publicApiUserLimiter } from "../middlewares/rate.limit.middleware.js";

const router = Router();

router.get('/templates/sync', authRequired, syncTemplatesController);
router.get('/templates', authRequired, getTemplatesController);

// El archivo de la cabecera llega crudo, con su tipo en el Content-Type: sin
// multipart no hace falta ninguna dependencia. El tope fino por formato lo
// pone `headerMediaFileIssue`; este solo evita leer algo enorme a memoria, y
// su error sale en el formato de la API en vez de la página HTML de Express.
const rawFile = express.raw({ type: () => true, limit: '17mb' });
const readFile = (req, res, next) => rawFile(req, res, (err) => (err
    ? res.status(err.status ?? 400).json([{
        message: err.type === 'entity.too.large' ? 'El archivo pesa demasiado: el máximo es 16 MB.' : 'No se pudo leer el archivo.',
    }])
    : next()));

router.put('/templates/:templateId/header-media', authRequired, readFile, uploadHeaderMediaController);
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
 