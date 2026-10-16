import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { requirePermission } from "../middlewares/require.permission.middleware.js";
import { previewLimiter } from "../middlewares/rate.limit.middleware.js";
import { getAutoReplies, previewAutoReply, saveAutoReplies } from "../controllers/auto.reply.controller.js";
import { autoReplyPreviewSchema, autoReplySettingsSchema } from "../schemas/auto.reply.schema.js";

const router = Router();

router.get('/auto-replies', authRequired, requirePermission('autoReplies.manage'), getAutoReplies);
router.put('/auto-replies', authRequired, requirePermission('autoReplies.manage'), validateSchema(autoReplySettingsSchema), saveAutoReplies);
router.post('/auto-replies/preview', authRequired, requirePermission('autoReplies.manage'), previewLimiter, validateSchema(autoReplyPreviewSchema), previewAutoReply);

export default router;
