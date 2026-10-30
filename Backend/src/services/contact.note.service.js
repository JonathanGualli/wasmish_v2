import ContactNote from '../models/contact.note.model.js';
import User from '../models/user.model.js';
import { NOTES_PER_CONTACT_MAX, serializeNote } from '../utils/contact.notes.js';

export const NOTES_LIMIT_MESSAGE = `Este contacto ya tiene ${NOTES_PER_CONTACT_MAX} notas.`;

/**
 * Las notas de un contacto para la persona de la sesión, de la más nueva a la
 * más vieja.
 */
export const listContactNotes = async (contact, auth) => {
    const notes = await ContactNote.find({ userId: contact.userId, contactId: contact._id })
        .sort({ createdAt: -1 }).limit(NOTES_PER_CONTACT_MAX + 1).lean();
    return serializeNotes(notes, auth);
};

/**
 * Las notas como las devuelve la API, sabiendo qué autores siguen activos en
 * la cuenta (los demás salen como «ya no está»).
 */
export const serializeNotes = async (notes, auth) => {
    const authorIds = [...new Set(notes.map(note => note.authorId).filter(Boolean).map(String))];
    const active = authorIds.length === 0 ? [] : await User.find({
        _id: { $in: authorIds }, accountId: auth.accountId, status: 'active',
    }).distinct('_id');
    const activeAuthorIds = new Set(active.map(String));
    return notes.map(note => serializeNote(note, auth, { activeAuthorIds }));
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
