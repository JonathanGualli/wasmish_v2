// El historial de la app de WhatsApp Business: leer lo que manda Meta en el
// webhook `history` y resumir el estado de una línea para la UI. Puro, sin BD.
// Spec: docs/superpowers/specs/2026-10-23-historial-coexistencia-design.md (§ 3, 5 y 6).

import { isMessageChange } from './message.change.js';

export const HISTORY_PLACEHOLDER_TEXT = 'Archivo: míralo en tu celular';
// Una pieza de `HistoryThread`: muy por debajo de los 16 MB por documento de
// Mongo, porque un hilo entero puede pasarlos (revisión de Codex del spec).
export const PIECE_MAX_MESSAGES = 500;
export const PIECE_MAX_BYTES = 4 * 1024 * 1024;
// «History sync is turned off by the business from the WhatsApp Business App».
export const HISTORY_DECLINED_CODE = 2593109;
// Meta da 24 h desde la conexión para pedir los contactos y el historial.
export const HISTORY_REQUEST_WINDOW_MS = 24 * 60 * 60 * 1000;
// Un pedido `uncertain` (no se sabe si llegó a Meta) se ofrece reintentar tras esto.
export const UNCERTAIN_RETRY_AFTER_MS = 30 * 60 * 1000;

const PHONE_CHARS = /^[0-9+\s().-]+$/;
const HISTORY_STATUS = { READ: 'read', PLAYED: 'read', DELIVERED: 'delivered', SENT: 'sent', PENDING: 'sent', ERROR: 'failed' };
const REQUEST_KINDS = ['contacts', 'history'];

/**
 * Un teléfono de Meta (el `id` de un hilo, un `from`) en solo dígitos.
 * @returns {string|null} De 8 a 15 dígitos, o null si no lo es (un BSUID, texto).
 */
export const normalizeWaPhone = (value) => {
    if (typeof value === 'number') value = String(value);
    if (typeof value !== 'string' || !PHONE_CHARS.test(value)) return null;
    const digits = value.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
};

const toNumber = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

/**
 * Un elemento de `value.history[]`.
 * @returns {{ declined: true }
 *          |{ declined: false, phase: number|null, chunkOrder: number|null, progress: number|null,
 *             threads: { contactPhone: string, messages: object[] }[], skippedThreads: number }
 *          |null} null si no hay nada que leer.
 */
export const describeHistoryChunk = (item) => {
    if (!item || typeof item !== 'object') return null;
    if (Array.isArray(item.errors) && item.errors.some(error => Number(error?.code) === HISTORY_DECLINED_CODE)) {
        return { declined: true };
    }
    if (!item.metadata && !Array.isArray(item.threads)) return null;

    const threads = [];
    let skippedThreads = 0;
    for (const thread of Array.isArray(item.threads) ? item.threads : []) {
        const contactPhone = normalizeWaPhone(thread?.id);
        if (!contactPhone || !Array.isArray(thread.messages)) {
            skippedThreads += 1;
            continue;
        }
        threads.push({ contactPhone, messages: thread.messages });
    }
    return {
        declined: false,
        phase: toNumber(item.metadata?.phase),
        chunkOrder: toNumber(item.metadata?.chunk_order),
        progress: toNumber(item.metadata?.progress),
        threads,
        skippedThreads,
    };
};

/**
 * Los mensajes de un hilo en piezas, en orden: ninguna pasa de `maxMessages`
 * ni de `maxBytes` de JSON, salvo un mensaje solo que ya los pase (va solo).
 * @returns {object[][]}
 */
export const splitThreadMessages = (messages, { maxMessages = PIECE_MAX_MESSAGES, maxBytes = PIECE_MAX_BYTES } = {}) => {
    const pieces = [];
    let current = [];
    let currentBytes = 0;
    for (const message of messages) {
        const bytes = Buffer.byteLength(JSON.stringify(message ?? null));
        if (current.length > 0 && (current.length >= maxMessages || currentBytes + bytes > maxBytes)) {
            pieces.push(current);
            current = [];
            currentBytes = 0;
        }
        current.push(message);
        currentBytes += bytes;
    }
    if (current.length > 0) pieces.push(current);
    return pieces;
};

/**
 * Lo que hace falta de un mensaje del historial para guardarlo; el contenido lo
 * lee `describeInboundMessage`, como en los entrantes y los ecos.
 * @param {string} contactPhone El teléfono del hilo, ya normalizado.
 * @returns {{ waMessageId: string, direction: 'inbound'|'outbound', timestamp: Date,
 *             status: string, isPlaceholder: boolean, isReaction: boolean }|null}
 *          null si está mal formado (sin `id`, sin un `from` que sea un teléfono,
 *          sin hora) o si es un borrado o una edición.
 */
export const describeHistoryMessage = (messageData, contactPhone) => {
    if (!messageData || typeof messageData.id !== 'string' || !messageData.id) return null;
    if (isMessageChange(messageData)) return null;
    const from = normalizeWaPhone(messageData.from);
    const seconds = toNumber(messageData.timestamp);
    if (!from || seconds === null) return null;

    // La dirección sale del teléfono del hilo, ya normalizado, y no del número
    // visible de la línea: el `from` puede venir con `+` o con espacios.
    const direction = from === contactPhone ? 'inbound' : 'outbound';
    const status = direction === 'inbound'
        ? 'delivered'
        : HISTORY_STATUS[String(messageData.history_context?.status ?? '').toUpperCase()] ?? 'sent';
    return {
        waMessageId: messageData.id,
        direction,
        timestamp: new Date(seconds * 1000),
        status,
        isPlaceholder: messageData.type === 'media_placeholder',
        isReaction: messageData.type === 'reaction',
    };
};

const isRetryable = (kind, sync, now) => {
    const request = sync.requests?.[kind];
    if (request?.state === 'rejected') return true;
    if (request?.state !== 'uncertain') return false;
    const claimedAt = request.claimedAt ? new Date(request.claimedAt).getTime() : 0;
    if (now.getTime() - claimedAt <= UNCERTAIN_RETRY_AFTER_MS) return false;
    // Si llegaron trozos (o el «no» del negocio), Meta aceptó el pedido del historial.
    return kind !== 'history' || (!sync.firstChunkAt && !sync.declined);
};

/**
 * El estado del historial de una línea, como lo enseña la UI.
 * @returns {{ status: 'declined'|'partial'|'done'|'receiving'|'failed'|'pending'|'none'|'requested',
 *             progress: number|null, failedThreads: number, retryable: ('contacts'|'history')[],
 *             canRetry: boolean, retryUntil: string }|null} null si la línea no lo tiene.
 */
export const historySyncView = (sync, now = new Date()) => {
    if (!sync?.connectionAt) return null;
    const deadline = new Date(new Date(sync.connectionAt).getTime() + HISTORY_REQUEST_WINDOW_MS);
    const withinWindow = now < deadline;
    const failedThreads = sync.failedThreads ?? 0;
    const historyState = sync.requests?.history?.state;

    let status;
    if (sync.declined) status = 'declined';
    else if (sync.finishedAt) status = failedThreads > 0 ? 'partial' : 'done';
    else if (sync.firstChunkAt) status = 'receiving';
    else if (historyState === 'rejected') status = 'failed';
    else if (historyState === 'pending' || historyState === 'requesting') status = 'pending';
    else if (!withinWindow) status = 'none';
    else status = 'requested';

    // Cada pedido por su cuenta: unos contactos rechazados se reintentan aunque
    // el historial ya esté llegando.
    const retryable = withinWindow ? REQUEST_KINDS.filter(kind => isRetryable(kind, sync, now)) : [];
    return {
        status,
        progress: sync.progress ?? null,
        failedThreads,
        retryable,
        canRetry: retryable.length > 0,
        retryUntil: deadline.toISOString(),
    };
};
