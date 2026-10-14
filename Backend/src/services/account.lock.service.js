import crypto from 'node:crypto';
import Account from '../models/account.model.js';

const LOCK_MS = 30 * 1000;

/**
 * Ejecuta `fn` con un candado de la cuenta: una operación a la vez por cuenta y
 * por candado (`field`: `lineLock` para las líneas, `teamLock` para el equipo),
 * también entre procesos (lo guarda `Account` en Mongo, sin transacciones).
 * Ocupado → lanza lo que devuelva `onBusy()`. Caduca a los 30 s (o `ttlMs`), por
 * si un proceso muere con él; se suelta solo si sigue siendo suyo.
 */
export const withAccountLock = async (accountId, field, fn, { ttlMs = LOCK_MS, onBusy }) => {
    const token = crypto.randomUUID();
    const now = new Date();
    const taken = await Account.findOneAndUpdate(
        { _id: accountId, $or: [{ [field]: null }, { [`${field}.expiresAt`]: { $lte: now } }] },
        { $set: { [field]: { token, expiresAt: new Date(now.getTime() + ttlMs) } } },
        { projection: { _id: 1 } },
    );
    if (!taken) throw onBusy();
    try {
        return await fn();
    } finally {
        await Account.updateOne({ _id: accountId, [`${field}.token`]: token }, { $set: { [field]: null } });
    }
};
