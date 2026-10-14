import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import { requirePermission } from "../middlewares/require.permission.middleware.js";
import { authLimiter } from "../middlewares/rate.limit.middleware.js";
import {
    acceptInvitation, getInvitation, inviteMember, listTeam, revokeInvitation, updateMember,
} from "../controllers/team.controller.js";
import { acceptInvitationSchema, inviteMemberSchema, updateMemberSchema } from "../schemas/team.schema.js";

const router = Router();

// El equipo: solo owner y admin (Fase 3).
router.get('/team', authRequired, requirePermission('team.manage'), listTeam);
router.post('/team/invitations', authRequired, requirePermission('team.manage'), validateSchema(inviteMemberSchema), inviteMember);
router.delete('/team/invitations/:id', authRequired, requirePermission('team.manage'), revokeInvitation);
router.patch('/team/members/:id', authRequired, requirePermission('team.manage'), validateSchema(updateMemberSchema), updateMember);

// Aceptar una invitación: público, con el límite de intentos del login.
router.get('/invitations/:token', authLimiter, getInvitation);
router.post('/invitations/:token/accept', authLimiter, validateSchema(acceptInvitationSchema), acceptInvitation);

export default router;
