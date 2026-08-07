import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { generateApiKeySchema } from "../schemas/api.key.schema.js";
import { generateApiKeyController, listApiKeysController, revokeApiKeyController } from "../controllers/api.key.controller.js";

const router = Router();

router.post('/api-key/generate', authRequired, validateSchema(generateApiKeySchema), generateApiKeyController);
router.get('/api-key', authRequired, listApiKeysController);
router.delete('/api-key/:id', authRequired, revokeApiKeyController);

export default router;
