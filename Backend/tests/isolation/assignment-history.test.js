// Los avisos de la asignación: la historia de cada conversación (eventos con
// los mensajes, spec § 5.1) y, desde la Tarea 4, lo que escribe cada camino.
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
    seedAccount, seedMember, connectWhatsapp, request, openStream, onMeta,
    Contact, Conversation, ConversationEvent, Message, Notification, User,
} from './helpers.js';

const { recordEvent, createNotifications, memberAuth, serializeNotifications } = await import('../../src/services/assignment.history.service.js');
const { confirmAssignee, confirmRequester } = await import('../../src/services/assignment.service.js');

// TODO lo que se prepara con `await` va aquí, antes del primer `test()`.

// La cuenta A con la línea 811: Ana y Luis, agentes de 811; un supervisor con 811.
const a = await seedAccount('AH', { seq: 81, maxLines: 2 });
const { lineId: l1 } = await connectWhatsapp(a, { phoneNumberId: '811' });
const ana = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'AHANA' });
const luis = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'AHLUIS' });
const supervisor = await seedMember(a, { role: 'supervisor', lineIds: [l1], label: 'AHSUP' });
const marta = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'AHMARTA' });
// Otra cuenta.
const b = await seedAccount('AI', { seq: 82 });

const BASE = Date.UTC(2026, 9, 28, 9, 0);
const minute = (n) => new Date(BASE + n * 60_000);

let phoneSeq = 0;
const nextPhone = () => `59399008${String(300 + phoneSeq++).padStart(4, '0')}`;

/** Una conversación de l1 con mensajes en los minutos `messageMinutes` y eventos en `eventMinutes`. */
const seedThread = async ({ messageMinutes, eventMinutes, assignedTo = null }) => {
    const phone = nextPhone();
    const contact = await Contact.create({ userId: a.accountId, phone, name: `Contacto ${phone}` });
    const conversation = await Conversation.create({
        userId: a.accountId, contactId: contact._id, contactPhone: phone, phoneNumberId: '811', lineId: l1,
        lastInboundAt: new Date(), assignedTo,
    });
    await Message.insertMany(messageMinutes.map((m, i) => ({
        conversationId: conversation._id, direction: 'inbound', sender: 'them', text: `mensaje ${i}`,
        waMessageId: `wamid.hist.${phone}.${i}`, timestamp: minute(m),
    })));
    await ConversationEvent.insertMany(eventMinutes.map((m) => ({
        userId: a.accountId, conversationId: conversation._id, type: 'assign',
        actorId: supervisor.userId, targetId: ana.userId, at: minute(m),
    })));
    return conversation;
};

/** Todas las páginas de `GET /chats/:id/messages`, con `events=1` o sin él. */
const allPages = async (session, conversationId, { limit = 10, events = true } = {}) => {
    const pages = [];
    let before = null;
    for (let guard = 0; guard < 50; guard++) {
        const query = new URLSearchParams({ limit: String(limit) });
        if (events) query.set('events', '1');
        if (before) query.set('before', before);
        const res = await request(session, 'GET', `/chats/${conversationId}/messages?${query}`);
        assert.equal(res.status, 200, res.text);
        pages.push(res.body);
        if (!res.body.nextCursor) return pages;
        before = res.body.nextCursor;
    }
    throw new Error('demasiadas páginas');
};
const eventIds = (pages) => pages.flatMap(page => page.events.map(event => event.id));

// Mensajes en los minutos 0..24; eventos en 0.5, 1.5… y en el 12 exacto (a la
// misma hora que un mensaje), y dos después del último mensaje.
const mixed = await seedThread({
    messageMinutes: Array.from({ length: 25 }, (_, i) => i),
    eventMinutes: [...Array.from({ length: 27 }, (_, i) => i + 0.5), 12, 30, 31],
});
// Tres mensajes viejos y 230 eventos después.
const crowded = await seedThread({
    messageMinutes: [0, 1, 2],
    eventMinutes: Array.from({ length: 230 }, (_, i) => 10 + i),
});

test('mensajes: la primera página trae los eventos más nuevos que el último mensaje y los de su tramo', async () => {
    const res = await request(a, 'GET', `/chats/${mixed._id}/messages?limit=10&events=1`);
    assert.equal(res.status, 200, res.text);
    const times = res.body.events.map(event => event.timestamp);
    assert.ok(times.includes(minute(31).toISOString()), 'falta el evento posterior al último mensaje');
    // El mensaje más viejo de la página es el del minuto 15: nada anterior.
    assert.ok(res.body.events.every(event => new Date(event.timestamp) >= minute(15)));
    const first = res.body.events[0];
    assert.deepEqual(Object.keys(first).sort(), ['actor', 'id', 'target', 'timestamp', 'type']);
    assert.deepEqual(first.actor, { id: supervisor.userId, name: 'AHSUP miembro' });
    assert.deepEqual(first.target, { id: ana.userId, name: 'AHANA miembro' });
});

test('mensajes: recorrer todas las páginas trae cada evento una sola vez, también uno a la misma hora que un mensaje', async () => {
    const pages = await allPages(a, mixed._id);
    const ids = eventIds(pages);
    assert.equal(ids.length, 30);
    assert.equal(new Set(ids).size, 30, 'un evento salió dos veces');
    assert.equal(pages.flatMap(page => page.items).length, 25);
});

test('mensajes: con 3 mensajes y 230 eventos, las páginas se acortan en 100 sin perder ni repetir nada', async () => {
    const pages = await allPages(a, crowded._id);
    const ids = eventIds(pages);
    assert.equal(ids.length, 230);
    assert.equal(new Set(ids).size, 230);
    assert.equal(pages.flatMap(page => page.items).length, 3);
    // La primera página se acortó: 100 eventos y su cursor es la fecha del evento 100.
    assert.equal(pages[0].events.length, 100);
    assert.equal(pages[0].items.length, 0, 'los mensajes son anteriores a los 100 eventos');
    assert.equal(pages[0].nextCursor, pages[0].events[99].timestamp);
});

test('mensajes: sin events=1, la respuesta y las páginas son las de hoy aunque haya 230 eventos', async () => {
    const pages = await allPages(a, crowded._id, { events: false });
    assert.equal(pages.length, 1);
    assert.equal(pages[0].items.length, 3);
    assert.ok(!('events' in pages[0]));
});

test('mensajes: el agente ve los eventos de antes de que fuera suya', async () => {
    const conversation = await seedThread({ messageMinutes: [0, 5], eventMinutes: [1, 2, 3], assignedTo: ana.userId });
    await ConversationEvent.create({
        userId: a.accountId, conversationId: conversation._id, type: 'assign', actorId: supervisor.userId, targetId: luis.userId, at: minute(0.5),
    });
    const res = await request(ana, 'GET', `/chats/${conversation._id}/messages?events=1`);
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.events.length, 4);
    assert.ok(res.body.events.some(event => event.target.id === luis.userId), 'falta el de cuando la tenía Luis');
});

test('mensajes: un agente que ya no la ve recibe 404 y ningún evento; otra cuenta, 404', async () => {
    const conversation = await seedThread({ messageMinutes: [0], eventMinutes: [1], assignedTo: luis.userId });
    const asAna = await request(ana, 'GET', `/chats/${conversation._id}/messages?events=1`);
    assert.equal(asAna.status, 404);
    assert.ok(!asAna.text.includes('AHSUP'));
    const asB = await request(b, 'GET', `/chats/${conversation._id}/messages?events=1`);
    assert.equal(asB.status, 404);
});

test('conversation_event: le llega a quien la ve, no al agente que la perdió', async () => {
    const conversation = await seedThread({ messageMinutes: [0], eventMinutes: [], assignedTo: ana.userId });
    const anaStream = await openStream(ana);
    const luisStream = await openStream(luis);
    try {
        await Conversation.updateOne({ _id: conversation._id }, { $set: { assignedTo: luis.userId } });
        await recordEvent({
            accountId: a.accountId, conversationId: conversation._id, type: 'assign',
            actorId: supervisor.userId, targetId: luis.userId, at: new Date(),
        });
        assert.ok(await luisStream.waitFor('event: conversation_event', 2000), 'Luis no recibió el evento');
        assert.ok(await luisStream.waitFor(String(conversation._id), 500));
        assert.equal(anaStream.count('event: conversation_event'), 0, 'Ana la perdió y recibió el evento');
    } finally {
        await anaStream.close();
        await luisStream.close();
    }
});

// --- Tarea 4: lo que escribe cada camino -------------------------------------

const fresh = (assignedTo = null) => seedThread({ messageMinutes: [0], eventMinutes: [], assignedTo });
const eventsOf = async (conversation) => (await ConversationEvent.find({ conversationId: conversation._id }).sort({ at: 1, _id: 1 }).lean())
    .map(event => ({ type: event.type, actor: event.actorId ? String(event.actorId) : null, target: event.targetId ? String(event.targetId) : null }));
const noticesOf = async (conversation) => (await Notification.find({ conversationId: conversation._id }).lean())
    .map(doc => ({ to: String(doc.recipientId), type: doc.type, resolution: doc.resolution?.status ?? null, by: doc.resolution?.by ? String(doc.resolution.by) : null }));
const sortedTo = (notices) => notices.map(notice => notice.to).sort();
const assign = (account, conversation, userId) => request(account, 'POST', `/chats/${conversation._id}/assign`, { userId });
const ask = (account, conversation) => request(account, 'POST', `/chats/${conversation._id}/transfer-request`);
const answer = (account, conversation, verb, requestId) =>
    request(account, 'POST', `/chats/${conversation._id}/transfer-request/${verb}`, { requestId });
const pendingId = async (conversation) => String((await Conversation.findById(conversation._id).lean()).transferRequest?.id ?? '');
const reply = (account, conversation) =>
    request(account, 'POST', `/chats/${conversation._id}/messages`, { text: 'hola', temporalId: `t-${Date.now()}-${Math.random()}` });
let sentCount = 0;
onMeta(async (config) => {
    if (config.method !== 'post' || config.url !== '/811/messages') return undefined;
    sentCount += 1;
    return { data: { messages: [{ id: `wamid.hist.out.${sentCount}.${Date.now()}` }] } };
});

test('responder una sin asignar escribe take, sin destinatario ni avisos', async () => {
    const conversation = await fresh();
    await Conversation.updateOne({ _id: conversation._id }, { $set: { lastInboundAt: new Date() } });
    const res = await reply(ana, conversation);
    assert.equal(res.status, 201, res.text);
    assert.deepEqual(await eventsOf(conversation), [{ type: 'take', actor: ana.userId, target: null }]);
    assert.deepEqual(await noticesOf(conversation), []);
});

test('asignársela a uno mismo desde el menú también es take sin destinatario', async () => {
    const conversation = await fresh();
    assert.equal((await assign(supervisor, conversation, supervisor.userId)).status, 200);
    assert.deepEqual(await eventsOf(conversation), [{ type: 'take', actor: supervisor.userId, target: null }]);
    assert.deepEqual(await noticesOf(conversation), []);
});

test('asignar a otro escribe assign y un aviso assigned solo a quien la recibe', async () => {
    const conversation = await fresh();
    assert.equal((await assign(supervisor, conversation, luis.userId)).status, 200);
    assert.deepEqual(await eventsOf(conversation), [{ type: 'assign', actor: supervisor.userId, target: luis.userId }]);
    assert.deepEqual(await noticesOf(conversation), [{ to: luis.userId, type: 'assigned', resolution: null, by: null }]);
});

test('soltar escribe release, sin avisos', async () => {
    const conversation = await fresh(luis.userId);
    assert.equal((await assign(luis, conversation, null)).status, 200);
    assert.deepEqual(await eventsOf(conversation), [{ type: 'release', actor: luis.userId, target: null }]);
    assert.deepEqual(await noticesOf(conversation), []);
});

test('requestTransfer real: request, y el requested lo reciben Ana (la atiende), el supervisor y el owner, no Luis', async () => {
    const conversation = await fresh(ana.userId);
    assert.equal((await ask(luis, conversation)).status, 202);
    assert.deepEqual(await eventsOf(conversation), [{ type: 'request', actor: luis.userId, target: null }]);
    const notices = await noticesOf(conversation);
    assert.ok(notices.every(notice => notice.type === 'requested' && notice.resolution === null));
    assert.deepEqual(sortedTo(notices), [ana.userId, supervisor.userId, a.userId].sort());
});

test('aceptar: pass, passed a quien la pidió y los requested resueltos como passed por quien aceptó', async () => {
    const conversation = await fresh(ana.userId);
    await ask(luis, conversation);
    const supStream = await openStream(supervisor);
    try {
        assert.equal((await answer(ana, conversation, 'accept', await pendingId(conversation))).status, 200);
        assert.ok(await supStream.waitFor('event: notification_updated', 2000), 'al supervisor no le llegó la resolución');
    } finally {
        await supStream.close();
    }
    assert.deepEqual((await eventsOf(conversation)).slice(1), [{ type: 'pass', actor: ana.userId, target: luis.userId }]);
    const notices = await noticesOf(conversation);
    assert.deepEqual(notices.filter(n => n.type === 'passed'), [{ to: luis.userId, type: 'passed', resolution: null, by: null }]);
    assert.ok(notices.filter(n => n.type === 'requested').every(n => n.resolution === 'passed' && n.by === ana.userId));
});

test('rechazar: reject, rejected a quien la pidió y los requested resueltos como rejected', async () => {
    const conversation = await fresh(ana.userId);
    await ask(luis, conversation);
    assert.equal((await answer(supervisor, conversation, 'reject', await pendingId(conversation))).status, 204);
    assert.deepEqual((await eventsOf(conversation)).slice(1), [{ type: 'reject', actor: supervisor.userId, target: luis.userId }]);
    const notices = await noticesOf(conversation);
    assert.deepEqual(notices.filter(n => n.type === 'rejected'), [{ to: luis.userId, type: 'rejected', resolution: null, by: null }]);
    assert.ok(notices.filter(n => n.type === 'requested').every(n => n.resolution === 'rejected' && n.by === supervisor.userId));
});

test('asignar al solicitante resuelve passed; asignar a otro, gone', async () => {
    const toRequester = await fresh(ana.userId);
    await ask(luis, toRequester);
    await assign(supervisor, toRequester, luis.userId);
    assert.ok((await noticesOf(toRequester)).filter(n => n.type === 'requested').every(n => n.resolution === 'passed' && n.by === supervisor.userId));

    const toOther = await fresh(ana.userId);
    await ask(luis, toOther);
    await assign(supervisor, toOther, marta.userId);
    assert.ok((await noticesOf(toOther)).filter(n => n.type === 'requested').every(n => n.resolution === 'gone'));
});

test('una solicitud nueva deja como gone la que reemplaza', async () => {
    const conversation = await fresh(ana.userId);
    await ask(luis, conversation);
    const first = await pendingId(conversation);
    await ask(marta, conversation);
    const notices = await Notification.find({ conversationId: conversation._id, type: 'requested' }).lean();
    assert.ok(notices.filter(n => String(n.requestId) === first).every(n => n.resolution?.status === 'gone'));
    assert.ok(notices.filter(n => String(n.requestId) !== first).every(n => n.resolution === null));
});

test('aceptar cuando quien la pidió ya no puede atenderla: 409 y gone', async () => {
    const leaving = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'AHGONE1' });
    const conversation = await fresh(ana.userId);
    await ask(leaving, conversation);
    await User.updateOne({ _id: leaving.userId }, { $set: { lineIds: [] } });
    const res = await answer(ana, conversation, 'accept', await pendingId(conversation));
    assert.equal(res.status, 409);
    assert.ok((await noticesOf(conversation)).every(n => n.resolution === 'gone'));
});

test('confirmAssignee que deshace resuelve como gone la solicitud que se llevó', async () => {
    const leaving = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'AHGONE2' });
    const conversation = await fresh(leaving.userId);
    await ask(luis, conversation);
    await User.updateOne({ _id: leaving.userId }, { $set: { lineIds: [] } });
    assert.equal(await confirmAssignee(a.accountId, conversation._id, leaving.userId), false);
    assert.ok((await noticesOf(conversation)).every(n => n.resolution === 'gone'));
});

test('confirmRequester que borra la solicitud la resuelve como gone', async () => {
    const leaving = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'AHGONE3' });
    const conversation = await fresh(ana.userId);
    const requestId = new mongoose.Types.ObjectId();
    await Conversation.updateOne({ _id: conversation._id }, { $set: { transferRequest: { id: requestId, requestedBy: leaving.userId, requestedAt: new Date() } } });
    await createNotifications({ accountId: a.accountId, recipientIds: [ana.userId], type: 'requested', actorId: leaving.userId, conversationId: conversation._id, requestId });
    await User.updateOne({ _id: leaving.userId }, { $set: { lineIds: [] } });
    assert.equal(await confirmRequester(a.accountId, conversation._id, requestId, leaving.userId), false);
    assert.deepEqual((await noticesOf(conversation)).map(n => n.resolution), ['gone']);
});

test('quitar el acceso: revoked en la que tenía y gone en lo que pidió', async () => {
    const leaving = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'AHGONE4' });
    const his = await fresh(leaving.userId);
    await ask(luis, his);
    const asked = await fresh(ana.userId);
    await ask(leaving, asked);
    const res = await request(a, 'PATCH', `/team/members/${leaving.userId}`, { status: 'inactive' });
    assert.equal(res.status, 200, res.text);
    assert.deepEqual((await eventsOf(his)).at(-1), { type: 'revoked', actor: null, target: leaving.userId });
    assert.ok((await noticesOf(his)).every(n => n.resolution === 'gone'));
    assert.ok((await noticesOf(asked)).every(n => n.resolution === 'gone'));
});

test('releaseAssignments no escribe revoked en una conversación que otro movió entre leer y soltar', async () => {
    const leaving = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'AHGONE5' });
    const kept = await fresh(leaving.userId);
    const moved = await fresh(leaving.userId);
    const original = Conversation.findOneAndUpdate;
    Conversation.findOneAndUpdate = function (filter, ...rest) {
        if (String(filter?._id) === String(moved._id) && filter.assignedTo) {
            // Justo antes de soltarla, otra persona se la asigna a Luis.
            return { select: () => ({ lean: async () => {
                await Conversation.updateOne({ _id: moved._id }, { $set: { assignedTo: luis.userId } });
                return original.call(this, filter, ...rest).select('transferRequest').lean();
            } }) };
        }
        return original.call(this, filter, ...rest);
    };
    try {
        assert.equal((await request(a, 'PATCH', `/team/members/${leaving.userId}`, { status: 'inactive' })).status, 200);
    } finally {
        Conversation.findOneAndUpdate = original;
    }
    assert.deepEqual((await eventsOf(kept)).map(e => e.type), ['revoked']);
    assert.deepEqual(await eventsOf(moved), [], 'escribió revoked en una que ya no era suya');
    assert.equal(String((await Conversation.findById(moved._id).lean()).assignedTo), luis.userId);
});

test('confirmAssignee deshace la asignación: ni evento ni aviso', async () => {
    const leaving = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'AHGONE6' });
    const conversation = await fresh();
    const original = Conversation.findOneAndUpdate;
    Conversation.findOneAndUpdate = function (...args) {
        const query = original.apply(this, args);
        const exec = query.exec.bind(query);
        query.exec = async (...e) => {
            const result = await exec(...e);
            // Después de escribir y antes de confirmar, le quitan la línea.
            await User.updateOne({ _id: leaving.userId }, { $set: { lineIds: [] } });
            return result;
        };
        return query;
    };
    let res;
    try {
        res = await assign(supervisor, conversation, leaving.userId);
    } finally {
        Conversation.findOneAndUpdate = original;
    }
    assert.equal(res.status, 409);
    assert.deepEqual(await eventsOf(conversation), []);
    assert.deepEqual(await noticesOf(conversation), []);
});

// Vigila la relectura de `notifyRequest`: sin ella, los avisos se emitían y
// quedaban pendientes de una solicitud ya aceptada (revisiones de Codex del spec, 2, y del plan, 3).
test('una solicitud aceptada mientras requestTransfer aún no creó sus avisos no deja ninguno pendiente ni los emite', async () => {
    const conversation = await fresh(ana.userId);
    const supStream = await openStream(supervisor);
    const original = Notification.insertMany;
    let raced = false;
    Notification.insertMany = async function (docs, ...rest) {
        if (!raced && docs[0]?.type === 'requested') {
            raced = true;
            const res = await answer(ana, conversation, 'accept', await pendingId(conversation));
            assert.equal(res.status, 200, res.text);
        }
        return original.call(this, docs, ...rest);
    };
    try {
        assert.equal((await ask(luis, conversation)).status, 202);
    } finally {
        Notification.insertMany = original;
    }
    try {
        assert.ok(raced);
        const requested = await Notification.find({ conversationId: conversation._id, type: 'requested' }).lean();
        assert.ok(requested.length > 0);
        assert.ok(requested.every(doc => doc.resolution !== null), 'quedó un aviso sin resolver');
        const supDoc = requested.find(doc => String(doc.recipientId) === supervisor.userId);
        const [shown] = await serializeNotifications(await memberAuth(a.accountId, supervisor.userId), [supDoc]);
        assert.equal(shown.request.pending, false);
        assert.equal(shown.request.canAnswer, false);
        await new Promise(resolve => setTimeout(resolve, 200));
        assert.equal(supStream.count('event: notification_created'), 0, 'se emitió el aviso de una solicitud que ya no estaba');
    } finally {
        await supStream.close();
    }
});

// Vigila que el evento lleve la fecha de la escritura ganadora (`at`) y no la de
// guardarlo: con la segunda, el hilo contaba «a Marta» antes que «a Luis» (revisión de Codex del spec, 5).
test('dos reasignaciones con las confirmaciones en orden inverso quedan en el hilo en el orden de sus escrituras', async () => {
    const conversation = await fresh();
    const originalUpdate = Conversation.findOneAndUpdate;
    const originalFind = User.findOne;
    let wroteA = false;
    let held = false;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let heldResolve;
    const isHeld = new Promise(resolve => { heldResolve = resolve; });
    Conversation.findOneAndUpdate = function (filter, update, ...rest) {
        const query = originalUpdate.call(this, filter, update, ...rest);
        if (!wroteA && String(update?.$set?.assignedTo) === luis.userId) {
            const exec = query.exec.bind(query);
            query.exec = async (...e) => { const result = await exec(...e); wroteA = true; return result; };
        }
        return query;
    };
    User.findOne = function (...args) {
        const query = originalFind.apply(this, args);
        if (wroteA && !held) {
            held = true;
            const exec = query.exec.bind(query);
            // La confirmación de A espera hasta que B haya terminado.
            query.exec = async (...e) => { heldResolve(); await gate; return exec(...e); };
        }
        return query;
    };
    try {
        const first = assign(supervisor, conversation, luis.userId);
        await isHeld;
        assert.equal((await assign(a, conversation, marta.userId)).status, 200);
        assert.equal(String((await Conversation.findById(conversation._id).lean()).assignedTo), marta.userId);
        release();
        assert.equal((await first).status, 200);
    } finally {
        Conversation.findOneAndUpdate = originalUpdate;
        User.findOne = originalFind;
    }
    assert.deepEqual((await eventsOf(conversation)).map(e => e.target), [luis.userId, marta.userId]);
    const res = await request(a, 'GET', `/chats/${conversation._id}/messages?events=1`);
    assert.deepEqual(res.body.events.map(e => e.target.id), [marta.userId, luis.userId], 'el hilo (del más nuevo al más viejo)');
});

