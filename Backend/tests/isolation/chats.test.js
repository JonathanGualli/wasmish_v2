// Conversaciones y mensajes: B no ve, no lee, no escribe ni manda archivos en
// la conversación de A. Lo que vigila es el `findOne({ _id, userId })` de cada
// controlador del chat; sin él, cualquier sesión escribiría en la de otro.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    seedAccount, seedMember, ANONYMOUS, ApiKey, request, assertNoLeak, assertHasOwn, connectWhatsapp, onMeta, metaCalls,
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

// Fase 2c: el token sale del `Waba` de la línea, que es la fuente. Una copia
// desajustada en `User` (aquí, otro token) no cambia nada.
test('con un User desajustado, el envío sale con el token del Waba de la línea', async () => {
    const conversation = await openConversation(d, await currentLineOf(d), '593990002004');
    await User.updateOne({ _id: d.userId }, { tokenWhatsapp: encrypt('token-de-user') });
    let authorization = null;
    onMeta(async (config) => {
        if (config.method !== 'post' || config.url !== `/${D_NUMBER}/messages`) return undefined;
        authorization = config.headers?.Authorization;
        return { data: { messages: [{ id: 'wamid.waba' }] } };
    });
    try {
        const res = await request(d, 'POST', `/chats/${conversation._id}/messages`, { text: 'hola', temporalId: 't-r' });
        assert.equal(res.status, 201, res.text);
        assert.equal(authorization, 'Bearer token-de-pruebas');
    } finally {
        onMeta(null);
    }
});

// Fase 2c: con dos líneas activas, cada conversación responde desde la suya.
test('cada conversación responde por su línea, con dos líneas activas', async () => {
    const m = await seedAccount('M', { seq: 9, maxLines: 2 });
    await connectWhatsapp(m);
    await connectWhatsapp(m, { phoneNumberId: '9909' });
    const first = await openConversation(m, await currentLineOf(m), '593990002009');
    const second = await openConversation(m, await Line.findOne({ accountId: m.accountId, phoneNumberId: '9909' }).lean(), '593990002010');
    onMeta(async (config) => (config.method === 'post' && config.url.endsWith('/messages')
        ? { data: { messages: [{ id: `wamid.${config.url}` }] } }
        : undefined));
    try {
        for (const [conversation, number] of [[first, `99${m.seq}`], [second, '9909']]) {
            const res = await request(m, 'POST', `/chats/${conversation._id}/messages`, { text: 'hola', temporalId: `t-${number}` });
            assert.equal(res.status, 201, res.text);
            assert.deepEqual(metaCalls.at(-1), { method: 'post', url: `/${number}/messages` });
        }
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

// Fase 2c: la bandeja enseña la línea de cada conversación y filtra por ella.
test('GET /chats devuelve el lineId de cada conversación', async () => {
    const conversation = await openConversation(d, await currentLineOf(d), '593990002011');
    const res = await request(d, 'GET', '/chats');
    assert.equal(res.status, 200, res.text);
    const entry = res.body.find(item => item.id === String(conversation._id));
    assert.equal(entry.lineId, String(conversation.lineId));
    assert.ok(res.body.some(item => item.lineId === null));   // la sembrada, anterior a las líneas
});

// Fase 3: con varias personas en la cuenta, cada mensaje dice quién lo envió
// desde el chat y de dónde salió (chat, campaña o API).
test('quién envió y de dónde salió: el chat lo firma; la API no', async () => {
    const e = await seedAccount('QE', { seq: 30 });
    const { lineId } = await connectWhatsapp(e);
    await Conversation.updateOne({ _id: e.conversationId }, { lineId, lastInboundAt: new Date() });
    const agent = await seedMember(e, { role: 'agent', lineIds: [lineId], label: 'QEA' });
    onMeta(async (config) => (config.method === 'post' && config.url.endsWith('/messages')
        ? { data: { messages: [{ id: `wamid.qe.${Math.random()}` }] } }
        : undefined));
    try {
        const reply = await request(agent, 'POST', `/chats/${e.conversationId}/messages`, { text: 'hola, soy el agente', temporalId: 'q1' });
        assert.equal(reply.status, 201, reply.text);
        assert.deepEqual(reply.body.sentBy, { id: agent.userId, name: 'QEA miembro' });
        assert.deepEqual(reply.body.origin, { kind: 'chat' });

        const template = await request(agent, 'POST', `/chats/${e.conversationId}/template`, { templateName: e.templateName, language: 'es' });
        assert.equal(template.status, 200, template.text);
        const stored = await Message.findById(template.body.id).lean();
        assert.equal(String(stored.sentBy), agent.userId);
        assert.equal(stored.origin, 'chat');

        const list = await request(e, 'GET', `/chats/${e.conversationId}/messages`);
        const mine = list.body.items.find(item => item.id === reply.body.id);
        assert.deepEqual(mine.sentBy, { id: agent.userId, name: 'QEA miembro' });

        const key = 'wm_qe_origen';
        await ApiKey.create({ userId: e.accountId, keyHash: (await import('../../src/utils/crypto.js')).hashApiKey(key), keyPreview: 'wm_', name: 'v1' });
        const viaApi = await request(ANONYMOUS, 'POST', '/v1/templates/send',
            { destinationNumber: e.phone, templateName: e.templateName }, { Authorization: `Bearer ${key}` });
        assert.equal(viaApi.status, 200, viaApi.text);
        const apiMessage = await Message.findOne({ waMessageId: viaApi.body.waMessageId }).lean();
        assert.equal(apiMessage.origin, 'api');
        assert.equal(apiMessage.sentBy ?? null, null);
    } finally {
        onMeta(null);
    }
});

// Mensajes eliminados y editados: recargar la página da lo mismo que llegó en vivo por `message_updated`.
test('GET /chats/:id/messages devuelve el borrado y las ediciones de cada mensaje', async () => {
    const c = await seedAccount('MCL', { seq: 31 });
    const changed = await Message.create({
        conversationId: c.conversationId, direction: 'inbound', sender: 'them', text: 'hola!!', timestamp: new Date(),
        deletedAt: new Date('2026-10-20T10:05:00Z'), editedAt: new Date('2026-10-20T10:02:00Z'), changeVersion: 3,
        previousVersions: [{ text: 'hola', caption: null, editedAt: new Date('2026-10-20T10:00:00Z') }],
    });
    const list = await request(c, 'GET', `/chats/${c.conversationId}/messages`);
    assert.equal(list.status, 200, list.text);
    const item = list.body.items.find(entry => entry.id === String(changed._id));
    assert.equal(item.deletedAt, '2026-10-20T10:05:00.000Z');
    assert.equal(item.editedAt, '2026-10-20T10:02:00.000Z');
    assert.deepEqual(item.previousVersions, [{ text: 'hola', caption: null, editedAt: '2026-10-20T10:00:00.000Z' }]);
    assert.equal(item.changeVersion, 3);

    const plain = list.body.items.find(entry => entry.id === c.messageId);
    assert.equal(plain.deletedAt, null);
    assert.equal(plain.editedAt, null);
    assert.deepEqual(plain.previousVersions, []);
    assert.equal(plain.changeVersion, 0);
});
