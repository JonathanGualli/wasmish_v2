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

// Quién lo hizo, por su nombre de pila; sin nombre, «Alguien».
const actorFirstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || 'Alguien';

/**
 * Cómo perdió una conversación quien la tenía (el aviso `lost`): `took`, si se
 * la quedó quien la movió; `passed`, si se la dio a un tercero; `released`, si
 * la dejó sin asignar.
 */
export const lostMode = ({ actorId, targetId }) => {
    if (targetId == null) return 'released';
    return String(targetId) === String(actorId) ? 'took' : 'passed';
};

const assignmentBody = ({ kind, actor, targetName, actorId, targetId }) => {
    switch (kind) {
        case 'assigned': return `${actor} te asignó esta conversación.`;
        case 'passed': return `${actor} te pasó esta conversación.`;
        case 'rejected': return `${actor} no te pasó esta conversación.`;
        case 'requested': return `${actor} pide esta conversación.`;
        case 'lost': {
            const mode = lostMode({ actorId, targetId });
            if (mode === 'took') return `${actor} tomó esta conversación.`;
            if (mode === 'passed') return `${actor} le pasó esta conversación a ${actorFirstName(targetName)}.`;
            return `${actor} dejó sin asignar esta conversación.`;
        }
        default: return '';
    }
};

/**
 * El aviso push de la asignación (avisos de la asignación, spec § 7 y diseño
 * m3): el título del de un entrante (el contacto, y la línea con más de una) y
 * el cuerpo «Carla te asignó esta conversación.». Con `open`, tocarlo abre la
 * conversación, como el de un entrante; sin él (quien lo recibe no la puede
 * abrir: un rechazo, o se la quitaron), abre la bandeja, y el aviso no se
 * agrupa con los de esa conversación.
 */
export const buildAssignmentPush = ({
    conversationId, contact, lineName = null, actorName, kind, actorId = null, targetId = null, targetName = null, open = true,
}) => {
    const id = String(conversationId);
    const suffix = lineName ? ` · ${lineName}` : '';
    return {
        title: truncate(contactDisplayName(contact), TITLE_MAX - suffix.length) + suffix,
        body: truncate(assignmentBody({ kind, actor: actorFirstName(actorName), targetName, actorId, targetId }), BODY_MAX),
        conversationId: open ? id : null,
        url: open ? `/private/chats?c=${id}` : '/private/chats',
    };
};

/**
 * Si el push de la asignación (`kind`) todavía le toca a `auth` (el de quien
 * lo recibe, leído ahora; `null` si ya no está activo) con la conversación
 * como está al enviar (`conversation`: `lineId`, `assignedTo` y
 * `transferRequest`), y si podrá abrirla: `{ open }`, o `null` si no se manda.
 * Siempre con la línea a su alcance: `updateMember` guarda el acceso nuevo
 * antes de soltar sus conversaciones (revisión de Codex del spec, 1).
 * - `assigned` y `passed`: que siga siendo suya.
 * - `requested`: que la solicitud (`requestId`) siga pendiente y que la vea.
 * - `rejected` y `lost`: que no sea suya ahora (si mientras tanto se la dieron,
 *   el aviso ya no dice la verdad); la abre solo si la sigue viendo.
 */
export const assignmentPushTarget = (kind, auth, conversation, { requestId = null } = {}) => {
    if (!auth || !conversation) return null;
    const meta = { lineId: conversation.lineId ?? null, assignedTo: conversation.assignedTo ?? null };
    if (!canReceive(auth, { lineId: meta.lineId })) return null;
    const isMine = meta.assignedTo != null && String(meta.assignedTo) === auth.userId;
    const sees = canReceive(auth, meta);
    switch (kind) {
        case 'assigned':
        case 'passed':
            return isMine ? { open: true } : null;
        case 'requested': {
            const pending = requestId != null && String(conversation.transferRequest?.id ?? '') === String(requestId);
            return pending && sees ? { open: true } : null;
        }
        case 'rejected':
        case 'lost':
            return isMine ? null : { open: kind === 'lost' && sees };
        default:
            return null;
    }
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
 * a su alcance (`canReceive`). Una conversación asignada (`meta.assignedTo`)
 * avisa solo a quien la atiende: el supervisor la ve, pero su celular no suena
 * con cada mensaje de cada agente (decisión del 2026-10-27). Devuelve sus `_id`
 * como string.
 */
export const pushRecipientIds = (members, accountId, meta) => members
    .map(sessionAuthFor)
    .filter(auth => auth && auth.accountId === String(accountId) && canReceive(auth, meta))
    .filter(auth => meta?.assignedTo == null || auth.userId === String(meta.assignedTo))
    .map(auth => auth.userId);

/** El servicio de push dice que esa suscripción ya no existe: hay que borrarla. */
export const isGonePushError = (error) => error?.statusCode === 404 || error?.statusCode === 410;
