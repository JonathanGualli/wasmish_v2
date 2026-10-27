// Fase 4 de multi-línea: la asignación de conversaciones. El agente ve las sin
// asignar y las suyas, nunca las de sus compañeros (404, como lo de otra
// cuenta); el supervisor ve todas las de sus líneas.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    seedAccount, seedMember, connectWhatsapp, request, postWebhook, openStream, metaCalls,
    Contact, Conversation, Message,
} from './helpers.js';

// TODO lo que se prepara con `await` va aquí, antes del primer `test()` (ver
// push.test.js: si no, el `after` de helpers.js puede cerrar Mongo a mitad).

// La cuenta A con la línea 711 y tres conversaciones abiertas: c1 sin asignar,
// c2 de Ana y c3 de Luis. Ana, Luis y Marta son agentes de 711; el supervisor
// también la tiene; otro agente solo tiene 712.
const a = await seedAccount('AS', { seq: 71, maxLines: 2 });
const { lineId: l1 } = await connectWhatsapp(a, { phoneNumberId: '711' });
const { lineId: l2 } = await connectWhatsapp(a, { phoneNumberId: '712' });
const ana = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'ASANA' });
const luis = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'ASLUIS' });
const supervisor = await seedMember(a, { role: 'supervisor', lineIds: [l1], label: 'ASSUP' });
const otherLine = await seedMember(a, { role: 'agent', lineIds: [l2], label: 'ASL2' });

const seedConversation = async (phone, name, assignedTo = null) => {
    const contact = await Contact.create({ userId: a.accountId, phone, name });
    const conversation = await Conversation.create({
        userId: a.accountId, contactId: contact._id, contactPhone: phone, phoneNumberId: '711', lineId: l1,
        lastInboundAt: new Date(), lastMessage: `último de ${name}`, assignedTo,
    });
    const message = await Message.create({
        conversationId: conversation._id, direction: 'inbound', sender: 'them', text: `mensaje de ${name}`,
        type: 'image', mediaId: `m-${phone}`, mimeType: 'image/png', mediaFile: '71000.png',
        waMessageId: `wamid.asig.${phone}`, timestamp: new Date(),
    });
    return { contact, conversation, message };
};
const c1 = await seedConversation('593990007101', 'Diego');
const c2 = await seedConversation('593990007102', 'Marisol', ana.userId);
const c3 = await seedConversation('593990007103', 'Rosa', luis.userId);

const ids = (res) => res.body.map(chat => chat.id);
const noMetaCalls = async (fn) => {
    const before = metaCalls.length;
    await fn();
    assert.equal(metaCalls.length, before, 'llamó a Meta');
};
const textMessage = (from, body) => ({
    contacts: [{ profile: { name: 'Cliente' }, wa_id: from }],
    messages: [{ from, id: `wamid.asig.in.${Date.now()}.${Math.random().toString(36).slice(2)}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body } }],
});

// --- Tarea 2: lo que ve cada uno -------------------------------------------

test('GET /chats: el agente, las sin asignar y las suyas; el supervisor, todas; con quién la atiende', async () => {
    const asAna = await request(ana, 'GET', '/chats');
    assert.equal(asAna.status, 200, asAna.text);
    assert.ok(ids(asAna).includes(String(c1.conversation._id)));
    assert.ok(ids(asAna).includes(String(c2.conversation._id)));
    assert.ok(!ids(asAna).includes(String(c3.conversation._id)), 've la de Luis');
    assert.ok(!asAna.text.includes('último de Rosa'));

    const asSupervisor = await request(supervisor, 'GET', '/chats');
    for (const { conversation } of [c1, c2, c3]) assert.ok(ids(asSupervisor).includes(String(conversation._id)));
    const byId = new Map(asSupervisor.body.map(chat => [chat.id, chat]));
    assert.equal(byId.get(String(c1.conversation._id)).assignedTo, null);
    assert.deepEqual(byId.get(String(c2.conversation._id)).assignedTo, { id: ana.userId, name: 'ASANA miembro' });
    assert.equal(byId.get(String(c2.conversation._id)).transferRequest, null);
});

test('la conversación de un compañero: 404 en todo, sin llamar a Meta', async () => {
    const id = String(c3.conversation._id);
    await noMetaCalls(async () => {
        for (const [method, url, body] of [
            ['GET', `/chats/${id}/messages`],
            ['GET', `/media/${c3.message._id}`],
            ['POST', `/chats/${id}/messages`, { text: 'hola', temporalId: 't-asig' }],
            ['POST', `/chats/${id}/template`, { templateName: a.templateName }],
            ['PUT', `/chats/${id}/messages/${c3.message._id}/reaction`, { emoji: '👍' }],
        ]) {
            const res = await request(ana, method, url, body);
            assert.equal(res.status, 404, `${method} ${url}: ${res.text}`);
            assert.ok(!res.text.includes('Rosa'), `${method} ${url} enseña algo de la conversación`);
        }
        const media = await request(ana, 'POST', `/chats/${id}/media`, Buffer.from('x'), { 'Content-Type': 'image/png' });
        assert.equal(media.status, 404, media.text);
    });
    // El supervisor sí llega.
    assert.equal((await request(supervisor, 'GET', `/chats/${id}/messages`)).status, 200);
});

test('Contactos: la lista no enseña la conversación de un compañero; la ficha, solo su línea y quién la atiende', async () => {
    const list = await request(ana, 'GET', '/contacts?limit=50');
    assert.equal(list.status, 200, list.text);
    const rosa = list.body.contacts.find(contact => contact.id === String(c3.contact._id));
    assert.ok(rosa, 'el contacto es de toda la cuenta');
    assert.deepEqual(rosa.conversations, []);
    assert.equal(rosa.conversationId, null);
    const marisol = list.body.contacts.find(contact => contact.id === String(c2.contact._id));
    assert.equal(marisol.conversations.length, 1, 've la suya');

    const card = await request(ana, 'GET', `/contacts/${c3.contact._id}`);
    assert.equal(card.status, 200, card.text);
    assert.equal(card.body.conversationId, null);
    assert.equal(card.body.lastInteractionAt, null);
    assert.equal(card.body.activity.received, 0, 'cuenta los mensajes de una conversación que no ve');
    assert.deepEqual(card.body.conversations, [{
        conversationId: String(c3.conversation._id), lineId: String(l1), lastInteractionAt: null, windowExpiresAt: null,
        assignedTo: { id: luis.userId, name: 'ASLUIS miembro' }, restricted: true,
    }]);

    // Un agente de otra línea no sabe ni que existe.
    const fromOtherLine = await request(otherLine, 'GET', `/contacts/${c3.contact._id}`);
    assert.deepEqual(fromOtherLine.body.conversations, []);
    // El supervisor la ve entera.
    const asSupervisor = await request(supervisor, 'GET', `/contacts/${c3.contact._id}`);
    assert.equal(asSupervisor.body.conversations[0].restricted, false);
    assert.equal(asSupervisor.body.conversationId, String(c3.conversation._id));
});

test('SSE: un entrante en la conversación de Ana no le llega a Luis', async () => {
    const asAna = await openStream(ana);
    const asLuis = await openStream(luis);
    const asSupervisor = await openStream(supervisor);
    try {
        const text = `para-ana-${Date.now()}`;
        assert.equal((await postWebhook('711', textMessage(c2.contact.phone, text))).status, 200);
        assert.ok(await asAna.waitFor(text, 2000), 'a Ana no le llegó');
        assert.ok(await asSupervisor.waitFor(text, 2000), 'al supervisor no le llegó');
        assert.equal(await asLuis.waitFor(text, 300), false, 'le llegó a Luis');
    } finally {
        await Promise.all([asAna.close(), asLuis.close(), asSupervisor.close()]);
    }
});
