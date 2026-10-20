// Reacciones (citas y reacciones, spec 2026-10-20): `applyReaction` pega el
// emoji a su original solo si es de la cuenta, la línea y el contacto del
// webhook, solo avanza, no reaplica un reintento y no crea mensajes ni suma no
// leídos. Se llama directo, sin webhook: el camino del webhook lo prueba webhook.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seedAccount, connectWhatsapp, openStream, Contact, Conversation, Message } from './helpers.js';

const { applyReaction } = await import('../../src/services/reaction.service.js');

const a = await seedAccount('RX', { seq: 131, maxLines: 2 });
const b = await seedAccount('RXB', { seq: 132 });
const { lineId: lineA1 } = await connectWhatsapp(a, { phoneNumberId: '13101' });
const { lineId: lineA2 } = await connectWhatsapp(a, { phoneNumberId: '13102' });
const { lineId: lineB } = await connectWhatsapp(b, { phoneNumberId: '13201' });
const LINE_A1 = { accountId: a.accountId, lineId: lineA1, phoneNumberId: '13101' };
const LINE_A2 = { accountId: a.accountId, lineId: lineA2, phoneNumberId: '13102' };
const LINE_B = { accountId: b.accountId, lineId: lineB, phoneNumberId: '13201' };

const BASE = Date.UTC(2026, 9, 20, 10, 0, 0);
const at = (seconds) => new Date(BASE + seconds * 1000);

let seq = 0;
const nextPhone = () => `5939913${String(++seq).padStart(5, '0')}`;

/** Un contacto con su conversación en `line`. `identity` es la que mandaría Meta. */
const chat = async ({ account = a, line = LINE_A1 } = {}) => {
    const phone = nextPhone();
    const contact = await Contact.create({ userId: account.accountId, phone });
    const conversation = await Conversation.create({
        userId: account.accountId, contactId: contact._id, contactPhone: phone,
        phoneNumberId: line.phoneNumberId, lineId: line.lineId, unreadCount: 2, lastMessageAt: null,
    });
    return { contact, conversation, identity: { phone, waUserId: null } };
};

/** Un mensaje de la conversación; si es el más nuevo, pasa a su vista previa (como el webhook). */
const message = async (conversation, { direction = 'outbound', text = 'Te paso la cotización', ts = at(0) } = {}) => {
    const msg = await Message.create({
        conversationId: conversation._id, direction, sender: direction === 'inbound' ? 'them' : 'me',
        waMessageId: `wamid.rx.${++seq}`, type: 'text', text, timestamp: ts,
    });
    await Conversation.updateOne(
        { _id: conversation._id, $or: [{ lastMessageAt: null }, { lastMessageAt: { $lte: ts } }] },
        { $set: { lastMessage: text, lastMessageAt: ts } },
    );
    return msg;
};

const reactionTo = (msg, emoji, seconds, waMessageId = `wamid.re.${++seq}`) => ({
    waMessageId, targetWaMessageId: msg.waMessageId, emoji, timestamp: at(seconds),
});
const react = (reaction, identity, { line = LINE_A1, side = 'them', origin = null } = {}) =>
    applyReaction({ line, reaction, side, identity, origin });

const reload = (msg) => Message.findById(msg._id).lean();
const conversationOf = (conversation) => Conversation.findById(conversation._id).lean();
const countMessages = (conversation) => Message.countDocuments({ conversationId: conversation._id });

test('poner 👍: se pega al original, la bandeja lo dice y no suma no leídos ni crea mensajes', async () => {
    const { conversation, identity } = await chat();
    const msg = await message(conversation, { text: 'Te paso la cotización de los volantes de mañana' });
    const before = await conversationOf(conversation);
    const stream = await openStream(a);
    try {
        assert.equal(await react(reactionTo(msg, '👍', 60), identity), 'applied');
        const saved = await reload(msg);
        assert.equal(saved.reactions.them.emoji, '👍');
        assert.equal(saved.reactions.them.at.getTime(), at(60).getTime());
        assert.equal(saved.changeVersion, 1);

        const after = await conversationOf(conversation);
        assert.equal(after.lastMessage, 'Reaccionó 👍 a: «Te paso la cotización de los volantes de…»');
        assert.equal(after.lastMessageAt.getTime(), at(60).getTime());
        assert.equal(after.unreadCount, before.unreadCount);
        assert.equal(after.lastInboundAt ?? null, before.lastInboundAt ?? null);
        assert.equal(await countMessages(conversation), 1);

        assert.ok(await stream.waitFor('event: message_updated', 2000));
        assert.ok(await stream.waitFor('"emoji":"👍"', 2000));
        assert.ok(await stream.waitFor('"canReply":true', 2000));
        assert.ok(await stream.waitFor('event: conversation_updated', 2000));
    } finally {
        await stream.close();
    }
});

test('un reintento de Meta no hace nada, y una más vieja tampoco', async () => {
    const { conversation, identity } = await chat();
    const msg = await message(conversation);
    const heart = reactionTo(msg, '❤️', 60);
    assert.equal(await react(heart, identity), 'applied');
    assert.equal(await react(heart, identity), 'unchanged');
    assert.equal(await react(reactionTo(msg, '👍', 30), identity), 'unchanged');
    const saved = await reload(msg);
    assert.equal(saved.reactions.them.emoji, '❤️');
    assert.equal(saved.changeVersion, 1);
});

test('quitarla deja la marca de la retirada y no toca la bandeja; una vieja no la resucita', async () => {
    const { conversation, identity } = await chat();
    const msg = await message(conversation);
    assert.equal(await react(reactionTo(msg, '👍', 60), identity), 'applied');
    const preview = (await conversationOf(conversation)).lastMessage;

    assert.equal(await react(reactionTo(msg, null, 70), identity), 'applied');
    const saved = await reload(msg);
    assert.equal(saved.reactions.them.emoji, null);
    assert.equal(saved.reactions.them.at.getTime(), at(70).getTime());
    assert.equal((await conversationOf(conversation)).lastMessage, preview);

    assert.equal(await react(reactionTo(msg, '😂', 65), identity), 'unchanged');
    assert.equal((await reload(msg)).reactions.them.emoji, null);
});

// Revisión de Codex del plan, 3: con A → B del mismo segundo, un reintento de
// A se reaplicaba porque su id no era el último guardado, y el 👍 reaparecía.
test('A (👍) → B (quitar, mismo segundo) → reintento de A: sigue sin reacción', async () => {
    const { conversation, identity } = await chat();
    const msg = await message(conversation);
    const first = reactionTo(msg, '👍', 60);
    assert.equal(await react(first, identity), 'applied');
    assert.equal(await react(reactionTo(msg, null, 60), identity), 'applied');
    assert.equal(await react(first, identity), 'unchanged');
    assert.equal((await reload(msg)).reactions.them.emoji, null);
});

test('reacciona a un mensaje guardado antes del campo', async () => {
    const { conversation, identity } = await chat();
    const waMessageId = `wamid.rx.viejo.${++seq}`;
    const { insertedId } = await Message.collection.insertOne({
        conversationId: conversation._id, direction: 'outbound', sender: 'me', waMessageId,
        type: 'text', text: 'de antes', timestamp: at(0), createdAt: at(0), updatedAt: at(0),
    });
    assert.equal(await react(reactionTo({ waMessageId }, '👍', 60), identity), 'applied');
    assert.equal((await Message.findById(insertedId).lean()).reactions.them.emoji, '👍');
});

test('el contacto reacciona a su propio mensaje', async () => {
    const { conversation, identity } = await chat();
    const msg = await message(conversation, { direction: 'inbound', text: 'mi pedido' });
    assert.equal(await react(reactionTo(msg, '🙏', 60), identity), 'applied');
    assert.equal((await reload(msg)).reactions.them.emoji, '🙏');
});

test('con algo más nuevo en la bandeja, la reacción a un mensaje viejo no la hace retroceder', async () => {
    const { conversation, identity } = await chat();
    const old = await message(conversation, { text: 'viejo', ts: at(0) });
    await message(conversation, { text: 'el más nuevo', ts: at(100) });
    assert.equal(await react(reactionTo(old, '👍', 50), identity), 'applied');
    const after = await conversationOf(conversation);
    assert.equal(after.lastMessage, 'el más nuevo');
    assert.equal(after.lastMessageAt.getTime(), at(100).getTime());
});

test('original de otra cuenta, de la otra línea o de otro contacto: no se toca', async () => {
    const mine = await chat();
    const msg = await message(mine.conversation);

    const other = await chat({ account: b, line: LINE_B });
    const foreign = await message(other.conversation);
    assert.equal(await react(reactionTo(foreign, '👍', 60), other.identity), 'not_found', 'otra cuenta');

    const otherLine = await chat({ line: LINE_A2 });
    const onLine2 = await message(otherLine.conversation);
    assert.equal(await react(reactionTo(onLine2, '👍', 60), otherLine.identity), 'not_found', 'la otra línea');

    const stranger = await chat();
    assert.equal(await react(reactionTo(msg, '👍', 60), stranger.identity), 'rejected', 'otro contacto');

    assert.equal(await react(reactionTo({ waMessageId: 'wamid.no.existe' }, '👍', 60), mine.identity), 'not_found');

    for (const m of [msg, foreign, onLine2]) assert.equal((await reload(m)).reactions, undefined);
});

test('la nuestra desde la app (eco): reactions.me con su origen y la bandeja «Reaccionaste»', async () => {
    const { conversation, identity } = await chat();
    const msg = await message(conversation, { direction: 'inbound', text: 'gracias' });
    assert.equal(await react(reactionTo(msg, '❤️', 60), identity, { side: 'me', origin: 'businessApp' }), 'applied');
    const saved = await reload(msg);
    assert.equal(saved.reactions.me.emoji, '❤️');
    assert.equal(saved.reactions.me.origin, 'businessApp');
    assert.equal(saved.reactions.me.status, 'sent');
    assert.equal(saved.reactions.them, undefined);
    assert.equal((await conversationOf(conversation)).lastMessage, 'Reaccionaste ❤️ a: «gracias»');
});

// Revisión de Codex del PR #115: con 👍 y ❤️ del mismo segundo, la bandeja de
// la primera se escribía DESPUÉS de la segunda y se quedaba «Reaccionó 👍»
// aunque el mensaje tuviera ❤️. Aquí la primera escritura de la bandeja espera
// a que la segunda reacción se aplique entera.
test('dos reacciones cruzadas: la bandeja queda con la vigente', async () => {
    const { conversation, identity } = await chat();
    const msg = await message(conversation, { text: 'Pedido' });
    const original = Conversation.updateOne;
    let intercepted = false;
    Conversation.updateOne = function (...args) {
        if (!intercepted && args[1]?.$set?.lastMessage?.startsWith('Reaccionó 👍')) {
            intercepted = true;
            Conversation.updateOne = original;
            const query = original.apply(this, args);
            const exec = query.exec.bind(query);
            query.exec = async () => { await react(reactionTo(msg, '❤️', 60), identity); return exec(); };
            return query;
        }
        return original.apply(this, args);
    };
    try {
        assert.equal(await react(reactionTo(msg, '👍', 60), identity), 'applied');
    } finally {
        Conversation.updateOne = original;
    }
    assert.ok(intercepted, 'el test no forzó el cruce');
    assert.equal((await reload(msg)).reactions.them.emoji, '❤️');
    assert.equal((await conversationOf(conversation)).lastMessage, 'Reaccionó ❤️ a: «Pedido»');
});
