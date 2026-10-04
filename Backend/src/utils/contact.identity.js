// Quién es un contacto según WhatsApp, y cómo se le escribe.
//
// Desde abril de 2026 Meta identifica a cada persona de DOS formas: el teléfono
// (`wa_id`) y el BSUID (`user_id`, p. ej. «EC.1349…»), un id propio de cada
// negocio. Normalmente llegan los dos, pero si la persona activó su nombre de
// usuario de WhatsApp y no ha hablado con el negocio en 30 días, el teléfono NO
// viene. Por eso un contacto se identifica por cualquiera de los dos, y este
// archivo es el único sitio que conoce la forma en que Meta los manda.

const cleanString = (value) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed.length > 0 ? trimmed : null;
};

// El anuncio de Facebook/Instagram («Click to WhatsApp») que trajo al contacto.
// Solo llega en el primer mensaje tras pulsar el anuncio.
export const describeReferral = (referral) => {
    if (!referral || typeof referral !== 'object') return null;
    return {
        sourceType: cleanString(referral.source_type),
        sourceId: cleanString(referral.source_id),
        sourceUrl: cleanString(referral.source_url),
        headline: cleanString(referral.headline),
        body: cleanString(referral.body),
        mediaType: cleanString(referral.media_type),
        ctwaClid: cleanString(referral.ctwa_clid),
    };
};

/**
 * Identidad del remitente de un mensaje entrante: el `messages[]` dice quién
 * escribe, y el `contacts[]` del mismo `value` trae su perfil.
 *
 * Con varios remitentes en un lote, `contacts` trae uno por cada uno: se casa
 * por teléfono o BSUID. Solo si hay un único perfil se usa sin casar, porque
 * con varios cogeríamos el nombre de otra persona.
 */
export const describeInboundContact = (contacts, messageData) => {
    const profiles = Array.isArray(contacts) ? contacts : [];
    const phone = cleanString(messageData?.from);
    const waUserId = cleanString(messageData?.from_user_id);

    const profile = profiles.find(c => (phone && c?.wa_id === phone) || (waUserId && c?.user_id === waUserId))
        ?? (profiles.length === 1 ? profiles[0] : {});

    return {
        phone: phone ?? cleanString(profile?.wa_id),
        waUserId: waUserId ?? cleanString(profile?.user_id),
        username: cleanString(profile?.profile?.username),
        profileName: cleanString(profile?.profile?.name),
        referral: describeReferral(messageData?.referral),
    };
};

export const hasContactIdentity = (identity) => Boolean(identity?.phone || identity?.waUserId);

/**
 * Qué hay que cambiar en un contacto guardado con lo que llega de un mensaje o
 * de un envío. Devuelve solo los campos que cambian (vacío si ninguno).
 *
 * - Teléfono y BSUID solo RELLENAN el hueco: un contacto ya identificado no
 *   cambia de identidad por un mensaje. (Si Meta regenera el BSUID, lo avisa con
 *   un webhook propio.)
 * - Nombre de perfil y nombre de usuario son de la persona y los cambia cuando
 *   quiere: se actualizan siempre.
 * - `name` es el que puso quien usa Wasmish: solo se rellena si no hay ninguno,
 *   nunca se pisa.
 */
export const mergeContactUpdates = (current, incoming) => {
    const changes = {};
    if (incoming.phone && !current.phone) changes.phone = incoming.phone;
    if (incoming.waUserId && !current.waUserId) changes.waUserId = incoming.waUserId;
    if (incoming.username && incoming.username !== current.username) changes.username = incoming.username;
    if (incoming.profileName && incoming.profileName !== current.profileName) changes.profileName = incoming.profileName;

    const name = cleanString(incoming.name);
    if (name && !current.name) changes.name = name;

    return changes;
};

/**
 * El destinatario en el formato de la API de mensajes de Meta: `to` con el
 * teléfono, o `recipient` con el BSUID cuando no lo hay. Se prefiere el teléfono
 * porque las plantillas de autenticación solo lo aceptan a él.
 */
export const whatsappRecipient = ({ phone, waUserId } = {}) => {
    if (phone) return { to: phone };
    if (waUserId) return { recipient: waUserId };
    return null;
};

// El nombre que se enseña en la bandeja y en la ficha.
export const contactDisplayName = ({ name, profileName, username, phone } = {}) =>
    cleanString(name)
    ?? cleanString(profileName)
    ?? (cleanString(username) ? `@${cleanString(username)}` : null)
    ?? cleanString(phone)
    ?? 'Contacto de WhatsApp';
