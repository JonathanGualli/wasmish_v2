import { z } from "zod";
import { IMPORT_BATCH_MAX, IMPORT_MAX_ROWS, isImportCountry } from "../utils/contact.import.js";

// Una celda tal como la lee el navegador: texto, o número si Excel la guardó
// como número (el teléfono, casi siempre).
const cell = z.union([z.string().max(5000), z.number()]).nullish();

// Una fila ya emparejada a los campos de Wasmish, con su número de fila del
// Excel (la 1 es la cabecera) para poder decir dónde está cada error.
const importRowSchema = z.object({
    row: z.number().int().min(1),
    phone: cell,
    name: cell,
    lastName: cell,
    email: cell,
    company: cell,
    notes: cell,
    tags: cell,
});

const importBody = (maxRows) => z.object({
    rows: z.array(importRowSchema).min(1, 'El archivo no tiene filas').max(maxRows, `Como mucho ${maxRows} filas`),
    // El de los números que vienen sin código de país (ISO: EC, CO, PE…).
    country: z.string().refine(isImportCountry, 'País no válido'),
    // «Etiquetas para todos»: se crean si no existen.
    extraTagNames: z.array(z.string().max(60)).max(20).nullish(),
});

// La vista previa trae el archivo entero; la importación, tandas.
export const importPreviewSchema = importBody(IMPORT_MAX_ROWS);

export const importContactsSchema = importBody(IMPORT_BATCH_MAX).extend({
    consent: z.literal(true, { error: 'Confirma que estos contactos aceptaron recibir mensajes de tu negocio.' }),
});
