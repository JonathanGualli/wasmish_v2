import { Router } from "express"
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { listConversations, listMessages, sendMessageController } from "../controllers/chat.controller.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { sendMessageSchema } from "../schemas/chat.schema.js";

const router = Router();

router.post('/chats/:id/messages', validateSchema(sendMessageSchema), authRequired, sendMessageController);
router.get('/chats', authRequired, listConversations);
router.get('/chats/:id/messages', authRequired, listMessages);

export default router;