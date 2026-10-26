// Importar el historial de la app de WhatsApp Business: del trozo que llega por
// el webhook a los contactos, las conversaciones y los mensajes, con el worker.
// En su propio archivo (su propio Mongo): el worker procesa la pieza más vieja,
// que no puede ser la de otro archivo. Spec: docs/superpowers/specs/2026-10-23-historial-coexistencia-design.md (§ 5 y 6).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    seedAccount, connectWhatsapp, openStream, postWebhook, postWebhookBody, postHistory, request, onMeta, pushCalls, FAKE_MEDIA_URL,
    Contact, Conversation, HistoryMedia, HistoryThread, Line, Message,
} from './helpers.js';
import { HISTORY_PLACEHOLDER_TEXT } from '../../src/utils/history.sync.js';

const { processNextHistoryThread } = await import('../../src/workers/history.worker.js');
const { importHistoryPiece, applyHistoryMedia } = await import('../../src/services/history.import.service.js');

const BUSINESS = '15550783881';
const HOUR = 60 * 60;
const nowSeconds = () => Math.floor(Date.now() / 1000);
let seq = 0;

/** Pone la línea como si hubiera pedido el historial en su conexión actual. */
const requestHistory = async (lineId) => {
    const line = await Line.findById(lineId).lean();
    await Line.updateOne({ _id: lineId }, { $set: { historySync: {
        connectionAt: line.connectedAt,
        requests: { contacts: { state: 'accepted' }, history: { state: 'accepted' } },
    } } });
};

// Todo lo que se prepara con `await` va aquí arriba (ver pruebas-y-scripts.md).
// H: con el bot encendido y un dispositivo con avisos: sin las dos cosas,
// comprobar que el historial no avisa ni despierta al bot no probaría nada.
const h = await seedAccount('H', { seq: 71 });
const { lineId: hLine } = await connectWhatsapp(h, { phoneNumberId: '771' });
await requestHistory(hLine);
const H_NUMBER = '771';
const week = { closed: false, ranges: [{ start: '00:00', end: '23:59' }] };
assert.equal((await request(h, 'PUT', '/auto-replies', {
    enabled: true, timezone: 'America/Guayaquil', handoffHours: 12,
    welcome: { enabled: true, text: '¡Hola!', returnAfterDays: 30 },
    outOfHours: { enabled: false, text: '', schedule: { mon: week, tue: week, wed: week, thu: week, fri: week, sat: week, sun: week } },
    keywordRules: [],
})).status, 200);
assert.equal((await request(h, 'POST', '/push/subscriptions', {
    endpoint: 'https://fcm.googleapis.com/fcm/send/prueba-importar', keys: { p256dh: 'BPcl4Zx-clave-publica-de-pruebas', auth: 'secreto-auth' },
})).status, 200);
// K: otra cuenta con el historial pedido.
const k = await seedAccount('K', { seq: 72 });
const { lineId: kLine } = await connectWhatsapp(k, { phoneNumberId: '772' });
await requestHistory(kLine);

// Meta falso para los archivos de 14 días: cualquier id de archivo (solo dígitos,
// como los de Meta: `nombreDeArchivo` no acepta otros) es un PNG.
onMeta(async (config) => (/^\/\d+$/.test(String(config.url))
    ? { data: { url: FAKE_MEDIA_URL, mime_type: 'image/png', file_size: 12 } } : undefined));

/** Un wamid con la forma de Meta: el destinatario y la clave del mensaje. */
const keyedWamid = (recipient, key) => 'wamid.' + Buffer.concat([
    Buffer.from([0x1c, 0x18, recipient.length]), Buffer.from(recipient, 'latin1'),
    Buffer.from([0x15, 0x02, 0x00, 0x11, 0x18, key.length]), Buffer.from(key, 'latin1'), Buffer.from([0x00]),
]).toString('base64');
const nextKey = () => `3EB1${String(++seq).padStart(18, '0')}`;

const historyMessage = (phone, { fromContact = true, body, type = 'text', id = `wamid.imp.${++seq}`, ts = nowSeconds() - 2 * HOUR, status = 'READ', ...rest } = {}) => ({
    from: fromContact ? phone : BUSINESS, id, timestamp: String(ts), type,
    ...(type === 'text' && { text: { body: body ?? `Mensaje ${seq}` } }),
    history_context: { status }, ...rest,
});
const postThread = (phone, messages, { number = H_NUMBER, chunkOrder = ++seq } = {}) =>
    postHistory(number, [{ metadata: { phase: 1, chunk_order: chunkOrder, progress: 50 }, threads: [{ id: phone, messages }] }]);
const postMedia = (phone, id, { number = H_NUMBER, caption = 'La foto' } = {}) => postWebhookBody({ entry: [{ changes: [{ field: 'history', value: {
    messaging_product: 'whatsapp', metadata: { phone_number_id: number },
    messages: [{ from: phone, id, timestamp: String(nowSeconds() - HOUR), type: 'image', image: { id: String(77100000 + ++seq), mime_type: 'image/jpeg', caption } }],
} }] }] });
/** Procesa todas las piezas pendientes. */
const drain = async (options) => {
    for (let i = 0; i < 50; i++) if (await processNextHistoryThread(options) === 'idle') return;
    throw new Error('la cola no se vació');
};
const withHooks = (hooks) => ({ importPiece: (piece) => importHistoryPiece(piece, { hooks }) });
const conversationOf = (account, phone) => Conversation.findOne({ userId: account.accountId, contactPhone: phone }).lean();
const messagesOf = async (account, phone) => {
    const conversation = await conversationOf(account, phone);
    return conversation ? Message.find({ conversationId: conversation._id }).sort({ timestamp: 1 }).lean() : [];
};
const eventually = async (predicate, ms) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
        if (await predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    return Boolean(await predicate());
};
const botJobs = () => Message.countDocuments({ bot: { $exists: true } });
const liveInbound = (from, body) => ({
    contacts: [{ profile: { name: 'Cliente de prueba' }, wa_id: from }],
    messages: [{ from, id: `wamid.vivo.${++seq}`, timestamp: String(nowSeconds()), type: 'text', text: { body } }],
});

test('un hilo crea el contacto, la conversación y sus mensajes en los dos sentidos', async () => {
    const phone = '593990071001';
    const t0 = nowSeconds() - 5 * HOUR;
    assert.equal((await postThread(phone, [
        historyMessage(phone, { body: 'Hola, ¿tienen stock?', ts: t0 }),
        historyMessage(phone, { fromContact: false, body: 'Sí, ¿cuántas?', ts: t0 + 60, status: 'READ' }),
        historyMessage(phone, { fromContact: false, body: 'Le paso el precio', ts: t0 + 120, status: 'DELIVERED' }),
    ])).status, 200);
    await drain();

    const contact = await Contact.findOne({ userId: h.accountId, phone }).lean();
    assert.equal(contact.source, 'businessApp');
    const conversation = await conversationOf(h, phone);
    assert.equal(String(conversation.lineId), String(hLine));
    const messages = await messagesOf(h, phone);
    assert.deepEqual(messages.map(m => [m.direction, m.sender, m.origin ?? null, m.status, m.text]), [
        ['inbound', 'them', null, 'delivered', 'Hola, ¿tienen stock?'],
        ['outbound', 'me', 'businessApp', 'read', 'Sí, ¿cuántas?'],
        ['outbound', 'me', 'businessApp', 'delivered', 'Le paso el precio'],
    ]);
    for (const message of messages) {
        assert.equal(message.fromHistory, true);
        assert.equal(message.bot, undefined);
    }
    assert.equal(messages[0].timestamp.getTime(), t0 * 1000);
    assert.equal((await HistoryThread.findOne({ contactPhone: phone }).lean()).status, 'done');
});

test('nada de lo traído suma no leídos, mueve lastInboundAt, manda push, crea trabajo del bot ni lo pausa', async () => {
    const phone = '593990071002';
    // Control: un entrante en vivo sí avisa y sí despierta al bot.
    const pushesBefore = pushCalls.length;
    const jobsBefore = await botJobs();
    assert.equal((await postWebhook(H_NUMBER, liveInbound(phone, 'Hola en vivo'))).status, 200);
    assert.ok(await eventually(() => pushCalls.length > pushesBefore, 2000), 'el control no avisó por push');
    assert.equal(await botJobs(), jobsBefore + 1, 'el control no despertó al bot');
    await eventually(() => false, 200);
    const before = await conversationOf(h, phone);
    const pushesAfterControl = pushCalls.length;

    await postThread(phone, [
        historyMessage(phone, { body: 'De ayer', ts: nowSeconds() - 30 * HOUR }),
        historyMessage(phone, { fromContact: false, body: 'Respondido desde la app ayer', ts: nowSeconds() - 29 * HOUR }),
    ]);
    await drain();

    const after = await conversationOf(h, phone);
    assert.equal((await messagesOf(h, phone)).length, 3);
    assert.equal(after.unreadCount, before.unreadCount);
    assert.equal(after.lastInboundAt.getTime(), before.lastInboundAt.getTime());
    assert.equal(after.bot?.humanRepliedAt ?? null, before.bot?.humanRepliedAt ?? null, 'lo traído pausó al bot');
    assert.equal(await botJobs(), jobsBefore + 1);
    assert.equal(await eventually(() => pushCalls.length > pushesAfterControl, 300), false, 'lo traído avisó por push');
});

test('una conversación nueva queda con la vista previa y la fecha de su último mensaje', async () => {
    const phone = '593990071003';
    const last = nowSeconds() - 2 * HOUR;
    await postThread(phone, [
        historyMessage(phone, { fromContact: false, body: 'El último', ts: last }),
        historyMessage(phone, { body: 'El primero', ts: last - HOUR }),
    ]);
    await drain();
    const conversation = await conversationOf(h, phone);
    assert.equal(conversation.lastMessage, 'El último');
    assert.equal(conversation.lastMessageAt.getTime(), last * 1000);
    assert.equal(conversation.unreadCount, 0);
});

// Lo que más puede fallar (plan, 1): alguien escribió justo al conectar.
test('en una conversación con un entrante en vivo más nuevo, la vista previa y los no leídos no cambian', async () => {
    const phone = '593990071004';
    await postWebhook(H_NUMBER, liveInbound(phone, 'Recién escrito'));
    const before = await conversationOf(h, phone);
    assert.equal(before.unreadCount, 1);

    await postThread(phone, [historyMessage(phone, { body: 'De la semana pasada', ts: nowSeconds() - 7 * 24 * HOUR })]);
    await drain();

    const after = await conversationOf(h, phone);
    assert.equal(after.lastMessage, 'Recién escrito');
    assert.equal(after.lastMessageAt.getTime(), before.lastMessageAt.getTime());
    assert.equal(after.unreadCount, 1);
    assert.equal((await messagesOf(h, phone)).length, 2);
});

test('una pieza importada dos veces no duplica', async () => {
    const phone = '593990071005';
    await postThread(phone, [historyMessage(phone), historyMessage(phone, { fromContact: false })]);
    await drain();
    assert.equal((await messagesOf(h, phone)).length, 2);
    await HistoryThread.updateMany({ contactPhone: phone }, { $set: { status: 'pending' } });
    await drain();
    assert.equal((await messagesOf(h, phone)).length, 2);
});

test('un mensaje que ya estaba con otro wamid de la misma clave no se duplica, también si es de hace 40 días y sin waMessageKey', async () => {
    const phone = '593990071006';
    await postWebhook(H_NUMBER, liveInbound(phone, 'Para abrir la conversación'));
    const conversation = await conversationOf(h, phone);
    const recent = nextKey();
    const old = nextKey();
    await Message.create({
        conversationId: conversation._id, direction: 'outbound', sender: 'me', origin: 'businessApp',
        waMessageId: keyedWamid('PE.1000000000000000', recent), text: 'Eco en vivo', timestamp: new Date(Date.now() - HOUR * 1000),
    });
    // De antes de `waMessageKey`: sin el campo.
    await Message.collection.insertOne({
        conversationId: conversation._id, direction: 'outbound', sender: 'me', type: 'text', status: 'sent',
        waMessageId: keyedWamid('PE.1000000000000000', old), text: 'De hace 40 días', timestamp: new Date(Date.now() - 40 * 24 * HOUR * 1000),
    });

    await postThread(phone, [
        historyMessage(phone, { fromContact: false, id: keyedWamid(phone, recent), body: 'Eco en vivo' }),
        historyMessage(phone, { fromContact: false, id: keyedWamid(phone, old), body: 'De hace 40 días', ts: nowSeconds() - 40 * 24 * HOUR }),
    ]);
    await drain();
    assert.equal((await messagesOf(h, phone)).length, 3, 'un mensaje quedó dos veces');
});

test('el placeholder se guarda con su etiqueta y nunca con text vacío', async () => {
    const phone = '593990071007';
    await postThread(phone, [historyMessage(phone, { type: 'media_placeholder' })]);
    await drain();
    const [message] = await messagesOf(h, phone);
    assert.equal(message.text, HISTORY_PLACEHOLDER_TEXT);
    assert.equal(message.type, 'unsupported');
    assert.equal((await conversationOf(h, phone)).lastMessage, HISTORY_PLACEHOLDER_TEXT);
});

/** El mensaje del archivo (el placeholder, o la foto si ya se aplicó) quedó con su contenido. */
const assertMediaApplied = async (phone, waMessageId) => {
    const message = (await messagesOf(h, phone)).find(m => m.type === 'image' || m.text === HISTORY_PLACEHOLDER_TEXT);
    assert.equal(message.type, 'image', 'el archivo no se aplicó');
    assert.equal(message.caption, 'La foto');
    assert.equal(message.text, 'La foto');
    assert.ok(message.mediaFile, 'sin archivo descargado');
    assert.equal((await HistoryMedia.findOne({ lineId: hLine, waMessageId }).lean()).applied, true);
};

test('el archivo llega antes que el hilo', async () => {
    const phone = '593990071008';
    const id = keyedWamid(phone, nextKey());
    await postMedia(phone, id);
    await postThread(phone, [historyMessage(phone, { type: 'media_placeholder', id })]);
    await drain();
    await assertMediaApplied(phone, id);
});

test('el archivo llega durante el hilo (después de reclamar la pieza, antes de crear el mensaje)', async () => {
    const phone = '593990071009';
    const id = keyedWamid(phone, nextKey());
    await postThread(phone, [historyMessage(phone, { type: 'media_placeholder', id })]);
    await drain(withHooks({ beforeMessages: () => postMedia(phone, id) }));
    await assertMediaApplied(phone, id);
});

test('el archivo llega después del hilo', async () => {
    const phone = '593990071010';
    const id = keyedWamid(phone, nextKey());
    await postThread(phone, [historyMessage(phone, { type: 'media_placeholder', id })]);
    await drain();
    assert.equal((await messagesOf(h, phone))[0].text, HISTORY_PLACEHOLDER_TEXT);
    await postMedia(phone, id);
    await assertMediaApplied(phone, id);
});

test('el archivo con otro wamid de la misma clave se aplica, llegue antes o después', async () => {
    const before = '593990071011';
    const keyBefore = nextKey();
    await postMedia(before, keyedWamid('PE.2000000000000000', keyBefore));
    await postThread(before, [historyMessage(before, { type: 'media_placeholder', id: keyedWamid(before, keyBefore) })]);
    await drain();
    await assertMediaApplied(before, keyedWamid('PE.2000000000000000', keyBefore));

    const after = '593990071012';
    const keyAfter = nextKey();
    await postThread(after, [historyMessage(after, { type: 'media_placeholder', id: keyedWamid(after, keyAfter) })]);
    await drain();
    await postMedia(after, keyedWamid('PE.2000000000000000', keyAfter));
    await assertMediaApplied(after, keyedWamid('PE.2000000000000000', keyAfter));
});

test('una pieza que se cortó después de crear sus mensajes, al reintentarse, aplica el archivo y la vista previa', async () => {
    const phone = '593990071013';
    const id = keyedWamid(phone, nextKey());
    await postMedia(phone, id);
    await postThread(phone, [historyMessage(phone, { body: 'Antes de la foto', ts: nowSeconds() - 3 * HOUR }), historyMessage(phone, { type: 'media_placeholder', id })]);
    const cut = () => { throw new Error('corte simulado'); };
    assert.equal(await processNextHistoryThread(withHooks({ afterMessages: cut })), 'retry');
    assert.equal((await messagesOf(h, phone)).length, 2, 'los mensajes se crearon antes del corte');
    assert.equal((await HistoryMedia.findOne({ waMessageId: id }).lean()).applied, false);
    assert.equal((await conversationOf(h, phone)).lastMessage, '');

    await drain();
    await assertMediaApplied(phone, id);
    assert.equal((await messagesOf(h, phone)).length, 2);
    assert.equal((await conversationOf(h, phone)).lastMessage, 'La foto');
});

test('una pieza que se cortó antes de la vista previa la pone al reintentarse', async () => {
    const phone = '593990071014';
    await postThread(phone, [historyMessage(phone, { body: 'Sin vista previa todavía' })]);
    assert.equal(await processNextHistoryThread(withHooks({ beforePreview: () => { throw new Error('corte simulado'); } })), 'retry');
    assert.equal((await conversationOf(h, phone)).lastMessage, '');
    await drain();
    assert.equal((await conversationOf(h, phone)).lastMessage, 'Sin vista previa todavía');
    assert.equal((await messagesOf(h, phone)).length, 1);
});

test('una reacción del historial se pega a su original; sin original, no crea nada', async () => {
    const phone = '593990071015';
    const original = 'wamid.imp.original.reaccion';
    const ts = nowSeconds() - 3 * HOUR;
    await postThread(phone, [
        historyMessage(phone, { fromContact: false, id: original, body: 'Te paso la cotización', ts }),
        historyMessage(phone, { type: 'reaction', reaction: { message_id: original, emoji: '👍' }, ts: ts + 60 }),
        historyMessage(phone, { type: 'reaction', reaction: { message_id: 'wamid.que.no.esta', emoji: '❤️' }, ts: ts + 120 }),
    ]);
    await drain();
    const messages = await messagesOf(h, phone);
    assert.equal(messages.length, 1, 'quedó una reacción suelta');
    assert.equal(messages[0].reactions.them.emoji, '👍');
});

test('el historial de la línea de una cuenta no crea nada en otra', async () => {
    const phone = '593990071016';
    await postThread(phone, [historyMessage(phone, { body: 'Solo de H' })]);
    await drain();
    assert.ok(await conversationOf(h, phone));
    assert.equal(await Contact.countDocuments({ userId: k.accountId, phone }), 0);
    assert.equal(await Conversation.countDocuments({ userId: k.accountId, contactPhone: phone }), 0);

    await postThread(phone, [historyMessage(phone, { body: 'Solo de K' })], { number: '772' });
    await drain();
    const inK = await messagesOf(k, phone);
    assert.deepEqual(inK.map(m => m.text), ['Solo de K']);
    assert.deepEqual((await messagesOf(h, phone)).map(m => m.text), ['Solo de H']);
});

// --- Revisión de Codex del PR #130 ------------------------------------------

// Regresión que vigila: con una conversación abierta y un mensaje en vivo más
// nuevo, lo importado no avisaba de nada y el hilo abierto no lo enseñaba.
test('lo importado avisa al hilo abierto (messages_imported), también con un mensaje en vivo más nuevo', async () => {
    const phone = '593990071017';
    await postWebhook(H_NUMBER, liveInbound(phone, 'En vivo, más nuevo'));
    const conversation = await conversationOf(h, phone);
    const stream = await openStream(h);
    try {
        await postThread(phone, [historyMessage(phone, { body: 'De hace un mes', ts: nowSeconds() - 30 * 24 * HOUR })]);
        await drain();
        assert.ok(await stream.waitFor('event: messages_imported', 2000), 'no avisó al hilo');
        assert.ok(await stream.waitFor(`"conversationId":"${conversation._id}"`, 0));
        assert.equal(stream.count('event: conversation_updated'), 0, 'la vista previa no tenía que cambiar');
    } finally {
        await stream.close();
    }
    assert.equal((await conversationOf(h, phone)).unreadCount, 1);
});

// Regresión que vigila: el último mensaje era el placeholder, llegaba la foto
// después y la bandeja seguía diciendo «Archivo: míralo en tu celular».
test('un archivo que llega después cambia también la vista previa si era su placeholder', async () => {
    const phone = '593990071018';
    const id = keyedWamid(phone, nextKey());
    await postThread(phone, [historyMessage(phone, { body: 'Antes', ts: nowSeconds() - 4 * HOUR }), historyMessage(phone, { type: 'media_placeholder', id, ts: nowSeconds() - 3 * HOUR })]);
    await drain();
    assert.equal((await conversationOf(h, phone)).lastMessage, HISTORY_PLACEHOLDER_TEXT);
    const stream = await openStream(h);
    try {
        await postMedia(phone, id);
        assert.equal((await conversationOf(h, phone)).lastMessage, 'La foto');
        assert.ok(await stream.waitFor('event: conversation_updated', 2000), 'la bandeja no se enteró');
    } finally {
        await stream.close();
    }
});

test('un archivo que llega después no pisa una vista previa más nueva', async () => {
    const phone = '593990071019';
    const id = keyedWamid(phone, nextKey());
    await postThread(phone, [historyMessage(phone, { type: 'media_placeholder', id, ts: nowSeconds() - 3 * HOUR })]);
    await drain();
    await postWebhook(H_NUMBER, liveInbound(phone, 'Escrito después'));
    await postMedia(phone, id);
    assert.equal((await conversationOf(h, phone)).lastMessage, 'Escrito después');
    await assertMediaApplied(phone, (await HistoryMedia.findOne({ lineId: hLine, waMessageKey: { $ne: null } }).sort({ createdAt: -1 }).lean()).waMessageId);
});

// Regresión que vigila: el worker y el webhook se cruzan; el que cambia el
// mensaje no es el que marca `applied`, y nadie avisaba de la foto.
test('quien cambia el mensaje avisa aunque otro haya marcado applied antes', async () => {
    const phone = '593990071020';
    const id = keyedWamid(phone, nextKey());
    await postThread(phone, [historyMessage(phone, { type: 'media_placeholder', id })]);
    await drain();
    // El archivo, leído como pendiente por este lado...
    await HistoryMedia.create({
        userId: h.accountId, lineId: hLine, connectionAt: (await Line.findById(hLine).lean()).historySync.connectionAt,
        mediaKey: (await import('../../src/utils/wamid.js')).wamidMessageKey(id), waMessageId: id, waMessageKey: null,
        messageData: { from: phone, id, type: 'image', image: { id: String(77100000 + ++seq), mime_type: 'image/jpeg', caption: 'La foto' } },
    });
    const media = await HistoryMedia.findOne({ waMessageId: id }).lean();
    // ...y marcado `applied` por el otro antes de que este escriba.
    await HistoryMedia.updateOne({ _id: media._id }, { $set: { applied: true } });
    const [message] = await messagesOf(h, phone);
    const line = { accountId: h.accountId, lineId: hLine, tokenWhatsapp: null };
    const stream = await openStream(h);
    try {
        await applyHistoryMedia({ line, connectionAt: media.connectionAt, message, media });
        assert.equal((await Message.findById(message._id).lean()).type, 'image');
        assert.ok(await stream.waitFor('event: message_updated', 2000), 'nadie avisó de la foto');
    } finally {
        await stream.close();
    }
});
