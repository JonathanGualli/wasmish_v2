import { z } from "zod";

export const sendTemplateSchema = z.object({
    destinationNumber: z.string().min(6, 'destinationNumber es requerido'),
    templateName: z.string().min(1, 'templateName es requerido'),
    language: z.string().optional(),
    parameters: z.array(z.any()).optional(),
    contactName: z.string().optional(),
});
