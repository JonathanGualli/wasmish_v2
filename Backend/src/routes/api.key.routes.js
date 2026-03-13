import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { generateApiKeySchema } from "../schemas/api.key.schema.js";
import { generateApiKeyController } from "../controllers/api.key.controller.js";

const router = Router();

router.post('/api-key/generate', validateSchema(generateApiKeySchema), authRequired, generateApiKeyController);

export default router;