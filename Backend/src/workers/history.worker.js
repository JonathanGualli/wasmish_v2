import crypto from "node:crypto";
import HistoryThread from "../models/history.thread.model.js";
import Line from "../models/line.model.js";
import { sendToAccount } from "../controllers/stream.controller.js";
import { importHistoryPiece } from "../services/history.import.service.js";

// ---------------------------------------------------------------------------
// Worker del historial de la app de WhatsApp Business. Corre dentro del proceso
// de la API, como los de campañas y respuestas automáticas: la cola son las
// piezas que guardó el webhook (`HistoryThread`). Una pieza a la vez: lo traído
// no tiene prisa y cada pieza puede tener cientos de mensajes. El flujo y el
// porqué: docs/superpowers/specs/2026-10-23-historial-coexistencia-design.md (§ 6).
//
// Supone UNA sola instancia de la API (como hoy en el compose): al arrancar da
// por muertas las piezas que estaban en curso.
// ---------------------------------------------------------------------------

const LEASE_MS = 120_000;                   // lo que puede durar una pieza antes de darla por muerta
const IDLE_MS = 3_000;                      // sin trabajo: cada cuánto se vuelve a mirar
const SWEEP_MS = 30_000;                    // cada cuánto se recogen las piezas a medias y se mira si terminó
export const FINISH_QUIET_MS = 10 * 60 * 1000; // sin trozos nuevos durante esto, la recepción terminó
const MAX_ATTEMPTS = 3;
const NOTIFY_EVERY_MS = 5_000;              // el SSE `history_sync`, como mucho esto por línea
const STOP_TIMEOUT_MS = 8_000;              // al parar, lo que se espera a la pieza en curso

let running = false;
let loopPromise = null;
let wakeIdle = null;
let wakeRequested = false;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// La espera sin trabajo se corta al llegar un trozo (`wakeHistoryWorker`). Un
// aviso que llega mientras no se espera no se pierde: la siguiente espera
// termina al momento.
const idle = (ms) => new Promise(resolve => {
    if (wakeRequested) {
        wakeRequested = false;
        resolve();
        return;
    }
    const timer = setTimeout(resolve, ms);
    wakeIdle = () => { clearTimeout(timer); resolve(); };
});

export const wakeHistoryWorker = () => {
    wakeRequested = true;
    wakeIdle?.();
    wakeIdle = null;
};

// El SSE `history_sync` ({ lineId }: Ajustes vuelve a leer el estado), solo a
// quien administra las líneas. Como mucho uno cada NOTIFY_EVERY_MS por línea; el
// que cae dentro del plazo sale al final de él, para que el último estado llegue.
const lastNotified = new Map();
const pendingNotify = new Map();
const notifyHistorySync = (accountId, lineId) => {
    const key = String(lineId);
    if (pendingNotify.has(key)) return;
    const emit = () => {
        pendingNotify.delete(key);
        lastNotified.set(key, Date.now());
        sendToAccount(String(accountId), 'history_sync', { lineId: key }, { lineId: key, permission: 'lines.manage' });
    };
    const wait = (lastNotified.get(key) ?? 0) + NOTIFY_EVERY_MS - Date.now();
    if (wait <= 0) return emit();
    const timer = setTimeout(emit, wait);
    timer.unref?.();
    pendingNotify.set(key, timer);
};

// El filtro de lo que solo puede hacer quien tiene la pieza: si el barrido la
// devolvió a la cola (su lease venció) y otro la tomó, ya no casa.
const ownPiece = (piece) => ({ _id: piece._id, status: 'processing', claimToken: piece.claimToken });

// Las piezas perdidas de una conexión, contadas desde las propias piezas.
const countFailedPieces = (lineId, connectionAt) => HistoryThread.countDocuments({ lineId, connectionAt, status: 'failed' });

// `failedThreads` de la conexión de la pieza (no de otra), RECALCULADO y no
// sumado: si el proceso muere entre marcar la pieza `failed` y esto, la próxima
// cuenta (o el cierre, en `finishHistorySyncs`) la incluye, y contar dos veces
// no la cuenta doble (revisión de Codex del PR #129).
const recountFailed = async (piece) => Line.updateOne(
    { _id: piece.lineId, 'historySync.connectionAt': piece.connectionAt },
    { $set: { 'historySync.failedThreads': await countFailedPieces(piece.lineId, piece.connectionAt) } },
);

// Sin textos ni teléfonos: son conversaciones de los clientes de nuestros clientes.
const logPiece = (piece, status, extra = {}) => console.log('Historial: pieza', {
    pieceId: String(piece._id), lineId: String(piece.lineId), phase: piece.phase, chunkOrder: piece.chunkOrder,
    part: piece.part, attempts: piece.attempts, status, ...extra,
});

/** Toma la pieza pendiente más vieja, de forma atómica, con un token propio. */
export const claimNextHistoryThread = (now = new Date()) => HistoryThread.findOneAndUpdate(
    { status: 'pending' },
    {
        $set: { status: 'processing', leaseUntil: new Date(now.getTime() + LEASE_MS), claimToken: crypto.randomUUID() },
        $inc: { attempts: 1 },
    },
    { sort: { createdAt: 1 }, new: true },
).lean();

/**
 * Reclama UNA pieza y la importa. Devuelve 'idle' (no había), 'done', 'retry'
 * (falló y vuelve a la cola), 'failed' (falló por tercera vez) o 'lost' (ya no
 * era suya). `importPiece` se puede cambiar en los tests.
 */
export const processNextHistoryThread = async ({ importPiece = importHistoryPiece } = {}) => {
    const piece = await claimNextHistoryThread();
    if (!piece) return 'idle';

    try {
        const result = await importPiece(piece);
        const closed = await HistoryThread.updateOne(ownPiece(piece), {
            $set: { status: 'done', leaseUntil: null, claimToken: null, error: null },
        });
        if (closed.matchedCount === 0) {
            logPiece(piece, 'lost');
            return 'lost';
        }
        logPiece(piece, 'done', result);
        notifyHistorySync(piece.userId, piece.lineId);
        return 'done';
    } catch (error) {
        const failed = piece.attempts >= MAX_ATTEMPTS;
        const closed = await HistoryThread.updateOne(ownPiece(piece), {
            $set: { status: failed ? 'failed' : 'pending', leaseUntil: null, claimToken: null, error: error.message },
        });
        if (closed.matchedCount === 0) {
            logPiece(piece, 'lost', { error: error.message });
            return 'lost';
        }
        if (failed) {
            await recountFailed(piece);
            notifyHistorySync(piece.userId, piece.lineId);
        }
        console.error('Historial: pieza con error', { pieceId: String(piece._id), attempts: piece.attempts, failed, error: error.message });
        return failed ? 'failed' : 'retry';
    }
};

/**
 * Recoge las piezas a medias: las `processing` con el lease vencido (al
 * arrancar, todas: hay una sola instancia) vuelven a la cola, o quedan `failed`
 * si ya iban por su tercer intento. Lo ya guardado no se duplica al repetirlas.
 */
export const recoverHistoryThreads = async ({ startup = false } = {}) => {
    const now = new Date();
    const dead = await HistoryThread.find({ status: 'processing', ...(startup ? {} : { leaseUntil: { $lt: now } }) })
        .select('_id userId lineId connectionAt attempts claimToken phase chunkOrder part').lean();

    const summary = { requeued: 0, failed: 0 };
    for (const piece of dead) {
        const failed = piece.attempts >= MAX_ATTEMPTS;
        const result = await HistoryThread.updateOne(ownPiece(piece), {
            $set: { status: failed ? 'failed' : 'pending', leaseUntil: null, claimToken: null, ...(failed && { error: 'interrupted' }) },
        });
        if (result.modifiedCount === 0) continue;
        if (failed) {
            summary.failed += 1;
            await recountFailed(piece);
            notifyHistorySync(piece.userId, piece.lineId);
        } else {
            summary.requeued += 1;
        }
    }
    if (summary.requeued || summary.failed) console.warn('Historial: piezas recogidas', summary);
    return summary;
};

/**
 * Da por terminada la recepción de las líneas con el trozo de `progress: 100`,
 * sin trozos nuevos en FINISH_QUIET_MS y sin piezas pendientes ni en curso de su
 * conexión. «Terminado» habla solo de los chats: la agenda y los archivos de 14
 * días pueden seguir llegando. Devuelve cuántas terminó.
 */
export const finishHistorySyncs = async (now = new Date()) => {
    const candidates = await Line.find({
        'historySync.historyComplete': true,
        'historySync.finishedAt': null,
        'historySync.lastChunkAt': { $lte: new Date(now.getTime() - FINISH_QUIET_MS) },
    }).select('_id accountId historySync.connectionAt historySync.lastChunkAt').lean();

    let finished = 0;
    for (const line of candidates) {
        const { connectionAt, lastChunkAt } = line.historySync;
        if (await HistoryThread.exists({ lineId: line._id, connectionAt, status: { $in: ['pending', 'processing'] } })) continue;
        // Sin nada pendiente, la cuenta de piezas perdidas ya no cambia: se deja
        // definitiva al cerrar. Condicionada a lo leído: un trozo que llegó entre
        // medias la deja abierta.
        const failedThreads = await countFailedPieces(line._id, connectionAt);
        const result = await Line.updateOne(
            { _id: line._id, 'historySync.connectionAt': connectionAt, 'historySync.lastChunkAt': lastChunkAt, 'historySync.finishedAt': null },
            { $set: { 'historySync.finishedAt': now, 'historySync.failedThreads': failedThreads } },
        );
        if (result.modifiedCount === 0) continue;
        finished += 1;
        console.log('Historial: recepción terminada', { lineId: String(line._id) });
        notifyHistorySync(line.accountId, line._id);
    }
    return finished;
};

const loop = async () => {
    let lastSweep = 0;
    while (running) {
        try {
            if (Date.now() - lastSweep >= SWEEP_MS) {
                lastSweep = Date.now();
                await recoverHistoryThreads();
                await finishHistorySyncs();
            }
            // Una pieza detrás de otra mientras haya; sin trabajo, se espera.
            if (await processNextHistoryThread() === 'idle' && running) await idle(IDLE_MS);
        } catch (error) {
            // Un fallo de la BD no puede matar el worker: se reintenta en la vuelta siguiente.
            console.error('Worker del historial:', error.message);
            if (running) await idle(IDLE_MS);
        }
    }
};

/** Arranca el worker, después de recoger lo que dejó a medias el proceso anterior. */
export const startHistoryWorker = async () => {
    if (running) return;
    running = true;
    try {
        await recoverHistoryThreads({ startup: true });
    } catch (error) {
        console.error('Historial: no se pudo recoger lo pendiente al arrancar:', error.message);
    }
    loopPromise = loop();
};

// Deja de tomar piezas y espera la que está en curso, con un plazo de
// STOP_TIMEOUT_MS (Docker da 10 s): si no termina, queda `processing` y el
// próximo arranque la devuelve a la cola.
export const stopHistoryWorker = async () => {
    running = false;
    wakeHistoryWorker();
    await Promise.race([loopPromise, sleep(STOP_TIMEOUT_MS)]);
};
