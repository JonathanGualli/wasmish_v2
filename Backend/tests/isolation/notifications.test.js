// La campanita (avisos de la asignación, spec § 5.2): cada persona lee y marca
// solo sus avisos, por páginas, con cuántos no vio de todos.
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
    seedAccount, seedMember, connectWhatsapp, request, openStream, ANONYMOUS,
    Contact, Conversation, Notification, User,
} from './helpers.js';

// TODO lo que se prepara con `await` va aquí, antes del primer `test()`.

const a = await seedAccount('NA', { seq: 85, maxLines: 2 });
const { lineId: l1 } = await connectWhatsapp(a, { phoneNumberId: '851' });
const ana = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'NAANA' });
const luis = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'NALUIS' });
const supervisor = await seedMember(a, { role: 'supervisor', lineIds: [l1], label: 'NASUP' });
const b = await seedAccount('NB', { seq: 86 });

let phoneSeq = 0;
const nextPhone = () => `59399009${String(400 + phoneSeq++).padStart(4, '0')}`;
const seedConversation = async (assignedTo = null) => {
    const phone = nextPhone();
    const contact = await Contact.create({ userId: a.accountId, phone, name: `Cliente ${phone}` });
    return Conversation.create({
        userId: a.accountId, contactId: contact._id, contactPhone: phone, phoneNumberId: '851', lineId: l1, assignedTo,
    });
};
const shared = await seedConversation(ana.userId);

/** Avisos con la fecha y el `_id` que se quieran (sin que Mongoose los cambie). */
const insertRaw = async (docs) => {
    await Notification.collection.insertMany(docs.map(doc => ({
        userId: new mongoose.Types.ObjectId(a.accountId), type: 'assigned', actorId: new mongoose.Types.ObjectId(supervisor.userId),
        conversationId: shared._id, requestId: null, resolution: null, seenAt: null, updatedAt: doc.createdAt, ...doc,
    })));
};
const list = (account, before) => request(account, 'GET', `/notifications${before ? `?before=${encodeURIComponent(before)}` : ''}`);
const allPages = async (account) => {
    const items = [];
    let before = null;
    for (let guard = 0; guard < 20; guard++) {
        const res = await list(account, before);
        assert.equal(res.status, 200, res.text);
        items.push(...res.body.items);
        if (!res.body.nextCursor) return items;
        before = res.body.nextCursor;
    }
    throw new Error('demasiadas páginas');
};

test('cada persona lee y marca solo los suyos; otra cuenta y sin sesión, nada', async () => {
    const recipient = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'NAOWN1' });
    const other = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'NAOWN2' });
    const now = new Date();
    const mineId = new mongoose.Types.ObjectId();
    await insertRaw([{ _id: mineId, recipientId: new mongoose.Types.ObjectId(recipient.userId), createdAt: now }]);

    const asOther = await list(other);
    assert.equal(asOther.status, 200);
    assert.deepEqual(asOther.body.items, []);
    assert.equal(asOther.body.unseenCount, 0);
    // Marcar un aviso ajeno no cambia nada y responde igual que uno inexistente.
    const otherSeen = await request(other, 'POST', '/notifications/seen', { ids: [String(mineId)] });
    assert.equal(otherSeen.status, 200);
    const fromB = await request(b, 'POST', '/notifications/seen', { all: true });
    assert.equal(fromB.status, 200);
    assert.equal((await Notification.findById(mineId).lean()).seenAt, null);
    assert.equal((await list(b)).body.items.length, 0);

    assert.equal((await list(ANONYMOUS)).status, 401);
    assert.equal((await request(ANONYMOUS, 'POST', '/notifications/seen', { all: true })).status, 401);

    const mine = await list(recipient);
    assert.deepEqual(mine.body.items.map(item => item.id), [String(mineId)]);
    assert.equal(mine.body.unseenCount, 1);
});

test('35 avisos: dos páginas sin repetir, unseenCount 35, y todos vistos de una vez', async () => {
    const recipient = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'NAMANY' });
    const base = Date.now();
    await insertRaw(Array.from({ length: 35 }, (_, i) => ({
        recipientId: new mongoose.Types.ObjectId(recipient.userId), createdAt: new Date(base - i * 1000),
    })));
    const first = await list(recipient);
    assert.equal(first.body.items.length, 30);
    assert.equal(first.body.unseenCount, 35);
    assert.ok(first.body.nextCursor);
    const items = await allPages(recipient);
    assert.equal(items.length, 35);
    assert.equal(new Set(items.map(item => item.id)).size, 35);

    const stream = await openStream(recipient);
    try {
        const seen = await request(recipient, 'POST', '/notifications/seen', { all: true });
        assert.equal(seen.status, 200);
        assert.equal(seen.body.unseenCount, 0);
        assert.ok(await stream.waitFor('event: notifications_seen', 2000), 'sus otras pestañas no se enteran');
    } finally {
        await stream.close();
    }
    assert.equal((await list(recipient)).body.unseenCount, 0);
});

test('con el mismo createdAt, o con los _id en otro orden que createdAt, se recorren por createdAt sin perder ninguno', async () => {
    const recipient = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'NATIES' });
    const to = new mongoose.Types.ObjectId(recipient.userId);
    const sameDate = new Date(Date.now() - 60_000);
    // 32 con la misma fecha: el corte de la página cae en medio de ellos.
    const ties = Array.from({ length: 32 }, () => ({ _id: new mongoose.Types.ObjectId(), recipientId: to, createdAt: sameDate }));
    // 5 cuyos _id van al revés que su fecha (el más nuevo tiene el _id más viejo).
    const ids = Array.from({ length: 5 }, () => new mongoose.Types.ObjectId());
    const reversed = ids.map((_id, i) => ({ _id, recipientId: to, createdAt: new Date(Date.now() - (i + 1) * 1000) })).reverse();
    await insertRaw([...ties, ...reversed]);

    const items = await allPages(recipient);
    assert.equal(items.length, 37);
    assert.equal(new Set(items.map(item => item.id)).size, 37);
    const dates = items.map(item => Date.parse(item.createdAt));
    assert.deepEqual(dates, [...dates].sort((x, y) => y - x), 'no van del más nuevo al más viejo');
});

test('un aviso de una conversación borrada sale con conversation: null', async () => {
    const recipient = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'NAGONE' });
    const doomed = await seedConversation();
    await Notification.create({ userId: a.accountId, recipientId: recipient.userId, type: 'assigned', actorId: supervisor.userId, conversationId: doomed._id });
    await Conversation.deleteOne({ _id: doomed._id });
    const res = await list(recipient);
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.items[0].conversation, null);
});

test('canAnswer: sí para quien la atiende y el supervisor; no para un supervisor que perdió la línea', async () => {
    const lostSup = await seedMember(a, { role: 'supervisor', lineIds: [l1], label: 'NALOSTSUP' });
    const conversation = await seedConversation(ana.userId);
    const res = await request(luis, 'POST', `/chats/${conversation._id}/transfer-request`);
    assert.equal(res.status, 202, res.text);
    const requestedFor = async (account) => (await list(account)).body.items.find(item => item.conversation?.id === String(conversation._id));
    assert.equal((await requestedFor(ana)).request.canAnswer, true);
    assert.equal((await requestedFor(supervisor)).request.canAnswer, true);
    assert.equal((await requestedFor(lostSup)).request.canAnswer, true);

    await User.updateOne({ _id: lostSup.userId }, { $set: { lineIds: [] } });
    const lost = await requestedFor(lostSup);
    assert.equal(lost.conversation.canOpen, false);
    assert.equal(lost.request.pending, true);
    assert.equal(lost.request.canAnswer, false);
});

test('una solicitud aceptada mientras se creaban sus avisos sale por HTTP con pending y canAnswer falsos', async () => {
    const conversation = await seedConversation(ana.userId);
    const original = Notification.insertMany;
    let raced = false;
    Notification.insertMany = async function (docs, ...rest) {
        if (!raced && docs[0]?.type === 'requested') {
            raced = true;
            const requestId = String((await Conversation.findById(conversation._id).lean()).transferRequest.id);
            const res = await request(ana, 'POST', `/chats/${conversation._id}/transfer-request/accept`, { requestId });
            assert.equal(res.status, 200, res.text);
        }
        return original.call(this, docs, ...rest);
    };
    try {
        assert.equal((await request(luis, 'POST', `/chats/${conversation._id}/transfer-request`)).status, 202);
    } finally {
        Notification.insertMany = original;
    }
    const item = (await list(supervisor)).body.items.find(entry => entry.conversation?.id === String(conversation._id) && entry.type === 'requested');
    assert.ok(item);
    assert.equal(item.request.pending, false);
    assert.equal(item.request.canAnswer, false);
    assert.equal(item.resolution.status, 'gone');
});

test('un cursor mal formado da 400', async () => {
    assert.equal((await list(ana, 'basura')).status, 400);
});
