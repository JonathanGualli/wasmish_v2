// La historia de una conversación con sus mensajes (avisos de la asignación,
// spec § 5.1) y el cursor de la lista de avisos (§ 5.2).
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
    EVENTS_PER_PAGE, NOTIFICATIONS_PER_PAGE, decodeCursor, encodeCursor, eventBounds, eventCutoff,
} from '../src/utils/conversation.events.js';

const at = (minute) => new Date(Date.UTC(2026, 9, 28, 10, minute));
// Del más nuevo al más viejo, como llegan de la BD.
const messages = [{ timestamp: at(50) }, { timestamp: at(40) }, { timestamp: at(30) }];

test('los tamaños de página son los del spec', () => {
    assert.equal(EVENTS_PER_PAGE, 100);
    assert.equal(NOTIFICATIONS_PER_PAGE, 30);
});

test('eventBounds: la primera página llena trae lo más nuevo, hasta el mensaje más viejo de la página', () => {
    assert.deepEqual(eventBounds({ before: null, messages, hasMore: true }), { from: at(30), to: null });
});

test('eventBounds: la primera y única página no tiene límites', () => {
    assert.deepEqual(eventBounds({ before: null, messages, hasMore: false }), { from: null, to: null });
});

test('eventBounds: una intermedia va del mensaje más viejo al cursor', () => {
    assert.deepEqual(eventBounds({ before: at(55), messages, hasMore: true }), { from: at(30), to: at(55) });
});

test('eventBounds: la última trae también lo anterior al primer mensaje', () => {
    assert.deepEqual(eventBounds({ before: at(55), messages, hasMore: false }), { from: null, to: at(55) });
});

test('eventBounds: una página sin mensajes no pone límite de abajo', () => {
    assert.deepEqual(eventBounds({ before: at(55), messages: [], hasMore: false }), { from: null, to: at(55) });
});

// Del más nuevo al más viejo, `count` eventos de un minuto en un minuto.
const events = (count) => Array.from({ length: count }, (_, i) => ({ at: new Date(at(0).getTime() + (count - i) * 60_000) }));

test('eventCutoff: con 100 o menos no se recorta', () => {
    assert.equal(eventCutoff(events(100)), null);
    assert.equal(eventCutoff([]), null);
});

test('eventCutoff: con 101 se recorta en la fecha del evento 100', () => {
    const list = events(101);
    assert.deepEqual(eventCutoff(list), list[99].at);
});

test('eventCutoff: si el 100 y el 101 tienen la misma fecha, esa fecha', () => {
    const list = events(101);
    list[100] = { at: list[99].at };
    assert.deepEqual(eventCutoff(list), list[99].at);
});

test('encodeCursor y decodeCursor: ida y vuelta con la fecha y el id', () => {
    const id = new mongoose.Types.ObjectId();
    const cursor = encodeCursor({ createdAt: at(12), _id: id });
    assert.equal(typeof cursor, 'string');
    const decoded = decodeCursor(cursor);
    assert.deepEqual(decoded.createdAt, at(12));
    assert.equal(String(decoded.id), String(id));
});

test('decodeCursor: lo mal formado es null', () => {
    for (const bad of ['', 'x', 'no-es-fecha_64b000000000000000000001', `${at(1).toISOString()}_noesunid`, `${at(1).toISOString()}`]) {
        assert.equal(decodeCursor(bad), null, bad);
    }
});
