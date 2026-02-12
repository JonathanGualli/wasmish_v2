import { z } from "zod";

export const sendMessageSchema = z.object({
    contactName: z.string().min(1).optional(),
    destinationNumber: z.string().min(8).optional(),
    text: z.string().min(1),
    temporalId: z.string().optional(),
});

export const sendNewMessageSchema = z.object({
    destinationNumber: z.string().min(9),
    text: z.string().min(1),
    temporalId: z.string().optional(),
});

export const sendMessageTemplateSchema = z.object({

    userId: z.string().min(2),

    destinationNumber: z
        .string({
            required_error: "El número de destino es requerido",
            invalid_type_error: "El número de destino debe ser un texto",
        })
        .min(8, { message: "El número debe tener al menos 8 dígitos" }),

    templateName: z
        .string({
            required_error: "El nombre de la plantilla es requerido",
        }),

    // 3. Idioma (Opcional, por defecto 'es')
    language: z
        .string()
        .optional()
        .default("es"),

    // 4. Parámetros HÍBRIDOS (La magia ✨)
    // Acepta: ["Juan", "100"]  O  [{ name: "user", value: "Juan" }]
    parameters: z
        .array(
            z.union([
                z.string(), // Opción A: Texto simple (Posicional)
                z.number().transform((val) => String(val)), // Opción A2: Si mandan un número, lo convertimos a string
                z.object({  // Opción B: Objeto con nombre (Nombrado)
                    name: z.string(),
                    value: z.union([z.string(), z.number().transform((val) => String(val))])
                })
            ])
        )
        .optional()
        .default([]),

    // 5. Campos opcionales para tu lógica de negocio
    contactName: z.string().optional(), // Para guardar el nombre si es contacto nuevo
    temporalId: z.string().optional(),  // Para tu frontend (optimistic UI)
});