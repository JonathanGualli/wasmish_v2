// El webhook no viene de una sesión: la cuenta sale del número (`phone_number_id`)
// y de su owner. Cada test comprueba que lo que llega al número de A se guarda
// y se avisa en la cuenta de A, no en la persona ni en la cuenta de B.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    seedAccount, seedMember, connectWhatsapp, postWebhook, openStream, Contact, Conversation, Line, Message, User,
} from './helpers.js';

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
