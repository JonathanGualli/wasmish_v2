import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { getTemplatesController, syncTemplatesController } from "../controllers/template.controller.js";


const router = Router();

router.get('/templates/sync', authRequired, syncTemplatesController);
router.get('/templates', authRequired, getTemplatesController);
/* router.post('/templates/send-template', validateSchema(sendMessageTemplateSchema), sendTemplateController); */
export default router;