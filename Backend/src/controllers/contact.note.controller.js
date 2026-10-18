import mongoose from "mongoose";
import Contact from "../models/contact.model.js";
import ContactNote from "../models/contact.note.model.js";
import { canEditNote, cleanNoteText, serializeNote } from "../utils/contact.notes.js";
import { createContactNote } from "../services/contact.note.service.js";
import { findOwnedContact, notifyContactChanged } from "./contact.controller.js";

// ---------------------------------------------------------------------------
// Las notas de un contacto: /contacts/:id/notes (spec
// `docs/superpowers/specs/2026-10-17-notas-contacto-design.md`, § 4). Las
// lista `GET /contacts/:id` (`noteList`).
// ---------------------------------------------------------------------------

const NOTE_NOT_YOURS_MESSAGE = 'Solo quien la escribió, el owner o un admin pueden cambiar esta nota.';

const sendNoteError = (res, status, message, extra = {}) => res.status(status).json([{ message, ...extra }]);

// El contacto de la cuenta y, si se pide, una nota suya: lo ajeno, o una nota
// de otro contacto, es 404 (regla 1). Un id mal formado, también.
const findOwnedNote = async (req, res) => {
    const accountId = req.auth.accountId;
    const contact = await findOwnedContact(accountId, req.params.id);
    if (!contact) {
        sendNoteError(res, 404, 'Contacto no encontrado');
        return null;
    }
    const note = mongoose.isValidObjectId(req.params.noteId)
        ? await ContactNote.findOne({ _id: req.params.noteId, userId: accountId, contactId: contact._id })
        : null;
    if (!note) {
        sendNoteError(res, 404, 'Nota no encontrada');
        return null;
    }
    if (!canEditNote(req.auth, note)) {
        sendNoteError(res, 403, NOTE_NOT_YOURS_MESSAGE, { code: 'note_not_yours' });
        return null;
    }
    return { contact, note };
};

// POST /contacts/:id/notes — a nombre de quien la escribe.
export const addContactNote = async (req, res) => {
    try {
        const accountId = req.auth.accountId;
        const contact = await findOwnedContact(accountId, req.params.id);
        if (!contact) return sendNoteError(res, 404, 'Contacto no encontrado');

        const note = await createContactNote({
            accountId, contactId: contact._id, text: cleanNoteText(req.body.text),
            author: { id: req.auth.userId, name: req.auth.name },
        });
        notifyContactChanged(accountId, contact._id);
        return res.status(201).json(serializeNote(note, req.auth));
    } catch (error) {
        if (error.code === 'notes_limit') return sendNoteError(res, 409, error.message, { code: error.code });
        return sendNoteError(res, 500, error.message);
    }
};

// PATCH /contacts/:id/notes/:noteId — el autor, o owner y admin.
export const editContactNote = async (req, res) => {
    try {
        const found = await findOwnedNote(req, res);
        if (!found) return;

        found.note.text = cleanNoteText(req.body.text);
        found.note.editedAt = new Date();
        await found.note.save();
        notifyContactChanged(req.auth.accountId, found.contact._id);
        return res.json(serializeNote(found.note, req.auth));
    } catch (error) {
        return sendNoteError(res, 500, error.message);
    }
};

// DELETE /contacts/:id/notes/:noteId — el autor, o owner y admin. Borrar la
// nota de antes vacía también `Contact.notes`: si no, la lectura al vuelo
// (`listContactNotes`) la haría reaparecer.
export const removeContactNote = async (req, res) => {
    try {
        const found = await findOwnedNote(req, res);
        if (!found) return;

        const accountId = req.auth.accountId;
        await ContactNote.deleteOne({ _id: found.note._id, userId: accountId });
        if (found.note.source === 'legacy') {
            await Contact.updateOne({ _id: found.contact._id, userId: accountId }, { $set: { notes: null } });
        }
        notifyContactChanged(accountId, found.contact._id);
        return res.sendStatus(204);
    } catch (error) {
        return sendNoteError(res, 500, error.message);
    }
};
