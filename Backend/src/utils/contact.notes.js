// ---------------------------------------------------------------------------
// Las notas de un contacto (spec `docs/superpowers/specs/2026-10-17-notas-contacto-design.md`):
// una lista, cada nota con su autor y su fecha. Aquí, lo que se decide sin BD:
// quién puede cambiar una nota, qué se devuelve de ella y cuándo la nota de un
// archivo importado es nueva.
// ---------------------------------------------------------------------------

export const NOTE_TEXT_MAX = 1000;
// Una barrera para que la ficha no crezca sin fin, no una garantía: con dos
// escrituras a la vez puede quedar en 501 (spec, § 4).
export const NOTES_PER_CONTACT_MAX = 500;
// 'legacy': la nota que el contacto tenía antes de la lista (el texto de
// `Contact.notes`, que `migrate:notes` pasó a una nota y después borró).
export const NOTE_SOURCES = ['manual', 'import', 'legacy'];

const EDIT_ANY_ROLES = ['owner', 'admin'];

/**
 * Si la persona de la sesión puede editar o borrar la nota: la suya, y
 * cualquiera si es owner o admin. Sin persona en la sesión (la API key), nunca.
 */
export const canEditNote = (auth, note) => {
    if (!auth?.userId) return false;
    if (EDIT_ANY_ROLES.includes(auth.role)) return true;
    return note.authorId != null && String(note.authorId) === auth.userId;
};

const toIso = (date) => (date ? new Date(date).toISOString() : null);

/**
 * Lo que la API devuelve de una nota, con `canEdit` para la persona de la
 * sesión. `activeAuthorIds`: las personas que siguen activas en la cuenta; un
 * autor que no está en ella sale con `active: false` («ya no está»). Sin el
 * conjunto, se da por activo.
 */
export const serializeNote = (note, auth, { activeAuthorIds = null } = {}) => ({
    id: String(note._id),
    text: note.text,
    author: note.authorId
        ? {
            id: String(note.authorId),
            name: note.authorName,
            active: activeAuthorIds ? activeAuthorIds.has(String(note.authorId)) : true,
        }
        : null,
    source: note.source,
    createdAt: toIso(note.createdAt),
    editedAt: toIso(note.editedAt),
    // Quién la cambió por última vez: owner y admin editan las de otros.
    editedBy: note.editedById ? { id: String(note.editedById), name: note.editedByName } : null,
    canEdit: canEditNote(auth, note),
});

/** El texto recortado, o null si queda vacío o pasa del límite. */
export const cleanNoteText = (text) => {
    const clean = String(text ?? '').trim();
    return clean && clean.length <= NOTE_TEXT_MAX ? clean : null;
};

/** Cómo se comparan las notas al importar: sin espacios alrededor ni mayúsculas. */
export const importKeyFor = (text) => String(text ?? '').trim().toLowerCase();

/**
 * La nota del archivo, si es nueva para el contacto: null si está vacía o ya
 * tiene una con el mismo texto. Así reimportar el mismo archivo no duplica.
 */
export const pickImportNote = (text, existingTexts) => {
    const clean = String(text ?? '').trim();
    if (!clean) return null;
    const key = importKeyFor(clean);
    return existingTexts.some(existing => importKeyFor(existing) === key) ? null : clean;
};
