import { z } from "zod";
import { NOTE_TEXT_MAX } from "../utils/contact.notes.js";

// El texto de una nota: con algo más que espacios, y como mucho NOTE_TEXT_MAX.
export const contactNoteSchema = z.object({
    text: z.string().trim()
        .min(1, 'Escribe la nota')
        .max(NOTE_TEXT_MAX, `Máximo ${NOTE_TEXT_MAX} caracteres`),
});
