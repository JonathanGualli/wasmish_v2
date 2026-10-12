import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { requireSuperadmin } from "../middlewares/require.superadmin.middleware.js";
import { getPlatformStats, listClients, updateAccountLimits } from "../controllers/admin.controller.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { accountLimitsSchema } from "../schemas/line.schema.js";

const router = Router();

router.get('/admin/stats', authRequired, requireSuperadmin, getPlatformStats);
router.get('/admin/clients', authRequired, requireSuperadmin, listClients);
router.patch('/admin/accounts/:accountId/limits', authRequired, requireSuperadmin, validateSchema(accountLimitsSchema), updateAccountLimits);

export default router;