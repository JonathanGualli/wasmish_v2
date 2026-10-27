// Fase 4 de multi-línea: la asignación de conversaciones. El agente ve las sin
// asignar y las suyas, nunca las de sus compañeros (404, como lo de otra
// cuenta); el supervisor ve todas las de sus líneas.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    seedAccount, seedMember, connectWhatsapp, request, postWebhook, openStream, metaCalls, onMeta, ANONYMOUS,
    ApiKey, Contact, Conversation, Message,
} from './helpers.js';

const { acquireConversation } = await import('../../src/services/assignment.service.js');
const { hashApiKey } = await import('../../src/utils/crypto.js');

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

let phoneSeq = 0;
const nextPhone = () => `59399007${String(200 + phoneSeq++).padStart(4, '0')}`;

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

// --- Tarea 3: responder la toma, antes de llamar a Meta ---------------------

// Meta acepta todo lo que sale por 711 y lo apunta en `sent`; `during` corre a
// mitad de la llamada (para cambiar algo mientras se espera a Meta).
const sent = [];
const acceptSends = ({ during = null, reject = false } = {}) => onMeta(async (config) => {
    if (config.method !== 'post' || config.url !== '/711/messages') return undefined;
    sent.push(JSON.parse(config.data));
    await during?.();
    if (reject) throw Object.assign(new Error('WhatsApp API Error (400): rechazado'), { waErrorCode: 131026, waErrorDetail: 'rechazado' });
    return { data: { messages: [{ id: `wamid.asig.out.${sent.length}.${Date.now()}` }] } };
});
const assigneeOf = async (conversation) => {
    const current = await Conversation.findById(conversation._id).select('assignedTo assignedBy').lean();
    return { assignedTo: current.assignedTo ? String(current.assignedTo) : null, assignedBy: current.assignedBy ? String(current.assignedBy) : null };
};
const reply = (account, conversation, text = 'hola') =>
    request(account, 'POST', `/chats/${conversation._id}/messages`, { text, temporalId: `t-${Date.now()}-${Math.random()}` });

test('responder una sin asignar la toma: el agente y el owner', async () => {
    acceptSends();
    try {
        const free = await seedConversation(nextPhone(), 'Libre');
        const res = await reply(ana, free.conversation);
        assert.equal(res.status, 201, res.text);
        assert.deepEqual(await assigneeOf(free.conversation), { assignedTo: ana.userId, assignedBy: ana.userId });

        const forOwner = await seedConversation(nextPhone(), 'Para el owner');
        assert.equal((await reply(a, forOwner.conversation)).status, 201);
        assert.equal((await assigneeOf(forOwner.conversation)).assignedTo, a.userId);
    } finally {
        onMeta(null);
    }
});

test('el supervisor responde la de Ana: sale firmado por él y sigue siendo de Ana (decisión del 2026-10-27)', async () => {
    acceptSends();
    try {
        const ofAna = await seedConversation(nextPhone(), 'De Ana', ana.userId);
        const res = await reply(supervisor, ofAna.conversation, 'ayudo yo');
        assert.equal(res.status, 201, res.text);
        assert.equal(res.body.sentBy.id, supervisor.userId);
        assert.equal((await assigneeOf(ofAna.conversation)).assignedTo, ana.userId);
    } finally {
        onMeta(null);
    }
});

test('dos agentes responden a la vez una sin asignar: solo uno llega a Meta y se la queda', async () => {
    acceptSends();
    try {
        const free = await seedConversation(nextPhone(), 'Carrera');
        const before = sent.length;
        const [fromAna, fromLuis] = await Promise.all([reply(ana, free.conversation, 'soy Ana'), reply(luis, free.conversation, 'soy Luis')]);
        const statuses = [fromAna.status, fromLuis.status].sort();
        assert.equal(statuses[0], 201, `${fromAna.text} / ${fromLuis.text}`);
        assert.ok([404, 409].includes(statuses[1]), `el segundo: ${statuses[1]}`);
        assert.equal(sent.length - before, 1, 'Meta se llamó más de una vez');
        const winner = fromAna.status === 201 ? ana : luis;
        assert.equal((await assigneeOf(free.conversation)).assignedTo, winner.userId);
    } finally {
        onMeta(null);
    }
});

test('acquireConversation: un agente en la de un compañero, 409 con su nombre', async () => {
    const luisAuth = { userId: luis.userId, accountId: a.accountId, role: 'agent', lineIds: [String(l1)] };
    await assert.rejects(acquireConversation(luisAuth, c2.conversation._id), (error) => {
        assert.equal(error.statusCode, 409);
        assert.equal(error.code, 'assigned_to_other');
        assert.deepEqual(error.details, { assignedToName: 'ASANA miembro', conversationId: String(c2.conversation._id) });
        return true;
    });
});

test('empezar con un contacto que atiende otro agente: 409 con su nombre y su id, sin llamar a Meta ni enseñar nada', async () => {
    await noMetaCalls(async () => {
        const byTemplate = await request(luis, 'POST', '/chats/template',
            { destinationNumber: c2.contact.phone, templateName: a.templateName, lineId: String(l1) });
        assert.equal(byTemplate.status, 409, byTemplate.text);
        assert.equal(byTemplate.body[0].code, 'assigned_to_other');
        assert.equal(byTemplate.body[0].assignedToName, 'ASANA miembro');
        assert.equal(byTemplate.body[0].conversationId, String(c2.conversation._id));
        assert.ok(!byTemplate.text.includes('último de Marisol') && !byTemplate.text.includes('mensaje de Marisol'));

        // Con texto libre a su número: el mismo 409, no el de la ventana.
        const byText = await request(luis, 'POST', '/chats/messages',
            { text: 'hola', temporalId: 't-num', destinationNumber: c2.contact.phone, lineId: String(l1) });
        assert.equal(byText.status, 409, byText.text);
        assert.equal(byText.body[0].code, 'assigned_to_other');
    });
});

test('empezar con un número nuevo: la conversación creada es de quien la empezó', async () => {
    acceptSends();
    try {
        const phone = nextPhone();
        const res = await request(luis, 'POST', '/chats/template', { destinationNumber: phone, templateName: a.templateName, lineId: String(l1) });
        assert.equal(res.status, 200, res.text);
        const created = await Conversation.findById(res.body.conversationId).lean();
        assert.equal(String(created.assignedTo), luis.userId);
    } finally {
        onMeta(null);
    }
});

test('Meta rechaza el envío: el mensaje queda fallido y la conversación, de quien lo intentó', async () => {
    acceptSends({ reject: true });
    try {
        const free = await seedConversation(nextPhone(), 'Rechazo');
        const res = await reply(ana, free.conversation);
        assert.equal(res.status, 201, res.text);
        assert.equal(res.body.status, 'failed');
        assert.equal((await assigneeOf(free.conversation)).assignedTo, ana.userId);
    } finally {
        onMeta(null);
    }
});

test('nada automático asigna: ni la API pública ni reaccionar', async () => {
    const key = 'wm_asignacion';
    await ApiKey.create({ userId: a.accountId, keyHash: hashApiKey(key), keyPreview: 'wm_', name: 'asignación' });
    acceptSends();
    try {
        const free = await seedConversation(nextPhone(), 'Automático');
        const api = await request(ANONYMOUS, 'POST', '/v1/templates/send',
            { destinationNumber: free.contact.phone, templateName: a.templateName, lineId: String(l1) }, { Authorization: `Bearer ${key}` });
        assert.equal(api.status, 200, api.text);
        assert.equal((await assigneeOf(free.conversation)).assignedTo, null);

        const reaction = await request(ana, 'PUT', `/chats/${free.conversation._id}/messages/${free.message._id}/reaction`, { emoji: '👍' });
        assert.equal(reaction.status, 200, reaction.text);
        assert.equal((await assigneeOf(free.conversation)).assignedTo, null);
    } finally {
        onMeta(null);
    }
});

test('SSE: cuando Ana toma una sin asignar, Luis recibe conversation_revoked y nada más de ella', async () => {
    acceptSends();
    const asLuis = await openStream(luis);
    try {
        const free = await seedConversation(nextPhone(), 'Se la lleva Ana');
        const text = `de-ana-${Date.now()}`;
        assert.equal((await reply(ana, free.conversation, text)).status, 201);
        assert.ok(await asLuis.waitFor(`event: conversation_revoked\ndata: {"id":"${free.conversation._id}"}`, 2000), 'Luis no recibió el revoked');
        assert.equal(await asLuis.waitFor(text, 300), false, 'a Luis le llegó el mensaje de Ana');
    } finally {
        onMeta(null);
        await asLuis.close();
    }
});

test('cambia de manos mientras se espera a Meta: el mensaje le llega al nuevo dueño, no al anterior', async () => {
    const ofAna = await seedConversation(nextPhone(), 'Cambia de manos', ana.userId);
    acceptSends({ during: () => Conversation.updateOne({ _id: ofAna.conversation._id }, { $set: { assignedTo: luis.userId } }) });
    const asAna = await openStream(ana);
    const asLuis = await openStream(luis);
    try {
        const text = `del-supervisor-${Date.now()}`;
        assert.equal((await reply(supervisor, ofAna.conversation, text)).status, 201);
        assert.ok(await asLuis.waitFor(text, 2000), 'a Luis no le llegó');
        assert.equal(await asAna.waitFor(text, 300), false, 'a Ana le llegó con la asignación vieja');
    } finally {
        onMeta(null);
        await Promise.all([asAna.close(), asLuis.close()]);
    }
});
