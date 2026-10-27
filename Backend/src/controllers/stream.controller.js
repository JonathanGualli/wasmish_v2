import { EventEmitter } from 'events';
import { assignmentEventFor, canReceive } from '../utils/permissions.js';

const emitter = new EventEmitter();
// Conexiones SSE abiertas, por cuenta (`accountId` → sus conexiones). Cada una
// guarda la sesión con la que se abrió: decide qué eventos recibe (Fase 3).
const clients = new Map();

export const addClient = (auth, res) => {
    if (!clients.has(auth.accountId)) clients.set(auth.accountId, new Set());
    clients.get(auth.accountId).add({ auth, res });
}

export const removeClient = (auth, res) => {
    const set = clients.get(auth.accountId);
    if (!set) return;
    for (const client of set) if (client.res === res) set.delete(client);
    if (set.size === 0) clients.delete(auth.accountId);
}

const write = (res, event, data) => {
    try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (_) {}
};

// Un evento a las conexiones de la cuenta que pueden recibirlo (`canReceive`
// con el `meta` del evento: su línea y, si hace falta, el permiso).
export const sendToAccount = (accountId, event, data, meta = {}) => {
    const set = clients.get(accountId);
    if (!set) return;
    for (const { auth, res } of set) {
        if (canReceive(auth, meta)) write(res, event, data);
    }
};

/**
 * Una conversación cambió de manos (Fase 4): `before` y `after` son su
 * `conversationMeta` antes y después. Quien la sigue viendo recibe
 * `conversation_assigned` con `data` (la conversación como la da la lista);
 * quien la pierde, `conversation_revoked { id }`, para quitarla de su caché.
 */
export const sendAssignmentChange = (accountId, data, before, after) => {
    const set = clients.get(accountId);
    if (!set) return;
    for (const { auth, res } of set) {
        const event = assignmentEventFor(auth, before, after);
        if (event === 'conversation_assigned') write(res, event, data);
        else if (event === 'conversation_revoked') write(res, event, { id: data.id });
    }
};

/** Un evento solo a las conexiones de una persona (la respuesta a su solicitud de transferencia). */
export const sendToUser = (accountId, userId, event, data) => {
    const set = clients.get(accountId);
    if (!set) return;
    for (const { auth, res } of set) {
        if (auth.userId === String(userId)) write(res, event, data);
    }
};

/**
 * Cierra todas las conexiones de una persona: la sesión que guardan ya no vale
 * (le cambiaron el rol, las líneas o el estado). Antes de cerrar, `access_changed`:
 * el frontend vacía lo que tiene y vuelve a leer su sesión. El navegador
 * reconecta solo, ya con el acceso nuevo.
 */
export const disconnectUser = (userId) => {
    for (const [accountId, set] of clients) {
        for (const client of set) {
            if (client.auth.userId !== String(userId)) continue;
            write(client.res, 'access_changed', {});
            try { client.res.end(); } catch (_) {}
            set.delete(client);
        }
        if (set.size === 0) clients.delete(accountId);
    }
};

export default emitter;
