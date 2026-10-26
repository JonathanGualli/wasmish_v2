import Line from '../models/line.model.js';
import HistoryThread from '../models/history.thread.model.js';
import HistoryMedia from '../models/history.media.model.js';
import { describeHistoryChunk, splitThreadMessages } from '../utils/history.sync.js';
import { wamidMessageKey } from '../utils/wamid.js';
import { wakeHistoryWorker } from '../workers/history.worker.js';

// Lo que llega por el webhook `history` (el historial de la app de WhatsApp
// Business): aquí solo se GUARDA, en piezas, y el worker lo procesa después
// (Meta recomienda no procesar un trozo de miles de mensajes en el webhook).
// Un fallo de la BD sube a `handleWebhook`, que responde 500 al final del lote
// para que Meta lo reentregue; las reentregas chocan en los índices únicos.
// Spec: docs/superpowers/specs/2026-10-23-historial-coexistencia-design.md (§ 5).

/**
 * La conexión de la línea si pidió el historial EN ESTA CONEXIÓN: lo que llegue
 * de una anterior (el número se desconectó y se volvió a conectar) no es suyo.
 * @returns {Promise<{ lineId, connectionAt: Date }|null>}
 */
const currentSync = async (inbound) => {
    if (!inbound.lineId) return null;
    const line = await Line.findOne({ _id: inbound.lineId, accountId: inbound.accountId, status: 'active' })
        .select('connectedAt historySync.connectionAt').lean();
    const connectionAt = line?.historySync?.connectionAt;
    if (!connectionAt || connectionAt.getTime() !== line.connectedAt?.getTime()) return null;
    return { lineId: line._id, connectionAt };
};

const logIgnored = (inbound, what) =>
    console.warn('Historial ignorado: la línea no lo pidió en esta conexión', { lineId: inbound.lineId ? String(inbound.lineId) : null, what });

/** Un error de `insertMany` en el que todo lo que falló ya estaba (una reentrega). */
const onlyDuplicates = (error) => {
    const errors = error?.writeErrors ?? (error?.code === 11000 ? [error] : null);
    return Array.isArray(errors) && errors.length > 0 && errors.every(item => (item.code ?? item.err?.code) === 11000);
};

/** Guarda las piezas de un trozo; las que ya estaban no cuentan. */
const insertPieces = async (pieces) => {
    if (pieces.length === 0) return 0;
    try {
        await HistoryThread.insertMany(pieces, { ordered: false });
        return pieces.length;
    } catch (error) {
        if (!onlyDuplicates(error)) throw error;
        return pieces.length - (error.writeErrors?.length ?? pieces.length);
    }
};

/**
 * El avance de la línea con un trozo nuevo, en una sola escritura atómica: el
 * mayor `progress` visto (llegan desordenados), el primero y el último trozo, y
 * `finishedAt` borrado (un trozo tardío vuelve a abrir la recepción).
 */
const recordChunk = (sync, progress, now) => Line.updateOne(
    { _id: sync.lineId, 'historySync.connectionAt': sync.connectionAt },
    [{ $set: {
        'historySync.progress': progress === null ? '$historySync.progress' : { $max: ['$historySync.progress', progress] },
        'historySync.firstChunkAt': { $ifNull: ['$historySync.firstChunkAt', now] },
        'historySync.lastChunkAt': now,
        'historySync.historyComplete': progress !== null && progress >= 100 ? true : { $ifNull: ['$historySync.historyComplete', false] },
        'historySync.finishedAt': null,
    } }],
);

/**
 * Los trozos de `value.history[]`: cada hilo en piezas (`HistoryThread`), o la
 * línea en `declined` si el negocio no compartió (error 2593109).
 * @returns {Promise<{ stored: number, declined: boolean, ignored: boolean }>}
 */
export const storeHistoryChunks = async (inbound, value) => {
    const items = Array.isArray(value?.history) ? value.history : [];
    if (items.length === 0) return { stored: 0, declined: false, ignored: false };
    const sync = await currentSync(inbound);
    if (!sync) {
        logIgnored(inbound, 'history');
        return { stored: 0, declined: false, ignored: true };
    }

    let stored = 0;
    let declined = false;
    for (const item of items) {
        const chunk = describeHistoryChunk(item);
        if (!chunk) {
            console.warn('Trozo de historial mal formado; se salta:', { lineId: String(sync.lineId) });
            continue;
        }
        if (chunk.declined) {
            declined = true;
            await Line.updateOne(
                { _id: sync.lineId, 'historySync.connectionAt': sync.connectionAt },
                { $set: { 'historySync.declined': true } },
            );
            console.log('Historial: el negocio no lo compartió', { lineId: String(sync.lineId) });
            continue;
        }

        const { phase, chunkOrder } = chunk;
        const pieces = chunk.threads.flatMap(thread => splitThreadMessages(thread.messages).map((messages, part) => ({
            userId: inbound.accountId, lineId: sync.lineId, connectionAt: sync.connectionAt,
            contactPhone: thread.contactPhone, phase, chunkOrder, part, messages,
        })));
        const inserted = await insertPieces(pieces);
        stored += inserted;
        if (inserted > 0) wakeHistoryWorker();
        await recordChunk(sync, chunk.progress, new Date());
        // Solo números: ni textos ni teléfonos.
        console.log('Historial: trozo guardado', {
            lineId: String(sync.lineId), phase, chunkOrder, progress: chunk.progress,
            hilos: chunk.threads.length, mensajes: chunk.threads.reduce((sum, thread) => sum + thread.messages.length, 0),
            piezas: pieces.length, nuevas: inserted,
        });
        if (chunk.skippedThreads > 0) {
            console.warn('Hilos del historial mal formados; se saltan:', { lineId: String(sync.lineId), phase, chunkOrder, hilos: chunk.skippedThreads });
        }
    }
    return { stored, declined, ignored: false };
};

/**
 * El contenido de los archivos de 14 días: un `messages[]` que llega bajo el
 * campo `history`. Nunca es un mensaje en vivo (no pasa por `procesarEntrante`):
 * se guarda en `HistoryMedia` por su identidad y lo aplica el worker.
 * @returns {Promise<{ stored: number, ignored: boolean }>}
 */
export const storeHistoryMedia = async (inbound, value) => {
    const messages = Array.isArray(value?.messages) ? value.messages : [];
    if (messages.length === 0) return { stored: 0, ignored: false };
    const sync = await currentSync(inbound);
    if (!sync) {
        logIgnored(inbound, 'media');
        return { stored: 0, ignored: true };
    }

    let stored = 0;
    for (const messageData of messages) {
        const waMessageId = typeof messageData?.id === 'string' && messageData.id ? messageData.id : null;
        if (!waMessageId) {
            console.warn('Archivo del historial sin id; se salta:', { lineId: String(sync.lineId), type: messageData?.type });
            continue;
        }
        const waMessageKey = wamidMessageKey(waMessageId);
        const mediaKey = waMessageKey ?? `id:${waMessageId}`;
        try {
            // Sin pisar nada: una reentrega no deshace un `applied`.
            const result = await HistoryMedia.updateOne(
                { lineId: sync.lineId, connectionAt: sync.connectionAt, mediaKey },
                { $setOnInsert: { userId: inbound.accountId, waMessageId, waMessageKey, messageData, applied: false } },
                { upsert: true },
            );
            stored += result.upsertedCount;
        } catch (error) {
            // Dos entregas a la vez: la otra ya lo guardó.
            if (error.code !== 11000) throw error;
        }
    }
    console.log('Historial: archivos guardados', { lineId: String(sync.lineId), recibidos: messages.length, nuevos: stored });
    return { stored, ignored: false };
};
