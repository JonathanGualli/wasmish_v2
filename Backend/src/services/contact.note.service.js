import ContactNote from '../models/contact.note.model.js';
import { NOTES_PER_CONTACT_MAX, legacyNoteFrom, serializeNote } from '../utils/contact.notes.js';

export const NOTES_LIMIT_MESSAGE = `Este contacto ya tiene ${NOTES_PER_CONTACT_MAX} notas.`;

/**
 * Las notas de un contacto para la persona de la sesión, de la más nueva a la
 * más vieja. Si `migrate:notes` aún no pasó por él, la nota de antes se lee al
 * vuelo de `Contact.notes` (sin poder editarla): así no falta durante el
 * despliegue.
 */
export const listContactNotes = async (contact, auth) => {
    const notes = await ContactNote.find({ userId: contact.userId, contactId: contact._id })
        .sort({ createdAt: -1 }).limit(NOTES_PER_CONTACT_MAX + 1).lean();
    const legacy = notes.some(note => note.source === 'legacy') ? null : legacyNoteFrom(contact);
    if (legacy) notes.push(legacy);
    return notes.map(note => serializeNote(note, auth));
};

/**
 * Una nota nueva a nombre de `author` (`{ id, name }`). Con el contacto en el
 * límite, un error con `statusCode` 409 y `code` 'notes_limit'.
 */
export const createContactNote = async ({ accountId, contactId, text, author, source = 'manual' }) => {
    if (await ContactNote.countDocuments({ userId: accountId, contactId }) >= NOTES_PER_CONTACT_MAX) {
        const error = new Error(NOTES_LIMIT_MESSAGE);
        error.statusCode = 409;
        error.code = 'notes_limit';
        throw error;
    }
    return ContactNote.create({
        userId: accountId, contactId, text, authorId: author.id, authorName: author.name, source,
    });
};
