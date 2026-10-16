import { z } from "zod";

// `businessApp`: el número sigue en la app de WhatsApp Business (coexistencia).
// En ese camino Meta solo da el WABA, y el backend deduce el número: es el
// único caso en que `phoneNumberId` puede faltar.
export const connectWhatsappSchema = z.object(
    {
        code: z.string().min(1, 'El code de Meta es requerido'),
        phoneNumberId: z.string().min(1, 'El phoneNumberId de Meta es requerido').optional(),
        waBusinessId: z.string().min(1, 'El waBusinessId de Meta es requerido'),
        businessApp: z.boolean().optional(),
    }
).refine(body => body.phoneNumberId || body.businessApp === true, {
    message: 'El phoneNumberId de Meta es requerido',
    path: ['phoneNumberId'],
});