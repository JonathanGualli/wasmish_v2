import { z } from "zod";
import { LINE_NAME_MAX, cleanLineName } from "../utils/line.js";

// PATCH /lines/:id — el nombre interno, hacerla la por defecto, o las dos.
// `validateSchema` no reemplaza el body: el controller vuelve a limpiar el
// nombre con `cleanLineName` (vacío = sin nombre).
export const updateLineSchema = z.object({
    name: z.string()
        .refine(name => (cleanLineName(name)?.length ?? 0) <= LINE_NAME_MAX, `Máximo ${LINE_NAME_MAX} caracteres`)
        .nullish(),
    isDefault: z.literal(true).optional(),
}).refine(body => body.name !== undefined || body.isDefault, { message: 'Nada que cambiar: manda name o isDefault' });

// PATCH /admin/accounts/:accountId/limits — solo el superadmin.
export const accountLimitsSchema = z.object({
    maxLines: z.number({ error: 'maxLines tiene que ser un número' }).int('maxLines tiene que ser entero')
        .min(1, 'Mínimo 1 línea').max(50, 'Máximo 50 líneas').optional(),
    // Las personas de la cuenta (Fase 3): activas más invitaciones pendientes.
    maxUsers: z.number({ error: 'maxUsers tiene que ser un número' }).int('maxUsers tiene que ser entero')
        .min(1, 'Mínimo 1 usuario').max(200, 'Máximo 200 usuarios').optional(),
}).refine(body => body.maxLines !== undefined || body.maxUsers !== undefined, { message: 'Nada que cambiar: manda maxLines o maxUsers' });
