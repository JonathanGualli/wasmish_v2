// Las etiquetas de los contactos: cómo se escribe un nombre y cuándo dos son la
// misma. Todo puro. Lo usan la API de etiquetas, el alta y la edición de
// contactos y la importación.

export const TAG_NAME_MAX = 30;
export const MAX_TAGS_PER_CONTACT = 20;

/** El nombre como se guarda: sin espacios de más. `null` si queda vacío. */
export const cleanTagName = (name) => {
    const cleaned = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
    return cleaned || null;
};

/**
 * La identidad de una etiqueta: «VIP», «vip » y «Vip» son la misma, y también
 * «Estándar» y «estandar». Es lo que lleva el índice único, para que crearla
 * al vuelo nunca duplique una que ya existe.
 */
export const tagKey = (name) => {
    const cleaned = cleanTagName(name);
    return cleaned
        ? cleaned.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        : null;
};

/**
 * Las etiquetas de una celda del archivo importado: «VIP, Quito; Norte».
 * Se separan por coma o punto y coma (el Excel en español usa los dos) y se
 * quitan las repetidas, conservando cómo se escribió la primera.
 */
export const splitTagCell = (cell) => {
    if (cell === null || cell === undefined) return [];
    const byKey = new Map();
    for (const part of String(cell).split(/[,;]/)) {
        const name = cleanTagName(part);
        const key = tagKey(name);
        if (key && !byKey.has(key)) byKey.set(key, name);
    }
    return [...byKey.values()];
};
