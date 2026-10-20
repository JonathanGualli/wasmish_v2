// Mensajes eliminados y editados (coexistencia): `applyMessageChange` toca el
// original solo si es de la cuenta, la línea, la dirección y el contacto del
// webhook, y deja la bandeja con el estado final. Se llama directo, sin webhook:
// los dos caminos del webhook los prueba webhook.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seedAccount, connectWhatsapp, openStream, Contact, Conversation, Message } from './helpers.js';

const { applyMessageChange } = await import('../../src/services/message.change.service.js');

const a = await seedAccount('MC', { seq: 71, maxLines: 2 });
const b = await seedAccount('MCB', { seq: 72 });
const { lineId: lineA1 } = await connectWhatsapp(a, { phoneNumberId: '7101' });
const { lineId: lineA2 } = await connectWhatsapp(a, { phoneNumberId: '7102' });
const { lineId: lineB } = await connectWhatsapp(b, { phoneNumberId: '7201' });
const LINE_A1 = { accountId: a.accountId, lineId: lineA1, phoneNumberId: '7101' };
const LINE_A2 = { accountId: a.accountId, lineId: lineA2, phoneNumberId: '7102' };
const LINE_B = { accountId: b.accountId, lineId: lineB, phoneNumberId: '7201' };

const BASE = Date.UTC(2026, 9, 20, 10, 0, 0);
const at = (seconds) => new Date(BASE + seconds * 1000);

let seq = 0;
const nextPhone = () => `5939971${String(++seq).padStart(5, '0')}`;

/** Un contacto con su conversación en `line`. `identity` es la que mandaría Meta. */
const chat = async ({ account = a, line = LINE_A1, phone = nextPhone(), waUserId = null } = {}) => {
    const contact = await Contact.create({ userId: account.accountId, phone, waUserId });
    const conversation = await Conversation.create({
        userId: account.accountId, contactId: contact._id, contactPhone: phone,
        phoneNumberId: line.phoneNumberId, lineId: line.lineId, unreadCount: 2,
        // Sin mensajes todavía: `message()` la pone a la hora de cada uno, como el webhook.
        lastMessageAt: null,
    });
    return { contact, conversation, identity: { phone, waUserId } };
};

/** Un mensaje de la conversación; si es el más nuevo, pasa a su vista previa (como el webhook y los envíos). */
const message = async (conversation, { direction = 'inbound', type = 'text', text = 'original', caption = null, mediaFilename = null, ts = at(0) } = {}) => {
    const msg = await Message.create({
        conversationId: conversation._id, direction, sender: direction === 'inbound' ? 'them' : 'me',
        waMessageId: `wamid.mc.${++seq}`, type, text, caption, mediaFilename, timestamp: ts,
    });
    await Conversation.updateOne(
        { _id: conversation._id, $or: [{ lastMessageAt: null }, { lastMessageAt: { $lte: ts } }] },
        { $set: { lastMessage: text, lastMessageAt: ts } },
    );
    return msg;
};

const revokeOf = (msg, seconds = 60) => ({
    kind: 'revoke', waMessageId: `wamid.rv.${++seq}`, originalWaMessageId: msg.waMessageId, timestamp: at(seconds), content: null,
});
const editOf = (msg, text, seconds, { type = 'text', caption = null } = {}) => ({
    kind: 'edit', waMessageId: `wamid.ed.${++seq}`, originalWaMessageId: msg.waMessageId, timestamp: at(seconds),
    content: { type, text, caption },
});
const apply = (change, identity, { line = LINE_A1, direction = 'inbound' } = {}) =>
    applyMessageChange({ line, change, direction, identity });

const reload = (msg) => Message.findById(msg._id).lean();
const previewOf = async (conversation) => (await Conversation.findById(conversation._id).lean()).lastMessage;

test('borrar: marca la hora del borrado y conserva lo que decía; un reintento no cambia nada', async () => {
    const { conversation, identity } = await chat();
    const msg = await message(conversation, { type: 'image', text: 'El horario', caption: 'El horario' });
    const change = revokeOf(msg);

    assert.equal(await apply(change, identity), 'applied');
    let saved = await reload(msg);
    assert.equal(saved.deletedAt.getTime(), at(60).getTime());
    assert.equal(saved.text, 'El horario');
    assert.equal(saved.caption, 'El horario');
    assert.equal(saved.changeVersion, 1);

    assert.equal(await apply(change, identity), 'unchanged');
    saved = await reload(msg);
    assert.equal(saved.deletedAt.getTime(), at(60).getTime());
    assert.equal(saved.changeVersion, 1, 'un reintento no sube changeVersion');

    // Una edición encima de un borrado se aplica (sigue eliminado) y sube la versión.
    assert.equal(await apply(editOf(msg, 'Otro horario', 70, { type: 'image', caption: 'Otro horario' }), identity), 'applied');
    saved = await reload(msg);
    assert.equal(saved.changeVersion, 2);
    assert.ok(saved.deletedAt);
});

test('editar dos veces: el texto nuevo y las dos versiones anteriores, en orden de llegada', async () => {
    const { conversation, identity } = await chat();
    const msg = await message(conversation, { text: 'hola' });

    assert.equal(await apply(editOf(msg, 'hola!', 30), identity), 'applied');
    const second = editOf(msg, 'hola!!', 40);
    assert.equal(await apply(second, identity), 'applied');

    const saved = await reload(msg);
    assert.equal(saved.text, 'hola!!');
    assert.equal(saved.editedAt.getTime(), at(40).getTime());
    assert.equal(saved.changeVersion, 2);
    assert.deepEqual(saved.previousVersions.map(v => [v.text, v.editedAt.getTime()]), [
        ['hola', at(0).getTime()],
        ['hola!', at(30).getTime()],
    ]);

    assert.equal(await apply(second, identity), 'unchanged', 'reintento de la misma edición');
    assert.equal(await apply(editOf(msg, 'vieja', 35), identity), 'unchanged', 'una edición vieja que llega tarde');
    const after = await reload(msg);
    assert.equal(after.text, 'hola!!');
    assert.equal(after.previousVersions.length, 2);
    assert.equal(after.changeVersion, 2);
});

// Revisión de Codex del spec, 5: una edición más nueva no se pierde porque su entrega se solapó con la de una más vieja.
for (const [label, order] of [['la vieja primero', [40, 50]], ['la nueva primero', [50, 40]]]) {
    test(`dos ediciones a la vez (${label}): queda la más nueva`, async () => {
        const { conversation, identity } = await chat();
        const msg = await message(conversation, { text: 'precio: 10' });
        await Promise.all(order.map(seconds => apply(editOf(msg, `precio a las ${seconds}`, seconds), identity)));
        const saved = await reload(msg);
        assert.equal(saved.text, 'precio a las 50');
        assert.equal(saved.editedAt.getTime(), at(50).getTime());
    });
}

test('edita un mensaje guardado antes de los campos nuevos', async () => {
    const { conversation, identity } = await chat();
    const waMessageId = `wamid.mc.viejo.${++seq}`;
    const { insertedId } = await Message.collection.insertOne({
        conversationId: conversation._id, direction: 'inbound', sender: 'them', waMessageId,
        type: 'text', text: 'de antes', timestamp: at(0), createdAt: at(0), updatedAt: at(0),
    });
    assert.equal(await apply(editOf({ waMessageId }, 'de ahora', 30), identity), 'applied');
    const saved = await Message.findById(insertedId).lean();
    assert.equal(saved.text, 'de ahora');
    assert.equal(saved.previousVersions[0].editedAt.getTime(), at(0).getTime());
});

test('editar un documento y quitarle el pie deja el nombre del archivo', async () => {
    const { conversation, identity } = await chat();
    const msg = await message(conversation, { type: 'document', text: 'Mira', caption: 'Mira', mediaFilename: 'Temario.pdf' });
    assert.equal(await apply(editOf(msg, 'Documento', 30, { type: 'document' }), identity), 'applied');
    const saved = await reload(msg);
    assert.equal(saved.text, 'Temario.pdf');
    assert.equal(saved.caption, null);
});

test('una edición con otro tipo que el original no se aplica', async () => {
    const { conversation, identity } = await chat();
    const msg = await message(conversation, { type: 'image', text: 'Imagen' });
    assert.equal(await apply(editOf(msg, 'texto', 30), identity), 'rejected');
    const saved = await reload(msg);
    assert.equal(saved.text, 'Imagen');
    assert.equal(saved.editedAt, null);
});

test('un original de otra cuenta, otra línea, otra dirección u otro contacto no se toca', async () => {
    const own = await chat();
    const ownMsg = await message(own.conversation);

    // Otra cuenta: el mensaje es de B y el cambio llega por la línea de A.
    const other = await chat({ account: b, line: LINE_B });
    const otherMsg = await message(other.conversation);
    assert.equal(await apply(revokeOf(otherMsg), other.identity), 'not_found');
    assert.equal((await reload(otherMsg)).deletedAt, null);

    // Otra línea de la misma cuenta.
    const inA2 = await chat({ line: LINE_A2 });
    const a2Msg = await message(inA2.conversation);
    assert.equal(await apply(revokeOf(a2Msg), inA2.identity), 'not_found');
    assert.equal((await reload(a2Msg)).deletedAt, null);
    // Control: por su línea, sí.
    assert.equal(await apply(revokeOf(a2Msg), inA2.identity, { line: LINE_A2 }), 'applied');

    // Otra dirección: un borrado del contacto no toca un saliente.
    const outMsg = await message(own.conversation, { direction: 'outbound', ts: at(1) });
    assert.equal(await apply(revokeOf(outMsg), own.identity), 'rejected');
    assert.equal((await reload(outMsg)).deletedAt, null);

    // Otro contacto (entrante): el remitente no es el de la conversación.
    const stranger = await chat();
    assert.equal(await apply(revokeOf(ownMsg), stranger.identity), 'rejected');
    assert.equal(await apply(revokeOf(ownMsg), { phone: null, waUserId: null }), 'rejected', 'sin identidad');
    assert.equal(await apply(revokeOf(ownMsg), { phone: '593990009999', waUserId: null }), 'rejected', 'contacto que no existe');
    assert.equal((await reload(ownMsg)).deletedAt, null);

    // Inexistente.
    assert.equal(await apply(revokeOf({ waMessageId: 'wamid.no.existe' }), own.identity), 'not_found');
});

// Revisión de Codex del spec, 1: un eco a A con el id de un saliente a B, en la misma cuenta y línea, tocaba el de B.
test('un eco solo toca un saliente de su destinatario, también buscado solo por BSUID', async () => {
    const recipient = await chat({ phone: nextPhone(), waUserId: `EC.MC${++seq}` });
    const msg = await message(recipient.conversation, { direction: 'outbound', text: 'te paso el precio' });
    const otherRecipient = await chat({ waUserId: `EC.MC${++seq}` });

    assert.equal(await apply(revokeOf(msg), { phone: null, waUserId: otherRecipient.identity.waUserId }, { direction: 'outbound' }), 'rejected');
    assert.equal(await apply(revokeOf(msg), { phone: null, waUserId: null }, { direction: 'outbound' }), 'rejected', 'eco sin destinatario');
    assert.equal((await reload(msg)).deletedAt, null);

    assert.equal(await apply(revokeOf(msg), { phone: null, waUserId: recipient.identity.waUserId }, { direction: 'outbound' }), 'applied');
});

test('la bandeja: solo cambia si era el último, y eliminado manda en los dos órdenes', async () => {
    // No es el último: la vista previa no cambia.
    const first = await chat();
    const older = await message(first.conversation, { text: 'viejo', ts: at(0) });
    await message(first.conversation, { text: 'nuevo', ts: at(5) });
    await apply(revokeOf(older), first.identity);
    assert.equal(await previewOf(first.conversation), 'nuevo');

    // Borrado y después edición.
    const second = await chat();
    const m2 = await message(second.conversation, { text: 'hola' });
    await apply(revokeOf(m2, 60), second.identity);
    assert.equal(await previewOf(second.conversation), 'Mensaje eliminado');
    await apply(editOf(m2, 'hola!', 70), second.identity);
    assert.equal(await previewOf(second.conversation), 'Mensaje eliminado');

    // Edición y después borrado.
    const third = await chat();
    const m3 = await message(third.conversation, { text: 'hola' });
    await apply(editOf(m3, 'hola!', 30), third.identity);
    assert.equal(await previewOf(third.conversation), 'hola!');
    await apply(revokeOf(m3, 60), third.identity);
    assert.equal(await previewOf(third.conversation), 'Mensaje eliminado');

    // Los dos a la vez (revisión de Codex del plan, 1).
    const fourth = await chat();
    const m4 = await message(fourth.conversation, { text: 'hola' });
    await Promise.all([apply(editOf(m4, 'hola!', 30), fourth.identity), apply(revokeOf(m4, 60), fourth.identity)]);
    assert.equal(await previewOf(fourth.conversation), 'Mensaje eliminado');
});

// Revisión de Codex del plan, 1: la edición lee su estado y, antes de escribir la bandeja, entra el
// borrado entero. Sin releer el mensaje tras escribir, la edición dejaba su texto en la bandeja de
// un mensaje eliminado. `Promise.all` no garantiza este orden; aquí se fuerza.
test('un borrado que se cuela entre la lectura y la escritura de la bandeja de una edición: queda eliminado', async () => {
    const { conversation, identity } = await chat();
    const msg = await message(conversation, { text: 'hola' });
    const original = Conversation.updateOne;
    let intercepted = false;
    Conversation.updateOne = async function (...args) {
        if (!intercepted) {
            intercepted = true;
            Conversation.updateOne = original;
            await apply(revokeOf(msg, 60), identity);
        }
        return original.apply(this, args);
    };
    try {
        assert.equal(await apply(editOf(msg, 'hola!', 30), identity), 'applied');
    } finally {
        Conversation.updateOne = original;
    }
    assert.ok(intercepted);
    assert.equal(await previewOf(conversation), 'Mensaje eliminado');
});

// Revisión de Codex del PR #109, 1: los entrantes traen la hora en segundos. M2, del mismo segundo que
// M1, llega entre la comprobación del último y la escritura: la condición `lastMessageAt <= timestamp`
// lo deja pasar, y el borrado de M1 dejaba «Mensaje eliminado» como vista previa de M2.
test('un mensaje del mismo segundo que se cuela antes de escribir la bandeja: queda su vista previa', async () => {
    const { conversation, identity } = await chat();
    const msg = await message(conversation, { text: 'M1', ts: at(0) });
    const original = Conversation.updateOne;
    let intercepted = false;
    Conversation.updateOne = async function (...args) {
        if (!intercepted) {
            intercepted = true;
            Conversation.updateOne = original;
            await message(conversation, { text: 'M2', ts: at(0) });
        }
        return original.apply(this, args);
    };
    try {
        assert.equal(await apply(revokeOf(msg), identity), 'applied');
    } finally {
        Conversation.updateOne = original;
    }
    assert.ok(intercepted);
    assert.equal(await previewOf(conversation), 'M2');
});

// Revisión de Codex del PR #109, 2: la edición escribe su vista previa y, antes de avisar, entra el
// borrado entero y avisa «Mensaje eliminado». La edición avisaba después con su «hola!»: el último
// aviso enseñaba el texto de un mensaje eliminado, aunque la BD quedaba bien.
test('dos cambios que se cruzan: ningún aviso de la bandeja enseña el texto de antes', async () => {
    const { conversation, identity } = await chat();
    const msg = await message(conversation, { text: 'hola' });
    const original = Conversation.findById;
    let intercepted = false;
    const stream = await openStream(a);
    Conversation.findById = function (...args) {
        if (!intercepted) {
            intercepted = true;
            Conversation.findById = original;
            // El borrado entero antes de que la edición lea lo que va a avisar.
            const query = original.apply(this, args);
            const exec = query.exec.bind(query);
            query.exec = async () => { await apply(revokeOf(msg, 60), identity); return exec(); };
            return query;
        }
        return original.apply(this, args);
    };
    try {
        assert.equal(await apply(editOf(msg, 'hola!', 30), identity), 'applied');
        const deleted = `{"id":"${conversation._id}","lastMessage":"Mensaje eliminado"}`;
        assert.ok(await stream.waitFor(deleted, 2000));
        await new Promise(resolve => setTimeout(resolve, 200));
        assert.equal(stream.count(`{"id":"${conversation._id}","lastMessage":"hola!"}`), 0, 'un aviso con el texto de antes');
        assert.equal(stream.count(deleted), 2);
    } finally {
        Conversation.findById = original;
        await stream.close();
    }
    assert.ok(intercepted);
    assert.equal(await previewOf(conversation), 'Mensaje eliminado');
});

// Revisión de Codex del plan, 2: un mensaje nuevo que escribe la conversación entre la comprobación del último y la escritura.
test('si ya llegó un mensaje más nuevo, la bandeja se queda con él y no se avisa', async () => {
    const { conversation, identity } = await chat();
    const msg = await message(conversation, { text: 'M1', ts: at(0) });
    // El estado intermedio: la conversación ya es de M2, que aún no está en `Message`.
    await Conversation.updateOne({ _id: conversation._id }, { $set: { lastMessage: 'M2', lastMessageAt: at(100) } });

    const stream = await openStream(a);
    try {
        assert.equal(await apply(revokeOf(msg), identity), 'applied');
        assert.ok(await stream.waitFor(String(msg._id), 2000), 'message_updated sí sale');
        assert.equal(await stream.waitFor(`"id":"${conversation._id}","lastMessage"`, 300), false);
    } finally {
        await stream.close();
    }
    assert.equal(await previewOf(conversation), 'M2');
});

test('SSE: message_updated a la cuenta y no a otra, y conversation_updated sin unreadCount', async () => {
    const { conversation, identity } = await chat();
    const msg = await message(conversation, { text: 'hola' });
    const streamA = await openStream(a);
    const streamB = await openStream(b);
    try {
        assert.equal(await apply(revokeOf(msg), identity), 'applied');
        assert.ok(await streamA.waitFor('event: message_updated', 2000));
        assert.ok(await streamA.waitFor(`"id":"${msg._id}"`, 0));
        assert.ok(await streamA.waitFor('"changeVersion":1', 0));
        assert.ok(await streamA.waitFor(`{"id":"${conversation._id}","lastMessage":"Mensaje eliminado"}`, 2000));
        assert.equal(await streamB.waitFor(String(msg._id), 300), false, 'B recibió un cambio de A');
    } finally {
        await streamA.close();
        await streamB.close();
    }
});
