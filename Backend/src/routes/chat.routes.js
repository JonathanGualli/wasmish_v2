import { Router } from "express"
import { authRequired } from "../middlewares/validate.token.middleware.js";
import {
    listConversations, listMessages, sendMessageController, sendMediaMessageController,
    sendConversationTemplateController, startConversationTemplateController, setReactionController,
} from "../controllers/chat.controller.js";
import { readRawFile } from "../middlewares/raw.file.middleware.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { sendMessageSchema, sendConversationTemplateSchema, startConversationTemplateSchema, reactionSchema } from "../schemas/chat.schema.js";

const router = Router();

router.post('/chats/:id/messages', validateSchema(sendMessageSchema), authRequired, sendMessageController); // Para mensajes antiguos
router.post('/chats/messages', validateSchema(sendMessageSchema), authRequired, sendMessageController); // Para mensajes nuevo 
// El archivo llega crudo: `authRequired` va antes, para no leer 16 MB de quien no tiene sesión.
router.post('/chats/:id/media', authRequired, readRawFile, sendMediaMessageController);
router.get('/chats', authRequired, listConversations);
router.get('/chats/:id/messages', authRequired, listMessages);
router.put('/chats/:id/messages/:messageId/reaction', authRequired, validateSchema(reactionSchema), setReactionController);
router.post('/chats/:id/template', authRequired, validateSchema(sendConversationTemplateSchema), sendConversationTemplateController);
router.post('/chats/template', authRequired, validateSchema(startConversationTemplateSchema), startConversationTemplateController);

export default router;
