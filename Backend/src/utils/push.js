import { contactDisplayName } from './contact.identity.js';
import { sessionAuthFor } from './account.js';
import { canReceive } from './permissions.js';

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

/**
 * El aviso de un mensaje entrante: el nombre del contacto (el de la bandeja) y
 * el texto (un adjunto sin texto trae su etiqueta, «Imagen»). Tocarlo abre la
 * conversación.
 */
export const buildInboundPush = ({ conversationId, contact, text }) => {
    const id = String(conversationId);
    return {
        title: truncate(contactDisplayName(contact), TITLE_MAX),
        body: truncate(String(text ?? ''), BODY_MAX),
        conversationId: id,
        url: `/private/chats?c=${id}`,
    };
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
