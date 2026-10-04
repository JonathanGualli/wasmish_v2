// Piezas puras de la sección de Contactos: qué campos acepta la API y cómo se
// traduce la búsqueda a una consulta de Mongo.

// Lo único que se edita a mano. Nombre de WhatsApp, usuario, BSUID, origen y
// baja de publicidad los pone WhatsApp: aunque lleguen en el body, se ignoran.
const EDITABLE_FIELDS = ['phone', 'name', 'email', 'company', 'notes'];

/**
 * Los campos editables del body, limpios: recortados y con el texto vacío
 * convertido en null (borrar el email es mandarlo vacío). Los que no vienen no
 * aparecen, así sirve igual para crear que para un PATCH parcial.
 */
export const pickContactFields = (body = {}) => {
    const fields = {};
    for (const key of EDITABLE_FIELDS) {
        if (body[key] === undefined) continue;
        const value = typeof body[key] === 'string' ? body[key].trim() : body[key];
        fields[key] = value === '' ? null : value;
    }
    return fields;
};

export const CONTACT_FILTERS = ['all', 'with_conversation', 'without_conversation', 'opted_out'];

// Sin escapar, lo que escribe el usuario se interpretaría como expresión
// regular: «+593» rompería la consulta y un patrón malicioso podría colgarla.
export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Condición de búsqueda por nombre, nombre de WhatsApp, usuario, email,
 * empresa o teléfono. Devuelve null si no hay nada que buscar.
 *
 * El teléfono se busca solo por sus dígitos: en pantalla se ve como
 * «+593 99 123 4567», pero se guarda como «593991234567».
 */
export const buildContactSearch = (search) => {
    const text = typeof search === 'string' ? search.trim().replace(/^@/, '') : '';
    if (!text) return null;

    const pattern = new RegExp(escapeRegex(text), 'i');
    const conditions = ['name', 'profileName', 'username', 'email', 'company'].map(field => ({ [field]: pattern }));

    const digits = text.replace(/\D/g, '');
    if (digits) conditions.push({ phone: new RegExp(digits) });

    return { $or: conditions };
};
