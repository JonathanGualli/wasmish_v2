import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveStatusTransition } from '../src/utils/message.status.js';

const T1 = new Date('2026-08-31T10:00:00Z');
const T2 = new Date('2026-08-31T10:00:05Z');

test('sent → delivered avanza y sella deliveredAt', () => {
    const changes = resolveStatusTransition({
        currentStatus: 'sent',
        incomingStatus: 'delivered',
        timestamp: T1,
        hasDeliveredAt: false,
    });

    assert.equal(changes.status, 'delivered');
    assert.equal(changes.deliveredAt, T1);
});

test('delivered → read avanza y sella readAt', () => {
    const changes = resolveStatusTransition({
        currentStatus: 'delivered',
        incomingStatus: 'read',
        timestamp: T2,
        hasDeliveredAt: true,
    });

    assert.equal(changes.status, 'read');
    assert.equal(changes.readAt, T2);
    // Ya tenía deliveredAt: no debe pisarlo
    assert.equal(changes.deliveredAt, undefined);
});

// EL BUG que arreglamos: Meta no garantiza el orden de los webhooks.
test('read → delivered NO retrocede (delivered llega tarde)', () => {
    const changes = resolveStatusTransition({
        currentStatus: 'read',
        incomingStatus: 'delivered',
        timestamp: T2,
        hasDeliveredAt: true,
    });

    assert.equal(changes, null);
});

test('read sin delivered previo infiere deliveredAt', () => {
    const changes = resolveStatusTransition({
        currentStatus: 'sent',
        incomingStatus: 'read',
        timestamp: T1,
        hasDeliveredAt: false,
    });

    assert.equal(changes.status, 'read');
    assert.equal(changes.readAt, T1);
    // Leído implica entregado: sin esto el mensaje se quedaría sin deliveredAt
    // para siempre y la UI no podría mostrar "Entregado a las X"
    assert.equal(changes.deliveredAt, T1);
});

test('un webhook repetido no produce cambios', () => {
    const changes = resolveStatusTransition({
        currentStatus: 'delivered',
        incomingStatus: 'delivered',
        timestamp: T2,
        hasDeliveredAt: true,
    });

    // Sin esto se emitiría un message_status idéntico y un re-render de balde
    assert.equal(changes, null);
});

test('un estado desconocido se ignora', () => {
    const changes = resolveStatusTransition({
        currentStatus: 'sent',
        incomingStatus: 'deleted',
        timestamp: T1,
        hasDeliveredAt: false,
    });

    assert.equal(changes, null);
});

test('failed gana sobre cualquier estado anterior', () => {
    const changes = resolveStatusTransition({
        currentStatus: 'read',
        incomingStatus: 'failed',
        timestamp: T2,
        hasDeliveredAt: true,
    });

    assert.equal(changes.status, 'failed');
    assert.equal(changes.failedAt, T2);
});

test('un mensaje sin status arranca como sent', () => {
    const changes = resolveStatusTransition({
        currentStatus: undefined,
        incomingStatus: 'delivered',
        timestamp: T1,
        hasDeliveredAt: false,
    });

    assert.equal(changes.status, 'delivered');
});
