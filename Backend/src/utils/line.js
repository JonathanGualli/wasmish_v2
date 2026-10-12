// Las líneas de WhatsApp de una cuenta (`Waba` + `Line`). En la Fase 2a de
// multi-línea son una PROYECCIÓN de la conexión que guarda el owner en `User`
// (`tokenWhatsapp`, `phoneNumberId`, `waBusinessId`), que es lo que enruta:
// la escribe `syncLinesFromOwner` y nada lee las líneas para decidir.

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

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
