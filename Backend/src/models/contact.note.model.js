import mongoose from 'mongoose';
import { NOTE_SOURCES } from '../utils/contact.notes.js';

// Una nota de un contacto, con quién la escribió y cuándo (spec
// `docs/superpowers/specs/2026-10-17-notas-contacto-design.md`). Las reglas
// están en `utils/contact.notes.js`.
const contactNoteSchema = new mongoose.Schema({
    // La cuenta, como en todos los modelos.
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        required: true,
    },
    contactId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Contact',
        required: true,
    },
    text: {
        type: String,
        required: true,
    },
    // La persona que la escribió; null en la nota de antes (`legacy`).
    authorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    // Su nombre, copiado al escribirla (como `Message.sentByName`): la nota lo
    // sigue diciendo aunque esa persona ya no esté en la cuenta.
    authorName: {
        type: String,
        default: null,
    },
    source: {
        type: String,
        enum: NOTE_SOURCES,
        required: true,
    },
    // Solo en las importadas: el texto recortado y en minúsculas, para que dos
    // importaciones a la vez del mismo archivo no la creen dos veces.
    importKey: {
        type: String,
        default: null,
    },
    // Sin `timestamps`: la nota de antes lleva la fecha del contacto, y la
    // migración la escribe con un upsert.
    createdAt: {
        type: Date,
        default: Date.now,
    },
    editedAt: {
        type: Date,
        default: null,
    },
});

// Las notas de un contacto, de la más nueva a la más vieja.
contactNoteSchema.index({ userId: 1, contactId: 1, createdAt: -1 }, { name: 'contact_notes_list' });
// Una sola nota de antes por contacto, aunque `migrate:notes` corra dos veces a la vez.
contactNoteSchema.index({ contactId: 1 }, {
    name: 'contact_note_legacy_unique', unique: true, partialFilterExpression: { source: 'legacy' },
});
// Una sola nota importada con el mismo texto por contacto (revisión de Codex del plan).
contactNoteSchema.index({ contactId: 1, importKey: 1 }, {
    name: 'contact_note_import_unique', unique: true, partialFilterExpression: { importKey: { $type: 'string' } },
});

export default mongoose.model('ContactNote', contactNoteSchema);
