import { EventEmitter } from 'events';

const emitter = new EventEmitter();
const clients = new Map();

// Conexiones SSE abiertas, por cuenta (`accountId` → sus respuestas abiertas).
export const addClient = (accountId, resp) => {
    if (!clients.has(accountId)) clients.set(accountId, new Set());
    clients.get(accountId).add(resp);
}

export const removeClient = (accountId, resp) => {
    const set = clients.get(accountId);
    if(!set) return;
    set.delete(resp);
    if (set.size ===0) clients.delete(accountId);
}

// Un evento a todas las conexiones abiertas de la cuenta.
export const sendToAccount = (accountId, event, data) => { 
    const set = clients.get(accountId);
    if (!set) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of set) {
        try { 
            res.write(payload);
        } catch (_) {}
    }
}; 

export default emitter;
