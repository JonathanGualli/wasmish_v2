import { z } from "zod";
import { CONTACT_FILTERS } from "../utils/contact.query.js";
import { MAX_TAGS_PER_CONTACT } from "../utils/contact.tags.js";

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Id no válido');

const tagIdsSchema = z.array(objectIdSchema).max(MAX_TAGS_PER_CONTACT, `Un contacto lleva como mucho ${MAX_TAGS_PER_CONTACT} etiquetas`);

// Solo dígitos, con código de país: el mismo formato con el que Meta manda el
// teléfono en el webhook. Si se guardara con «+» o espacios, el contacto que
// escriba no casaría con este y se crearía otro.
export const phoneNumberSchema = z.string().regex(/^\d{8,15}$/, 'El número debe llevar solo dígitos, con código de país (8 a 15)');

// El texto vacío es válido: es como se borra un campo (el controller lo
// convierte en null).
const optionalText = (max) => z.string().trim().max(max, `Máximo ${max} caracteres`).nullish();

export const createContactSchema = z.object({
    phone: phoneNumberSchema,
    name: optionalText(80),
    email: z.union([z.literal(''), z.email('El email no es válido')]).nullish(),
    company: optionalText(80),
    notes: optionalText(1000),
    tagIds: tagIdsSchema.nullish(),
});

// Mismo formulario, todo opcional. El teléfono no se puede quitar (un contacto
// sin teléfono ni BSUID no existe), solo cambiar, y solo sin conversación.
export const updateContactSchema = createContactSchema.partial();

/**
 * Una selección de contactos: los marcados uno a uno, o «todos los que
 * coinciden» con una búsqueda, un filtro y unas etiquetas de Contactos, menos
 * los desmarcados. La usan las campañas (destinatarios) y el etiquetado en
 * bloque, cada una con su tope.
 */
export const contactSelectionSchema = (maxContacts) => z.discriminatedUnion('mode', [
    z.object({
        mode: z.literal('ids'),
        contactIds: z.array(objectIdSchema).min(1, 'Elige al menos un contacto').max(maxContacts),
    }),
    z.object({
        mode: z.literal('query'),
        search: z.string().max(100).nullish(),
        filter: z.enum(CONTACT_FILTERS).nullish(),
        tagIds: z.array(objectIdSchema).max(50).nullish(),
        excludeIds: z.array(objectIdSchema).max(maxContacts).nullish(),
    }),
]);

// Etiquetar en bloque llega a todos los que coinciden, que pueden ser miles.
export const CONTACT_BULK_MAX = 10000;

export const bulkTagContactsSchema = z.object({
    selection: contactSelectionSchema(CONTACT_BULK_MAX),
    add: tagIdsSchema.nullish(),
    remove: z.array(objectIdSchema).max(50).nullish(),
}).refine(body => (body.add?.length ?? 0) + (body.remove?.length ?? 0) > 0, { message: 'Elige alguna etiqueta que añadir o quitar' });
