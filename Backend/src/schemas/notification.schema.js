import { z } from "zod";
import { objectIdSchema } from "./contact.schema.js";

// POST /notifications/seen — unos avisos (los que se abrieron) o todos
// («Marcar todos como vistos»).
export const notificationsSeenSchema = z.union([
    z.object({ ids: z.array(objectIdSchema).min(1).max(100) }).strict(),
    z.object({ all: z.literal(true) }).strict(),
]);
