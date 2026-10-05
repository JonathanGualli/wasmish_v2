import { z } from "zod";
import { TAG_NAME_MAX, cleanTagName } from "../utils/contact.tags.js";

// Se mide ya limpio: «  VIP  » es una etiqueta de 3 caracteres. Ojo:
// `validateSchema` no reemplaza el body, así que el controller vuelve a pasar
// el nombre por `cleanTagName` antes de guardarlo.
export const tagSchema = z.object({
    name: z.string({ error: 'Escribe el nombre de la etiqueta' })
        .refine(name => cleanTagName(name) !== null, 'Escribe el nombre de la etiqueta')
        .refine(name => (cleanTagName(name)?.length ?? 0) <= TAG_NAME_MAX, `Máximo ${TAG_NAME_MAX} caracteres`),
});
