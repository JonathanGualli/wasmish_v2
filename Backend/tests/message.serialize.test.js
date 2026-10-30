import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeMessage } from '../src/utils/message.serialize.js';

const base = {
    _id: 'm1', conversationId: 'c1', sender: 'me', direction: 'outbound', text: 'hola',
    timestamp: new Date('2026-10-29T12:00:00Z'), status: 'sent', waMessageId: 'wamid.1',
};

test('serializeMessage: los ids como texto y las fechas en ISO', () => {
    const out = serializeMessage({ ...base, deliveredAt: new Date('2026-10-29T12:00:05Z') });
    assert.equal(out.id, 'm1');
    assert.equal(out.conversationId, 'c1');
    assert.equal(out.timestamp, '2026-10-29T12:00:00.000Z');
    assert.equal(out.deliveredAt, '2026-10-29T12:00:05.000Z');
    assert.equal(out.readAt, null);
    assert.equal(out.waMessageId, 'wamid.1');
});

test('serializeMessage: un mensaje anterior a los campos sale con sus valores por defecto', () => {
    const out = serializeMessage({ _id: 'm2', conversationId: 'c1', sender: 'them', text: 'viejo', createdAt: new Date('2026-01-01T00:00:00Z') });
    assert.equal(out.type, 'text');
    assert.equal(out.status, 'sent');
    assert.equal(out.timestamp, '2026-01-01T00:00:00.000Z', 'sin timestamp, la fecha de creación');
    assert.equal(out.hasMedia, false);
    assert.equal(out.waMessageId, null);
    assert.equal(out.templateName, null);
    assert.equal(out.replyTo, null);
});

test('serializeMessage: de qué campaña salió, con su nombre si se conoce', () => {
    const msg = { ...base, origin: 'campaign', campaignId: 'k1', templateName: 'promo' };
    assert.deepEqual(serializeMessage(msg, { campaignNames: new Map([['k1', 'Promo octubre']]) }).origin, { kind: 'campaign', campaignName: 'Promo octubre' });
    assert.deepEqual(serializeMessage(msg).origin, { kind: 'campaign', campaignName: null });
    assert.equal(serializeMessage(msg).templateName, 'promo');
});

test('serializeMessage: un saliente no se puede reaccionar', () => {
    assert.equal(serializeMessage(base).canReact, false);
});
