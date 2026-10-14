// Las líneas de WhatsApp de una cuenta (`Waba` + `Line`). Desde la Fase 2c de
// multi-línea son la FUENTE de la conexión, y el owner guarda en `User`
// (`tokenWhatsapp`, `phoneNumberId`, `waBusinessId`) una copia de la línea por
// defecto, para la imagen anterior (`legacyUserFields`).

import { LINE_NOT_FOUND_MESSAGE } from './whatsapp.line.js';

// Sin distinguir mayúsculas: un ObjectId es hexadecimal, y el que llega en un
// cuerpo (`lineId`) puede venir en mayúsculas.
const sameId = (a, b) => a != null && b != null && String(a).toLowerCase() === String(b).toLowerCase();

// La conexión que dice `User`, o null si le falta alguno de los tres campos.
export const ownerConnection = (owner) => {
    if (!owner?.tokenWhatsapp || !owner?.phoneNumberId || !owner?.waBusinessId) return null;
    return { tokenWhatsapp: owner.tokenWhatsapp, phoneNumberId: owner.phoneNumberId, waBusinessId: owner.waBusinessId };
};

// En qué no coincide la proyección con `User` (lo que garantiza
// `syncLinesFromOwner`; desde la Fase 2c solo vale para una cuenta sin líneas,
// que `migrate:lines` construye desde `User`). Vacío = al día. `lines` son
// todas las de la cuenta; `waba`, el del WABA de `User` (o null si no existe).
export const lineStateIssues = ({ owner, account, lines, waba }) => {
    const issues = [];
    const connection = ownerConnection(owner);
    const active = lines.filter(line => line.status === 'active');

    if (!connection) {
        if (active.length > 0) issues.push('hay líneas activas sin WhatsApp conectado');
        if (account.defaultLineId) issues.push('hay línea por defecto sin WhatsApp conectado');
        return issues;
    }

    const current = active.find(line => line.phoneNumberId === connection.phoneNumberId);
    if (!current) issues.push(`falta la línea activa del número ${connection.phoneNumberId}`);
    for (const line of active) {
        if (line.phoneNumberId !== connection.phoneNumberId) issues.push(`la línea ${line.phoneNumberId} sigue activa`);
    }
    if (current && !sameId(account.defaultLineId, current._id)) issues.push('la línea por defecto no es la del número actual');

    if (!waba) {
        issues.push(`falta el WABA ${connection.waBusinessId}`);
    } else {
        if (!sameId(waba.accountId, owner.accountId)) issues.push('el WABA es de otra cuenta');
        if (waba.tokenWhatsapp !== connection.tokenWhatsapp) issues.push('el token del WABA no es el de User');
        if (current && !sameId(current.wabaId, waba._id)) issues.push('la línea activa no apunta a su WABA');
    }

    return issues;
};

// Los WABA que aparecen en más de una cuenta. `entries` = `{ waBusinessId,
// accountId }` sacados de los owners (`User`) y de los `Waba` que ya existan.
// `migrate:lines` para si hay alguno: un WABA es de una sola cuenta.
export const sharedWabas = (entries) => {
    const byWaba = new Map();
    for (const { waBusinessId, accountId } of entries) {
        if (!waBusinessId || !accountId) continue;
        if (!byWaba.has(waBusinessId)) byWaba.set(waBusinessId, new Set());
        byWaba.get(waBusinessId).add(String(accountId));
    }
    return [...byWaba]
        .filter(([, accounts]) => accounts.size > 1)
        .map(([waBusinessId, accounts]) => ({ waBusinessId, accountIds: [...accounts] }));
};

// Las líneas desconectadas que `migrate:lines` crea en una cuenta: los números
// de sus conversaciones que no son el actual (de ese se ocupa
// `syncLinesFromOwner`) y aún no tienen línea. Una conversación sin número es
// un dato ambiguo: la migración para en vez de adivinar.
export const historicalLines = (conversationPhoneIds, existingPhoneIds, currentPhoneNumberId = null) => {
    if (conversationPhoneIds.some(phoneNumberId => !phoneNumberId)) {
        return { stop: 'hay conversaciones sin phoneNumberId' };
    }
    const existing = new Set(existingPhoneIds);
    return {
        create: conversationPhoneIds.filter(phoneNumberId =>
            phoneNumberId !== currentPhoneNumberId && !existing.has(phoneNumberId)),
    };
};

// Lo que la imagen anterior (1.0.14, que lee `User`) tiene que encontrar en el
// owner (Fase 2c de multi-línea): la conexión de la línea por defecto, o nada
// si no está activa o su WABA no tiene token. `User` ya no enruta: es esta copia.
export const legacyUserFields = (defaultLine, waba) => {
    if (defaultLine?.status !== 'active' || !waba?.tokenWhatsapp) {
        return { tokenWhatsapp: null, phoneNumberId: null, waBusinessId: null };
    }
    return { tokenWhatsapp: waba.tokenWhatsapp, phoneNumberId: defaultLine.phoneNumberId, waBusinessId: waba.waBusinessId };
};

// En qué no coincide `User` con la copia de la línea por defecto. Vacío = al día.
// `hasActiveLines`: si la cuenta tiene alguna línea activa (entonces alguna
// tiene que ser la por defecto).
export const legacyUserIssues = ({ owner, defaultLine, waba, hasActiveLines = false }) => {
    const issues = [];
    if (hasActiveLines && defaultLine?.status !== 'active') issues.push('ninguna línea activa es la por defecto');

    const expected = legacyUserFields(defaultLine, waba);
    if ((owner?.phoneNumberId ?? null) !== expected.phoneNumberId) {
        issues.push(`User tiene el número ${owner?.phoneNumberId ?? 'ninguno'} y la línea por defecto es ${expected.phoneNumberId ?? 'ninguna'}`);
    }
    if ((owner?.waBusinessId ?? null) !== expected.waBusinessId) issues.push('el WABA de User no es el de la línea por defecto');
    if ((owner?.tokenWhatsapp ?? null) !== expected.tokenWhatsapp) issues.push('el token de User no es el del WABA de la línea por defecto');
    return issues;
};

/**
 * Qué hace conectar el número `phoneNumberId` en una cuenta con estas `lines`
 * (`_id`, `phoneNumberId`, `status`) y este límite:
 *
 * - Ya activo → `{ action: 'renew', lineId }`: renovar el token nunca choca
 *   con el límite, aunque se haya bajado por debajo de las activas.
 * - Por debajo del límite → `{ action: 'add' }` (también si el número tiene
 *   una línea desconectada: se reactiva).
 * - `maxLines: 1` y exactamente una activa de otro número → `{ action:
 *   'replace', replaceLineIds }`: el «volver a conectar» con otro número de
 *   siempre.
 * - Si no → `{ error: 'limit' }`. Con más activas que el límite (se bajó)
 *   nunca se reemplaza: bajar el límite no desconecta nada.
 */
export const planConnection = ({ lines, maxLines, phoneNumberId }) => {
    const active = lines.filter(line => line.status === 'active');
    const same = active.find(line => line.phoneNumberId === phoneNumberId);
    if (same) return { action: 'renew', lineId: same._id };
    if (active.length < maxLines) return { action: 'add' };
    if (maxLines === 1 && active.length === 1) return { action: 'replace', replaceLineIds: [active[0]._id] };
    return { error: 'limit' };
};

/**
 * Por qué línea sale un envío (Fase 2c: `Line` y `Waba` son la fuente):
 * `{ line }` (un SendingLine, `{ accountId, lineId, phoneNumberId,
 * waBusinessId, tokenWhatsapp }`, token cifrado) o `{ issue }`.
 *
 * Sin línea, desconectada o sin token en su WABA: `disconnected` si se pidió
 * una línea o un número concretos (`requested`: la de una conversación), y
 * `not_connected` si se buscaba la por defecto.
 */
export const sendingLineFor = ({ line, waba, requested = false }) => {
    if (line?.status !== 'active' || !waba?.tokenWhatsapp) {
        return { issue: requested ? 'disconnected' : 'not_connected' };
    }
    return {
        line: {
            accountId: line.accountId, lineId: line._id, phoneNumberId: line.phoneNumberId,
            waBusinessId: waba.waBusinessId, tokenWhatsapp: waba.tokenWhatsapp,
        },
    };
};

const digitsOf = (text) => String(text ?? '').replace(/\D/g, '');

/**
 * Qué línea pide quien llama a la API pública (Fase 2b): `{ lineId }` (null =
 * la por defecto) o `{ statusCode, message }`. Con `lineId`, una línea de la
 * cuenta; con `from`, la de ese número, comparado solo por sus dígitos con
 * `displayPhoneNumber` («+593 99 123 4567» ↔ «593991234567»). Con los dos,
 * tienen que ser la misma. `lines` son las de la cuenta (`_id`,
 * `displayPhoneNumber`). Si está conectada lo decide después `findSendingLine`.
 */
export const resolveApiLine = (lines, { lineId = null, from = null } = {}) => {
    const byId = lineId ? lines.find(line => sameId(line._id, lineId)) : null;
    if (lineId && !byId) return { statusCode: 404, message: LINE_NOT_FOUND_MESSAGE };

    const wanted = from ? digitsOf(from) : null;
    const byNumber = wanted ? lines.find(line => line.displayPhoneNumber && digitsOf(line.displayPhoneNumber) === wanted) : null;
    if (from && !byNumber) return { statusCode: 404, message: 'Ningún número de tu cuenta es ese.' };

    if (byId && byNumber && !sameId(byId._id, byNumber._id)) {
        return { statusCode: 400, message: 'lineId y from no son la misma línea.' };
    }
    const line = byId ?? byNumber;
    return { lineId: line ? String(line._id) : null };
};

// Cuándo se conectó una línea: `connectedAt` o, en las anteriores a ese campo, `createdAt`.
const connectedTime = (line) => new Date(line.connectedAt ?? line.createdAt ?? 0).getTime();

// La línea que pasa a ser la por defecto cuando se desconecta la que lo era
// (Fase 2c): la activa conectada más recientemente, o null. No `updatedAt`:
// renombrar una línea la cambia.
export const nextDefaultLine = (lines, removedLineId) => lines
    .filter(line => line.status === 'active' && !sameId(line._id, removedLineId))
    .sort((a, b) => connectedTime(b) - connectedTime(a))[0] ?? null;

export const LINE_NAME_MAX = 40;

// El nombre interno de una línea («Ventas»), sin espacios de sobra; vacío → null.
export const cleanLineName = (name) => {
    const clean = String(name ?? '').replace(/\s+/g, ' ').trim();
    return clean ? clean : null;
};

/**
 * Por qué línea sale lo que se empieza sin elegirla (una conversación nueva o
 * una campaña), según las líneas a su alcance (Fase 3 de multi-línea).
 * `accessibleLineIds`: las ACTIVAS a las que llega, o `null` si llega a todas.
 * La pedida se devuelve tal cual: su alcance se comprueba después (404).
 * → `{ lineId }` (null = no hay línea por defecto) o `{ error: 'choose_line' | 'no_line' }`.
 */
export const pickSendingLineId = ({ requestedLineId = null, defaultLineId = null, accessibleLineIds = null }) => {
    if (requestedLineId) return { lineId: String(requestedLineId) };
    if (accessibleLineIds === null) return { lineId: defaultLineId ? String(defaultLineId) : null };
    const accessible = accessibleLineIds.map(String);
    if (defaultLineId && accessible.includes(String(defaultLineId))) return { lineId: String(defaultLineId) };
    if (accessible.length === 1) return { lineId: accessible[0] };
    return { error: accessible.length === 0 ? 'no_line' : 'choose_line' };
};

/** Cómo se llama una línea para las personas: su nombre interno, el verificado o su número (como `lineLabel` del frontend). */
export const lineDisplayName = (line) =>
    line?.name || line?.verifiedName || line?.displayPhoneNumber || line?.phoneNumberId || null;
