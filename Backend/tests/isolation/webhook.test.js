// El webhook no viene de una sesión: la cuenta sale del número (`phone_number_id`)
// y de su owner. Cada test comprueba que lo que llega al número de A se guarda
// y se avisa en la cuenta de A, no en la persona ni en la cuenta de B.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    seedAccount, connectWhatsapp, postWebhook, openStream, Contact, Conversation, Line, Message,
} from './helpers.js';

const a = await seedAccount('A', { seq: 1 });
const b = await seedAccount('B', { seq: 2 });
await connectWhatsapp(a);
await connectWhatsapp(b);
const A_NUMBER = `99${a.seq}`;

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
