import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeWaPhone, describeShape, describeHistoryChunk, splitThreadMessages, describeHistoryMessage, historySyncView,
    HISTORY_DECLINED_CODE,
} from '../src/utils/history.sync.js';

// Los ejemplos de la referencia del webhook `history` de Meta (2026-10-23).
const BUSINESS = '15550783881';
const CONTACT = '16505551234';
const messageOf = (overrides = {}) => ({
    from: CONTACT, id: 'wamid.historial.1', timestamp: '1739230970', type: 'text', text: { body: 'Hola' },
    history_context: { status: 'READ' }, ...overrides,
});

test('normalizeWaPhone: solo dígitos de 8 a 15', () => {
    assert.equal(normalizeWaPhone('16505551234'), '16505551234');
    assert.equal(normalizeWaPhone('+1 650-555-1234'), '16505551234');
    assert.equal(normalizeWaPhone(16505551234), '16505551234');
    for (const value of [null, undefined, '', 'abc', '1234567', '1234567890123456', 'PE.1000000000000000', {}]) {
        assert.equal(normalizeWaPhone(value), null, String(value));
    }
});

test('describeHistoryChunk: un trozo con dos hilos, con su fase, su orden y su avance como números', () => {
    const chunk = describeHistoryChunk({
        metadata: { phase: '1', chunk_order: '3', progress: '55' },
        threads: [
            { id: CONTACT, messages: [messageOf()] },
            { id: '+593 99 000 1111', messages: [] },
        ],
    });
    assert.equal(chunk.declined, false);
    assert.equal(chunk.phase, 1);
    assert.equal(chunk.chunkOrder, 3);
    assert.equal(chunk.progress, 55);
    assert.deepEqual(chunk.threads.map(thread => thread.contactPhone), [CONTACT, '593990001111']);
    assert.equal(chunk.threads[0].messages.length, 1);
    assert.deepEqual(chunk.skippedThreads, []);
});

test('describeHistoryChunk: el error 2593109 es que el negocio no compartió', () => {
    const item = { errors: [{ code: HISTORY_DECLINED_CODE, title: 'History sync is turned off by the business from the WhatsApp Business App' }] };
    assert.deepEqual(describeHistoryChunk(item), { declined: true });
});

test('describeShape: la forma sin el contenido, para el log', () => {
    assert.equal(describeShape('120363025875043210@g.us'), '9{18}@a.a{2}');
    assert.equal(describeShape('PE.1000000000000000'), 'a{2}.9{16}');
    assert.equal(describeShape('Ñandú 7'), 'a{5} 9');
    assert.deepEqual([undefined, null, 5, {}].map(describeShape), ['undefined', 'null', 'number', 'object']);
});

// Regresión: en la prueba con Meta de verdad saltaron 9 hilos y el log solo
// decía cuántos, sin la forma de su `id` (grupo, BSUID…).
test('describeHistoryChunk: un hilo sin teléfono o sin mensajes se salta, con la forma de su id', () => {
    const chunk = describeHistoryChunk({
        metadata: { phase: 0, chunk_order: 1, progress: 10 },
        threads: [{ id: 'abc', messages: [messageOf()] }, { id: CONTACT }, null, { id: CONTACT, messages: [] }],
    });
    assert.equal(chunk.threads.length, 1);
    assert.deepEqual(chunk.skippedThreads, [
        { id: 'a{3}', mensajes: 1 },
        { id: '9{11}', mensajes: 'undefined' },
        { id: 'undefined', mensajes: 'undefined' },
    ]);
});

test('describeHistoryChunk: sin nada que leer da null; sin metadata, los números en null', () => {
    for (const value of [null, undefined, 'x', {}]) assert.equal(describeHistoryChunk(value), null, String(value));
    const chunk = describeHistoryChunk({ threads: [] });
    assert.deepEqual([chunk.phase, chunk.chunkOrder, chunk.progress], [null, null, null]);
});

test('splitThreadMessages: piezas de 500 mensajes como mucho, en orden', () => {
    const messages = Array.from({ length: 1200 }, (_, i) => messageOf({ id: `wamid.${i}` }));
    const pieces = splitThreadMessages(messages);
    assert.deepEqual(pieces.map(piece => piece.length), [500, 500, 200]);
    assert.equal(pieces[1][0].id, 'wamid.500');
    assert.deepEqual(splitThreadMessages([]), []);
});

test('splitThreadMessages: ninguna pieza pasa del tamaño, y un mensaje que solo ya lo pasa va solo', () => {
    const MB = 1024 * 1024;
    const big = (i) => messageOf({ id: `wamid.${i}`, text: { body: 'x'.repeat(MB) } });
    const pieces = splitThreadMessages(Array.from({ length: 10 }, (_, i) => big(i)), { maxBytes: 4 * MB });
    assert.equal(pieces.flat().length, 10);
    for (const piece of pieces) {
        assert.ok(Buffer.byteLength(JSON.stringify(piece)) <= 4 * MB + 1024, 'una pieza pasa de 4 MB');
    }
    const huge = messageOf({ text: { body: 'x'.repeat(5 * MB) } });
    assert.deepEqual(splitThreadMessages([messageOf(), huge, messageOf()], { maxBytes: 4 * MB }).map(piece => piece.length), [1, 1, 1]);
});

test('describeHistoryMessage: del contacto es entrante y entregado', () => {
    const message = describeHistoryMessage(messageOf(), CONTACT);
    assert.equal(message.waMessageId, 'wamid.historial.1');
    assert.equal(message.direction, 'inbound');
    assert.equal(message.status, 'delivered');
    assert.equal(message.timestamp.getTime(), 1739230970 * 1000);
    assert.equal(message.isPlaceholder, false);
    assert.equal(message.isReaction, false);
});

test('describeHistoryMessage: del negocio es saliente, con el estado de Meta', () => {
    const status = (value) => describeHistoryMessage(messageOf({ from: BUSINESS, history_context: { status: value } }), CONTACT).status;
    assert.equal(describeHistoryMessage(messageOf({ from: BUSINESS }), CONTACT).direction, 'outbound');
    assert.equal(status('PLAYED'), 'read');
    assert.equal(status('READ'), 'read');
    assert.equal(status('DELIVERED'), 'delivered');
    assert.equal(status('SENT'), 'sent');
    assert.equal(status('PENDING'), 'sent');
    assert.equal(status('ERROR'), 'failed');
    assert.equal(status('ALGO_NUEVO'), 'sent');
    assert.equal(describeHistoryMessage(messageOf({ from: BUSINESS, history_context: undefined }), CONTACT).status, 'sent');
});

// Lo que más puede fallar (plan, 2): el `from` del contacto con otro formato no
// puede salir como saliente.
test('describeHistoryMessage: el from del contacto con + y espacios sigue siendo entrante', () => {
    assert.equal(describeHistoryMessage(messageOf({ from: '+1 650-555-1234' }), CONTACT).direction, 'inbound');
});

test('describeHistoryMessage: archivo sin contenido y reacción', () => {
    assert.equal(describeHistoryMessage(messageOf({ type: 'media_placeholder', text: undefined }), CONTACT).isPlaceholder, true);
    assert.equal(describeHistoryMessage(messageOf({ type: 'reaction', reaction: { message_id: 'wamid.x', emoji: '👍' } }), CONTACT).isReaction, true);
});

test('describeHistoryMessage: borrados, ediciones y lo mal formado dan null', () => {
    assert.equal(describeHistoryMessage(messageOf({ type: 'revoke' }), CONTACT), null);
    assert.equal(describeHistoryMessage(messageOf({ type: 'edit' }), CONTACT), null);
    assert.equal(describeHistoryMessage(messageOf({ id: undefined }), CONTACT), null);
    assert.equal(describeHistoryMessage(messageOf({ id: '' }), CONTACT), null);
    assert.equal(describeHistoryMessage(messageOf({ from: undefined }), CONTACT), null, 'sin from no se sabe la dirección');
    assert.equal(describeHistoryMessage(messageOf({ timestamp: 'ayer' }), CONTACT), null, 'sin hora');
    assert.equal(describeHistoryMessage(null, CONTACT), null);
});

// --- historySyncView ---------------------------------------------------------

const CONNECTED = new Date('2026-10-26T12:00:00Z');
const minutes = (n) => new Date(CONNECTED.getTime() + n * 60 * 1000);
const syncOf = (overrides = {}) => ({
    connectionAt: CONNECTED,
    requests: { contacts: { state: 'accepted' }, history: { state: 'accepted' } },
    failedThreads: 0,
    ...overrides,
});
const requests = (contacts, history) => ({ contacts, history });

test('historySyncView: sin historySync, null', () => {
    assert.equal(historySyncView(undefined), null);
    assert.equal(historySyncView(null), null);
});

test('historySyncView: un estado por caso', () => {
    const at = minutes(5);
    const status = (sync, now = at) => historySyncView(sync, now).status;
    assert.equal(status(syncOf({ declined: true, firstChunkAt: at })), 'declined');
    assert.equal(status(syncOf({ firstChunkAt: at, finishedAt: at })), 'done');
    assert.equal(status(syncOf({ firstChunkAt: at, finishedAt: at, failedThreads: 2 })), 'partial');
    assert.equal(status(syncOf({ firstChunkAt: at, progress: 40 })), 'receiving');
    assert.equal(status(syncOf({ requests: requests({ state: 'accepted' }, { state: 'rejected' }) })), 'failed');
    assert.equal(status(syncOf({ requests: requests({ state: 'pending' }, { state: 'pending' }) })), 'pending');
    assert.equal(status(syncOf({ requests: requests({ state: 'accepted' }, { state: 'requesting' }) })), 'pending');
    assert.equal(status(syncOf()), 'requested');
    assert.equal(status(syncOf(), minutes(24 * 60 + 1)), 'none');
});

test('historySyncView: el avance, los hilos fallidos y hasta cuándo se puede reintentar', () => {
    const view = historySyncView(syncOf({ firstChunkAt: minutes(1), progress: 40, failedThreads: 1 }), minutes(5));
    assert.equal(view.progress, 40);
    assert.equal(view.failedThreads, 1);
    assert.equal(view.retryUntil, '2026-10-27T12:00:00.000Z');
    assert.equal(historySyncView(syncOf(), minutes(5)).progress, null);
});

test('historySyncView: un pedido rechazado se reintenta dentro de las 24 h, no después', () => {
    const sync = syncOf({ requests: requests({ state: 'accepted' }, { state: 'rejected', error: { code: 100 } }) });
    assert.deepEqual(historySyncView(sync, minutes(60)).retryable, ['history']);
    assert.equal(historySyncView(sync, minutes(60)).canRetry, true);
    assert.equal(historySyncView(sync, minutes(24 * 60 + 1)).canRetry, false);
});

// Lo que más puede fallar (plan, 4): un pedido a medias no se repite solo; se
// ofrece reintentar a los 30 minutos.
test('historySyncView: un pedido incierto se ofrece reintentar después de 30 minutos', () => {
    const sync = syncOf({ requests: requests({ state: 'accepted' }, { state: 'uncertain', claimedAt: minutes(0) }) });
    assert.equal(historySyncView(sync, minutes(10)).canRetry, false);
    assert.deepEqual(historySyncView(sync, minutes(31)).retryable, ['history']);
});

test('historySyncView: el historial incierto con trozos o con el «no» del negocio no se reintenta', () => {
    const uncertain = { state: 'uncertain', claimedAt: minutes(0) };
    assert.equal(historySyncView(syncOf({ requests: requests({ state: 'accepted' }, uncertain), firstChunkAt: minutes(2) }), minutes(31)).canRetry, false);
    assert.equal(historySyncView(syncOf({ requests: requests({ state: 'accepted' }, uncertain), declined: true }), minutes(31)).canRetry, false);
    // Los contactos inciertos no dependen de los trozos del historial.
    assert.deepEqual(historySyncView(syncOf({ requests: requests(uncertain, { state: 'accepted' }), firstChunkAt: minutes(2) }), minutes(31)).retryable, ['contacts']);
});

test('historySyncView: contactos rechazados con el historial llegando se reintentan solos', () => {
    const sync = syncOf({ requests: requests({ state: 'rejected' }, { state: 'accepted' }), firstChunkAt: minutes(2), progress: 30 });
    const view = historySyncView(sync, minutes(5));
    assert.equal(view.status, 'receiving');
    assert.deepEqual(view.retryable, ['contacts']);
});
