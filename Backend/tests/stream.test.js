// Las conexiones SSE y a quién le llega cada evento (Fase 3 de multi-línea).
import test from 'node:test';
import assert from 'node:assert/strict';
import { addClient, disconnectUser, removeClient, sendToAccount } from '../src/controllers/stream.controller.js';

/** Una respuesta SSE falsa: apunta lo que se le escribe y si se cerró. */
const fakeRes = () => {
    const res = { chunks: [], ended: false };
    res.write = (chunk) => res.chunks.push(chunk);
    res.end = () => { res.ended = true; };
    res.events = () => res.chunks.map(chunk => chunk.split('\n')[0].replace('event: ', ''));
    return res;
};

const owner = { userId: 'owner', accountId: 'acc-1', role: 'owner', lineIds: [] };
const agent = { userId: 'agent', accountId: 'acc-1', role: 'agent', lineIds: ['l1'] };
const other = { userId: 'other', accountId: 'acc-2', role: 'owner', lineIds: [] };

test('sendToAccount: un evento de la línea 2 llega al owner, no al agente de la línea 1 ni a otra cuenta', () => {
    const ownerRes = fakeRes();
    const agentRes = fakeRes();
    const otherRes = fakeRes();
    addClient(owner, ownerRes);
    addClient(agent, agentRes);
    addClient(other, otherRes);
    try {
        sendToAccount('acc-1', 'message_created', { id: 'm2' }, { lineId: 'l2' });
        sendToAccount('acc-1', 'message_created', { id: 'm1' }, { lineId: 'l1' });
        sendToAccount('acc-1', 'contact_updated', { id: 'c1' });
        assert.deepEqual(ownerRes.events(), ['message_created', 'message_created', 'contact_updated']);
        assert.deepEqual(agentRes.events(), ['message_created', 'contact_updated']);
        assert.ok(agentRes.chunks[0].includes('"m1"'));
        assert.deepEqual(otherRes.events(), []);
    } finally {
        removeClient(owner, ownerRes);
        removeClient(agent, agentRes);
        removeClient(other, otherRes);
    }
});

test('disconnectUser: avisa con access_changed y cierra todas las pestañas de esa persona, no las demás', () => {
    const tab1 = fakeRes();
    const tab2 = fakeRes();
    const ownerRes = fakeRes();
    addClient(agent, tab1);
    addClient(agent, tab2);
    addClient(owner, ownerRes);
    try {
        disconnectUser('agent');
        for (const tab of [tab1, tab2]) {
            assert.deepEqual(tab.events(), ['access_changed']);
            assert.equal(tab.ended, true);
        }
        assert.equal(ownerRes.ended, false);
        assert.deepEqual(ownerRes.events(), []);

        sendToAccount('acc-1', 'message_created', { id: 'm1' }, { lineId: 'l1' });
        assert.deepEqual(tab1.events(), ['access_changed'], 'ya no le escribe');
        assert.deepEqual(ownerRes.events(), ['message_created']);
    } finally {
        removeClient(owner, ownerRes);
    }
});
