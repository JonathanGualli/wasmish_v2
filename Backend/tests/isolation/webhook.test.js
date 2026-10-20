// El webhook no viene de una sesión: la cuenta sale del número (`phone_number_id`)
// y de su owner. Cada test comprueba que lo que llega al número de A se guarda
// y se avisa en la cuenta de A, no en la persona ni en la cuenta de B.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    seedAccount, seedMember, connectWhatsapp, postWebhook, postWebhookBody, postEcho, openStream, recordQueries, onMeta,
    FAKE_MEDIA_URL, PNG, request, pushCalls, Contact, Conversation, Line, Message, User,
} from './helpers.js';

const { disconnectLine } = await import('../../src/services/line.service.js');

const a = await seedAccount('A', { seq: 1 });
const b = await seedAccount('B', { seq: 2 });
await connectWhatsapp(a);
await connectWhatsapp(b);
const A_NUMBER = `99${a.seq}`;

// Fase 3: la cuenta EQ con dos líneas (701 y 702) y un agente solo de la 701.
const team = await seedAccount('EQ', { seq: 40, maxLines: 2 });
const { lineId: team1 } = await connectWhatsapp(team, { phoneNumberId: '701' });
const { lineId: team2 } = await connectWhatsapp(team, { phoneNumberId: '702' });
const agentEq = await seedMember(team, { role: 'agent', lineIds: [team1], label: 'AGEQ' });

const textMessage = (from, body) => ({
    contacts: [{ profile: { name: 'Cliente de prueba' }, wa_id: from }],
    messages: [{ from, id: `wamid.test.${Date.now()}.${Math.random().toString(36).slice(2)}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body } }],
});

// Regresión que vigila: el webhook guardaba con el `_id` del owner, no con su cuenta.
test('un entrante al número de A queda en la cuenta de A', async () => {
    const res = await postWebhook(A_NUMBER, textMessage('593990009999', 'hola desde el webhook'));
    assert.equal(res.status, 200);

    const conversation = await Conversation.findOne({ userId: a.accountId, contactPhone: '593990009999' }).lean();
    assert.ok(conversation, 'el entrante no quedó en la cuenta de A');
    assert.ok(await Message.exists({ conversationId: conversation._id, text: 'hola desde el webhook' }));
    assert.equal(await Conversation.countDocuments({ userId: { $in: [a.userId, b.accountId] }, contactPhone: '593990009999' }), 0);
});

test('el entrante llega por SSE a la sesión de A y no a la de B', async () => {
    const streamA = await openStream(a);
    const streamB = await openStream(b);
    try {
        const text = `sse-${Date.now()}`;
        assert.equal((await postWebhook(A_NUMBER, textMessage('593990009998', text))).status, 200);
        assert.ok(await streamA.waitFor(text, 2000), 'A no recibió el entrante en vivo');
        assert.ok(await streamA.waitFor('event: message_created', 0));
        assert.equal(await streamB.waitFor(text, 300), false, 'B recibió un entrante de A');
    } finally {
        await streamA.close();
        await streamB.close();
    }
});

test('un número que no es de nadie se ignora con 200', async () => {
    const before = await Conversation.countDocuments({});
    assert.equal((await postWebhook('000', textMessage('593990009997', 'nadie'))).status, 200);
    assert.equal(await Conversation.countDocuments({}), before);
});

test('una baja de publicidad (user_preferences) marca al contacto de A, no a los de B', async () => {
    const bBefore = await Contact.countDocuments({ userId: b.accountId, marketingOptOut: true });
    const res = await postWebhook(A_NUMBER, {
        user_preferences: [{
            wa_id: a.phone, detail: 'User requested to stop marketing messages',
            category: 'marketing_messages', value: 'stop', timestamp: Math.floor(Date.now() / 1000),
        }],
    });
    assert.equal(res.status, 200);
    assert.equal((await Contact.findById(a.contactId).lean()).marketingOptOut, true);
    assert.equal(await Contact.countDocuments({ userId: b.accountId, marketingOptOut: true }), bBefore);
});

test('un cambio de número (user_id_update) actualiza el contacto de A y se avisa a A', async () => {
    await Contact.updateOne({ _id: a.contactId }, { waUserId: 'EC.PREVIO' });
    const stream = await openStream(a);
    try {
        const res = await postWebhook(A_NUMBER, {
            user_id_update: [{
                wa_id: '593990007777', detail: 'User id has been updated.',
                user_id: { previous: 'EC.PREVIO', current: 'EC.NUEVO' }, timestamp: String(Math.floor(Date.now() / 1000)),
            }],
        });
        assert.equal(res.status, 200);
        const contact = await Contact.findById(a.contactId).lean();
        assert.equal(contact.waUserId, 'EC.NUEVO');
        assert.equal(contact.phone, '593990007777');
        assert.ok(await stream.waitFor(`"id":"${a.contactId}"`, 2000), 'A no recibió contact_updated');
    } finally {
        await stream.close();
    }
});

test('un estado failed con 131050 de un mensaje de A da de baja a su contacto y se avisa a A', async () => {
    const contact = await Contact.create({ userId: a.accountId, phone: '593990006666', name: 'baja por fallo' });
    const conversation = await Conversation.create({
        userId: a.accountId, contactId: contact._id, contactPhone: contact.phone, phoneNumberId: A_NUMBER,
    });
    const message = await Message.create({
        conversationId: conversation._id, direction: 'outbound', sender: 'me', text: 'promo',
        waMessageId: 'wamid.baja.131050', status: 'sent', timestamp: new Date(),
    });
    const stream = await openStream(a);
    try {
        const res = await postWebhook(A_NUMBER, {
            statuses: [{
                id: 'wamid.baja.131050', status: 'failed', timestamp: String(Math.floor(Date.now() / 1000)),
                recipient_id: contact.phone, errors: [{ code: 131050, title: 'User has stopped marketing messages' }],
            }],
        });
        assert.equal(res.status, 200);
        assert.equal((await Message.findById(message._id).lean()).status, 'failed');
        assert.equal((await Contact.findById(contact._id).lean()).marketingOptOut, true);
        assert.ok(await stream.waitFor('event: message_status', 2000), 'A no recibió message_status');
    } finally {
        await stream.close();
    }
});

// Fase 2a: la conversación nace con la línea de su número (todavía no enruta por ella).
test('una conversación nueva nace con la línea de su número', async () => {
    const line = await Line.findOne({ accountId: a.accountId, phoneNumberId: A_NUMBER }).lean();
    assert.ok(line, 'connectWhatsapp no dejó la línea de A');
    assert.equal((await postWebhook(A_NUMBER, textMessage('593990005555', 'con línea'))).status, 200);
    const conversation = await Conversation.findOne({ userId: a.accountId, contactPhone: '593990005555' }).lean();
    assert.equal(String(conversation.lineId), String(line._id));
});

// Fase 2b: una conversación por contacto y línea.
// Regresión que vigila: antes, el contacto seguía en su conversación del número
// anterior, y la respuesta salía con ese número y el token del nuevo.
test('el contacto con conversación en otro número estrena una conversación en la línea actual', async () => {
    const contact = await Contact.create({ userId: a.accountId, phone: '593990004444', name: 'número anterior' });
    const oldLine = await Line.create({ accountId: a.accountId, phoneNumberId: '8811', status: 'disconnected' });
    const old = await Conversation.create({
        userId: a.accountId, contactId: contact._id, contactPhone: contact.phone, phoneNumberId: '8811',
        lineId: oldLine._id, lastMessage: 'en el número anterior',
    });

    assert.equal((await postWebhook(A_NUMBER, textMessage(contact.phone, 'al número actual'))).status, 200);

    const current = await Line.findOne({ accountId: a.accountId, phoneNumberId: A_NUMBER }).lean();
    const fresh = await Conversation.findOne({ userId: a.accountId, contactId: contact._id, lineId: current._id }).lean();
    assert.ok(fresh, 'no nació la conversación de la línea actual');
    assert.ok(await Message.exists({ conversationId: fresh._id, text: 'al número actual' }));
    assert.equal((await Conversation.findById(old._id).lean()).lastMessage, 'en el número anterior');
});

// Regresión que vigila (Codex, plan de la 2b): un entrante a A2 abría la
// ventana de la conversación de A1 si caía en ella.
test('un entrante a A2 no toca el historial ni la ventana de la conversación de A1', async () => {
    const c = await seedAccount('C', { seq: 3 });
    await connectWhatsapp(c);
    const a1 = await Line.findOne({ accountId: c.accountId, status: 'active' }).lean();
    const contact = await Contact.create({ userId: c.accountId, phone: '593990003333', name: 'dos líneas' });
    const lastInboundAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const inA1 = await Conversation.create({
        userId: c.accountId, contactId: contact._id, contactPhone: contact.phone, phoneNumberId: a1.phoneNumberId,
        lineId: a1._id, lastMessage: 'en A1', lastInboundAt,
    });
    // C pasa al número A2 (con `maxLines: 1`, A1 queda desconectada con su historial).
    await connectWhatsapp(c, { phoneNumberId: '8833' });
    const a2 = await Line.findOne({ accountId: c.accountId, phoneNumberId: '8833' }).lean();

    assert.equal((await postWebhook('8833', textMessage(contact.phone, 'a la línea A2'))).status, 200);

    const after = await Conversation.findById(inA1._id).lean();
    assert.equal(after.lastMessage, 'en A1');
    assert.equal(after.lastInboundAt.getTime(), lastInboundAt.getTime());
    assert.equal(await Message.countDocuments({ conversationId: inA1._id }), 0);
    const inA2 = await Conversation.findOne({ userId: c.accountId, contactId: contact._id, lineId: a2._id }).lean();
    assert.ok(await Message.exists({ conversationId: inA2._id, text: 'a la línea A2' }));
});

// Fase 2c: con dos líneas activas, cada número llega a su línea, en su cuenta.
test('dos líneas activas: cada entrante cae en la conversación de su línea', async () => {
    const m = await seedAccount('M', { seq: 9, maxLines: 2 });
    const { lineId: first } = await connectWhatsapp(m);
    const { lineId: second } = await connectWhatsapp(m, { phoneNumberId: '8839' });

    for (const [number, lineId] of [[`99${m.seq}`, first], ['8839', second]]) {
        assert.equal((await postWebhook(number, textMessage('593990002019', `a ${number}`))).status, 200);
        const conversation = await Conversation.findOne({ userId: m.accountId, lineId }).lean();
        assert.ok(conversation, `no nació la conversación de la línea ${number}`);
        assert.ok(await Message.exists({ conversationId: conversation._id, text: `a ${number}` }));
    }
    assert.equal(await Conversation.countDocuments({ userId: m.accountId, contactPhone: '593990002019' }), 2);
});

// Regresión que vigila (Codex, PR #15): con la reserva, la línea es null, y la
// conversación sin línea de OTRO número del contacto se llevaba el entrante.
test('con la reserva, un entrante no cae en la conversación sin línea de otro número', async () => {
    const g = await seedAccount('G', { seq: 7 });
    await connectWhatsapp(g);
    const contact = await Contact.create({ userId: g.accountId, phone: '593990002006', name: 'sin línea' });
    const old = await Conversation.create({
        userId: g.accountId, contactId: contact._id, contactPhone: contact.phone,
        phoneNumberId: '8816', lineId: null, lastMessage: 'del número viejo',
    });
    await User.updateOne({ _id: g.userId }, { phoneNumberId: '8817' });   // solo User: reserva sin línea

    assert.equal((await postWebhook('8817', textMessage(contact.phone, 'al número nuevo'))).status, 200);

    assert.equal((await Conversation.findById(old._id).lean()).lastMessage, 'del número viejo');
    const fresh = await Conversation.findOne({ userId: g.accountId, contactId: contact._id, phoneNumberId: '8817' }).lean();
    assert.ok(await Message.exists({ conversationId: fresh._id, text: 'al número nuevo' }));
});

// Fase 2b: `from` en la API busca la línea por su número visible, y las líneas
// que creó la migración no lo tienen. Meta lo manda en cada webhook.
test('el webhook guarda el número visible de la línea si no lo tenía', async () => {
    await Line.updateOne({ accountId: a.accountId, phoneNumberId: A_NUMBER }, { displayPhoneNumber: null });
    const value = textMessage('593990002008', 'con número visible');
    const res = await postWebhook(A_NUMBER, { ...value, metadata: { phone_number_id: A_NUMBER, display_phone_number: '15550000991' } });
    assert.equal(res.status, 200);
    assert.equal((await Line.findOne({ accountId: a.accountId, phoneNumberId: A_NUMBER }).lean()).displayPhoneNumber, '15550000991');
});

// Fase 3 (revisión de Codex del plan): lo que entra por una línea, y los acuses
// de sus mensajes, solo llegan a quien ve esa línea.
test('un entrante y un acuse de la línea 702 llegan al owner y no al agente de la 701', async () => {
    const contact = await Contact.create({ userId: team.accountId, phone: '593990007070', name: 'cliente de la 702' });
    const conversation = await Conversation.create({
        userId: team.accountId, contactId: contact._id, contactPhone: contact.phone, phoneNumberId: '702', lineId: team2,
    });
    await Message.create({
        conversationId: conversation._id, direction: 'outbound', sender: 'me', text: 'hola',
        waMessageId: 'wamid.linea.702', status: 'sent', timestamp: new Date(),
    });
    const ownerStream = await openStream(team);
    const agentStream = await openStream(agentEq);
    try {
        assert.equal((await postWebhook('702', {
            statuses: [{ id: 'wamid.linea.702', status: 'delivered', timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: contact.phone }],
        })).status, 200);
        assert.equal((await postWebhook('702', textMessage(contact.phone, 'entrante de la 702'))).status, 200);
        assert.ok(await ownerStream.waitFor('event: message_status', 2000), 'el owner no recibió el acuse');
        assert.ok(await ownerStream.waitFor('entrante de la 702', 2000), 'el owner no recibió el entrante');
        assert.equal(await agentStream.waitFor('event: message_status', 300), false, 'el agente recibió el acuse de otra línea');
        assert.equal(await agentStream.waitFor('entrante de la 702', 300), false, 'el agente recibió el entrante de otra línea');

        assert.equal((await postWebhook('701', textMessage('593990007071', 'entrante de la 701'))).status, 200);
        assert.ok(await agentStream.waitFor('entrante de la 701', 2000), 'el agente no recibió lo de su línea');
    } finally {
        await ownerStream.close();
        await agentStream.close();
    }
});

// Regresión que vigila (revisión de Codex del PR #35): el acuse buscaba el
// mensaje solo por su `waMessageId`. Si el número pasaba de A a B, un acuse
// tardío de un mensaje de A cambiaba ese mensaje y se avisaba a B.
test('un acuse que llega por el número de B no toca un mensaje de A ni se avisa a B', async () => {
    const contact = await Contact.create({ userId: a.accountId, phone: '593990004848', name: 'acuse cruzado' });
    const conversation = await Conversation.create({
        userId: a.accountId, contactId: contact._id, contactPhone: contact.phone, phoneNumberId: A_NUMBER,
    });
    const message = await Message.create({
        conversationId: conversation._id, direction: 'outbound', sender: 'me', text: 'de A',
        waMessageId: 'wamid.cruzado.ab', status: 'sent', timestamp: new Date(),
    });
    const stream = await openStream(b);
    try {
        const res = await postWebhook(`99${b.seq}`, {
            statuses: [{ id: 'wamid.cruzado.ab', status: 'read', timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: contact.phone }],
        });
        assert.equal(res.status, 200);
        assert.equal((await Message.findById(message._id).lean()).status, 'sent');
        assert.equal(await stream.waitFor('wamid.cruzado.ab', 300), false, 'B recibió el acuse de un mensaje de A');
    } finally {
        await stream.close();
    }
});


// --- Coexistencia: lo que el negocio responde desde la app de WhatsApp Business ---

const nowSeconds = () => Math.floor(Date.now() / 1000);
let echoSeq = 0;
const echoOf = ({ to, body = 'Respondido desde la app', ts = nowSeconds(), id = `wamid.eco.${Date.now()}.${++echoSeq}`, ...rest } = {}) =>
    ({ from: '15550000001', to, id, timestamp: String(ts), type: 'text', text: { body }, ...rest });
const inboundAt = (from, body, ts) => ({
    contacts: [{ profile: { name: 'Cliente de prueba' }, wa_id: from }],
    messages: [{ from, id: `wamid.in.${Date.now()}.${++echoSeq}`, timestamp: String(ts), type: 'text', text: { body } }],
});
const conversationOf = (account, phone) => Conversation.findOne({ userId: account.accountId, contactPhone: phone }).lean();
const pauseWrites = (log) => log.filter(entry => entry.collection === 'conversations'
    && entry.doc?.$set?.['bot.humanRepliedAt'] !== undefined).length;

test('eco a un contacto nuevo: crea el contacto y la conversación, sin abrir la ventana', async () => {
    const ts = nowSeconds();
    const res = await postEcho(A_NUMBER, [echoOf({ to: '593990007001', body: 'Hola, te escribo desde la app', ts })]);
    assert.equal(res.status, 200);
    assert.ok(await Contact.exists({ userId: a.accountId, phone: '593990007001' }));
    const conversation = await conversationOf(a, '593990007001');
    assert.ok(conversation);
    assert.equal(conversation.lastMessage, 'Hola, te escribo desde la app');
    assert.equal(conversation.lastMessageAt.getTime(), ts * 1000);
    assert.equal(conversation.lastInboundAt ?? null, null, 'responder desde la app no abre la ventana');
    const message = await Message.findOne({ conversationId: conversation._id }).lean();
    assert.equal(message.direction, 'outbound');
    assert.equal(message.sender, 'me');
    assert.equal(message.origin, 'businessApp');
    assert.equal(message.sentBy ?? null, null);
});

test('eco con foto: se guarda con su archivo', async () => {
    onMeta(async (config) => (config.url === '/7001001'
        ? { data: { url: FAKE_MEDIA_URL, mime_type: 'image/png', file_size: 12 } } : undefined));
    const res = await postEcho(A_NUMBER, [echoOf({ to: '593990007002', type: 'image', text: undefined, image: { id: '7001001', mime_type: 'image/png', caption: 'El horario' } })]);
    onMeta(null);
    assert.equal(res.status, 200);
    const message = await Message.findOne({ conversationId: (await conversationOf(a, '593990007002'))._id }).lean();
    assert.equal(message.text, 'El horario');
    assert.ok(message.mediaFile, 'el eco con foto no guardó el archivo');
});

// Regresión que vigila: dos entregas a la vez del mismo eco pausaban al bot dos veces.
test('dos entregas simultáneas del mismo eco: un mensaje, una pausa y un solo SSE de cada tipo', async () => {
    const stream = await openStream(a);
    try {
        const echo = echoOf({ to: '593990007003' });
        const log = await recordQueries(() => Promise.all([postEcho(A_NUMBER, [echo]), postEcho(A_NUMBER, [echo])]));
        assert.equal(await Message.countDocuments({ waMessageId: echo.id }), 1);
        assert.equal(pauseWrites(log), 1, 'el bot se pausó más de una vez');
        assert.ok(await stream.waitFor('event: conversation_updated', 2000));
        await new Promise(resolve => setTimeout(resolve, 200));
        assert.equal(stream.count('event: message_created'), 1);
        assert.equal(stream.count('event: conversation_updated'), 1);
    } finally {
        await stream.close();
    }
});

test('un eco con el id de un mensaje ya enviado desde Wasmish no crea otro ni pausa', async () => {
    await postEcho(A_NUMBER, [echoOf({ to: '593990007004' })]);
    const conversation = await conversationOf(a, '593990007004');
    await Message.create({ conversationId: conversation._id, direction: 'outbound', sender: 'me', waMessageId: 'wamid.ya.enviado', text: 'Desde Wasmish', origin: 'chat' });
    const log = await recordQueries(() => postEcho(A_NUMBER, [echoOf({ to: '593990007004', id: 'wamid.ya.enviado' })]));
    assert.equal(await Message.countDocuments({ waMessageId: 'wamid.ya.enviado' }), 1);
    assert.equal(pauseWrites(log), 0);
});

test('no leídos: el eco los pone en cero salvo que haya un entrante más nuevo; la vista previa no retrocede', async () => {
    const t = nowSeconds();
    // Entrantes anteriores al eco → en cero.
    await postWebhook(A_NUMBER, inboundAt('593990007005', 'uno', t - 120));
    await postWebhook(A_NUMBER, inboundAt('593990007005', 'dos', t - 60));
    await postEcho(A_NUMBER, [echoOf({ to: '593990007005', ts: t })]);
    assert.equal((await conversationOf(a, '593990007005')).unreadCount, 0);

    // Un entrante posterior al eco → se conserva el contador, y el eco viejo no cambia la vista previa.
    await postWebhook(A_NUMBER, inboundAt('593990007006', 'uno', t - 60));
    await postWebhook(A_NUMBER, inboundAt('593990007006', 'después', t + 60));
    await postEcho(A_NUMBER, [echoOf({ to: '593990007006', body: 'respuesta vieja', ts: t })]);
    const conversation = await conversationOf(a, '593990007006');
    assert.equal(conversation.unreadCount, 2);
    assert.equal(conversation.lastMessage, 'después');
});

test('ediciones y eliminaciones desde la app: nada guardado, 200', async () => {
    const res = await postEcho(A_NUMBER, [
        echoOf({ to: '593990007007', type: 'edit', text: undefined, edit: {} }),
        echoOf({ to: '593990007007', type: 'revoke', text: undefined, revoke: {} }),
    ]);
    assert.equal(res.status, 200);
    assert.equal(await Contact.exists({ userId: a.accountId, phone: '593990007007' }), null);
});

test('el eco llega por SSE a A, no a B, y en la cuenta EQ no al agente sin acceso a esa línea', async () => {
    const streamA = await openStream(a);
    const streamB = await openStream(b);
    const ownerEq = await openStream(team);
    const agentStream = await openStream(agentEq);
    try {
        const body = `eco-sse-${Date.now()}`;
        await postEcho(A_NUMBER, [echoOf({ to: '593990007008', body })]);
        assert.ok(await streamA.waitFor(body, 2000));
        assert.ok(await streamA.waitFor('event: conversation_updated', 1000));
        assert.equal(await streamB.waitFor(body, 300), false);

        const bodyEq = `eco-eq-${Date.now()}`;
        await postEcho('702', [echoOf({ to: '593990007009', body: bodyEq })]);
        assert.ok(await ownerEq.waitFor(bodyEq, 2000));
        assert.equal(await agentStream.waitFor(bodyEq, 300), false, 'el agente sin acceso a la línea 702 vio el eco');
    } finally {
        await Promise.all([streamA.close(), streamB.close(), ownerEq.close(), agentStream.close()]);
    }
});

test('un eco anterior a la conexión de la línea: nada guardado', async () => {
    const line = await Line.findOne({ accountId: a.accountId, phoneNumberId: A_NUMBER }).lean();
    const ts = Math.floor(line.connectedAt.getTime() / 1000) - 3600;
    await postEcho(A_NUMBER, [echoOf({ to: '593990007010', ts })]);
    assert.equal(await Contact.exists({ userId: a.accountId, phone: '593990007010' }), null);
});

// Regresión que vigila: un número que pasó a otra cuenta recibía ahí un eco viejo de la anterior.
test('un número que pasó de una cuenta a otra: un eco anterior a la conexión nueva no entra en ninguna', async () => {
    const c = await seedAccount('EC', { seq: 61 });
    const d = await seedAccount('ED', { seq: 62 });
    const { lineId } = await connectWhatsapp(c, { phoneNumberId: '761' });
    const before = nowSeconds() - 30;
    await disconnectLine(c.accountId, lineId);
    await connectWhatsapp(d, { phoneNumberId: '761' });
    await postEcho('761', [echoOf({ to: '593990007011', ts: before })]);
    assert.equal(await Contact.exists({ userId: { $in: [c.accountId, d.accountId] }, phone: '593990007011' }), null);
});

test('un eco roto en un lote con un entrante: el entrante se guarda y la respuesta es 200', async () => {
    const res = await postWebhookBody({ entry: [{ changes: [{ value: {
        metadata: { phone_number_id: A_NUMBER },
        ...inboundAt('593990007012', 'el entrante del lote', nowSeconds()),
        message_echoes: [null, { id: 'wamid.sin.destino' }],
    } }] }] });
    assert.equal(res.status, 200);
    assert.ok(await Message.exists({ text: 'el entrante del lote' }));
});

// --- Coexistencia: los ecos a quien tiene nombre de usuario (2026-10-19) ---
// Alguien con nombre de usuario escribe y Meta manda solo su BSUID. El eco de la
// respuesta trae su BSUID en `to_user_id`, y `to` (el teléfono) solo si Meta
// puede compartirlo. Wasmish ignoraba `to_user_id`: sin `to`, el eco se perdía;
// con `to`, creaba otro contacto.

const bsuidOnly = (waUserId, body, ts = nowSeconds()) => ({
    contacts: [{ profile: { name: 'Albert' }, user_id: waUserId, username: 'albert' }],
    messages: [{ from_user_id: waUserId, id: `wamid.bsuid.${Date.now()}.${++echoSeq}`, timestamp: String(ts), type: 'text', text: { body } }],
});
// Regresión que vigila: los ecos sin `to` se descartaban en silencio.
test('eco solo con BSUID (to_user_id, sin to): cae en la conversación de su contacto', async () => {
    const waUserId = 'CO.9000000000009001';
    await postWebhook(A_NUMBER, bsuidOnly(waUserId, 'Hola', nowSeconds() - 5));
    const contact = await Contact.findOne({ userId: a.accountId, waUserId }).lean();
    const res = await postEcho(A_NUMBER, [echoOf({ to: undefined, to_user_id: waUserId, body: 'Respondido desde el teléfono' })]);
    assert.equal(res.status, 200);
    const echo = await Message.findOne({ text: 'Respondido desde el teléfono' }).lean();
    assert.ok(echo, 'el eco sin teléfono se perdió');
    const conversation = await Conversation.findById(echo.conversationId).lean();
    assert.equal(String(conversation.contactId), String(contact._id));
    assert.equal(await Contact.countDocuments({ userId: a.accountId, waUserId }), 1);
});

// Regresión que vigila: el eco con teléfono y BSUID creaba otro contacto por el teléfono.
test('eco con teléfono y BSUID: cae en el contacto del BSUID, que se queda con el teléfono', async () => {
    const phone = '573990009002';
    const waUserId = 'CO.9000000000009002';
    await postWebhook(A_NUMBER, bsuidOnly(waUserId, 'Hola', nowSeconds() - 5));
    const contact = await Contact.findOne({ userId: a.accountId, waUserId }).lean();
    await postEcho(A_NUMBER, [echoOf({ to: phone, to_user_id: waUserId, body: 'Te respondo desde la app' })]);
    const echo = await Message.findOne({ text: 'Te respondo desde la app' }).lean();
    assert.equal(String((await Conversation.findById(echo.conversationId).lean()).contactId), String(contact._id));
    assert.equal((await Contact.findById(contact._id).lean()).phone, phone);
    assert.equal(await Contact.countDocuments({ userId: a.accountId, phone }), 1);
});

// --- Mensajes eliminados y editados (coexistencia) --------------------------

// Una cuenta con el bot encendido y un dispositivo con avisos: sin las dos cosas, comprobar que un cambio
// no avisa ni despierta al bot no probaría nada (revisión de Codex del plan, 3).
const changes = await seedAccount('MW', { seq: 64 });
await connectWhatsapp(changes, { phoneNumberId: '764' });
const MW_NUMBER = '764';
const day = (ranges) => ({ closed: ranges.length === 0, ranges });
const week = day([{ start: '00:00', end: '23:59' }]);
assert.equal((await request(changes, 'PUT', '/auto-replies', {
    enabled: true, timezone: 'America/Guayaquil', handoffHours: 12,
    welcome: { enabled: true, text: '¡Hola!', returnAfterDays: 30 },
    outOfHours: { enabled: false, text: '', schedule: { mon: week, tue: week, wed: week, thu: week, fri: week, sat: week, sun: week } },
    keywordRules: [],
})).status, 200);
assert.equal((await request(changes, 'POST', '/push/subscriptions', {
    endpoint: 'https://fcm.googleapis.com/fcm/send/prueba-cambios', keys: { p256dh: 'BPcl4Zx-clave-publica-de-pruebas', auth: 'secreto-auth' },
})).status, 200);

/** Espera (el push no se espera en el webhook) hasta que se cumple `predicate`, o `ms`. */
const eventually = async (predicate, ms = 1000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
        if (await predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    return Boolean(await predicate());
};
const changeOf = (from, type, body, extra = {}) => ({
    contacts: [{ profile: { name: 'Cliente de prueba' }, wa_id: from }],
    messages: [{ from, id: `wamid.cambio.${Date.now()}.${++echoSeq}`, timestamp: String(nowSeconds()), type, [type]: body, ...extra }],
});
const botJobs = () => Message.countDocuments({ bot: { $exists: true } });

test('un borrado y una edición del contacto marcan el original sin contar como mensaje nuevo', async () => {
    const from = '593990006401';
    // Control: un entrante normal sí despierta al bot y sí avisa.
    const pushesBefore = pushCalls.length;
    const jobsBefore = await botJobs();
    await postWebhook(MW_NUMBER, textMessage(from, 'quiero el precio'));
    assert.ok(await eventually(() => pushCalls.length > pushesBefore), 'el control no avisó por push');
    assert.equal(await botJobs(), jobsBefore + 1, 'el control no creó trabajo del bot');

    const original = await Message.findOne({ text: 'quiero el precio' }).lean();
    const conversationBefore = await Conversation.findById(original.conversationId).lean();
    const messagesBefore = await Message.countDocuments({ conversationId: original.conversationId });
    const pushesAfterControl = pushCalls.length;

    const editedRes = await postWebhook(MW_NUMBER, changeOf(from, 'edit', {
        original_message_id: original.waMessageId, message: { type: 'text', text: { body: 'quiero el precio, por favor' } },
    }));
    assert.equal(editedRes.status, 200);
    await postWebhook(MW_NUMBER, changeOf(from, 'revoke', { original_message_id: original.waMessageId }));
    // Mal formados: tampoco son mensajes nuevos.
    await postWebhook(MW_NUMBER, changeOf(from, 'edit', { original_message_id: original.waMessageId }));
    await postWebhook(MW_NUMBER, changeOf(from, 'revoke', {}));

    const saved = await Message.findById(original._id).lean();
    assert.equal(saved.text, 'quiero el precio, por favor');
    assert.ok(saved.deletedAt);
    assert.equal(await Message.countDocuments({ conversationId: original.conversationId }), messagesBefore);
    const conversation = await Conversation.findById(original.conversationId).lean();
    assert.equal(conversation.unreadCount, conversationBefore.unreadCount);
    assert.equal(conversation.lastInboundAt.getTime(), conversationBefore.lastInboundAt.getTime());
    assert.equal(conversation.lastMessage, 'Mensaje eliminado');
    assert.equal(await botJobs(), jobsBefore + 1, 'un cambio creó trabajo del bot');
    assert.equal(await eventually(() => pushCalls.length > pushesAfterControl, 300), false, 'un cambio avisó por push');
});

test('un borrado y una edición desde la app (eco) marcan el saliente sin pausar al bot', async () => {
    const to = '593990006402';
    await postEcho(MW_NUMBER, [echoOf({ to, body: 'Cuesta $10' })]);
    const original = await Message.findOne({ text: 'Cuesta $10', origin: 'businessApp' }).lean();
    const messagesBefore = await Message.countDocuments({ conversationId: original.conversationId });

    const log = await recordQueries(() => postEcho(MW_NUMBER, [
        echoOf({ to, type: 'edit', text: undefined, edit: { original_message_id: original.waMessageId, message: { type: 'text', text: { body: 'Cuesta $12' } } } }),
        echoOf({ to, type: 'revoke', text: undefined, revoke: { original_message_id: original.waMessageId } }),
        echoOf({ to, type: 'edit', text: undefined, edit: { original_message_id: original.waMessageId } }),
    ]));
    assert.equal(pauseWrites(log), 0, 'un cambio desde la app pausó al bot');

    const saved = await Message.findById(original._id).lean();
    assert.equal(saved.text, 'Cuesta $12');
    assert.ok(saved.deletedAt);
    assert.equal(await Message.countDocuments({ conversationId: original.conversationId }), messagesBefore);
});

// Regresión que vigila: el 2026-10-20 un texto llegó como `unsupported` (coexistencia) y el motivo de Meta
// no quedó en ningún sitio. Ahora va al log, con el subtipo, el código y el título; nunca el contenido.
test('un entrante que Meta no entregó deja su motivo en el log, sin el contenido', async () => {
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => { warnings.push(args); };
    const id = `wamid.unsupported.${Date.now()}`;
    try {
        const res = await postWebhook(A_NUMBER, {
            contacts: [{ profile: { name: 'Cliente de prueba' }, wa_id: '593990006501' }],
            messages: [{
                from: '593990006501', id, timestamp: String(nowSeconds()), type: 'unsupported',
                errors: [{ code: 131060, title: 'This message is currently unavailable', message: 'secreto del cliente', error_data: { details: 'secreto del cliente' } }],
                unsupported: { type: 'text' },
            }],
        });
        assert.equal(res.status, 200);
    } finally {
        console.warn = originalWarn;
    }
    const logged = warnings.find(([label]) => String(label).includes('Meta no entregó'));
    assert.ok(logged, 'no se registró el motivo');
    assert.deepEqual(logged[1], { waMessageId: id, subtype: 'text', errors: [{ code: 131060, title: 'This message is currently unavailable' }] });
    assert.ok(!JSON.stringify(warnings).includes('secreto del cliente'), 'el log trae el contenido');
    assert.equal((await Message.findOne({ waMessageId: id }).lean()).text, 'Mensaje no compatible', 'el mensaje se guarda igual');
});

// --- Citas, reenvíos y reacciones (spec 2026-10-20-citas-reacciones) --------

const reactionOf = (from, targetWaMessageId, emoji) => ({
    contacts: [{ profile: { name: 'Cliente de prueba' }, wa_id: from }],
    messages: [{
        from, id: `wamid.reaccion.${Date.now()}.${++echoSeq}`, timestamp: String(nowSeconds()), type: 'reaction',
        reaction: emoji === undefined ? { message_id: targetWaMessageId } : { message_id: targetWaMessageId, emoji },
    }],
});
const withContext = (payload, context) => ({ ...payload, messages: [{ ...payload.messages[0], context }] });

test('una reacción del contacto se pega a su mensaje: sin mensaje nuevo, sin no leído, sin push ni bot', async () => {
    const from = '593990006601';
    await postEcho(MW_NUMBER, [echoOf({ to: from, body: 'Te paso la cotización' })]);
    const original = await Message.findOne({ text: 'Te paso la cotización', origin: 'businessApp' }).lean();
    const before = await Conversation.findById(original.conversationId).lean();
    const messagesBefore = await Message.countDocuments({ conversationId: original.conversationId });
    const pushesBefore = pushCalls.length;
    const jobsBefore = await botJobs();

    assert.equal((await postWebhook(MW_NUMBER, reactionOf(from, original.waMessageId, '👍'))).status, 200);

    assert.equal((await Message.findById(original._id).lean()).reactions.them.emoji, '👍');
    assert.equal(await Message.countDocuments({ conversationId: original.conversationId }), messagesBefore);
    const after = await Conversation.findById(original.conversationId).lean();
    assert.equal(after.unreadCount, before.unreadCount);
    assert.equal(after.lastInboundAt ?? null, before.lastInboundAt ?? null);
    assert.equal(after.lastMessage, 'Reaccionó 👍 a: «Te paso la cotización»');
    assert.equal(await botJobs(), jobsBefore);
    assert.equal(await eventually(() => pushCalls.length > pushesBefore, 300), false, 'una reacción avisó por push');
});

test('una reacción a un mensaje que no está: mensaje suelto sin no leído ni push; quitarla no guarda nada', async () => {
    const from = '593990006602';
    const pushesBefore = pushCalls.length;
    const payload = reactionOf(from, 'wamid.que.no.existe', '❤️');
    assert.equal((await postWebhook(MW_NUMBER, payload)).status, 200);
    assert.equal((await postWebhook(MW_NUMBER, payload)).status, 200, 'Meta reintenta');

    const contact = await Contact.findOne({ userId: changes.accountId, phone: from }).lean();
    const conversation = await Conversation.findOne({ userId: changes.accountId, contactId: contact._id }).lean();
    const loose = await Message.find({ conversationId: conversation._id }).lean();
    assert.equal(loose.length, 1, 'el reintento lo duplicó');
    assert.equal(loose[0].type, 'reaction');
    assert.equal(loose[0].text, 'Reaccionó con ❤️');
    assert.equal(conversation.unreadCount ?? 0, 0);
    assert.equal(conversation.lastInboundAt ?? null, null);
    assert.equal(conversation.lastMessage, 'Reaccionó con ❤️');
    assert.equal(await eventually(() => pushCalls.length > pushesBefore, 300), false, 'avisó por push');

    await postWebhook(MW_NUMBER, reactionOf(from, 'wamid.otro.que.no.existe', undefined));
    assert.equal(await Message.countDocuments({ conversationId: conversation._id }), 1);
});

// Revisión de Codex del plan, 1: sin `lastInboundAt`, el envío buscaba el último
// entrante y una reacción suelta le abría la ventana de 24 h.
test('una reacción suelta no abre la ventana de 24 h, tampoco sin lastInboundAt', async () => {
    const from = '593990006603';
    await postWebhook(MW_NUMBER, reactionOf(from, 'wamid.tampoco.existe', '👍'));
    const contact = await Contact.findOne({ userId: changes.accountId, phone: from }).lean();
    const conversation = await Conversation.findOne({ userId: changes.accountId, contactId: contact._id }).lean();
    await Conversation.updateOne({ _id: conversation._id }, { $unset: { lastInboundAt: '' } });

    const text = await request(changes, 'POST', `/chats/${conversation._id}/messages`, { text: 'hola', temporalId: 't1' });
    assert.equal(text.status, 409, text.text);
    const file = await request(changes, 'POST', `/chats/${conversation._id}/media`, PNG, { 'Content-Type': 'image/png', 'X-Filename': 'f.png' });
    assert.equal(file.status, 409, file.text);
});

test('una cita del contacto: a qué responde, solo si es de su conversación', async () => {
    const from = '593990006604';
    await postEcho(MW_NUMBER, [echoOf({ to: from, body: 'Tarjetas: $20' })]);
    const quoted = await Message.findOne({ text: 'Tarjetas: $20' }).lean();
    // Un mensaje de OTRA conversación de la misma cuenta.
    await postEcho(MW_NUMBER, [echoOf({ to: '593990006699', body: 'de otro contacto' })]);
    const foreign = await Message.findOne({ text: 'de otro contacto' }).lean();

    const stream = await openStream(changes);
    try {
        await postWebhook(MW_NUMBER, withContext(textMessage(from, 'este'), { from: '15550000001', id: quoted.waMessageId }));
        assert.ok(await stream.waitFor(`"replyTo":{"id":"${quoted._id}"`, 2000), 'el message_created no trae la cita');
    } finally {
        await stream.close();
    }
    const reply = await Message.findOne({ text: 'este', conversationId: quoted.conversationId }).lean();
    assert.equal(reply.replyTo.waMessageId, quoted.waMessageId);
    assert.equal(String(reply.replyTo.messageId), String(quoted._id));

    await postWebhook(MW_NUMBER, withContext(textMessage(from, 'ese otro'), { id: foreign.waMessageId }));
    const crossed = await Message.findOne({ text: 'ese otro' }).lean();
    assert.equal(crossed.replyTo.messageId, null, 'enlazó un mensaje de otra conversación');

    // La lista trae el resumen del citado, leído al servir.
    await Message.updateOne({ _id: quoted._id }, { $set: { deletedAt: new Date() } });
    const list = await request(changes, 'GET', `/chats/${quoted.conversationId}/messages`);
    const listed = list.body.items.find(item => item.id === String(reply._id));
    assert.deepEqual(listed.replyTo, {
        id: String(quoted._id), sender: 'me', type: 'text', text: 'Tarjetas: $20', hasMedia: false, deleted: true,
        sentBy: null, origin: 'businessApp',
    });
    assert.equal(list.body.items.find(item => item.id === String(crossed._id)).replyTo.id, null);
});

test('un reenvío muchas veces queda marcado', async () => {
    await postWebhook(MW_NUMBER, withContext(textMessage('593990006605', 'cadena'), { forwarded: true, frequently_forwarded: true }));
    assert.equal((await Message.findOne({ text: 'cadena' }).lean()).forwarded, 'many');
});

test('una reacción y una cita desde la app (eco): se pegan sin pausar al bot', async () => {
    const to = '593990006606';
    await postWebhook(MW_NUMBER, textMessage(to, 'gracias por todo'));
    const inbound = await Message.findOne({ text: 'gracias por todo' }).lean();
    const messagesBefore = await Message.countDocuments({ conversationId: inbound.conversationId });

    const log = await recordQueries(() => postEcho(MW_NUMBER, [
        echoOf({ to, type: 'reaction', text: undefined, reaction: { message_id: inbound.waMessageId, emoji: '❤️' } }),
    ]));
    assert.equal(pauseWrites(log), 0, 'una reacción desde la app pausó al bot');
    const saved = await Message.findById(inbound._id).lean();
    assert.equal(saved.reactions.me.emoji, '❤️');
    assert.equal(saved.reactions.me.origin, 'businessApp');
    assert.equal(await Message.countDocuments({ conversationId: inbound.conversationId }), messagesBefore);

    await postEcho(MW_NUMBER, [echoOf({ to, body: 'de nada', context: { id: inbound.waMessageId } })]);
    const reply = await Message.findOne({ text: 'de nada' }).lean();
    assert.equal(String(reply.replyTo.messageId), String(inbound._id));
});

test('el acuse failed de una reacción nuestra la marca a ella, nunca al mensaje', async () => {
    const to = '593990006607';
    await postWebhook(MW_NUMBER, textMessage(to, 'me reaccionan'));
    const inbound = await Message.findOne({ text: 'me reaccionan' }).lean();
    const reactionId = `wamid.mireaccion.${Date.now()}`;
    await Message.updateOne({ _id: inbound._id }, { $set: { 'reactions.me': {
        emoji: '👍', previousEmoji: null, at: new Date(), waMessageId: reactionId, status: 'sent', origin: 'chat',
    } } });
    const failed = (id) => ({ statuses: [{
        id, status: 'failed', timestamp: String(nowSeconds()), recipient_id: to,
        errors: [{ code: 131009, title: 'Parameter value is not valid', error_data: { details: 'Message is too old' } }],
    }] });

    const log = await recordQueries(() => postWebhook(MW_NUMBER, failed(reactionId)));
    const lookup = log.find(entry => entry.collection === 'messages' && JSON.stringify(entry.query).includes('reactions.me.waMessageId'));
    assert.ok(lookup && JSON.stringify(lookup.query).includes('$type'), 'la búsqueda no lleva el predicado del índice');

    // Revisión de Codex del plan, 2: el $set escribía `status` y `errorCode` del mensaje.
    const saved = await Message.findById(inbound._id).lean();
    assert.equal(saved.reactions.me.status, 'failed');
    assert.equal(saved.reactions.me.errorCode, '131009');
    assert.equal(saved.reactions.me.errorDetail, 'Message is too old');
    assert.equal(saved.status, inbound.status);
    assert.equal(saved.errorCode ?? null, null);

    // Una reacción ya reemplazada: su acuse no marca la nueva.
    await Message.updateOne({ _id: inbound._id }, { $set: { 'reactions.me.waMessageId': 'wamid.nueva', 'reactions.me.status': 'sent' } });
    await postWebhook(MW_NUMBER, failed(reactionId));
    assert.equal((await Message.findById(inbound._id).lean()).reactions.me.status, 'sent');
});
