import { z } from "zod";

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
});

// Mismo formulario, todo opcional. El teléfono no se puede quitar (un contacto
// sin teléfono ni BSUID no existe), solo cambiar, y solo sin conversación.
export const updateContactSchema = createContactSchema.partial();
