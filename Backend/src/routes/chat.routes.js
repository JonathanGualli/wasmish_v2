import { Router } from "express"
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { listConversations, listMessages, sendMessageController, sendTemplateController} from "../controllers/chat.controller.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { sendMessageSchema, sendMessageTemplateSchema } from "../schemas/chat.schema.js";

const router = Router();

router.post('/chats/:id/messages', validateSchema(sendMessageSchema), authRequired, sendMessageController); // Para mensajes antiguos
router.post('/chats/messages', validateSchema(sendMessageSchema), authRequired, sendMessageController); // Para mensajes nuevo 
router.get('/chats', authRequired, listConversations);
router.get('/chats/:id/messages', authRequired, listMessages);
router.post('/chats/messages/send-template', validateSchema(sendMessageTemplateSchema), sendTemplateController);

export default router;