import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { listLines, updateLine, disconnectLineController, getLinePin, retryHistorySyncController } from "../controllers/line.controller.js";
import { updateLineSchema } from "../schemas/line.schema.js";
import { requirePermission } from "../middlewares/require.permission.middleware.js";

const router = Router();

router.get('/lines', authRequired, listLines);
router.patch('/lines/:id', authRequired, requirePermission('lines.manage'), validateSchema(updateLineSchema), updateLine);
router.post('/lines/:id/disconnect', authRequired, requirePermission('lines.manage'), disconnectLineController);
router.get('/lines/:id/pin', authRequired, requirePermission('lines.manage'), getLinePin);
router.post('/lines/:id/history-sync', authRequired, requirePermission('lines.manage'), retryHistorySyncController);

export default router;
