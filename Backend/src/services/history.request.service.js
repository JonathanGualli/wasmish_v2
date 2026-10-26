// Pedir a Meta la agenda y el historial de un número de la app de WhatsApp
// Business, una vez por conexión (`applyConnection` deja los dos pedidos
// `pending`), y reintentarlo desde Ajustes. Lo llama el worker del historial en
// cada vuelta, antes de las piezas.
// Spec: docs/superpowers/specs/2026-10-23-historial-coexistencia-design.md (§ 4).

import Line from '../models/line.model.js';
import Waba from '../models/waba.model.js';
import { requestSmbAppData } from '../libs/whatsapp.js';
import { decrypt } from '../utils/crypto.js';
import { historySyncView, HISTORY_REQUEST_WINDOW_MS, REQUEST_KINDS, SYNC_TYPES } from '../utils/history.sync.js';
import { LINE_ERROR_CODES } from '../utils/whatsapp.line.js';

const statePath = (kind) => `historySync.requests.${kind}`;

// El historial no se pide (ni se vuelve a pedir) si ya llegó algo de él o el
// negocio dijo que no: Meta ya lo aceptó (revisión de Codex del PR #132).
const notStarted = (kind) => (kind === 'history'
    ? { 'historySync.firstChunkAt': null, 'historySync.declined': { $ne: true } }
    : {});

/**
 * Reclama un pedido `pending` de la conexión actual de la línea: `requesting`,
 * con la hora. Condicionado al estado, así que dos procesos (o el worker y un
 * reintento) nunca piden lo mismo dos veces.
 * @returns {Promise<object|null>} la línea, o null si ya no estaba pendiente.
 */
export const claimHistoryRequest = (lineId, connectionAt, kind, now = new Date()) => Line.findOneAndUpdate(
    { _id: lineId, status: 'active', 'historySync.connectionAt': connectionAt, [`${statePath(kind)}.state`]: 'pending', ...notStarted(kind) },
    { $set: { [`${statePath(kind)}.state`]: 'requesting', [`${statePath(kind)}.claimedAt`]: now }, $unset: { [`${statePath(kind)}.error`]: '' } },
    { new: true },
).lean();

/**
 * Lo que dejó la respuesta de Meta. Con un error suyo (`waErrorCode`), Meta
 * contestó que no: `rejected`, y se puede reintentar. Sin respuesta (timeout,
 * red, un 5xx sin cuerpo de Meta) no se sabe si lo aceptó: `uncertain`, y no se
 * repite solo, porque Meta lo da una sola vez.
 */
const outcomeOf = (requestId, error) => {
    if (!error) return { state: 'accepted', requestId };
    if (error.waErrorCode != null) {
        return { state: 'rejected', error: { code: String(error.waErrorCode), detail: error.waErrorDetail ?? error.message } };
    }
    return { state: 'uncertain' };
};

/**
 * El token de esta conexión: `applyConnection` escribe la línea (con los pedidos)
 * antes que el token del WABA, así que hasta que `authorizedAt` alcanza la
 * conexión el token es el de antes, o ninguno. Mientras, no se pide nada: sin
 * esto, el worker podía pedir en ese hueco y dejarlo rechazado, o pedirlo con
 * un token viejo (revisión de Codex del PR #132).
 */
const connectionToken = async (line) => {
    const waba = line.wabaId ? await Waba.findById(line.wabaId).select('tokenWhatsapp authorizedAt').lean() : null;
    const ready = waba?.tokenWhatsapp && waba.authorizedAt && waba.authorizedAt >= line.historySync.connectionAt;
    return ready ? decrypt(waba.tokenWhatsapp) : null;
};

const requestOne = async (line, kind, token, now) => {
    const claimed = await claimHistoryRequest(line._id, line.historySync.connectionAt, kind, now);
    if (!claimed) return false;

    let requestId = null;
    let error = null;
    try {
        requestId = await requestSmbAppData({ token, phoneNumberId: line.phoneNumberId, syncType: SYNC_TYPES[kind] });
    } catch (caught) {
        error = caught;
    }
    const outcome = outcomeOf(requestId, error);
    // Solo sobre el pedido reclamado aquí: si otro lo cambió entre medias, manda lo suyo.
    await Line.updateOne(
        { _id: line._id, 'historySync.connectionAt': line.historySync.connectionAt, [`${statePath(kind)}.state`]: 'requesting', [`${statePath(kind)}.claimedAt`]: now },
        { $set: Object.fromEntries(Object.entries(outcome).map(([field, value]) => [`${statePath(kind)}.${field}`, value])) },
    );
    // Sin textos: el lineId, el pedido y lo que respondió Meta.
    const log = { lineId: String(line._id), kind, state: outcome.state, requestId, errorCode: outcome.error?.code ?? null };
    if (outcome.state === 'accepted') console.log('Historial: pedido a Meta', log);
    else console.error('Historial: pedido a Meta sin aceptar', { ...log, error: error?.waErrorDetail ?? error?.message });
    return true;
};

/**
 * Hace los pedidos `pending` de las líneas activas dentro de las 24 h de su
 * conexión: por línea, primero la agenda y después el historial. Si uno falla,
 * el otro se pide igual.
 * @returns {Promise<{ accountId, lineId }[]>} las líneas que cambiaron (para el SSE).
 */
export const processPendingHistoryRequests = async (now = new Date()) => {
    const lines = await Line.find({
        status: 'active',
        'historySync.connectionAt': { $gt: new Date(now.getTime() - HISTORY_REQUEST_WINDOW_MS) },
        $or: REQUEST_KINDS.map(kind => ({ [`${statePath(kind)}.state`]: 'pending' })),
    }).select('_id accountId wabaId phoneNumberId connectedAt historySync').lean();

    const changed = [];
    for (const line of lines) {
        // Un `historySync` de otra conexión no se pide (`applyConnection` lo reinicia al conectar).
        if (line.historySync.connectionAt.getTime() !== line.connectedAt?.getTime()) continue;
        // La conexión aún no guardó su token: en la vuelta siguiente.
        const token = await connectionToken(line);
        if (!token) continue;
        let requested = false;
        for (const kind of REQUEST_KINDS) {
            if (line.historySync.requests?.[kind]?.state !== 'pending') continue;
            if (await requestOne(line, kind, token, now)) requested = true;
        }
        if (requested) changed.push({ accountId: line.accountId, lineId: line._id });
    }
    return changed;
};

/**
 * Al arrancar: un pedido que quedó `requesting` (el proceso murió con él en
 * curso) pasa a `uncertain`. Meta pudo recibirlo; no se repite solo.
 */
export const recoverHistoryRequests = async () => {
    let recovered = 0;
    for (const kind of REQUEST_KINDS) {
        const result = await Line.updateMany(
            { [`${statePath(kind)}.state`]: 'requesting' },
            { $set: { [`${statePath(kind)}.state`]: 'uncertain' } },
        );
        recovered += result.modifiedCount;
    }
    if (recovered > 0) console.warn('Historial: pedidos a Meta interrumpidos, quedan inciertos', { pedidos: recovered });
    return recovered;
};

const unavailable = () => Object.assign(
    new Error('No hay nada que reintentar: el historial ya se pidió o pasaron las 24 horas para pedirlo.'),
    { statusCode: 409, code: LINE_ERROR_CODES.historySyncUnavailable },
);

/**
 * Reintentar desde Ajustes (`POST /lines/:id/history-sync`): vuelve a `pending`
 * solo los pedidos que `historySyncView` da por reintentables, cada uno
 * condicionado a su estado de ahora. 409 si no hay ninguno (la línea no es de
 * la app, está desconectada o pasaron las 24 h). La línea ya es de la cuenta.
 * @returns {Promise<string[]>} los pedidos que vuelven a la cola.
 */
export const retryHistorySync = async (line, now = new Date()) => {
    const view = line.status === 'active' ? historySyncView(line.historySync, now) : null;
    if (!view?.canRetry) throw unavailable();

    const retried = [];
    for (const kind of view.retryable) {
        const request = line.historySync.requests[kind];
        const result = await Line.updateOne(
            {
                _id: line._id, status: 'active', 'historySync.connectionAt': line.historySync.connectionAt,
                [`${statePath(kind)}.state`]: request.state, [`${statePath(kind)}.claimedAt`]: request.claimedAt ?? null,
                // Un `uncertain` del historial, solo si sigue sin llegar nada: un
                // trozo pudo entrar después de leer la línea.
                ...(request.state === 'uncertain' && notStarted(kind)),
            },
            { $set: { [`${statePath(kind)}.state`]: 'pending' } },
        );
        if (result.modifiedCount > 0) retried.push(kind);
    }
    // Otro lo cambió entre la lectura y la escritura: ya no había nada que reintentar.
    if (retried.length === 0) throw unavailable();
    console.log('Historial: reintento pedido', { lineId: String(line._id), pedidos: retried });
    return retried;
};
