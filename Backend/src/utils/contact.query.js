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

const SEARCH_FIELDS = ['name', 'profileName', 'username', 'email', 'company'];

// Lo que se busca, como expresiones: el texto en los campos de SEARCH_FIELDS
// y, si trae dígitos, el teléfono. null si no hay nada que buscar.
const searchPatterns = (search) => {
    const text = typeof search === 'string' ? search.trim().replace(/^@/, '') : '';
    if (!text) return null;
    const digits = text.replace(/\D/g, '');
    return { text: new RegExp(escapeRegex(text), 'i'), phone: digits ? new RegExp(digits) : null };
};

/**
 * Condición de búsqueda por nombre, nombre de WhatsApp, usuario, email,
 * empresa o teléfono. Devuelve null si no hay nada que buscar.
 *
 * El teléfono se busca solo por sus dígitos: en pantalla se ve como
 * «+593 99 123 4567», pero se guarda como «593991234567».
 */
export const buildContactSearch = (search) => {
    const patterns = searchPatterns(search);
    if (!patterns) return null;

    const conditions = SEARCH_FIELDS.map(field => ({ [field]: patterns.text }));
    if (patterns.phone) conditions.push({ phone: patterns.phone });
    return { $or: conditions };
};

/**
 * El `$match` de una selección de contactos: la cuenta, la búsqueda, el filtro
 * de baja de publicidad y las etiquetas. Con varias etiquetas basta con tener
 * alguna («VIP o ESTÁNDAR»). Los ids ya convertidos a ObjectId: aggregate no
 * convierte tipos como find. Los filtros por conversación necesitan el
 * `$lookup` y los pone `contactSelectionStages`.
 */
export const buildContactMatch = ({ userId, search, filter, tagIds = [] }) => {
    const match = { userId, ...buildContactSearch(search) };
    if (filter === 'opted_out') match.marketingOptOut = true;
    if (tagIds.length > 0) match.tags = { $in: tagIds };
    return match;
};

/**
 * La misma búsqueda que `buildContactSearch`, sobre un contacto ya cargado:
 * para filtrar una lista que ya está en memoria (los destinatarios de un
 * campaña) sin volver a consultar. Sin búsqueda, todos coinciden.
 */
export const matchesContactSearch = (contact, search) => {
    const patterns = searchPatterns(search);
    if (!patterns) return true;
    return SEARCH_FIELDS.some(field => typeof contact[field] === 'string' && patterns.text.test(contact[field]))
        || Boolean(patterns.phone && typeof contact.phone === 'string' && patterns.phone.test(contact.phone));
};
