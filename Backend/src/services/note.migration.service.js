import Contact from '../models/contact.model.js';
import ContactNote from '../models/contact.note.model.js';
import { NOTE_TEXT_MAX } from '../utils/contact.notes.js';

// La lógica de `migrate:notes` (notas del contacto con autor, 2026-10-17),
// aparte del script para poder probarla con Mongo. Pasa la nota de antes
// (`Contact.notes`) a la lista como `source: 'legacy'`: sin autor, con la fecha
// del contacto. El índice único parcial de `legacy` impide crearla dos veces
// aunque corran dos pasadas a la vez.
//
// Desde que la transición se cerró (2026-10-30), `Contact.notes` ya no está en
// el modelo: se lee y se borra directo en la colección (`Contact.collection`),
// porque Mongoose descarta en las escrituras un campo que no conoce.

const HAS_TEXT = { $type: 'string', $regex: /\S/ };

// Los contactos con texto de antes, y cuáles ya tienen su nota `legacy`.
const findWithText = async () => {
    const withText = await Contact.collection
        .find({ notes: HAS_TEXT }, { projection: { _id: 1, userId: 1, notes: 1, createdAt: 1 } }).toArray();
    if (withText.length === 0) return { withText, migrated: new Set() };
    const migrated = new Set((await ContactNote.find({
        source: 'legacy', contactId: { $in: withText.map(contact => contact._id) },
    }).distinct('contactId')).map(String));
    return { withText, migrated };
};

// Los contactos con una nota de antes que todavía no está en la lista.
const findPending = async () => {
    const { withText, migrated } = await findWithText();
    return withText.filter(contact => !migrated.has(String(contact._id)));
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

/**
 * Borra `Contact.notes` donde ya no se pierde nada (`--drop-text`): el texto
 * vacío y el que ya tiene su nota `legacy`. El que no la tiene se queda y se
 * cuenta en `kept` (correr antes la migración: el script lo hace).
 * `{ dropped, kept }`; con `dryRun`, solo cuenta.
 *
 * Sin vuelta atrás salvo desde un `mongodump`: una versión anterior a la
 * 1.0.26 ya no ve esas notas (las demás leen la lista).
 */
export const runNoteTextDrop = async ({ dryRun = false } = {}) => {
    const { withText, migrated } = await findWithText();
    const kept = withText.filter(contact => !migrated.has(String(contact._id)));
    const keptIds = kept.map(contact => contact._id);
    const filter = { notes: { $exists: true }, _id: { $nin: keptIds } };
    if (dryRun) return { dropped: await Contact.collection.countDocuments(filter), kept: kept.length };
    const { modifiedCount } = await Contact.collection.updateMany(filter, { $unset: { notes: '' } });
    return { dropped: modifiedCount, kept: kept.length };
};
