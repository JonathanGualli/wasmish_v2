import { EventEmitter } from 'events';

const emitter = new EventEmitter();
const clients = new Map();

export const addClient = (userId, resp) => {
    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(resp);
}

export const removeClient = (userId, resp) => {
    const set = clients.get(userId);
    if(!set) return;
    set.delete(resp);
    if (set.size ===0) clients.delete(userId);
}

export const sendUser = (userId, event, data) => { 
    const set = clients.get(userId);
    if (!set) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of set) {
        try { 
            res.write(payload);
        } catch (_) {}
    }
}; 

export default emitter;
