// Responder citando y reaccionar desde Wasmish (citas y reacciones, spec
// 2026-10-20, PR 3 del plan). El citado y el mensaje al que se reacciona tienen
// que ser de LA MISMA conversación, que tiene que estar al alcance de la
// sesión: lo ajeno responde 404 y nunca llega a Meta.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    seedAccount, seedMember, request, connectWhatsapp, onMeta, metaCalls, openStream, postWebhook,
    Contact, Conversation, Message, PNG,
} from './helpers.js';

// Todo lo que se prepara con `await` va antes del primer `test()` (ver chats.test.js).
const r = await seedAccount('RR', { seq: 133, maxLines: 2 });
const other = await seedAccount('RRB', { seq: 134 });
const { lineId: line1 } = await connectWhatsapp(r, { phoneNumberId: '13301' });
const { lineId: line2 } = await connectWhatsapp(r, { phoneNumberId: '13302' });
const agent = await seedMember(r, { role: 'agent', lineIds: [line1], label: 'RRA' });
await connectWhatsapp(other, { phoneNumberId: '13401' });

let seq = 0;
const DAY = 24 * 60 * 60 * 1000;

/** Una conversación con la ventana abierta en `lineId` (de la cuenta `account`). */
const openChat = async ({ account = r, lineId = line1, phoneNumberId = '13301' } = {}) => {
    const phone = `5939933${String(++seq).padStart(5, '0')}`;
    const contact = await Contact.create({ userId: account.accountId, phone, name: `contacto ${phone}` });
    return Conversation.create({
        userId: account.accountId, contactId: contact._id, contactPhone: phone,
        phoneNumberId, lineId, lastInboundAt: new Date(), unreadCount: 2,
    });
};
const inboundIn = (conversation, { text = 'Tarjetas de 500, ¿cuánto?', ago = 0, ...extra } = {}) => Message.create({
    conversationId: conversation._id, direction: 'inbound', sender: 'them', text,
    waMessageId: `wamid.rr.in.${++seq}`, timestamp: new Date(Date.now() - ago), ...extra,
});

/** Meta acepta: guarda el cuerpo de cada envío. `wait`: una promesa que retiene la respuesta. */
let sent = [];
const metaAccepts = ({ wait = null } = {}) => onMeta(async (config) => {
    if (config.method !== 'post') return undefined;
    if (config.url.endsWith('/media')) return { data: { id: `media.rr.${++seq}` } };
    if (!config.url.endsWith('/messages')) return undefined;
    sent.push(JSON.parse(config.data));
    if (wait) await wait;
    return { data: { messages: [{ id: `wamid.rr.out.${++seq}` }] } };
});
const metaRejects = () => onMeta(async (config) => {
    if (config.method === 'post' && config.url.endsWith('/messages')) {
        throw Object.assign(new Error('Meta rechazó'), { waErrorCode: 131009, waErrorDetail: 'Parameter value is not valid' });
    }
    return undefined;
});
test.beforeEach(() => { sent = []; });
test.afterEach(() => { onMeta(null); });

// --- Responder citando -------------------------------------------------------

test('texto citando un mensaje de la conversación: el context a Meta y la cita igual en HTTP, SSE y GET', async () => {
    const conversation = await openChat();
    const quoted = await inboundIn(conversation);
    metaAccepts();
    const stream = await openStream(r);
    try {
        const res = await request(r, 'POST', `/chats/${conversation._id}/messages`,
            { text: 'Salen en 2 días', temporalId: 'rq1', replyToMessageId: String(quoted._id) });
        assert.equal(res.status, 201, res.text);
        assert.deepEqual(sent.at(-1).context, { message_id: quoted.waMessageId });
        assert.equal(res.body.replyTo.id, String(quoted._id));
        assert.equal(res.body.replyTo.text, 'Tarjetas de 500, ¿cuánto?');
        assert.ok(await stream.waitFor(`"replyTo":{"id":"${quoted._id}"`, 2000), 'el message_created no trae la cita');

        const list = await request(r, 'GET', `/chats/${conversation._id}/messages`);
        assert.deepEqual(list.body.items.find(item => item.id === res.body.id).replyTo, res.body.replyTo);
    } finally {
        await stream.close();
    }
});

test('archivo citando (X-Reply-To): también lleva el context', async () => {
    const conversation = await openChat();
    const quoted = await inboundIn(conversation);
    metaAccepts();
    const res = await request(r, 'POST', `/chats/${conversation._id}/media`, PNG,
        { 'Content-Type': 'image/png', 'X-Filename': 'muestra.png', 'X-Reply-To': String(quoted._id) });
    assert.equal(res.status, 201, res.text);
    assert.deepEqual(sent.at(-1).context, { message_id: quoted.waMessageId });
    assert.equal(res.body.replyTo.id, String(quoted._id));
});

test('citar un mensaje de otra conversación, de otra cuenta o de una línea fuera del alcance → 404 sin llamar a Meta', async () => {
    const conversation = await openChat();
    const elsewhere = await inboundIn(await openChat());
    const foreign = await inboundIn(await openChat({ account: other, lineId: null, phoneNumberId: '13401' }));
    const onLine2 = await inboundIn(await openChat({ lineId: line2, phoneNumberId: '13302' }));
    metaAccepts();
    const calls = metaCalls.length;

    for (const [label, who, id] of [
        ['otra conversación', r, elsewhere._id], ['otra cuenta', r, foreign._id], ['id inválido', r, 'no-es-un-id'],
        ['la otra línea, como agente', agent, onLine2._id],
    ]) {
        const res = await request(who, 'POST', `/chats/${conversation._id}/messages`, { text: 'x', temporalId: 'rq', replyToMessageId: String(id) });
        assert.equal(res.status, 404, `${label}: ${res.text}`);
    }
    const file = await request(r, 'POST', `/chats/${conversation._id}/media`, PNG,
        { 'Content-Type': 'image/png', 'X-Filename': 'f.png', 'X-Reply-To': String(foreign._id) });
    assert.equal(file.status, 404, file.text);
    assert.equal(metaCalls.length, calls);
});

test('citar un mensaje que no salió (sin wamid) → 400 reply_unavailable; sin conversación → 400', async () => {
    const conversation = await openChat();
    const failed = await Message.create({
        conversationId: conversation._id, direction: 'outbound', sender: 'me', text: 'no salió', status: 'failed', waMessageId: null,
    });
    const calls = metaCalls.length;
    const res = await request(r, 'POST', `/chats/${conversation._id}/messages`, { text: 'x', temporalId: 'rq', replyToMessageId: String(failed._id) });
    assert.equal(res.status, 400, res.text);
    assert.equal(res.body[0].code, 'reply_unavailable');

    const fresh = await request(r, 'POST', '/chats/messages', { text: 'x', destinationNumber: '593990003300', replyToMessageId: String(failed._id) });
    assert.equal(fresh.status, 400, fresh.text);
    assert.equal(metaCalls.length, calls);
});

test('Meta rechaza la respuesta: el fallido se guarda con su cita', async () => {
    const conversation = await openChat();
    const quoted = await inboundIn(conversation);
    metaRejects();
    const res = await request(r, 'POST', `/chats/${conversation._id}/messages`, { text: 'x', temporalId: 'rq', replyToMessageId: String(quoted._id) });
    assert.equal(res.status, 201, res.text);
    assert.equal(res.body.status, 'failed');
    assert.equal(res.body.replyTo.id, String(quoted._id));
    const list = await request(r, 'GET', `/chats/${conversation._id}/messages`);
    assert.equal(list.body.items.find(item => item.id === res.body.id).replyTo.id, String(quoted._id));
});

// --- Reaccionar --------------------------------------------------------------

const react = (who, conversation, message, emoji) =>
    request(who, 'PUT', `/chats/${conversation._id}/messages/${message._id}/reaction`, { emoji });

test('poner 👍: a Meta, firmada, en la bandeja, lee la conversación y no pausa al bot', async () => {
    const conversation = await openChat();
    const target = await inboundIn(conversation, { text: 'Gracias, ya les hice la transferencia.' });
    metaAccepts();
    const res = await react(agent, conversation, target, '👍');
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(sent.at(-1).reaction, { message_id: target.waMessageId, emoji: '👍' });
    assert.equal(sent.at(-1).type, 'reaction');
    assert.equal(res.body.reactions.me.emoji, '👍');
    assert.deepEqual(res.body.reactions.me.sentBy, { id: agent.userId, name: 'RRA miembro' });

    const after = await Conversation.findById(conversation._id).lean();
    assert.equal(after.lastMessage, 'Reaccionaste 👍 a: «Gracias, ya les hice la transferencia.»');
    assert.equal(after.unreadCount, 0);
    assert.equal(after.bot?.humanRepliedAt ?? null, null, 'reaccionar pausó al bot');
});

test('quitarla: Meta recibe emoji vacío, la respuesta sin reacción y la bandeja igual', async () => {
    const conversation = await openChat();
    const target = await inboundIn(conversation);
    metaAccepts();
    assert.equal((await react(r, conversation, target, '❤️')).status, 200);
    const preview = (await Conversation.findById(conversation._id).lean()).lastMessage;

    const res = await react(r, conversation, target, '');
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(sent.at(-1).reaction, { message_id: target.waMessageId, emoji: '' });
    assert.equal(res.body.reactions.me, null);
    assert.equal((await Conversation.findById(conversation._id).lean()).lastMessage, preview);
    assert.equal((await Message.findById(target._id).lean()).reactions.me.previousEmoji, '❤️');
});

test('a un saliente, a uno de hace 31 días o con algo que no es un emoji → 400 sin llamar a Meta', async () => {
    const conversation = await openChat();
    const ours = await Message.create({
        conversationId: conversation._id, direction: 'outbound', sender: 'me', text: 'nuestro', waMessageId: `wamid.rr.o.${++seq}`,
    });
    const old = await inboundIn(conversation, { ago: 31 * DAY });
    const fine = await inboundIn(conversation);
    const calls = metaCalls.length;

    for (const target of [ours, old]) {
        const res = await react(r, conversation, target, '👍');
        assert.equal(res.status, 400, res.text);
        assert.equal(res.body[0].code, 'reaction_unavailable');
    }
    for (const emoji of ['hola', '👍👍', 'a']) {
        assert.equal((await react(r, conversation, fine, emoji)).status, 400, emoji);
    }
    assert.equal(metaCalls.length, calls);
});

test('reaccionar a un mensaje de otra conversación, de otra cuenta o de una línea fuera del alcance → 404', async () => {
    const conversation = await openChat();
    const elsewhere = await inboundIn(await openChat());
    const foreignChat = await openChat({ account: other, lineId: null, phoneNumberId: '13401' });
    const foreign = await inboundIn(foreignChat);
    const line2Chat = await openChat({ lineId: line2, phoneNumberId: '13302' });
    const onLine2 = await inboundIn(line2Chat);
    const calls = metaCalls.length;

    assert.equal((await react(r, conversation, elsewhere, '👍')).status, 404, 'otra conversación');
    assert.equal((await react(r, foreignChat, foreign, '👍')).status, 404, 'otra cuenta');
    assert.equal((await react(agent, line2Chat, onLine2, '👍')).status, 404, 'línea fuera del alcance');
    assert.equal((await request(r, 'PUT', `/chats/${conversation._id}/messages/no-es-un-id/reaction`, { emoji: '👍' })).status, 404);
    assert.equal(metaCalls.length, calls);
    assert.equal((await Message.findById(foreign._id).lean()).reactions, undefined);
});

test('Meta la rechaza: 502 con su código, nada guardado y el mensaje libre para otra', async () => {
    const conversation = await openChat();
    const target = await inboundIn(conversation);
    metaRejects();
    const res = await react(r, conversation, target, '👍');
    assert.equal(res.status, 502, res.text);
    assert.equal(res.body[0].errorCode, '131009');
    assert.equal((await Message.findById(target._id).lean()).reactions?.me, undefined);

    metaAccepts();
    assert.equal((await react(r, conversation, target, '🙏')).status, 200, 'el mensaje quedó tomado');
});

// Revisión de Codex del plan, 4: dos reacciones a la vez podían dejar en Wasmish
// una distinta de la que ve el contacto.
test('dos a la vez al mismo mensaje: la segunda 409 sin llamar a Meta, queda la primera', async () => {
    const conversation = await openChat();
    const target = await inboundIn(conversation);
    let release;
    metaAccepts({ wait: new Promise(resolve => { release = resolve; }) });

    const first = react(r, conversation, target, '👍');
    try {
        // Hasta que la primera está en Meta (tomó el mensaje), como mucho 2 s.
        const deadline = Date.now() + 2000;
        while (sent.length === 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
        assert.equal(sent.length, 1, 'la primera no llegó a Meta');
        // Sin el candado, la segunda se queda esperando a Meta: la carrera lo convierte en un fallo.
        const second = await Promise.race([
            react(agent, conversation, target, '❤️'),
            new Promise(resolve => setTimeout(() => resolve({ status: 'esperando a Meta', text: '' }), 2000)),
        ]);
        assert.equal(second.status, 409, second.text);
        assert.equal(second.body[0].code, 'reaction_in_progress');
        assert.equal(sent.length, 1);
    } finally {
        release();
    }
    assert.equal((await first).status, 200);
    const saved = await Message.findById(target._id).lean();
    assert.equal(saved.reactions.me.emoji, '👍');
    assert.equal(saved.reactions.sendingUntil ?? null, null, 'no soltó el mensaje');
});

// Revisión de Codex del plan, 6: si fallaba quitarla, la UI no se enteraba.
test('quitarla y que Meta lo rechace después: sale entera, con la que sigue viendo el contacto', async () => {
    const conversation = await openChat();
    const target = await inboundIn(conversation);
    metaAccepts();
    await react(r, conversation, target, '👍');
    await react(r, conversation, target, '');
    const reactionId = (await Message.findById(target._id).lean()).reactions.me.waMessageId;

    const res = await postWebhook('13301', { statuses: [{
        id: reactionId, status: 'failed', timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: conversation.contactPhone,
        errors: [{ code: 131009, title: 'Parameter value is not valid' }],
    }] });
    assert.equal(res.status, 200);
    const list = await request(r, 'GET', `/chats/${conversation._id}/messages`);
    const me = list.body.items.find(item => item.id === String(target._id)).reactions.me;
    assert.equal(me.emoji, null);
    assert.equal(me.previousEmoji, '👍');
    assert.equal(me.status, 'failed');
    assert.equal(me.errorCode, '131009');
});
