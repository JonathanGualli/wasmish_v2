// Los avisos de la asignación: la historia de cada conversación (eventos con
// los mensajes, spec § 5.1) y, desde la Tarea 4, lo que escribe cada camino.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    seedAccount, seedMember, connectWhatsapp, request, openStream,
    Contact, Conversation, ConversationEvent, Message,
} from './helpers.js';

const { recordEvent } = await import('../../src/services/assignment.history.service.js');

// TODO lo que se prepara con `await` va aquí, antes del primer `test()`.

// La cuenta A con la línea 811: Ana y Luis, agentes de 811; un supervisor con 811.
const a = await seedAccount('AH', { seq: 81, maxLines: 2 });
const { lineId: l1 } = await connectWhatsapp(a, { phoneNumberId: '811' });
const ana = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'AHANA' });
const luis = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'AHLUIS' });
const supervisor = await seedMember(a, { role: 'supervisor', lineIds: [l1], label: 'AHSUP' });
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
