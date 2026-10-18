import type { AxiosError } from "axios";
import type { ContactNote } from "../models/contact.model";

// Las notas de un contacto en la UI (diseño `Design/Wasmish Notas del contacto.html`).

/** Desde aquí se enseña cuánto queda; el límite es CONTACT_NOTES_MAX. */
export const NOTE_COUNTER_FROM = 900;
/** Una nota más larga se recorta con «Ver más». */
export const NOTE_PREVIEW_CHARS = 170;

const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const pad = (n: number) => String(n).padStart(2, '0');
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/**
 * Cuándo, como en el diseño: «ahora», «hace 5 min», «hoy 10:12», «ayer»,
 * «2 sep» y, con otro año, «2 sep 2025».
 */
export const formatNoteDate = (iso: string, now = new Date()) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
    if (minutes < 1) return 'ahora';
    if (minutes < 60) return `hace ${minutes} min`;
    const daysApart = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
    if (daysApart <= 0) return `hoy ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    if (daysApart === 1) return 'ayer';
    const day = `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}`;
    return date.getFullYear() === now.getFullYear() ? day : `${day} ${date.getFullYear()}`;
};

/** La fecha completa, al pasar el ratón: «jueves 17 oct 2026 · 10:12». */
export const formatNoteFullDate = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${SHORT_MONTHS[date.getMonth()]} ${date.getFullYear()}`
        + ` · ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * Por qué falló guardar o borrar una nota: el mensaje del backend si lo hay
 * (`note_not_yours`, `notes_limit`, `notes_moved`); sin respuesta, la conexión.
 */
export const noteErrorText = (error: unknown) => {
    const response = (error as AxiosError<{ message?: string }[]>)?.response;
    if (!response) return 'Revisa la conexión.';
    const message = Array.isArray(response.data) ? response.data[0]?.message : undefined;
    return message ?? 'Inténtalo de nuevo.';
};

/** Una nota de la lista, o la que se está guardando (`id` temporal). */
export type NoteView = Pick<ContactNote, 'id' | 'text' | 'author' | 'source' | 'createdAt' | 'editedAt' | 'editedBy' | 'canEdit'>;

/** De quién es la nota, dicho en la confirmación de borrar y en la hoja del teléfono. */
export const noteOwnerLabel = (note: NoteView, mine: boolean) => {
    if (note.source === 'legacy') return 'la nota de antes';
    if (mine) return 'esta nota';
    return `la nota de ${note.author?.name ?? 'otra persona'}`;
};
