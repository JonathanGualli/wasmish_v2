import { Router } from "express";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { updateUserTokenWhatsappSchema } from "../schemas/user.schema.js";
import { updateUserTokenWhatsapp } from "../controllers/user.controller.js";
import { authRequired } from "../middlewares/validate.token.middleware.js";

const router = Router();

router.put('/update-user-token-whatsapp', authRequired, validateSchema(updateUserTokenWhatsappSchema), updateUserTokenWhatsapp);

export default router;