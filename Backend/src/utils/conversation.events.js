import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// La historia de una conversación (avisos de la asignación, spec § 5.1): qué
// eventos acompañan a cada página de mensajes, y el cursor de la lista de
// avisos de la campanita (§ 5.2). Sin BD: lo usan `listMessages` y el
// controlador de avisos.
// ---------------------------------------------------------------------------

// Una conversación con pocos mensajes y muchos cambios de manos no trae toda
// su historia de golpe (revisión de Codex del spec, 9).
export const EVENTS_PER_PAGE = 100;
export const NOTIFICATIONS_PER_PAGE = 30;

/**
 * El tramo de tiempo de los eventos de una página de mensajes: arriba, el
 * cursor (`before`; la primera página no tiene); abajo, el mensaje más viejo
 * de la página si hay más páginas (si no, ninguno: la última trae también lo
 * anterior al primer mensaje). `messages` va del más nuevo al más viejo.
 * Cerrado abajo y abierto arriba, como los mensajes: un evento no sale en dos.
 */
export const eventBounds = ({ before, messages, hasMore }) => ({
    from: hasMore && messages.length > 0 ? messages[messages.length - 1].timestamp : null,
    to: before ?? null,
});

/**
 * Dónde acortar una página con demasiados eventos: con `events` del más nuevo
 * al más viejo (se piden `cap + 1`), `null` si caben; si no, la fecha del
 * evento número `cap`. La página se queda con lo de esa fecha en adelante.
 */
export const eventCutoff = (events, cap = EVENTS_PER_PAGE) => (events.length > cap ? events[cap - 1].at : null);

// El cursor de los avisos: `createdAt` y `_id` del último de la página, para
// desempatar los de la misma fecha sin perder ninguno.
export const encodeCursor = (doc) => `${doc.createdAt.toISOString()}_${String(doc._id)}`;

/** `{ createdAt, id }` de un cursor de `encodeCursor`; `null` si está mal formado. */
export const decodeCursor = (text) => {
    const separator = typeof text === 'string' ? text.lastIndexOf('_') : -1;
    if (separator <= 0) return null;
    const createdAt = new Date(text.slice(0, separator));
    const id = text.slice(separator + 1);
    if (Number.isNaN(createdAt.getTime()) || !mongoose.isValidObjectId(id)) return null;
    return { createdAt, id: new mongoose.Types.ObjectId(id) };
};
