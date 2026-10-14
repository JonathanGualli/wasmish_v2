import { contactDisplayName } from './contact.identity.js';
import { sessionAuthFor } from './account.js';
import { canReceive } from './permissions.js';
import { lineDisplayName } from './line.js';

// ---------------------------------------------------------------------------
// Avisos push (app móvil): qué servicios de push se aceptan, qué dice el aviso
// de un mensaje entrante y quién lo recibe. Sin BD ni red: el envío vive en
// `services/push.service.js`.
// ---------------------------------------------------------------------------

// El backend hace un POST al `endpoint` que manda el navegador, así que solo se
// aceptan los servicios de push de los navegadores: Chrome, Edge (también WNS),
// Firefox y Safari. Cualquier otro permitiría hacer que el servidor llame a una
// URL elegida por quien se suscribe.
const PUSH_HOSTS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com']);
const PUSH_HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com'];

export const isAllowedPushEndpoint = (endpoint) => {
    let url;
    try {
        url = new URL(endpoint);
    } catch {
        return false;
    }
    if (url.protocol !== 'https:') return false;
    return PUSH_HOSTS.has(url.hostname) || PUSH_HOST_SUFFIXES.some(suffix => url.hostname.endsWith(suffix));
};

const TITLE_MAX = 60;
const BODY_MAX = 180;

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// Los archivos llevan su emoji, como en WhatsApp. Sin texto, el tipo; con pie,
// el pie (diseño D1). Lo demás (ubicación, contacto, botón…) va como en la bandeja.
const MEDIA_LABELS = {
    image: ['📷', 'Foto'],
    video: ['🎥', 'Video'],
    audio: ['🎤', 'Audio'],
    document: ['📄', 'Documento'],
};

const pushBody = ({ text, type, caption }) => {
    const media = MEDIA_LABELS[type];
    if (!media) return String(text ?? '');
    const [emoji, label] = media;
    return `${emoji} ${caption || label}`;
};

/**
 * El aviso de un mensaje entrante: el nombre del contacto (el de la bandeja) y
 * el texto. Con varias líneas, la línea va en el título («María López ·
 * Ventas»): Android no tiene otro sitio para ella. Tocarlo abre la conversación.
 */
export const buildInboundPush = ({ conversationId, contact, text, type = null, caption = null, lineName = null }) => {
    const id = String(conversationId);
    const suffix = lineName ? ` · ${lineName}` : '';
    return {
        title: truncate(contactDisplayName(contact), TITLE_MAX - suffix.length) + suffix,
        body: truncate(pushBody({ text, type, caption }), BODY_MAX),
        conversationId: id,
        url: `/private/chats?c=${id}`,
    };
};

/** El nombre de la línea para el aviso: solo si la cuenta tiene más de una activa. */
export const pushLineName = (activeLines, lineId) => {
    if (activeLines.length < 2 || lineId == null) return null;
    const line = activeLines.find(candidate => String(candidate._id) === String(lineId));
    return lineDisplayName(line);
};

/**
 * Quiénes de `members` (usuarios leídos de la BD) reciben el aviso: la misma
 * regla que el `message_created` por SSE. Activos, de esa cuenta y con la línea
 * a su alcance (`canReceive`). Devuelve sus `_id` como string.
 */
export const pushRecipientIds = (members, accountId, meta) => members
    .map(sessionAuthFor)
    .filter(auth => auth && auth.accountId === String(accountId) && canReceive(auth, meta))
    .map(auth => auth.userId);

/** El servicio de push dice que esa suscripción ya no existe: hay que borrarla. */
export const isGonePushError = (error) => error?.statusCode === 404 || error?.statusCode === 410;
