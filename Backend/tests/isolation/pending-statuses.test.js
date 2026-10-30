// Acuses adelantados (2026-10-27): un acuse de Meta que llega antes de que se
// guarde su saliente se guarda (`PendingStatus`) y se aplica al guardarlo.
// Aquí el Meta falso manda el acuse por el webhook ANTES de responder con el
// wamid: lo mismo que pasa cuando Meta es más rápido que el guardado.
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
    seedAccount, connectWhatsapp, request, onMeta, postWebhook, openStream, Contact, Conversation, Message,
} from './helpers.js';

const { default: PendingStatus } = await import('../../src/models/pending.status.model.js');
const { receiveStatus, applyHeldStatuses } = await import('../../src/services/message.status.service.js');

// Todo lo que se prepara con `await` va antes del primer `test()` (ver chats.test.js).
const a = await seedAccount('PS', { seq: 141 });
const b = await seedAccount('PSB', { seq: 142 });
const { lineId } = await connectWhatsapp(a, { phoneNumberId: '14101' });
await connectWhatsapp(b, { phoneNumberId: '14201' });

let seq = 0;
const nextWamid = () => `wamid.ps.${++seq}`;

/** Una conversación de A con la ventana abierta. */
const openChat = async () => {
    const phone = `5939914${String(++seq).padStart(5, '0')}`;
    const contact = await Contact.create({ userId: a.accountId, phone, name: `contacto ${phone}` });
    return Conversation.create({
        userId: a.accountId, contactId: contact._id, contactPhone: phone,
        phoneNumberId: '14101', lineId, lastInboundAt: new Date(), unreadCount: 0,
    });
};

/** Un acuse de Meta por el webhook del número `number`. */
const postStatus = (number, waMessageId, status, extra = {}) => postWebhook(number, {
    statuses: [{ id: waMessageId, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: '593990000000', ...extra }],
});

const FAILED = { errors: [{ code: 131049, title: 'Not delivered', error_data: { details: 'Meta no lo entregó' } }] };

/** Meta acepta el envío con `waMessageId`, pero antes llega por el webhook lo que hace `beforeReply`. */
const metaRacesWith = (waMessageId, beforeReply) => onMeta(async (config) => {
    if (config.method !== 'post' || !config.url.endsWith('/messages')) return undefined;
    await beforeReply();
    return { data: { messages: [{ id: waMessageId }] } };
});

test.afterEach(() => { onMeta(null); });

// Regresión que vigila: `procesarEstado` no encontraba el mensaje (todavía no
// estaba guardado) y descartaba el acuse; el mensaje se quedaba en «enviado».
test('un entregado que llega antes que el texto se aplica al guardarlo', async () => {
    const conversation = await openChat();
    const waMessageId = nextWamid();
    metaRacesWith(waMessageId, async () => {
        assert.equal((await postStatus('14101', waMessageId, 'delivered')).status, 200);
    });
    const res = await request(a, 'POST', `/chats/${conversation._id}/messages`, { text: 'hola', temporalId: 'ps-1' });
    assert.equal(res.status, 201, res.text);
    assert.equal(res.body.status, 'delivered', 'la respuesta no trae el estado del acuse adelantado');

    const saved = await Message.findOne({ waMessageId }).lean();
    assert.equal(saved.status, 'delivered');
    assert.ok(saved.deliveredAt);
    assert.equal(await PendingStatus.countDocuments({ waMessageId }), 0, 'el acuse aplicado quedó guardado');
});

// El caso grave: un `failed` de una plantilla (una campaña va por el mismo camino).
test('un fallido que llega antes que la plantilla la deja fallida, con su error', async () => {
    const conversation = await openChat();
    const waMessageId = nextWamid();
    metaRacesWith(waMessageId, async () => {
        assert.equal((await postStatus('14101', waMessageId, 'failed', FAILED)).status, 200);
    });
    const res = await request(a, 'POST', `/chats/${conversation._id}/template`, { templateName: a.templateName, language: 'es' });
    assert.ok(res.status < 300, res.text);

    const saved = await Message.findOne({ waMessageId }).lean();
    assert.equal(saved.status, 'failed');
    assert.equal(String(saved.errorCode), '131049');
    assert.equal(saved.errorDetail, 'Meta no lo entregó');
});

// Un acuse llega por el número de B con el wamid de un mensaje de A: nunca toca
// el de A (como `procesarEstado`: el mensaje tiene que ser de la cuenta del número).
test('un acuse guardado por el número de otra cuenta no se aplica', async () => {
    const conversation = await openChat();
    const waMessageId = nextWamid();
    metaRacesWith(waMessageId, async () => {
        assert.equal((await postStatus('14201', waMessageId, 'failed', FAILED)).status, 200);
    });
    const res = await request(a, 'POST', `/chats/${conversation._id}/messages`, { text: 'hola', temporalId: 'ps-3' });
    assert.equal(res.status, 201, res.text);
    assert.equal((await Message.findOne({ waMessageId }).lean()).status, 'sent');
    assert.equal(await PendingStatus.countDocuments({ waMessageId }), 0);
});

test('la reentrega de un acuse adelantado no lo guarda dos veces', async () => {
    const waMessageId = nextWamid();
    assert.equal((await postStatus('14101', waMessageId, 'delivered')).status, 200);
    assert.equal((await postStatus('14101', waMessageId, 'delivered')).status, 200);
    assert.equal(await PendingStatus.countDocuments({ waMessageId }), 1);
});

// El otro lado del cruce: el saliente se guarda DESPUÉS de que el webhook lo
// buscó y ANTES de que guarde el acuse, así que el envío ya no lo ve. El
// webhook vuelve a buscar el mensaje después de guardar el acuse.
test('si el saliente se guarda mientras se guarda el acuse, el webhook lo aplica', async () => {
    const conversation = await openChat();
    const waMessageId = nextWamid();
    const original = PendingStatus.create;
    let crossed = false;
    PendingStatus.create = async function (...args) {
        if (!crossed) {
            crossed = true;
            await Message.create({
                conversationId: conversation._id, direction: 'outbound', sender: 'me', text: 'hola',
                waMessageId, status: 'sent', timestamp: new Date(),
            });
        }
        return original.apply(this, args);
    };
    try {
        await receiveStatus({ accountId: a.accountId, statusData: { id: waMessageId, status: 'read', timestamp: String(Math.floor(Date.now() / 1000)) } });
    } finally {
        PendingStatus.create = original;
    }
    assert.ok(crossed, 'el test no forzó el cruce');
    assert.equal((await Message.findOne({ waMessageId }).lean()).status, 'read');
    assert.equal(await PendingStatus.countDocuments({ waMessageId }), 0);
});

// Regresión que vigila: el `message_created` de una plantilla se armaba a mano,
// sin `deliveredAt` ni `readAt` ni `waMessageId`: con un acuse adelantado, el
// evento decía «entregado» sin la hora. Ahora es `serializeMessage`, como el del texto.
test('el message_created de una plantilla con un acuse adelantado trae su hora', async () => {
    const conversation = await openChat();
    const waMessageId = nextWamid();
    metaRacesWith(waMessageId, async () => {
        assert.equal((await postStatus('14101', waMessageId, 'delivered')).status, 200);
    });
    const stream = await openStream(a);
    try {
        const res = await request(a, 'POST', `/chats/${conversation._id}/template`, { templateName: a.templateName, language: 'es' });
        assert.equal(res.status, 200, res.text);
        assert.ok(await stream.waitFor(`"waMessageId":"${waMessageId}"`, 2000), 'el message_created de la plantilla no trae su waMessageId');
        assert.ok(await stream.waitFor('"status":"delivered"', 0));
        assert.ok(await stream.waitFor('"deliveredAt":"', 0), 'el message_created de la plantilla no trae deliveredAt');
    } finally {
        await stream.close();
    }
});

// Un acuse que nunca encuentra su mensaje (otra herramienta en el número) se
// queda guardado hasta que caduca, sin tocar nada.
test('un acuse sin mensaje se guarda con su cuenta y caduca solo', async () => {
    const waMessageId = nextWamid();
    assert.equal((await postStatus('14101', waMessageId, 'read')).status, 200);
    const held = await PendingStatus.findOne({ waMessageId }).lean();
    assert.equal(String(held.userId), String(a.accountId));
    assert.equal(held.status, 'read');
    const indexes = await PendingStatus.collection.indexes();
    assert.equal(indexes.find((index) => index.name === 'pending_status_ttl')?.expireAfterSeconds, 3600);
});

// Una reacción nuestra tiene el mismo hueco: el `failed` la marca a ella.
test('un fallido que llega antes que la reacción la marca fallida', async () => {
    const conversation = await openChat();
    const target = await Message.create({
        conversationId: conversation._id, direction: 'inbound', sender: 'them', text: 'Gracias',
        waMessageId: nextWamid(), timestamp: new Date(),
    });
    const waMessageId = nextWamid();
    metaRacesWith(waMessageId, async () => {
        assert.equal((await postStatus('14101', waMessageId, 'failed', FAILED)).status, 200);
    });
    const res = await request(a, 'PUT', `/chats/${conversation._id}/messages/${target._id}/reaction`, { emoji: '👍' });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.reactions.me.status, 'failed');
    assert.equal((await Message.findById(target._id).lean()).reactions.me.status, 'failed');
});

/** Un saliente de A ya guardado, en «enviado», y un acuse suyo esperando en `PendingStatus`. */
const sentWithHeld = async (held, extra = {}) => {
    const conversation = await openChat();
    const waMessageId = nextWamid();
    const message = await Message.create({
        conversationId: conversation._id, direction: 'outbound', sender: 'me', text: 'hola',
        waMessageId, status: 'sent', timestamp: new Date(),
    });
    const statusData = { id: waMessageId, status: held, timestamp: String(Math.floor(Date.now() / 1000)), ...extra };
    await PendingStatus.create({ userId: a.accountId, waMessageId, status: held, statusData });
    return { message, waMessageId };
};

/** Cambia la escritura del estado `status` (`Message.updateOne`) la primera vez: `around(exec)` decide. */
const interceptStatusWrite = (status, around) => {
    const original = Message.updateOne;
    let intercepted = false;
    Message.updateOne = function (...args) {
        if (intercepted || args[1]?.$set?.status !== status) return original.apply(this, args);
        intercepted = true;
        Message.updateOne = original;
        const query = original.apply(this, args);
        const exec = query.exec.bind(query);
        query.exec = () => around(exec);
        return query;
    };
    return { restore: () => { Message.updateOne = original; }, wasIntercepted: () => intercepted };
};

// Revisión de Codex del PR #140, 2: el envío aplica un `delivered` guardado y, a
// la vez, el webhook un `read`. Los dos leían «enviado» y guardaban con `save()`:
// el `delivered` llegaba último y el mensaje retrocedía. Aquí el `read` se
// aplica entero mientras el `delivered` espera para escribir.
test('un acuse guardado y otro del webhook a la vez: el estado no retrocede', async () => {
    const { message, waMessageId } = await sentWithHeld('delivered');
    const read = { id: waMessageId, status: 'read', timestamp: String(Math.floor(Date.now() / 1000)) };
    const write = interceptStatusWrite('delivered', async (exec) => {
        await receiveStatus({ accountId: a.accountId, statusData: read });
        return exec();
    });
    try {
        assert.equal(await applyHeldStatuses(waMessageId), 1);
    } finally {
        write.restore();
    }
    assert.ok(write.wasIntercepted(), 'el test no forzó el cruce');
    const saved = await Message.findById(message._id).lean();
    assert.equal(saved.status, 'read');
    assert.ok(saved.deliveredAt);
    assert.equal(await PendingStatus.countDocuments({ waMessageId }), 0);
});

// Revisión de Codex del PR #140, 1: el acuse se tomaba borrándolo antes de
// aplicarlo, y un fallo de la BD en medio lo perdía. Ahora se borra después:
// sigue guardado y el siguiente intento lo aplica.
test('si la BD falla al aplicar un acuse guardado, sigue guardado y otro intento lo aplica', async () => {
    const { message, waMessageId } = await sentWithHeld('failed', FAILED);
    const write = interceptStatusWrite('failed', async () => {
        throw new mongoose.mongo.MongoNetworkError('connection reset');
    });
    try {
        assert.equal(await applyHeldStatuses(waMessageId, { retryLater: false }), 0);
    } finally {
        write.restore();
    }
    assert.ok(write.wasIntercepted(), 'el test no forzó el fallo');
    assert.equal((await Message.findById(message._id).lean()).status, 'sent');
    assert.equal(await PendingStatus.countDocuments({ waMessageId }), 1, 'el acuse se perdió');

    assert.equal(await applyHeldStatuses(waMessageId), 1);
    const saved = await Message.findById(message._id).lean();
    assert.equal(saved.status, 'failed');
    assert.equal(saved.errorCode, '131049');
    assert.equal(await PendingStatus.countDocuments({ waMessageId }), 0);
});
