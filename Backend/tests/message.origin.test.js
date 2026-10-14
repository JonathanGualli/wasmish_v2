import test from 'node:test';
import assert from 'node:assert/strict';
import { messageOrigin, messageSender } from '../src/utils/message.origin.js';

test('messageOrigin: el del mensaje; una campaña, con su nombre si se conoce', () => {
    assert.deepEqual(messageOrigin({ origin: 'chat' }), { kind: 'chat' });
    assert.deepEqual(messageOrigin({ origin: 'api' }), { kind: 'api' });
    const names = new Map([['c1', 'Promo octubre']]);
    assert.deepEqual(messageOrigin({ origin: 'campaign', campaignId: 'c1' }, names), { kind: 'campaign', campaignName: 'Promo octubre' });
    assert.deepEqual(messageOrigin({ origin: 'campaign', campaignId: 'c2' }, names), { kind: 'campaign', campaignName: null });
});

test('messageOrigin: un mensaje anterior al campo con campaña sigue siendo de la campaña; sin nada, null', () => {
    assert.deepEqual(messageOrigin({ campaignId: 'c1' }, new Map([['c1', 'Vieja']])), { kind: 'campaign', campaignName: 'Vieja' });
    assert.equal(messageOrigin({}), null, 'un entrante o un saliente antiguo del chat');
});

test('messageSender: quién lo envió desde el chat, con el nombre copiado al enviarlo', () => {
    assert.deepEqual(messageSender({ sentBy: 'u1', sentByName: 'Ana' }), { id: 'u1', name: 'Ana' });
    assert.deepEqual(messageSender({ sentBy: 'u1' }), { id: 'u1', name: null });
    assert.equal(messageSender({}), null);
});
