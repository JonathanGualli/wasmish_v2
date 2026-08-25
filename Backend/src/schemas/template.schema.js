import { z } from "zod";

// Un botón de la plantilla. `parameters` son valores simples (["123456"]);
// cada sub_type los envuelve distinto para Meta — eso lo hace el controller.
const templateButtonSchema = z.object({
    subType: z.enum(['url', 'quick_reply', 'copy_code'], {
        message: 'subType debe ser url, quick_reply o copy_code',
    }).optional(),
    index: z.coerce.number().int().min(0).max(9).optional(),
    parameters: z.array(z.any()).optional(),
});

export const sendTemplateSchema = z.object({
    destinationNumber: z.string().min(6, 'destinationNumber es requerido'),
    templateName: z.string().min(1, 'templateName es requerido'),
    language: z.string().nullish(),
    parameters: z.array(z.any()).nullish(),
    contactName: z.string().nullish(),
    buttons: z.array(templateButtonSchema).nullish(),
});