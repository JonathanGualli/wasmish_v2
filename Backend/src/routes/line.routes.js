import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { listLines, updateLine, disconnectLineController } from "../controllers/line.controller.js";
import { updateLineSchema } from "../schemas/line.schema.js";

const router = Router();

router.get('/lines', authRequired, listLines);
router.patch('/lines/:id', authRequired, validateSchema(updateLineSchema), updateLine);
router.post('/lines/:id/disconnect', authRequired, disconnectLineController);

export default router;
