// El historial de la app de WhatsApp Business por el webhook (`field: 'history'`):
// el webhook solo guarda piezas (`HistoryThread`) y archivos (`HistoryMedia`), en
// la línea y la cuenta del número, y solo si la línea lo pidió en esta conexión.
// Spec: docs/superpowers/specs/2026-10-23-historial-coexistencia-design.md (§ 5).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    seedAccount, connectWhatsapp, postWebhook, postWebhookBody, postWebhookRaw, postHistory, request, pushCalls,
    Conversation, HistoryMedia, HistoryThread, Line, Message,
} from './helpers.js';

const BUSINESS = '15550783881';
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
const syncOf = async (lineId) => (await Line.findById(lineId).lean()).historySync;

// Todo lo que se prepara con `await` va aquí arriba (ver pruebas-y-scripts.md).
// H: pidió el historial, con el bot encendido y un dispositivo con avisos: sin las
// dos cosas, comprobar que el historial no avisa ni despierta al bot no probaría nada.
const h = await seedAccount('H', { seq: 81 });
const { lineId: hLine } = await connectWhatsapp(h, { phoneNumberId: '881' });
await requestHistory(hLine);
const H_NUMBER = '881';
const week = { closed: false, ranges: [{ start: '00:00', end: '23:59' }] };
assert.equal((await request(h, 'PUT', '/auto-replies', {
    enabled: true, timezone: 'America/Guayaquil', handoffHours: 12,
    welcome: { enabled: true, text: '¡Hola!', returnAfterDays: 30 },
    outOfHours: { enabled: false, text: '', schedule: { mon: week, tue: week, wed: week, thu: week, fri: week, sat: week, sun: week } },
    keywordRules: [],
})).status, 200);
assert.equal((await request(h, 'POST', '/push/subscriptions', {
    endpoint: 'https://fcm.googleapis.com/fcm/send/prueba-historial', keys: { p256dh: 'BPcl4Zx-clave-publica-de-pruebas', auth: 'secreto-auth' },
})).status, 200);
// N: nunca pidió el historial. V: lo pidió en una conexión anterior.
const n = await seedAccount('N', { seq: 82 });
const { lineId: nLine } = await connectWhatsapp(n, { phoneNumberId: '882' });
const v = await seedAccount('V', { seq: 83 });
const { lineId: vLine } = await connectWhatsapp(v, { phoneNumberId: '883' });
await Line.updateOne({ _id: vLine }, { $set: { historySync: { connectionAt: new Date('2026-01-01T00:00:00Z'), requests: {} } } });
// D y X: para el «no» del negocio y para un trozo de otra cuenta.
const d = await seedAccount('D', { seq: 84 });
const { lineId: dLine } = await connectWhatsapp(d, { phoneNumberId: '884' });
await requestHistory(dLine);
const x = await seedAccount('X', { seq: 85 });
const { lineId: xLine } = await connectWhatsapp(x, { phoneNumberId: '885' });
await requestHistory(xLine);

const historyMessage = (contactPhone, { fromContact = true, body = 'Hola', type = 'text', ...rest } = {}) => ({
    from: fromContact ? contactPhone : BUSINESS, id: `wamid.historial.${Date.now()}.${++seq}`, timestamp: String(nowSeconds() - 3600),
    type, ...(type === 'text' && { text: { body } }), history_context: { status: 'READ' }, ...rest,
});
const chunkOf = (threads, { phase = 1, chunkOrder = 1, progress = 50 } = {}) => ({
    metadata: { phase, chunk_order: chunkOrder, progress },
    threads: threads.map(({ phone, count = 1, message = {} }) => ({
        id: phone, messages: Array.from({ length: count }, () => historyMessage(phone, message)),
    })),
});
const piecesOf = (lineId, filter = {}) => HistoryThread.find({ lineId, ...filter }).sort({ contactPhone: 1, part: 1 }).lean();

test('un trozo guarda una pieza por hilo, en la cuenta y la línea del número, y no crea mensajes', async () => {
    const messagesBefore = await Message.countDocuments({});
    const conversationsBefore = await Conversation.countDocuments({});
    const res = await postHistory(H_NUMBER, [chunkOf([{ phone: '593990081001', count: 3 }, { phone: '593990081002' }], { chunkOrder: 10 })]);
    assert.equal(res.status, 200);

    const pieces = await piecesOf(hLine, { chunkOrder: 10 });
    assert.deepEqual(pieces.map(piece => [piece.contactPhone, piece.messages.length]), [['593990081001', 3], ['593990081002', 1]]);
    for (const piece of pieces) {
        assert.equal(String(piece.userId), String(h.accountId));
        assert.equal(piece.status, 'pending');
        assert.equal(piece.phase, 1);
        assert.equal(piece.part, 0);
    }
    assert.equal(await Message.countDocuments({}), messagesBefore);
    assert.equal(await Conversation.countDocuments({}), conversationsBefore);
    const sync = await syncOf(hLine);
    assert.ok(sync.firstChunkAt && sync.lastChunkAt);
    assert.ok(sync.progress >= 50);
});

test('un hilo de 1200 mensajes queda en 3 piezas', async () => {
    assert.equal((await postHistory(H_NUMBER, [chunkOf([{ phone: '593990081003', count: 1200 }], { chunkOrder: 11 })])).status, 200);
    assert.deepEqual((await piecesOf(hLine, { chunkOrder: 11 })).map(piece => [piece.part, piece.messages.length]), [[0, 500], [1, 500], [2, 200]]);
});

test('el mismo trozo dos veces no duplica piezas', async () => {
    const chunk = chunkOf([{ phone: '593990081004', count: 2 }, { phone: '593990081005' }], { chunkOrder: 12 });
    assert.equal((await postHistory(H_NUMBER, [chunk])).status, 200);
    assert.equal((await postHistory(H_NUMBER, [chunk])).status, 200, 'una reentrega no es un error');
    assert.equal((await piecesOf(hLine, { chunkOrder: 12 })).length, 2);
});

// Un hilo entero puede pasar los 16 MB por documento de Mongo (revisión de Codex del spec).
test('un hilo de más de 16 MB se guarda en piezas', async () => {
    const phone = '593990081006';
    const body = 'x'.repeat(4000);
    const messages = [];
    let bytes = 0;
    while (bytes <= 16 * 1024 * 1024) {
        const message = historyMessage(phone, { body });
        bytes += Buffer.byteLength(JSON.stringify(message));
        messages.push(message);
    }
    const chunk = { metadata: { phase: 2, chunk_order: 13, progress: 60 }, threads: [{ id: phone, messages }] };
    assert.equal((await postHistory(H_NUMBER, [chunk])).status, 200);
    const pieces = await piecesOf(hLine, { chunkOrder: 13 });
    assert.ok(pieces.length >= 5, `solo ${pieces.length} piezas`);
    assert.equal(pieces.reduce((sum, piece) => sum + piece.messages.length, 0), messages.length);
});

test('el error 2593109 marca la línea declined, también sin entry, y no guarda piezas', async () => {
    const declined = { errors: [{ code: 2593109, title: 'History sync is turned off by the business from the WhatsApp Business App' }] };
    assert.equal((await postWebhookBody({ messaging_product: 'whatsapp', metadata: { phone_number_id: '884' }, history: [declined] })).status, 200);
    assert.equal((await syncOf(dLine)).declined, true, 'sin entry');
    await Line.updateOne({ _id: dLine }, { $set: { 'historySync.declined': false } });
    assert.equal((await postHistory('884', [declined])).status, 200);
    assert.equal((await syncOf(dLine)).declined, true, 'con entry');
    assert.equal(await HistoryThread.countDocuments({ lineId: dLine }), 0);
});

test('una línea sin historySync, o con el de otra conexión, no guarda nada', async () => {
    const chunk = chunkOf([{ phone: '593990082001' }]);
    assert.equal((await postHistory('882', [chunk])).status, 200);
    assert.equal((await postHistory('883', [chunk])).status, 200);
    assert.equal(await HistoryThread.countDocuments({ lineId: { $in: [nLine, vLine] } }), 0);
    assert.equal((await Line.findById(nLine).lean()).historySync, undefined);
    assert.equal((await syncOf(vLine)).firstChunkAt ?? null, null);
});

test('el trozo de un número de otra cuenta no toca la línea de esta', async () => {
    const before = await syncOf(hLine);
    assert.equal((await postHistory('885', [chunkOf([{ phone: '593990085001' }], { chunkOrder: 20, progress: 100 })])).status, 200);
    assert.equal(await HistoryThread.countDocuments({ lineId: xLine, userId: x.accountId }), 1);
    assert.equal(await HistoryThread.countDocuments({ contactPhone: '593990085001', lineId: { $ne: xLine } }), 0);
    const after = await syncOf(hLine);
    assert.equal(after.historyComplete, before.historyComplete);
    assert.equal(after.progress, before.progress);
});

test('progress 100 marca historyComplete; un trozo nuevo borra finishedAt; el avance no retrocede', async () => {
    assert.equal((await postHistory(H_NUMBER, [chunkOf([{ phone: '593990081007' }], { chunkOrder: 30, progress: 100 })])).status, 200);
    let sync = await syncOf(hLine);
    assert.equal(sync.historyComplete, true);
    assert.equal(sync.progress, 100);

    await Line.updateOne({ _id: hLine }, { $set: { 'historySync.finishedAt': new Date() } });
    assert.equal((await postHistory(H_NUMBER, [chunkOf([{ phone: '593990081008' }], { chunkOrder: 31, progress: 20 })])).status, 200);
    sync = await syncOf(hLine);
    assert.equal(sync.finishedAt, null);
    assert.equal(sync.progress, 100, 'un trozo atrasado bajó el avance');
    assert.equal(sync.historyComplete, true);
});

// Lo que más puede fallar (plan, 5): el archivo de 14 días llega bajo
// `field: 'history'` con forma de entrante. Tratarlo como un mensaje en vivo
// crearía un mensaje nuevo con su no leído, su aviso push y trabajo del bot.
test('un messages[] bajo field history se guarda como archivo, no como un mensaje en vivo', async () => {
    const eventually = async (predicate, ms) => {
        const deadline = Date.now() + ms;
        while (Date.now() < deadline) {
            if (await predicate()) return true;
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        return Boolean(await predicate());
    };
    const botJobs = () => Message.countDocuments({ bot: { $exists: true } });
    const from = '593990081009';
    const inbound = (id, extra = {}) => ({
        contacts: [{ profile: { name: 'Cliente de prueba' }, wa_id: from }],
        messages: [{ from, id, timestamp: String(nowSeconds()), type: 'image', image: { id: '881001', mime_type: 'image/jpeg', caption: 'La foto' }, ...extra }],
    });

    // Control: el mismo mensaje en vivo sí crea mensaje, avisa y despierta al bot.
    const pushesBefore = pushCalls.length;
    const jobsBefore = await botJobs();
    assert.equal((await postWebhook(H_NUMBER, inbound(`wamid.vivo.${Date.now()}`, { type: 'text', image: undefined, text: { body: 'Hola' } }))).status, 200);
    assert.ok(await eventually(() => pushCalls.length > pushesBefore, 2000), 'el control no avisó por push');
    assert.equal(await botJobs(), jobsBefore + 1, 'el control no despertó al bot');
    const conversation = await Conversation.findOne({ userId: h.accountId, contactPhone: from }).lean();

    const id = `wamid.archivo.${Date.now()}`;
    const messagesBefore = await Message.countDocuments({});
    const pushesAfterControl = pushCalls.length;
    const res = await postWebhookBody({ entry: [{ changes: [{ field: 'history', value: {
        messaging_product: 'whatsapp', metadata: { phone_number_id: H_NUMBER }, ...inbound(id),
    } }] }] });
    assert.equal(res.status, 200);

    const media = await HistoryMedia.findOne({ lineId: hLine, waMessageId: id }).lean();
    assert.ok(media, 'no se guardó el archivo');
    assert.equal(media.mediaKey, `id:${id}`);
    assert.equal(media.applied, false);
    assert.equal(media.messageData.image.caption, 'La foto');
    assert.equal(await Message.countDocuments({}), messagesBefore, 'se creó un mensaje en vivo');
    assert.equal(await Message.exists({ waMessageId: id }), null);
    assert.equal((await Conversation.findById(conversation._id).lean()).unreadCount, conversation.unreadCount);
    assert.equal(await botJobs(), jobsBefore + 1);
    assert.equal(await eventually(() => pushCalls.length > pushesAfterControl, 300), false, 'el archivo avisó por push');
});

test('el mismo archivo dos veces se guarda una vez y no pierde el applied', async () => {
    const id = `wamid.archivo.dos.${Date.now()}`;
    const body = { entry: [{ changes: [{ field: 'history', value: {
        messaging_product: 'whatsapp', metadata: { phone_number_id: H_NUMBER },
        messages: [{ from: '593990081010', id, timestamp: String(nowSeconds()), type: 'image', image: { id: '881002' } }],
    } }] }] };
    assert.equal((await postWebhookBody(body)).status, 200);
    await HistoryMedia.updateOne({ waMessageId: id }, { $set: { applied: true } });
    assert.equal((await postWebhookBody(body)).status, 200);
    const saved = await HistoryMedia.find({ waMessageId: id }).lean();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].applied, true);
});

// Lo que más puede fallar (plan, 3): el límite de 20 MB es solo del webhook.
test('un cuerpo de 1 MB a otra ruta de la API sigue dando 413', async () => {
    const res = await request(h, 'POST', '/contacts', { name: 'x'.repeat(1024 * 1024), phone: '593990081099' });
    assert.equal(res.status, 413);
});

test('uno de 5 MB al webhook con mala firma da 401', async () => {
    const raw = JSON.stringify({ entry: [], relleno: 'x'.repeat(5 * 1024 * 1024) });
    assert.equal((await postWebhookRaw(raw, 'sha256=' + '0'.repeat(64))).status, 401);
    assert.equal((await postWebhookRaw(raw)).status, 200, 'control: con la firma buena pasa');
});
