import { z } from "zod";
import { objectIdSchema } from "./contact.schema.js";
import { registerSchema } from "./auth.schema.js";

const roleSchema = z.enum(['admin', 'supervisor', 'agent'], { error: 'Elige un rol: admin, supervisor o agente' });

// POST /team/invitations — supervisor y agente, al menos una línea; el admin las ve todas.
export const inviteMemberSchema = z.object({
    email: z.email('Escribe un correo válido'),
    role: roleSchema,
    lineIds: z.array(objectIdSchema).max(50).optional(),
}).refine(body => body.role === 'admin' || (body.lineIds?.length ?? 0) > 0, {
    message: 'Elige al menos una línea', path: ['lineIds'],
});

// PATCH /team/members/:id — al menos uno de los tres.
export const updateMemberSchema = z.object({
    role: roleSchema.optional(),
    lineIds: z.array(objectIdSchema).max(50).optional(),
    status: z.enum(['active', 'inactive']).optional(),
}).refine(body => body.role !== undefined || body.lineIds !== undefined || body.status !== undefined, {
    message: 'Nada que cambiar: manda role, lineIds o status',
});

// POST /invitations/:token/accept — como el registro, sin el correo (es el de la invitación).
export const acceptInvitationSchema = registerSchema.omit({ email: true });
