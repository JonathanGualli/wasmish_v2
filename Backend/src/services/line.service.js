import crypto from 'node:crypto';
import Account from '../models/account.model.js';
import Line from '../models/line.model.js';
import User from '../models/user.model.js';
import Waba from '../models/waba.model.js';
import { findAccountOwner } from './account.service.js';
import { legacyUserFields, nextDefaultLine, ownerConnection, planConnection, sendingLineFor } from '../utils/line.js';
import {
    DEFAULT_LINE_INACTIVE_MESSAGE, LINE_BUSY_MESSAGE, LINE_ERROR_CODES, LINE_DISCONNECTED_MESSAGE, LINE_NOT_FOUND_MESSAGE, WHATSAPP_NOT_CONNECTED_MESSAGE,
    lineLimitMessage,
} from '../utils/whatsapp.line.js';

// Las líneas de WhatsApp de una cuenta. Desde la Fase 2c de multi-línea,
// `Waba`, `Line` y `Account.defaultLineId` son la FUENTE de la conexión, y
// solo este archivo la escribe (`applyConnection`), siempre dentro de
// `withLineLock`. El owner guarda en `User` una copia de la línea por defecto
// (`writeLegacyUser`) para que la imagen anterior, que lee `User`, siga
// funcionando mientras ninguna cuenta tenga dos líneas.
//
// `syncLinesFromOwner` es lo de la Fase 2a (de `User` a `Line`): solo lo usa
// `migrate:lines`, en las cuentas que todavía no tienen ninguna línea.

const MAX_SYNC_ATTEMPTS = 3;

const connectionKey = (owner) => [owner?.tokenWhatsapp, owner?.phoneNumberId, owner?.waBusinessId].join('|');

const writeProjection = async (accountId, owner, details) => {
    const connection = ownerConnection(owner);

    if (!connection) {
        await Line.updateMany({ accountId, status: 'active' }, { $set: { status: 'disconnected' } });
        await Account.updateOne({ _id: accountId }, { $set: { defaultLineId: null } });
        return;
    }

    // Con `accountId` en el filtro: si el WABA ya es de otra cuenta, el upsert
    // intenta insertarlo y el índice único lo frena (E11000), sin tocar el ajeno.
    const waba = await Waba.findOneAndUpdate(
        { waBusinessId: connection.waBusinessId, accountId },
        { $set: { tokenWhatsapp: connection.tokenWhatsapp } },
        { upsert: true, new: true },
    );

    // Con `maxLines: 1`, el número actual es la única línea activa.
    await Line.updateMany(
        { accountId, status: 'active', phoneNumberId: { $ne: connection.phoneNumberId } },
        { $set: { status: 'disconnected' } },
    );
    // `User.phoneNumberId` es único: si OTRA cuenta tiene activo este número,
    // esa línea es vieja (el número pasó de una cuenta a otra, p. ej. con la
    // imagen anterior, que solo escribe `User`). Sin esto, activarlo aquí
    // chocaría con el índice y la sincronización se quedaría bloqueada.
    await Line.updateMany(
        { phoneNumberId: connection.phoneNumberId, status: 'active', accountId: { $ne: accountId } },
        { $set: { status: 'disconnected' } },
    );
    // Los datos de Meta solo si son de ESTE número: al repetir tras un cambio
    // de número, los que llegaron eran del anterior.
    const freshDetails = details && details.phoneNumberId === connection.phoneNumberId ? details : null;
    const line = await Line.findOneAndUpdate(
        { accountId, phoneNumberId: connection.phoneNumberId },
        { $set: {
            wabaId: waba._id,
            status: 'active',
            ...(freshDetails && { displayPhoneNumber: freshDetails.displayPhoneNumber ?? null, verifiedName: freshDetails.verifiedName ?? null }),
        } },
        { upsert: true, new: true },
    );
    await Account.updateOne({ _id: accountId }, { $set: { defaultLineId: line._id } });
};

/**
 * (Fase 2a; desde la 2c, solo para `migrate:lines` en una cuenta sin líneas.)
 * Deja `Waba`, `Line` y `Account.defaultLineId` como dice el owner de la cuenta.
 * Idempotente. Lee el owner de la BD, escribe, y lo vuelve a leer: si su
 * conexión cambió entre medias (otra conexión a la vez), repite, así que la
 * última sincronización en terminar siempre refleja el `User` final.
 *
 * `details` = `{ phoneNumberId, displayPhoneNumber, verifiedName }` de Meta, si
 * se acaban de leer al conectar; solo se guardan si son del número actual. `afterRead(attempt)` es SOLO para los tests: provoca un
 * cambio entre la lectura y la escritura.
 */
export const syncLinesFromOwner = async (accountId, { details = null, afterRead = null } = {}) => {
    for (let attempt = 1; attempt <= MAX_SYNC_ATTEMPTS; attempt++) {
        const owner = await findAccountOwner(accountId).lean();
        if (!owner) throw new Error(`La cuenta ${accountId} no tiene owner`);
        await afterRead?.(attempt);

        await writeProjection(accountId, owner, details);

        const after = await findAccountOwner(accountId).lean();
        if (connectionKey(after) === connectionKey(owner)) return { attempts: attempt };
    }
    throw new Error(`La conexión de la cuenta ${accountId} cambió ${MAX_SYNC_ATTEMPTS} veces durante la sincronización`);
};

/**
 * A qué cuenta y línea va lo que llega al webhook por `phoneNumberId`:
 * `{ accountId, lineId, phoneNumberId, tokenWhatsapp }`, con el token (cifrado)
 * para bajar los adjuntos.
 *
 * La línea activa de ese número (un número activo está en una sola cuenta) y
 * el token de su WABA. Un número que es `Line` pero no está activo en ninguna
 * cuenta no recibe: se desconectó. La reserva del spec («nunca se descarta»)
 * queda solo para un número sin ninguna `Line` que el `User` de una cuenta sí
 * tiene (una conexión hecha con la imagen anterior): se procesa en esa cuenta,
 * sin línea, con aviso en el log.
 */
export const findInboundLine = async (phoneNumberId) => {
    const line = await Line.findOne({ phoneNumberId, status: 'active' }).lean();
    if (line) {
        const waba = line.wabaId ? await Waba.findById(line.wabaId).lean() : null;
        return { accountId: line.accountId, lineId: line._id, phoneNumberId, tokenWhatsapp: waba?.tokenWhatsapp ?? null };
    }
    if (await Line.exists({ phoneNumberId })) return null;

    const owner = await User.findOne({ phoneNumberId }).select('accountId tokenWhatsapp').lean();
    if (!owner) return null;
    console.error('Webhook por la reserva de User: el número no tiene línea', {
        accountId: String(owner.accountId), phoneNumberId,
    });
    return { accountId: owner.accountId, lineId: null, phoneNumberId, tokenWhatsapp: owner.tokenWhatsapp ?? null };
};

/**
 * Guarda el número visible de una línea que no lo tiene: las que creó
 * `migrate:lines` no lo saben (solo se guarda al conectar), y Meta lo manda en
 * cada webhook (`metadata.display_phone_number`). Lo necesita `from` en la API
 * pública. Nunca pisa uno que ya esté.
 */
export const rememberDisplayPhoneNumber = async (lineId, displayPhoneNumber) => {
    if (!lineId || !displayPhoneNumber) return;
    await Line.updateOne({ _id: lineId, displayPhoneNumber: null }, { $set: { displayPhoneNumber: String(displayPhoneNumber) } });
};

const statusError = (statusCode, message, code = null) => Object.assign(new Error(message), { statusCode, code });

/**
 * La línea por la que sale un envío de la cuenta: un SendingLine
 * `{ accountId, lineId, phoneNumberId, waBusinessId, tokenWhatsapp }` (token
 * cifrado; ver `sendingLineFor`).
 *
 * - `lineId`: esa línea de la cuenta; si no es suya, 404.
 * - Si no, la del número `phoneNumberId` (una conversación sin línea).
 * - Si no, la línea por defecto de la cuenta.
 *
 * Errores con `statusCode`: 409 sin WhatsApp conectado, o si la línea pedida
 * está desconectada.
 */
export const findSendingLine = async (accountId, { lineId = null, phoneNumberId = null } = {}) => {
    let line = null;
    if (lineId) {
        line = await Line.findOne({ _id: lineId, accountId }).lean();
        if (!line) throw statusError(404, LINE_NOT_FOUND_MESSAGE, LINE_ERROR_CODES.notFound);
    } else if (phoneNumberId) {
        line = await Line.findOne({ accountId, phoneNumberId }).lean();
    } else {
        const account = await Account.findById(accountId).select('defaultLineId').lean();
        line = account?.defaultLineId ? await Line.findOne({ _id: account.defaultLineId, accountId }).lean() : null;
    }
    const waba = line?.wabaId ? await Waba.findById(line.wabaId).lean() : null;

    const result = sendingLineFor({ line, waba, requested: Boolean(lineId || phoneNumberId) });
    if (result.issue === 'not_connected') throw statusError(409, WHATSAPP_NOT_CONNECTED_MESSAGE);
    if (result.issue === 'disconnected') throw statusError(409, LINE_DISCONNECTED_MESSAGE);
    return result.line;
};

// La línea de una conversación: la suya o, si es anterior a las líneas, la de su número.
export const findConversationLine = (conversation) =>
    findSendingLine(conversation.userId, { lineId: conversation.lineId, phoneNumberId: conversation.phoneNumberId });

// --- Escribir la conexión (Fase 2c) ------------------------------------------

const LOCK_MS = 30 * 1000;

/**
 * Ejecuta `fn` con el candado de líneas de la cuenta: un cambio de líneas a la
 * vez por cuenta, también entre procesos (lo guarda `Account.lineLock` en
 * Mongo, sin transacciones). Ocupado → 409 `LINE_BUSY_MESSAGE`. Caduca a los
 * 30 s, por si un proceso muere con él; se suelta solo si sigue siendo suyo.
 */
export const withLineLock = async (accountId, fn) => {
    const token = crypto.randomUUID();
    const now = new Date();
    const taken = await Account.findOneAndUpdate(
        { _id: accountId, $or: [{ lineLock: null }, { 'lineLock.expiresAt': { $lte: now } }] },
        { $set: { lineLock: { token, expiresAt: new Date(now.getTime() + LOCK_MS) } } },
        { projection: { _id: 1 } },
    );
    if (!taken) throw statusError(409, LINE_BUSY_MESSAGE, LINE_ERROR_CODES.busy);
    try {
        return await fn();
    } finally {
        await Account.updateOne({ _id: accountId, 'lineLock.token': token }, { $set: { lineLock: null } });
    }
};

// La copia que le toca al owner de la cuenta: la de su línea por defecto.
const legacyFieldsOf = async (accountId) => {
    const account = await Account.findById(accountId).select('defaultLineId').lean();
    const line = account?.defaultLineId ? await Line.findById(account.defaultLineId).lean() : null;
    const waba = line?.wabaId ? await Waba.findById(line.wabaId).lean() : null;
    return legacyUserFields(line, waba);
};

const copyToOwner = async (accountId) => {
    await User.updateOne({ accountId, role: 'owner' }, { $set: await legacyFieldsOf(accountId) });
    await Account.updateOne({ _id: accountId }, { $set: { legacyUserStale: false } });
};

/**
 * Escribe en el owner la copia de la línea por defecto (`legacyUserFields`),
 * para la imagen anterior. Nunca lanza: `Line` ya está escrita y es la fuente.
 *
 * Si choca con `User.phoneNumberId` (único), es que el `User` de OTRA cuenta
 * conserva ese número en una copia atrasada (su cuenta ya lo tiene como
 * `Line`, desconectada): se rehace primero la copia de esa cuenta, desde SUS
 * líneas, y se reintenta. Si aun así falla, `Account.legacyUserStale` queda en
 * true y `migrate:lines` la repara (revisión de Codex del plan de la 2c).
 */
export const writeLegacyUser = async (accountId) => {
    try {
        await copyToOwner(accountId);
        return;
    } catch (error) {
        if (error.code === 11000) {
            try {
                const { phoneNumberId } = await legacyFieldsOf(accountId);
                const holder = await User.findOne({ phoneNumberId, accountId: { $ne: accountId } }).select('accountId').lean();
                if (holder && await Line.exists({ accountId: holder.accountId, phoneNumberId })) {
                    await copyToOwner(holder.accountId);
                    await copyToOwner(accountId);
                    return;
                }
            } catch (retryError) {
                error = retryError;
            }
        }
        console.error('No se pudo copiar la conexión en User:', { accountId: String(accountId), error: error.message });
    }
    await Account.updateOne({ _id: accountId }, { $set: { legacyUserStale: true } }).catch(() => {});
};

/**
 * Termina un reemplazo de número que se cortó (revisión de Codex del PR #19):
 * si el número nuevo quedó activo, desconecta los reemplazados y lo deja por
 * defecto; si no llegó a activarse, el reemplazo no ocurrió y no se toca nada.
 * Se llama con el candado tomado, al empezar cada operación de líneas y al
 * final de cada reemplazo. Sin esto, reintentar la conexión daba «renovar» y
 * dejaba las dos activas y la por defecto en la vieja.
 */
export const finishPendingReplace = async (accountId) => {
    const account = await Account.findById(accountId).select('pendingReplace').lean();
    const pending = account?.pendingReplace;
    if (!pending) return;

    const line = await Line.findOne({ accountId, phoneNumberId: pending.phoneNumberId, status: 'active' }).lean();
    if (line) {
        await Line.updateMany(
            { _id: { $in: pending.replaceLineIds }, accountId, phoneNumberId: { $ne: pending.phoneNumberId }, status: 'active' },
            { $set: { status: 'disconnected', disconnectedAt: new Date() } },
        );
        await Account.updateOne({ _id: accountId }, { $set: { defaultLineId: line._id } });
    }
    await Account.updateOne({ _id: accountId }, { $set: { pendingReplace: null } });
    await writeLegacyUser(accountId);
};

/**
 * Conecta (o renueva) el número `phoneNumberId` del WABA `waBusinessId` en la
 * cuenta, con su token ya cifrado, y devuelve `{ lineId }`. Lo que comparten el
 * Embedded Signup y el formulario manual DESPUÉS de hablar con Meta y de
 * reclamar el WABA (`claimWaba`). `details` = `{ phoneNumberId,
 * displayPhoneNumber, verifiedName }` de Meta.
 *
 * Dentro del candado: termina un reemplazo anterior que se cortara, el plan
 * (`planConnection`) con las líneas y el límite de ahora (409 si no cabe) y, en
 * este orden, la línea activa (si otra cuenta activó el número a la vez, E11000
 * y no se cambia nada más), el token del WABA y la línea por defecto con la
 * copia en `User`. Un reemplazo se apunta en `Account.pendingReplace` antes de
 * activar el número nuevo, y `finishPendingReplace` desconecta los anteriores.
 * `afterLock` es SOLO para los tests: se llama con el candado tomado.
 */
export const applyConnection = async (
    { accountId, waBusinessId, tokenWhatsapp, phoneNumberId, details = null, twoStepPin = null },
    { afterLock = null } = {},
) => withLineLock(accountId, async () => {
    await afterLock?.();
    await finishPendingReplace(accountId);
    const account = await Account.findById(accountId).select('limits defaultLineId').lean();
    const maxLines = account?.limits?.maxLines ?? 1;
    const lines = await Line.find({ accountId }).select('_id phoneNumberId status').lean();
    const plan = planConnection({ lines, maxLines, phoneNumberId });
    if (plan.error) throw statusError(409, lineLimitMessage(maxLines), LINE_ERROR_CODES.limit);

    // El reemplazo se apunta antes de activar nada: si se corta, la siguiente
    // operación lo termina.
    if (plan.action === 'replace') {
        await Account.updateOne({ _id: accountId }, { $set: { pendingReplace: { phoneNumberId, replaceLineIds: plan.replaceLineIds } } });
    }

    const waba = await Waba.findOneAndUpdate(
        { waBusinessId, accountId },
        { $setOnInsert: { tokenWhatsapp: null } },
        { upsert: true, new: true },
    );
    const freshDetails = details?.phoneNumberId === phoneNumberId ? details : null;
    const line = await Line.findOneAndUpdate(
        { accountId, phoneNumberId },
        { $set: {
            wabaId: waba._id,
            status: 'active',
            // Renovar el token no es conectar: la fecha se queda.
            ...(plan.action !== 'renew' && { connectedAt: new Date(), disconnectedAt: null }),
            ...(freshDetails && { displayPhoneNumber: freshDetails.displayPhoneNumber ?? null, verifiedName: freshDetails.verifiedName ?? null }),
            // El PIN del registro (`registerIfNeeded`); sin él, se queda el que hubiera.
            ...(twoStepPin && { twoStepPin }),
        } },
        { upsert: true, new: true },
    );
    await Waba.updateOne({ _id: waba._id }, {
        $set: { tokenWhatsapp },
        // Ya está en la línea: deja de estar pendiente.
        ...(twoStepPin && { $unset: { [`pendingTwoStepPins.${phoneNumberId}`]: '' } }),
    });

    if (plan.action === 'replace') {
        await finishPendingReplace(accountId);
        return { lineId: line._id };
    }
    const defaultIsActive = account?.defaultLineId
        && lines.some(other => String(other._id) === String(account.defaultLineId) && other.status === 'active');
    if (!defaultIsActive) await Account.updateOne({ _id: accountId }, { $set: { defaultLineId: line._id } });
    await writeLegacyUser(accountId);
    return { lineId: line._id };
});

const findAccountLine = async (accountId, lineId) => {
    const line = await Line.findOne({ _id: lineId, accountId }).lean();
    if (!line) throw statusError(404, LINE_NOT_FOUND_MESSAGE, LINE_ERROR_CODES.notFound);
    return line;
};

/**
 * Cambia el nombre interno de una línea de la cuenta y/o la hace por defecto
 * (la de la API pública sin `lineId`, y la que se copia en `User`). `name`:
 * undefined = no se toca; null = sin nombre. Todo con el candado, y
 * comprobando ANTES de escribir nada: 404 si no es de la cuenta, 409 si se
 * pide hacer por defecto una que no está activa (revisión de Codex del PR #20:
 * el nombre se guardaba aunque la petición respondiera 409).
 */
export const updateLineSettings = (accountId, lineId, { name, makeDefault = false } = {}) => withLineLock(accountId, async () => {
    await finishPendingReplace(accountId);
    const line = await findAccountLine(accountId, lineId);
    if (makeDefault && line.status !== 'active') throw statusError(409, DEFAULT_LINE_INACTIVE_MESSAGE, LINE_ERROR_CODES.defaultInactive);

    if (name !== undefined) await Line.updateOne({ _id: line._id }, { $set: { name } });
    if (makeDefault) {
        await Account.updateOne({ _id: accountId }, { $set: { defaultLineId: line._id } });
        await writeLegacyUser(accountId);
    }
});

/**
 * Desconecta una línea de la cuenta: deja de enviar y de recibir, y conserva
 * su historial. Idempotente. Si era la por defecto, pasa a serlo la activa más
 * reciente (`nextDefaultLine`) o ninguna. No llama a Meta ni borra el token del
 * `Waba`: otras líneas del WABA lo usan. 404 si no es de la cuenta.
 */
export const disconnectLine = (accountId, lineId) => withLineLock(accountId, async () => {
    await finishPendingReplace(accountId);
    const line = await findAccountLine(accountId, lineId);
    if (line.status === 'active') await Line.updateOne({ _id: line._id }, { $set: { status: 'disconnected', disconnectedAt: new Date() } });

    const account = await Account.findById(accountId).select('defaultLineId').lean();
    if (account?.defaultLineId && String(account.defaultLineId) === String(line._id)) {
        const lines = await Line.find({ accountId }).select('_id status connectedAt createdAt').lean();
        await Account.updateOne({ _id: accountId }, { $set: { defaultLineId: nextDefaultLine(lines, line._id)?._id ?? null } });
    }
    await writeLegacyUser(accountId);
});

/**
 * Los WABA de la cuenta con alguna línea activa, como `{ accountId,
 * waBusinessId, tokenWhatsapp }` (token cifrado): lo que necesita
 * `syncTemplatesForWaba`. Las plantillas se listan y se sincronizan de todos.
 */
export const findAccountWabas = async (accountId) => {
    const wabaIds = await Line.distinct('wabaId', { accountId, status: 'active', wabaId: { $ne: null } });
    const wabas = await Waba.find({ _id: { $in: wabaIds }, accountId }).lean();
    return wabas.map(waba => ({ accountId, waBusinessId: waba.waBusinessId, tokenWhatsapp: waba.tokenWhatsapp }));
};
