import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { generateApiKeySchema } from "../schemas/api.key.schema.js";
import { generateApiKeyController, listApiKeysController, revokeApiKeyController } from "../controllers/api.key.controller.js";
import { requirePermission } from "../middlewares/require.permission.middleware.js";

const router = Router();

router.post('/api-key/generate', authRequired, requirePermission('apiKeys.manage'), validateSchema(generateApiKeySchema), generateApiKeyController);
router.get('/api-key', authRequired, requirePermission('apiKeys.manage'), listApiKeysController);
router.delete('/api-key/:id', authRequired, requirePermission('apiKeys.manage'), revokeApiKeyController);

export default router;
