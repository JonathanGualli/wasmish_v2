// Fase 4 de multi-línea: la asignación de conversaciones. El agente ve las sin
// asignar y las suyas, nunca las de sus compañeros (404, como lo de otra
// cuenta); el supervisor ve todas las de sus líneas.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    seedAccount, seedMember, connectWhatsapp, request, postWebhook, openStream, metaCalls, onMeta, ANONYMOUS,
    Account, ApiKey, Contact, Conversation, Message, User,
} from './helpers.js';

const { acquireConversation, confirmAssignee, confirmRequester } = await import('../../src/services/assignment.service.js');
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
const marta = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'ASMARTA' });
const inactive = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'ASOFF' });
await User.updateOne({ _id: inactive.userId }, { status: 'inactive' });
// Otra cuenta, para los endpoints nuevos con :id.
const b = await seedAccount('AT', { seq: 72 });

let phoneSeq = 0;
const nextPhone = () => `59399007${String(200 + phoneSeq++).padStart(4, '0')}`;

const seedConversation = async (phone, name, assignedTo = null, { line = l1, number = '711' } = {}) => {
    const contact = await Contact.create({ userId: a.accountId, phone, name });
    const conversation = await Conversation.create({
        userId: a.accountId, contactId: contact._id, contactPhone: phone, phoneNumberId: number, lineId: line,
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

test('la conversación de un compañero: leerla, 404; escribirle, 409 con quién la atiende; nada llega a Meta', async () => {
    const id = String(c3.conversation._id);
    await noMetaCalls(async () => {
        for (const [method, url, body] of [
            ['GET', `/chats/${id}/messages`],
            ['GET', `/media/${c3.message._id}`],
            ['PUT', `/chats/${id}/messages/${c3.message._id}/reaction`, { emoji: '👍' }],
        ]) {
            const res = await request(ana, method, url, body);
            assert.equal(res.status, 404, `${method} ${url}: ${res.text}`);
            assert.ok(!res.text.includes('Rosa'), `${method} ${url} enseña algo de la conversación`);
        }
        // Escribirle: Luis la tomó antes de que el SSE se lo dijera a Ana. El
        // aviso dice quién la atiende, como la carrera al milisegundo (diseño,
        // 3c), sin nada de lo que dice. Antes daba 404 y el mensaje quedaba «Fallido».
        const writes = [
            await request(ana, 'POST', `/chats/${id}/messages`, { text: 'hola', temporalId: 't-asig' }),
            await request(ana, 'POST', `/chats/${id}/template`, { templateName: a.templateName }),
            await request(ana, 'POST', `/chats/${id}/media`, Buffer.from('x'), { 'Content-Type': 'image/png' }),
        ];
        for (const res of writes) {
            assert.equal(res.status, 409, res.text);
            assert.equal(res.body[0].code, 'assigned_to_other');
            assert.equal(res.body[0].assignedToName, 'ASLUIS miembro');
            assert.ok(!res.text.includes('Rosa'), 'enseña algo de la conversación');
        }
        // De otra línea, o de otra cuenta, sigue sin existir.
        assert.equal((await request(otherLine, 'POST', `/chats/${id}/messages`, { text: 'hola', temporalId: 't-asig2' })).status, 404);
        assert.equal((await request(b, 'POST', `/chats/${id}/messages`, { text: 'hola', temporalId: 't-asig3' })).status, 404);
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
        assignedTo: { id: luis.userId, name: 'ASLUIS miembro' }, restricted: true, transferRequested: false,
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
        assert.ok(await asLuis.waitFor(`event: conversation_revoked\ndata: {"id":"${free.conversation._id}","assignedTo":{"id":"${ana.userId}"`, 2000), 'Luis no recibió el revoked');
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

// --- Tarea 4: asignar, tomar y a quién --------------------------------------

const assign = (account, conversation, userId) => request(account, 'POST', `/chats/${conversation._id}/assign`, { userId });

test('asignar: el supervisor, cualquiera; el agente pasa o suelta la suya', async () => {
    const free = await seedConversation(nextPhone(), 'Para Luis');
    const res = await assign(supervisor, free.conversation, luis.userId);
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(res.body.assignedTo, { id: luis.userId, name: 'ASLUIS miembro' });
    assert.ok(ids(await request(luis, 'GET', '/chats')).includes(String(free.conversation._id)));
    assert.deepEqual(await assigneeOf(free.conversation), { assignedTo: luis.userId, assignedBy: supervisor.userId });

    const ofAna = await seedConversation(nextPhone(), 'Ana la pasa', ana.userId);
    assert.equal((await assign(ana, ofAna.conversation, luis.userId)).status, 200);
    assert.equal((await request(ana, 'GET', `/chats/${ofAna.conversation._id}/messages`)).status, 404, 'Ana la sigue viendo');

    const released = await seedConversation(nextPhone(), 'Ana la suelta', ana.userId);
    const released1 = await assign(ana, released.conversation, null);
    assert.equal(released1.status, 200, released1.text);
    assert.equal(released1.body.assignedTo, null);
});

test('asignar: el agente no pasa una sin asignar ni elige a quien no puede atenderla', async () => {
    const free = await seedConversation(nextPhone(), 'Sin asignar');
    const denied = await assign(ana, free.conversation, luis.userId);
    assert.equal(denied.status, 403, denied.text);
    assert.equal((await assigneeOf(free.conversation)).assignedTo, null);

    for (const target of [inactive.userId, otherLine.userId, b.userId]) {
        const res = await assign(supervisor, free.conversation, target);
        assert.equal(res.status, 400, res.text);
        assert.equal(res.body[0].code, 'invalid_assignee');
    }
    assert.equal((await assigneeOf(free.conversation)).assignedTo, null);
});

test('tomar: suya si está sin asignar; la de otro, 409 (y al agente ni se le enseña)', async () => {
    const free = await seedConversation(nextPhone(), 'Tomar');
    const taken = await request(luis, 'POST', `/chats/${free.conversation._id}/take`);
    assert.equal(taken.status, 200, taken.text);
    assert.equal(taken.body.assignedTo.id, luis.userId);
    assert.equal((await request(luis, 'POST', `/chats/${free.conversation._id}/take`)).status, 200, 'ya suya');

    const bySupervisor = await request(supervisor, 'POST', `/chats/${free.conversation._id}/take`);
    assert.equal(bySupervisor.status, 409, bySupervisor.text);
    assert.equal(bySupervisor.body[0].code, 'assigned_to_other');
    assert.equal((await request(ana, 'POST', `/chats/${free.conversation._id}/take`)).status, 404);
    assert.equal((await assigneeOf(free.conversation)).assignedTo, luis.userId);
});

test('a quién se puede asignar: los activos que pueden atender esa línea', async () => {
    const res = await request(ana, 'GET', `/chats/${c1.conversation._id}/assignees`);
    assert.equal(res.status, 200, res.text);
    const people = res.body.map(person => person.id);
    for (const member of [a, ana, luis, supervisor, marta]) assert.ok(people.includes(member.userId), member.label);
    for (const member of [otherLine, inactive]) assert.ok(!people.includes(member.userId), member.label);
    assert.deepEqual(Object.keys(res.body[0]).sort(), ['id', 'name', 'role']);
});

test('cambiar la asignación borra la solicitud pendiente', async () => {
    const ofAna = await seedConversation(nextPhone(), 'Con solicitud', ana.userId);
    assert.equal((await request(luis, 'POST', `/chats/${ofAna.conversation._id}/transfer-request`)).status, 202);
    assert.equal((await assign(supervisor, ofAna.conversation, marta.userId)).status, 200);
    const current = await Conversation.findById(ofAna.conversation._id).lean();
    assert.equal(current.transferRequest, undefined);
});

test('otra cuenta: tomar, asignar y a quién, 404 sin cambiar nada', async () => {
    const free = await seedConversation(nextPhone(), 'Ajena para B');
    const stream = await openStream(a);
    try {
        await noMetaCalls(async () => {
            for (const [method, url, body] of [
                ['POST', `/chats/${free.conversation._id}/take`],
                ['POST', `/chats/${free.conversation._id}/assign`, { userId: b.userId }],
                ['GET', `/chats/${free.conversation._id}/assignees`],
            ]) {
                const res = await request(b, method, url, body);
                assert.equal(res.status, 404, `${method} ${url}: ${res.text}`);
            }
        });
        assert.equal((await assigneeOf(free.conversation)).assignedTo, null);
        assert.equal(await stream.waitFor(String(free.conversation._id), 300), false, 'A recibió un evento');
    } finally {
        await stream.close();
    }
});

// --- Tarea 5: pedir que te la pasen ---------------------------------------

const requestTransfer = (account, conversation) => request(account, 'POST', `/chats/${conversation._id}/transfer-request`);
const answer = (account, conversation, verb, requestId) =>
    request(account, 'POST', `/chats/${conversation._id}/transfer-request/${verb}`, { requestId });
const pendingOf = async (conversation) => (await Conversation.findById(conversation._id).lean()).transferRequest ?? null;

test('Luis pide la de Ana: la ven Ana y el supervisor; sin nada de la conversación en la respuesta', async () => {
    const ofAna = await seedConversation(nextPhone(), 'Pedida', ana.userId);
    const res = await requestTransfer(luis, ofAna.conversation);
    assert.equal(res.status, 202, res.text);
    assert.equal(res.text, '');
    for (const account of [ana, supervisor]) {
        const chat = (await request(account, 'GET', '/chats')).body.find(item => item.id === String(ofAna.conversation._id));
        assert.deepEqual(chat.transferRequest.requestedBy, { id: luis.userId, name: 'ASLUIS miembro' }, account.label);
    }
});

test('aceptar: pasa al que la pidió, y él se entera; rechazar: sigue igual, y también se entera', async () => {
    const asLuis = await openStream(luis);
    try {
        const ofAna = await seedConversation(nextPhone(), 'Aceptada', ana.userId);
        await requestTransfer(luis, ofAna.conversation);
        const accepted = await answer(ana, ofAna.conversation, 'accept', String((await pendingOf(ofAna.conversation)).id));
        assert.equal(accepted.status, 200, accepted.text);
        assert.equal(accepted.body.assignedTo.id, luis.userId);
        assert.equal(accepted.body.transferRequest, null);
        assert.equal((await request(ana, 'GET', `/chats/${ofAna.conversation._id}/messages`)).status, 404);
        assert.ok(await asLuis.waitFor(`"id":"${ofAna.conversation._id}","accepted":true`, 2000), 'Luis no se enteró');

        const other = await seedConversation(nextPhone(), 'Rechazada', ana.userId);
        await requestTransfer(luis, other.conversation);
        const rejected = await answer(ana, other.conversation, 'reject', String((await pendingOf(other.conversation)).id));
        assert.equal(rejected.status, 204, rejected.text);
        assert.equal((await assigneeOf(other.conversation)).assignedTo, ana.userId);
        assert.equal(await pendingOf(other.conversation), null);
        assert.ok(await asLuis.waitFor(`"id":"${other.conversation._id}","accepted":false`, 2000));
    } finally {
        await asLuis.close();
    }
});

test('pedir: de otra línea, 404; sin asignar, 409; una segunda reemplaza a la primera', async () => {
    const ofAna = await seedConversation(nextPhone(), 'Varias', ana.userId);
    assert.equal((await requestTransfer(otherLine, ofAna.conversation)).status, 404);
    const free = await seedConversation(nextPhone(), 'Nadie');
    const notAssigned = await requestTransfer(luis, free.conversation);
    assert.equal(notAssigned.status, 409);
    assert.equal(notAssigned.body[0].code, 'not_assigned');

    await requestTransfer(luis, ofAna.conversation);
    const first = await pendingOf(ofAna.conversation);
    await requestTransfer(marta, ofAna.conversation);
    const second = await pendingOf(ofAna.conversation);
    assert.equal(String(second.requestedBy), marta.userId);
    assert.notEqual(String(second.id), String(first.id));
    // Luis acepta su propia solicitud: no ve la conversación.
    assert.equal((await answer(luis, ofAna.conversation, 'accept', String(second.id))).status, 404);
});

// Regresión (revisión de Codex del PR #146): sin esto, el bloque de la ficha se
// quedaba en «Solicitud enviada» si la respuesta llegaba con el SSE cortado o si
// otro agente la pedía después.
test('la ficha dice si la solicitud pendiente es de quien mira; la de otro, no', async () => {
    const ofAna = await seedConversation(nextPhone(), 'Pedida', ana.userId);
    const requestedBy = async (who) =>
        (await request(who, 'GET', `/contacts/${ofAna.contact._id}`)).body.conversations[0].transferRequested;
    assert.equal(await requestedBy(luis), false);
    await requestTransfer(luis, ofAna.conversation);
    assert.equal(await requestedBy(luis), true);
    assert.equal(await requestedBy(marta), false, 'la de Luis no es de Marta');
    // Marta la pide después y reemplaza la de Luis.
    await requestTransfer(marta, ofAna.conversation);
    assert.equal(await requestedBy(luis), false);
    assert.equal(await requestedBy(marta), true);
    // Rechazada, ya no está pendiente.
    await answer(ana, ofAna.conversation, 'reject', String((await pendingOf(ofAna.conversation)).id));
    assert.equal(await requestedBy(marta), false);
});

test('una solicitud reemplazada no se acepta ni se rechaza con el id viejo (revisión de Codex del plan, 5)', async () => {
    const ofAna = await seedConversation(nextPhone(), 'Reemplazada', ana.userId);
    await requestTransfer(luis, ofAna.conversation);
    const seenByAna = String((await pendingOf(ofAna.conversation)).id);
    await requestTransfer(marta, ofAna.conversation);
    for (const verb of ['accept', 'reject']) {
        const res = await answer(ana, ofAna.conversation, verb, seenByAna);
        assert.equal(res.status, 409, `${verb}: ${res.text}`);
        assert.equal(res.body[0].code, 'transfer_request_changed');
    }
    assert.equal((await assigneeOf(ofAna.conversation)).assignedTo, ana.userId);
    assert.equal(String((await pendingOf(ofAna.conversation)).requestedBy), marta.userId);

    // La misma persona otra vez: otro id.
    await requestTransfer(luis, ofAna.conversation);
    const again = await pendingOf(ofAna.conversation);
    await requestTransfer(luis, ofAna.conversation);
    assert.equal((await answer(ana, ofAna.conversation, 'accept', String(again.id))).status, 409);
});

test('una solicitud vieja no se aplica sobre el dueño nuevo; un solicitante desactivado, 409', async () => {
    const ofAna = await seedConversation(nextPhone(), 'Vieja', ana.userId);
    await requestTransfer(luis, ofAna.conversation);
    const requestId = String((await pendingOf(ofAna.conversation)).id);
    assert.equal((await assign(supervisor, ofAna.conversation, marta.userId)).status, 200);
    const late = await answer(ana, ofAna.conversation, 'accept', requestId);
    assert.ok([403, 404].includes(late.status), late.text);
    assert.equal((await assigneeOf(ofAna.conversation)).assignedTo, marta.userId);

    const leaving = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'ASLEAVE' });
    const other = await seedConversation(nextPhone(), 'Se va', ana.userId);
    await requestTransfer(leaving, other.conversation);
    const pending = String((await pendingOf(other.conversation)).id);
    await User.updateOne({ _id: leaving.userId }, { status: 'inactive' });
    const res = await answer(supervisor, other.conversation, 'accept', pending);
    assert.equal(res.status, 409, res.text);
    assert.equal(res.body[0].code, 'invalid_assignee');
    assert.equal(await pendingOf(other.conversation), null);
    assert.equal((await assigneeOf(other.conversation)).assignedTo, ana.userId);
});

test('otra cuenta: pedir, aceptar y rechazar, 404 sin cambiar nada', async () => {
    const ofAna = await seedConversation(nextPhone(), 'Ajena para pedir', ana.userId);
    await requestTransfer(luis, ofAna.conversation);
    const pending = await pendingOf(ofAna.conversation);
    for (const res of [
        await requestTransfer(b, ofAna.conversation),
        await answer(b, ofAna.conversation, 'accept', String(pending.id)),
        await answer(b, ofAna.conversation, 'reject', String(pending.id)),
    ]) assert.equal(res.status, 404, res.text);
    assert.equal((await assigneeOf(ofAna.conversation)).assignedTo, ana.userId);
    assert.equal(String((await pendingOf(ofAna.conversation)).id), String(pending.id));
});

// --- Tarea 6: quitar acceso libera ------------------------------------------

const patchMember = (member, body) => request(a, 'PATCH', `/team/members/${member.userId}`, body);

test('desactivar a alguien suelta sus conversaciones y lo que se pidió en ellas; las que él pidió, también', async () => {
    const leaving = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'ASOUT1' });
    const his = await seedConversation(nextPhone(), 'De quien se va', leaving.userId);
    await requestTransfer(luis, his.conversation);
    const ofAna = await seedConversation(nextPhone(), 'Pedida por quien se va', ana.userId);
    await requestTransfer(leaving, ofAna.conversation);

    const res = await patchMember(leaving, { status: 'inactive' });
    assert.equal(res.status, 200, res.text);
    assert.equal((await assigneeOf(his.conversation)).assignedTo, null);
    assert.equal(await pendingOf(his.conversation), null, 'quedó la solicitud de Luis');
    assert.equal((await assigneeOf(ofAna.conversation)).assignedTo, ana.userId);
    assert.equal(await pendingOf(ofAna.conversation), null, 'quedó la solicitud del desactivado');
});

test('quitarle una línea suelta solo las de esa línea; pasarlo a admin, nada', async () => {
    const mover = await seedMember(a, { role: 'agent', lineIds: [l1, l2], label: 'ASOUT2' });
    const inL1 = await seedConversation(nextPhone(), 'En 711', mover.userId);
    const inL2 = await seedConversation(nextPhone(), 'En 712', mover.userId, { line: l2, number: '712' });
    assert.equal((await patchMember(mover, { lineIds: [String(l2)] })).status, 200);
    assert.equal((await assigneeOf(inL1.conversation)).assignedTo, null);
    assert.equal((await assigneeOf(inL2.conversation)).assignedTo, mover.userId);

    const promoted = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'ASOUT3' });
    const kept = await seedConversation(nextPhone(), 'Sigue', promoted.userId);
    assert.equal((await patchMember(promoted, { role: 'admin' })).status, 200);
    assert.equal((await assigneeOf(kept.conversation)).assignedTo, promoted.userId, 'un null en releaseFilter soltó todas');
});

test('la carrera con la desactivación: una asignación escrita después se deshace (revisión de Codex del plan, 1)', async () => {
    const late = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'ASOUT4' });
    const free = await seedConversation(nextPhone(), 'Carrera con el equipo');
    // Como si `updateMember` hubiera guardado el `User` y ya liberado, y la
    // asignación (validada antes) se escribiera después.
    await User.updateOne({ _id: late.userId }, { status: 'inactive' });
    await Conversation.updateOne({ _id: free.conversation._id }, { $set: { assignedTo: late.userId } });
    assert.equal(await confirmAssignee(a.accountId, free.conversation._id, late.userId), false);
    assert.equal((await assigneeOf(free.conversation)).assignedTo, null);
});

test('una solicitud guardada mientras se le quitaba el acceso al que la pidió se borra (revisión de Codex del PR #144)', async () => {
    const late = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'ASOUT5' });
    const ofAna = await seedConversation(nextPhone(), 'Pedida a destiempo', ana.userId);
    // Como si la solicitud se escribiera después de que `updateMember` lo desactivara y limpiara.
    const requestId = new (await import('mongoose')).default.Types.ObjectId();
    await User.updateOne({ _id: late.userId }, { status: 'inactive' });
    await Conversation.updateOne({ _id: ofAna.conversation._id }, {
        $set: { transferRequest: { id: requestId, requestedBy: late.userId, requestedAt: new Date() } },
    });
    assert.equal(await confirmRequester(a.accountId, ofAna.conversation._id, requestId, late.userId), false);
    assert.equal(await pendingOf(ofAna.conversation), null);
    assert.equal((await assigneeOf(ofAna.conversation)).assignedTo, ana.userId);
});

test('desactivar y soltar van con el candado del equipo: ocupado, 409 y nada cambia (revisión de Codex del PR #144)', async () => {
    const member = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'ASOUT6' });
    const his = await seedConversation(nextPhone(), 'Con el candado', member.userId);
    // Otro cambio del equipo en curso (otra petición tiene el candado).
    await Account.updateOne({ _id: a.accountId }, { $set: { teamLock: { token: 'otro', expiresAt: new Date(Date.now() + 30_000) } } });
    try {
        const res = await patchMember(member, { status: 'inactive' });
        assert.equal(res.status, 409, res.text);
        assert.equal(res.body[0].code, 'team_busy');
        assert.equal((await User.findById(member.userId).lean()).status, 'active');
        assert.equal((await assigneeOf(his.conversation)).assignedTo, member.userId);
    } finally {
        await Account.updateOne({ _id: a.accountId }, { $set: { teamLock: null } });
    }
    assert.equal((await patchMember(member, { status: 'inactive' })).status, 200);
    assert.equal((await assigneeOf(his.conversation)).assignedTo, null);
});
