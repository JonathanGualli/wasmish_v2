import { z } from "zod";

export const updateUserTokenWhatsappSchema = z.object (
    {
        tokenWhatsapp: z.string().min(1, 'El token de WhatsApp es requerido'),
        phoneNumberId: z.string().min(1, 'El phoneNumberId de Meta es requerido'),
        waBusinessId: z.string().min(1, 'El waBusinessId de Meta es requerido'),
    }
);
