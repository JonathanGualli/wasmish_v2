import { z } from "zod";

export const connectWhatsappSchema = z.object(
    {
        code: z.string().min(1, 'El code de Meta es requerido'),
        phoneNumberId: z.string().min(1, 'El phoneNumberId de Meta es requerido'),
        waBusinessId: z.string().min(1, 'El waBusinessId de Meta es requerido'),
    }
);