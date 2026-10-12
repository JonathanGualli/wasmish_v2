import Account from '../models/account.model.js';
import Line from '../models/line.model.js';
import User from '../models/user.model.js';
import Waba from '../models/waba.model.js';
import { findAccountOwner } from './account.service.js';
import { ownerConnection, lineMatchesOwner, sendingLineFor } from '../utils/line.js';
import {
    LINE_DISCONNECTED_MESSAGE, LINE_NOT_FOUND_MESSAGE, WHATSAPP_NOT_CONNECTED_MESSAGE,
} from '../utils/whatsapp.line.js';

// Fase 2a de multi-línea: `Waba`, `Line` y `Account.defaultLineId` son una
// proyección de la conexión que guarda el owner en `User` (ver utils/line.js).
// Solo `syncLinesFromOwner` los escribe (más las líneas de números anteriores
// que crea `migrate:lines`). Desde la 2b, lo que entra y sale de WhatsApp los
// LEE (`findInboundLine`); `User` sigue siendo la fuente hasta la 2c.

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

/**
 * A qué cuenta y línea va lo que llega al webhook por `phoneNumberId`:
 * `{ accountId, lineId, phoneNumberId, tokenWhatsapp }`, con el token (cifrado)
 * para bajar los adjuntos.
 *
 * Mientras `User` sea la fuente de la conexión (hasta la Fase 2c), la cuenta
 * sale del `User` que tiene el número (es único) y la línea, de esa cuenta y
 * ese número: una línea activa obsoleta de otra cuenta no se queda nada. Si la
 * proyección coincide con `User` (`lineMatchesOwner`), el token es el del WABA
 * de la línea. Si no (la proyección falló o se cortó), la reserva del spec: el
 * token de `User` y la línea de ese número en la cuenta si existe (o null),
 * nunca la de otro número, con aviso en el log. Un número que ningún `User`
 * tiene no es de nadie: null.
 */
export const findInboundLine = async (phoneNumberId) => {
    const owner = await User.findOne({ phoneNumberId }).select('accountId tokenWhatsapp phoneNumberId waBusinessId').lean();
    if (!owner) return null;

    const line = await Line.findOne({ accountId: owner.accountId, phoneNumberId }).lean();
    const waba = line?.wabaId ? await Waba.findById(line.wabaId).lean() : null;

    if (lineMatchesOwner({ owner, line, waba })) {
        return { accountId: owner.accountId, lineId: line._id, phoneNumberId, tokenWhatsapp: waba.tokenWhatsapp };
    }

    console.error('Webhook por la reserva de User: la línea no refleja la conexión', {
        accountId: String(owner.accountId), phoneNumberId, lineId: line ? String(line._id) : null,
    });
    return { accountId: owner.accountId, lineId: line?._id ?? null, phoneNumberId, tokenWhatsapp: owner.tokenWhatsapp ?? null };
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

const statusError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

/**
 * La línea por la que sale un envío de la cuenta: un SendingLine
 * `{ accountId, lineId, phoneNumberId, waBusinessId, tokenWhatsapp }` (token
 * cifrado; ver `sendingLineFor`). `User` sigue siendo la fuente de la conexión.
 *
 * - `lineId`: esa línea de la cuenta; si no es suya, 404.
 * - Si no, la del número `phoneNumberId` (una conversación sin línea) o, sin él,
 *   la del número conectado: la línea por defecto.
 *
 * Errores con `statusCode`: 409 sin WhatsApp conectado o si la línea es de un
 * número que ya no está conectado. La reserva (la proyección no cuadra con
 * `User`) envía igual y deja un `console.error`.
 */
export const findSendingLine = async (accountId, { lineId = null, phoneNumberId = null } = {}) => {
    const owner = await findAccountOwner(accountId).lean();

    let line = null;
    if (lineId) {
        line = await Line.findOne({ _id: lineId, accountId }).lean();
        if (!line) throw statusError(404, LINE_NOT_FOUND_MESSAGE);
    } else {
        const number = phoneNumberId ?? owner?.phoneNumberId;
        line = number ? await Line.findOne({ accountId, phoneNumberId: number }).lean() : null;
    }
    const waba = line?.wabaId ? await Waba.findById(line.wabaId).lean() : null;

    const result = sendingLineFor({ owner, line, waba, phoneNumberId });
    if (result.issue === 'not_connected') throw statusError(409, WHATSAPP_NOT_CONNECTED_MESSAGE);
    if (result.issue === 'disconnected') throw statusError(409, LINE_DISCONNECTED_MESSAGE);
    if (result.fallback) {
        console.error('Envío por la reserva de User: la línea no refleja la conexión', {
            accountId: String(accountId), lineId: line ? String(line._id) : null,
        });
    }
    return result.line;
};

// La línea de una conversación: la suya o, si es anterior a las líneas, la de su número.
export const findConversationLine = (conversation) =>
    findSendingLine(conversation.userId, { lineId: conversation.lineId, phoneNumberId: conversation.phoneNumberId });
