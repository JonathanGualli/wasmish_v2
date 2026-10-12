// Conversaciones y mensajes: B no ve, no lee, no escribe ni manda archivos en
// la conversación de A. Lo que vigila es el `findOne({ _id, userId })` de cada
// controlador del chat; sin él, cualquier sesión escribiría en la de otro.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    seedAccount, request, assertNoLeak, assertHasOwn, connectWhatsapp, onMeta, metaCalls,
    Contact, Conversation, Line, Message, User, Waba, PNG,
} from './helpers.js';

const { encrypt } = await import('../../src/utils/crypto.js');
const { LINE_DISCONNECTED_MESSAGE } = await import('../../src/utils/whatsapp.line.js');

const a = await seedAccount('A', { seq: 1 });
const b = await seedAccount('B', { seq: 2 });
// La cuenta de los tests de la Fase 2b, preparada aquí y no junto a ellos: un
// `await` de primer nivel entre dos `test()` hace que node:test pueda cerrar el
// archivo (y su `after`, que cierra Mongo) antes de registrar los de abajo.
const d = await seedAccount('D', { seq: 4 });
await connectWhatsapp(d);

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

// Fase 2b: los envíos salen por la línea de la conversación.
const D_NUMBER = `99${d.seq}`;
const currentLineOf = (account) => Line.findOne({ accountId: account.accountId, phoneNumberId: `99${account.seq}` }).lean();

/** Una conversación de `account` con la ventana abierta, en la línea `line`. */
const openConversation = async (account, line, phone) => {
    const contact = await Contact.create({ userId: account.accountId, phone, name: `contacto ${phone}` });
    return Conversation.create({
        userId: account.accountId, contactId: contact._id, contactPhone: phone,
        phoneNumberId: line.phoneNumberId, lineId: line._id, lastInboundAt: new Date(),
    });
};

// Regresión que vigila: una conversación de un número anterior respondía con ese
// número y el token del actual, y quedaba un Message fallido.
test('responder en una conversación de una línea desconectada → 409 sin llamar a Meta', async () => {
    const old = await Line.create({ accountId: d.accountId, phoneNumberId: '8812', status: 'disconnected' });
    const conversation = await openConversation(d, old, '593990002001');
    const calls = metaCalls.length;

    const text = await request(d, 'POST', `/chats/${conversation._id}/messages`, { text: 'hola', temporalId: 't-d' });
    assert.equal(text.status, 409, text.text);
    assert.equal(text.body[0].message, LINE_DISCONNECTED_MESSAGE);
    const template = await request(d, 'POST', `/chats/${conversation._id}/template`, { templateName: d.templateName });
    assert.equal(template.status, 409, template.text);

    assert.equal(metaCalls.length, calls);
    assert.equal(await Message.countDocuments({ conversationId: conversation._id }), 0);
});

test('el envío sale con el número de la línea de la conversación', async () => {
    const conversation = await openConversation(d, await currentLineOf(d), '593990002002');
    onMeta(async (config) => (config.method === 'post' && config.url === `/${D_NUMBER}/messages`
        ? { data: { messages: [{ id: 'wamid.linea' }] } }
        : undefined));
    try {
        const res = await request(d, 'POST', `/chats/${conversation._id}/messages`, { text: 'hola', temporalId: 't-l' });
        assert.equal(res.status, 201, res.text);
        assert.equal(metaCalls.at(-1).url, `/${D_NUMBER}/messages`);
    } finally {
        onMeta(null);
    }
});

// Regresión que vigila (Codex, plan de la 2b): la ventana es de cada línea. Un
// contacto que escribió hace poco a un número anterior no tiene la ventana
// abierta en el actual.
test('ventana por línea: abierta en el número anterior y cerrada en el actual → 409', async () => {
    const e = await seedAccount('E', { seq: 5 });
    await connectWhatsapp(e);
    const old = await Line.create({ accountId: e.accountId, phoneNumberId: '8813', status: 'disconnected' });
    const conversation = await openConversation(e, old, '593990002003');

    const res = await request(e, 'POST', '/chats/messages', { text: 'hola', destinationNumber: conversation.contactPhone });
    assert.equal(res.status, 409, res.text);
    assert.equal(res.body[0].code, 'window_closed');
});

// La reserva: si la proyección no cuadra con `User` (aquí, el token del Waba
// quedó viejo), el envío sale con la conexión de `User`, que es la buena.
test('con la proyección desajustada, el envío sale con el token de User', async () => {
    const conversation = await openConversation(d, await currentLineOf(d), '593990002004');
    await Waba.updateOne({ accountId: d.accountId }, { tokenWhatsapp: encrypt('token-viejo') });
    let authorization = null;
    onMeta(async (config) => {
        if (config.method !== 'post' || config.url !== `/${D_NUMBER}/messages`) return undefined;
        authorization = config.headers?.Authorization;
        return { data: { messages: [{ id: 'wamid.reserva' }] } };
    });
    try {
        const res = await request(d, 'POST', `/chats/${conversation._id}/messages`, { text: 'hola', temporalId: 't-r' });
        assert.equal(res.status, 201, res.text);
        assert.equal(authorization, 'Bearer token-de-pruebas');
    } finally {
        onMeta(null);
    }
});

// Regresión que vigila (Codex, PR #15): con la reserva (cambio de número que la
// proyección no reflejó), la línea es null, y una conversación sin línea de
// OTRO número prestaba su ventana al número nuevo.
test('con la reserva, la ventana de una conversación sin línea de otro número no cuenta', async () => {
    const f = await seedAccount('F', { seq: 6 });
    await connectWhatsapp(f);
    const contact = await Contact.create({ userId: f.accountId, phone: '593990002005', name: 'número viejo' });
    await Conversation.create({
        userId: f.accountId, contactId: contact._id, contactPhone: contact.phone,
        phoneNumberId: '8815', lineId: null, lastInboundAt: new Date(),
    });
    await User.updateOne({ _id: f.userId }, { phoneNumberId: `97${f.seq}` });   // solo User
    const calls = metaCalls.length;

    const res = await request(f, 'POST', '/chats/messages', { text: 'hola', destinationNumber: contact.phone });
    assert.equal(res.status, 409, res.text);
    assert.equal(res.body[0].code, 'window_closed');
    assert.equal(metaCalls.length, calls);
});

// Fase 2b: la conversación nueva puede elegir su línea (la UI lo hará en la 2c).
test('conversación nueva con el lineId de otra cuenta → 404', async () => {
    const foreign = await currentLineOf(d);
    const e = await seedAccount('H', { seq: 8 });
    await connectWhatsapp(e);
    const calls = metaCalls.length;

    const template = await request(e, 'POST', '/chats/template', {
        templateName: e.templateName, destinationNumber: '593990002007', lineId: String(foreign._id),
    });
    assert.equal(template.status, 404, template.text);
    const text = await request(e, 'POST', '/chats/messages', {
        text: 'hola', destinationNumber: '593990002007', lineId: String(foreign._id),
    });
    assert.equal(text.status, 404, text.text);
    assert.equal(metaCalls.length, calls);
});
