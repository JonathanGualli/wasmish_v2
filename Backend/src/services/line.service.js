import Account from '../models/account.model.js';
import Line from '../models/line.model.js';
import Waba from '../models/waba.model.js';
import { findAccountOwner } from './account.service.js';
import { ownerConnection } from '../utils/line.js';

// Fase 2a de multi-línea: `Waba`, `Line` y `Account.defaultLineId` son una
// proyección de la conexión que guarda el owner en `User` (ver utils/line.js).
// Solo esta función los escribe (más las líneas de números anteriores que crea
// `migrate:lines`).

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

// La línea de ese número en esa cuenta (activa o no), o null.
export const findLineId = async (accountId, phoneNumberId) => {
    const line = await Line.findOne({ accountId, phoneNumberId }).select('_id').lean();
    return line?._id ?? null;
};
