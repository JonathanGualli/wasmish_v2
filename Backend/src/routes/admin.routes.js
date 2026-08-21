import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { requireSuperadmin } from "../middlewares/require.superadmin.middleware.js";
import { getPlatformStats, listClients } from "../controllers/admin.controller.js";

const router = Router();

router.get('/admin/stats', authRequired, requireSuperadmin, getPlatformStats);
router.get('/admin/clients', authRequired, requireSuperadmin, listClients);

export default router;