// Las líneas de WhatsApp de una cuenta (`Waba` + `Line`). En la Fase 2a de
// multi-línea son una PROYECCIÓN de la conexión que guarda el owner en `User`
// (`tokenWhatsapp`, `phoneNumberId`, `waBusinessId`), que es lo que enruta:
// la escribe `syncLinesFromOwner` y nada lee las líneas para decidir.

import { LINE_NOT_FOUND_MESSAGE } from './whatsapp.line.js';

// Sin distinguir mayúsculas: un ObjectId es hexadecimal, y el que llega en un
// cuerpo (`lineId`) puede venir en mayúsculas.
const sameId = (a, b) => a != null && b != null && String(a).toLowerCase() === String(b).toLowerCase();

// La conexión que dice `User`, o null si le falta alguno de los tres campos.
export const ownerConnection = (owner) => {
    if (!owner?.tokenWhatsapp || !owner?.phoneNumberId || !owner?.waBusinessId) return null;
    return { tokenWhatsapp: owner.tokenWhatsapp, phoneNumberId: owner.phoneNumberId, waBusinessId: owner.waBusinessId };
};

// En qué no coincide la proyección con `User`. Vacío = al día. `lines` son
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

// Si una línea sirve para recibir o enviar (Fase 2b). Mientras `User` sea la
// fuente de la conexión, solo si la proyección coincide con él: la línea
// activa del número del owner, en su cuenta, con su WABA y el token de `User`.
// Si no (una sincronización que falló o se cortó), quien llama usa la reserva
// de `User` en vez de una línea o un token obsoletos.
export const lineMatchesOwner = ({ owner, line, waba }) => {
    const connection = ownerConnection(owner);
    return Boolean(connection && line && waba)
        && line.status === 'active'
        && sameId(line.accountId, owner.accountId)
        && line.phoneNumberId === connection.phoneNumberId
        && sameId(line.wabaId, waba._id)
        && waba.waBusinessId === connection.waBusinessId
        && waba.tokenWhatsapp === connection.tokenWhatsapp;
};

/**
 * Por qué línea sale un envío (Fase 2b): `{ line, fallback }` o `{ issue }`.
 * `line` es un SendingLine: `{ accountId, lineId, phoneNumberId, waBusinessId,
 * tokenWhatsapp }` (token cifrado). `User` sigue siendo la fuente hasta la
 * 2c: decide qué número está conectado. `line` es la `Line` pedida (la de la
 * conversación, o la del número de `User`); `phoneNumberId`, el número de una
 * conversación sin línea.
 *
 * - Sin WhatsApp conectado → `{ issue: 'not_connected' }`.
 * - Otro número que el de `User` → `{ issue: 'disconnected' }`: una conversación
 *   de un número anterior ya no puede responderse desde él.
 * - La proyección cuadra (`lineMatchesOwner`) → la línea y el token de su WABA.
 * - Si no, la reserva: la conexión de `User`, con la línea si existe
 *   (`fallback: true`, quien llama lo deja en el log).
 */
export const sendingLineFor = ({ owner, line, waba, phoneNumberId = null }) => {
    const connection = ownerConnection(owner);
    if (!connection) return { issue: 'not_connected' };

    const wanted = line?.phoneNumberId ?? phoneNumberId ?? connection.phoneNumberId;
    if (wanted !== connection.phoneNumberId) return { issue: 'disconnected' };

    if (lineMatchesOwner({ owner, line, waba })) {
        return {
            line: {
                accountId: owner.accountId, lineId: line._id, phoneNumberId: line.phoneNumberId,
                waBusinessId: waba.waBusinessId, tokenWhatsapp: waba.tokenWhatsapp,
            },
            fallback: false,
        };
    }
    return { line: { accountId: owner.accountId, lineId: line?._id ?? null, ...connection }, fallback: true };
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
