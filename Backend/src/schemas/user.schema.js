import { z } from "zod";

export const updateUserTokenWhatsappSchema = z.object (
    {
        tokenWhatsapp: z.string(),
    }
);