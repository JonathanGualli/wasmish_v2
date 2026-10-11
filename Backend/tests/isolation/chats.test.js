// Conversaciones y mensajes: B no ve, no lee, no escribe ni manda archivos en
// la conversación de A. Lo que vigila es el `findOne({ _id, userId })` de cada
// controlador del chat; sin él, cualquier sesión escribiría en la de otro.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seedAccount, request, assertNoLeak, assertHasOwn, Conversation, Message, PNG } from './helpers.js';

const a = await seedAccount('A', { seq: 1 });
const b = await seedAccount('B', { seq: 2 });

const messagesIn = (account) => Message.countDocuments({ conversationId: account.conversationId });
const unreadOf = async (account) => (await Conversation.findById(account.conversationId).lean()).unreadCount;

test('GET /chats: B no ve las conversaciones de A', async () => {
    assertNoLeak(await request(b, 'GET', '/chats'), a);
    assertHasOwn(await request(a, 'GET', '/chats'), a);
});

test('GET /chats/:id/messages: B no lee la de A ni le quita los no leídos', async () => {
    const asB = await request(b, 'GET', `/chats/${a.conversationId}/messages`);
    assert.equal(asB.status, 404);
    assertNoLeak(asB, a);
    // Abrir el chat lo marca como leído: el intento de B no puede hacerlo.
    assert.equal(await unreadOf(a), 3);

    assertHasOwn(await request(a, 'GET', `/chats/${a.conversationId}/messages`), a);
});

test('POST /chats/:id/messages: B no escribe en la de A', async () => {
    const before = await messagesIn(a);
    const asB = await request(b, 'POST', `/chats/${a.conversationId}/messages`, { text: 'hola', temporalId: 't-b' });
    assert.equal(asB.status, 404);
    assert.equal(await messagesIn(a), before);

    // Control: A pasa la comprobación de propiedad y se frena después, en la
    // ventana de 24 h (cerrada desde hace un día), sin llegar a Meta.
    const asA = await request(a, 'POST', `/chats/${a.conversationId}/messages`, { text: 'hola', temporalId: 't-a' });
    assert.equal(asA.status, 409, asA.text);
    assert.equal(asA.body[0].code, 'window_closed');
});

test('POST /chats/messages: B escribe al número de un contacto de A y no usa su conversación', async () => {
    const before = await messagesIn(a);
    const asB = await request(b, 'POST', '/chats/messages', { text: 'hola', destinationNumber: a.phone });
    // Para B ese número no tiene conversación: nunca le escribió.
    assert.equal(asB.status, 409, asB.text);
    assertNoLeak(asB, a);
    assert.equal(await messagesIn(a), before);
});

test('POST /chats/:id/template: B no envía plantillas en la de A', async () => {
    const before = await messagesIn(a);
    const asB = await request(b, 'POST', `/chats/${a.conversationId}/template`, { templateName: b.templateName });
    assert.equal(asB.status, 404);
    assert.equal(await messagesIn(a), before);

    // Control: A llega hasta el envío, que se frena por no tener WhatsApp conectado.
    const asA = await request(a, 'POST', `/chats/${a.conversationId}/template`, { templateName: a.templateName });
    assert.equal(asA.status, 409, asA.text);
});

test('POST /chats/:id/media: B no manda archivos a la de A', async () => {
    const before = await messagesIn(a);
    const headers = { 'Content-Type': 'image/png', 'X-Filename': 'foto.png' };
    const asB = await request(b, 'POST', `/chats/${a.conversationId}/media`, PNG, headers);
    assert.equal(asB.status, 404);
    assert.equal(await messagesIn(a), before);

    const asA = await request(a, 'POST', `/chats/${a.conversationId}/media`, PNG, headers);
    assert.equal(asA.status, 409, asA.text);
});

test('GET /media/:id: B no descarga el adjunto de un mensaje de A', async () => {
    const asB = await request(b, 'GET', `/media/${a.messageId}`);
    // 404 y no 403: un 403 confirmaría que el mensaje existe.
    assert.equal(asB.status, 404);
    assert.ok(!asB.text.includes('PNG'), 'B recibió los bytes del archivo de A');

    const asA = await request(a, 'GET', `/media/${a.messageId}`);
    assert.equal(asA.status, 200, asA.text);
    assert.equal(asA.text.slice(1, 4), 'PNG');
});
