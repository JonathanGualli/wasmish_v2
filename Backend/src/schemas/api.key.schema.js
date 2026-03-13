import { z } from "zod";

export const generateApiKeySchema = z.object(
    {
        nameApiKey: z.string().min(3, 'Name must be at least 3 caracters long'),
    }
)