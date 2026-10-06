import type { Tag } from "../models/tag.model";

// Las mismas reglas que `utils/contact.tags.js` del backend: el selector tiene
// que saber, mientras se escribe, si el nombre ya es de una etiqueta.

export const TAG_NAME_MAX = 30;
export const MAX_TAGS_PER_CONTACT = 20;

/** El nombre como se guarda: sin espacios de más. Vacío si no queda nada. */
export const cleanTagName = (name: string) => name.trim().replace(/\s+/g, ' ');

/** «VIP», «vip » y «Vip» son la misma; también «Estándar» y «estandar». */
export const tagKey = (name: string) =>
    cleanTagName(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** La etiqueta que ya tiene ese nombre, si hay alguna. */
export const findTagByName = (tags: Tag[], name: string) => {
    const key = tagKey(name);
    return key ? tags.find(tag => tagKey(tag.name) === key) : undefined;
};

/** Las etiquetas cuyo nombre contiene lo escrito, sin distinguir mayúsculas ni tildes. */
export const searchTags = (tags: Tag[], query: string) => {
    const key = tagKey(query);
    return key ? tags.filter(tag => tagKey(tag.name).includes(key)) : tags;
};

/**
 * Las etiquetas de unos ids, en el orden de la lista de la cuenta (por nombre).
 * Un id que ya no existe (se borró en otra pestaña) se ignora.
 */
export const tagsFromIds = (tags: Tag[], ids: readonly string[]) => tags.filter(tag => ids.includes(tag.id));

/** «VIP», «VIP o ESTÁNDAR», «VIP, Quito o ESTÁNDAR». */
export const joinTagNames = (names: string[]) =>
    names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} o ${names[names.length - 1]}`;
