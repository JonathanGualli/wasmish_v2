import Contact from '../models/contact.model.js';
import ContactNote from '../models/contact.note.model.js';
import { NOTE_TEXT_MAX } from '../utils/contact.notes.js';

// La lógica de `migrate:notes` (notas del contacto con autor, 2026-10-17),
// aparte del script para poder probarla con Mongo. Pasa la nota de antes
// (`Contact.notes`) a la lista como `source: 'legacy'`: sin autor, con la fecha
// del contacto. `Contact.notes` no se toca, para poder volver a la versión
// anterior.
//
// Idempotente, y se puede correr con la API en marcha: mientras tanto,
// `listContactNotes` lee la nota de antes al vuelo. El índice único parcial de
// `legacy` impide crearla dos veces aunque corran dos pasadas a la vez.

// Los contactos con una nota de antes que todavía no está en la lista.
const findPending = async () => {
    const withNotes = await Contact.find({ notes: { $type: 'string', $regex: /\S/ } })
        .select('_id userId notes createdAt').lean();
    if (withNotes.length === 0) return [];
    const migrated = new Set((await ContactNote.find({
        source: 'legacy', contactId: { $in: withNotes.map(contact => contact._id) },
    }).distinct('contactId')).map(String));
    return withNotes.filter(contact => !migrated.has(String(contact._id)));
};

const legacyUpsert = (contact) => ({
    updateOne: {
        filter: { contactId: contact._id, source: 'legacy' },
        update: { $setOnInsert: {
            userId: contact.userId,
            text: contact.notes.trim().slice(0, NOTE_TEXT_MAX),
            authorId: null, authorName: null, importKey: null,
            createdAt: contact.createdAt ?? new Date(),
            editedAt: null,
        } },
        upsert: true,
    },
});

/**
 * `{ pending, migrated }`: los contactos que faltaban al empezar y las notas
 * que se crearon. Con `dryRun`, solo cuenta.
 */
export const runNoteMigration = async ({ dryRun = false } = {}) => {
    const pending = await findPending();
    if (dryRun || pending.length === 0) return { pending: pending.length, migrated: 0 };

    try {
        const result = await ContactNote.collection.bulkWrite(pending.map(legacyUpsert), { ordered: false });
        return { pending: pending.length, migrated: result.upsertedCount };
    } catch (error) {
        // Otra pasada a la vez ya la creó: el índice único lo frena.
        const writeErrors = error.writeErrors ?? [];
        if (writeErrors.length === 0 || writeErrors.some(e => e.code !== 11000)) throw error;
        return { pending: pending.length, migrated: error.result.upsertedCount };
    }
};
