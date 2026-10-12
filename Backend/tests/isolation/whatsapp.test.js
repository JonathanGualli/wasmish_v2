// Un número de WhatsApp es de una sola cuenta: el webhook enruta por él.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { seedAccount, request, connectWhatsapp, metaCalls, onMeta, Account, Line, User, Waba, Conversation, PNG } from './helpers.js';

const { isPhoneNumberTaken, WABA_TAKEN_MESSAGE } = await import('../../src/services/whatsapp.connection.service.js');
const { lineStateIssues } = await import('../../src/utils/line.js');

const a = await seedAccount('A', { seq: 1 });
const b = await seedAccount('B', { seq: 2 });
await connectWhatsapp(a);
const A_NUMBER = '991';

// Meta devuelve `numbers` como los números del WABA; el resto de llamadas, OK.
const fakeMeta = (numbers, { onPhoneNumbers } = {}) => onMeta(async (config) => {
    if (config.url === '/oauth/access_token') return { data: { access_token: 'token-nuevo' } };
    if (config.url.endsWith('/phone_numbers')) {
        await onPhoneNumbers?.();
        return { data: { data: numbers.map(id => ({ id, display_phone_number: `+1 555 ${id}`, verified_name: `Negocio ${id}` })) } };
    }
    if (config.url.endsWith('/subscribed_apps')) return { data: { success: true } };
});

const updateToken = (account, phoneNumberId) => request(account, 'PUT', '/users/update-user-token-whatsapp',
    { tokenWhatsapp: 'token-manual', phoneNumberId, waBusinessId: `waba-${account.label}` });

// Regresión que vigila: un número ya conectado en otra cuenta no se puede volver a conectar.
test('PUT /users/update-user-token-whatsapp: B no puede declarar el número de A, y sin llamar a Meta', async () => {
    const before = metaCalls.length;
    const res = await updateToken(b, A_NUMBER);
    assert.equal(res.status, 409, res.text);
    assert.equal(metaCalls.length, before);
    assert.equal((await User.findById(b.userId).lean()).phoneNumberId, null);
});

test('POST /whatsapp/connect: B no puede conectar el número de A, y sin llamar a Meta', async () => {
    const before = metaCalls.length;
    const res = await request(b, 'POST', '/whatsapp/connect', { code: 'x', phoneNumberId: A_NUMBER, waBusinessId: 'waba-b' });
    assert.equal(res.status, 409, res.text);
    assert.equal(metaCalls.length, before);
});

test('PUT /users/update-user-token-whatsapp: faltan phoneNumberId o waBusinessId → 400', async () => {
    const res = await request(b, 'PUT', '/users/update-user-token-whatsapp', { tokenWhatsapp: 'x' });
    assert.equal(res.status, 400, res.text);
});

test('PUT /users/update-user-token-whatsapp: un número que no está en el WABA → 400 y nada guardado', async () => {
    const c = await seedAccount('C', { seq: 3 });
    fakeMeta(['993-otro']);
    const res = await updateToken(c, '993');
    onMeta(null);
    assert.equal(res.status, 400, res.text);
    assert.equal((await User.findById(c.userId).lean()).phoneNumberId, null);
});

test('PUT /users/update-user-token-whatsapp: un número del WABA se guarda, con el token cifrado', async () => {
    const d = await seedAccount('D', { seq: 4 });
    fakeMeta(['994']);
    const res = await updateToken(d, '994');
    onMeta(null);
    assert.equal(res.status, 200, res.text);
    const saved = await User.findById(d.userId).lean();
    assert.equal(saved.phoneNumberId, '994');
    assert.notEqual(saved.tokenWhatsapp, 'token-manual');
});

test('POST /whatsapp/connect: comprueba el número antes de suscribir la app, y lo guarda', async () => {
    const e = await seedAccount('E', { seq: 5 });
    fakeMeta(['995']);
    const before = metaCalls.length;
    const res = await request(e, 'POST', '/whatsapp/connect', { code: 'x', phoneNumberId: '995', waBusinessId: 'waba-e' });
    onMeta(null);
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(metaCalls.slice(before).map(c => c.url),
        ['/oauth/access_token', '/waba-e/phone_numbers', '/waba-e/subscribed_apps']);
    assert.equal((await User.findById(e.userId).lean()).phoneNumberId, '995');
});

test('dos conexiones a la vez: la segunda recibe 409, no 500, y no guarda nada', async () => {
    await User.init();
    const f = await seedAccount('F', { seq: 6 });
    const g = await seedAccount('G', { seq: 7 });
    // Mientras Meta responde a F, G se queda el número: F ya pasó la comprobación previa.
    fakeMeta(['996'], { onPhoneNumbers: () => User.updateOne({ _id: g.userId }, { phoneNumberId: '996' }) });
    const res = await updateToken(f, '996');
    onMeta(null);
    assert.equal(res.status, 409, res.text);
    assert.equal((await User.findById(f.userId).lean()).phoneNumberId, null);
    assert.equal(await Line.countDocuments({ accountId: f.accountId, status: 'active' }), 0);
});

// Regresión que vigila: solo se miraba la primera página de /phone_numbers.
test('PUT /users/update-user-token-whatsapp: un número en la segunda página del WABA también vale', async () => {
    const h = await seedAccount('H', { seq: 8 });
    onMeta(async (config) => {
        if (!config.url.endsWith('/phone_numbers')) return undefined;
        return config.params?.after === 'pagina-2'
            ? { data: { data: [{ id: '998' }] } }
            : { data: { data: [{ id: '997' }], paging: { cursors: { after: 'pagina-2' }, next: 'https://graph.facebook.com/…' } } };
    });
    const res = await updateToken(h, '998');
    onMeta(null);
    assert.equal(res.status, 200, res.text);
    assert.equal((await User.findById(h.userId).lean()).phoneNumberId, '998');
});

test('isPhoneNumberTaken: el número propio no cuenta como tomado (reconectar)', async () => {
    assert.equal(await isPhoneNumberTaken(a.userId, A_NUMBER), false);
    assert.equal(await isPhoneNumberTaken(b.userId, A_NUMBER), true);
});

// Regresión que vigila: los controladores tienen que pasar el `_id` del usuario
// que guarda la conexión, no el de la cuenta (en los tests son distintos): con
// el de la cuenta, el propio número cuenta como «de otro» y renovar da 409.
for (const [via, reconnect] of [
    ['PUT /users/update-user-token-whatsapp', (number) => updateToken(a, number)],
    ['POST /whatsapp/connect', (number) => request(a, 'POST', '/whatsapp/connect', { code: 'x', phoneNumberId: number, waBusinessId: 'waba-A' })],
]) {
    test(`${via}: reconectar el propio número (renovar el token) no da 409`, async () => {
        const current = (await User.findById(a.userId).lean()).phoneNumberId;
        fakeMeta([current]);
        const res = await reconnect(current);
        onMeta(null);
        assert.equal(res.status, 200, res.text);
        assert.equal((await User.findById(a.userId).lean()).phoneNumberId, current);
    });
}

// Regresión que vigila: processMessageSending llamaba a decrypt(null) y respondía 500 «Cannot read properties of null».
test('POST /chats/:id/messages sin WhatsApp y con la ventana abierta: 409', async () => {
    await Conversation.updateOne({ _id: b.conversationId }, { lastInboundAt: new Date() });
    const res = await request(b, 'POST', `/chats/${b.conversationId}/messages`, { text: 'hola', temporalId: 't1' });
    assert.equal(res.status, 409, res.text);
});

test('POST /chats/:id/media sin WhatsApp: 409 y no guarda el archivo', async () => {
    await Conversation.updateOne({ _id: b.conversationId }, { lastInboundAt: new Date() });
    const before = await fs.readdir(process.env.MEDIA_DIR, { recursive: true });
    const res = await request(b, 'POST', `/chats/${b.conversationId}/media`, PNG, { 'Content-Type': 'image/png' });
    assert.equal(res.status, 409, res.text);
    assert.deepEqual(await fs.readdir(process.env.MEDIA_DIR, { recursive: true }), before);
});

// Regresión que vigila: syncTemplatesForUser descifraba antes de comprobar el token y respondía 500.
test('GET /templates/sync sin WhatsApp: 400, sin llamar a Meta', async () => {
    const before = metaCalls.length;
    const res = await request(b, 'GET', '/templates/sync');
    assert.equal(res.status, 400, res.text);
    assert.equal(metaCalls.length, before);
});

// --- Fase 2a: Waba y Line, proyección de User -------------------------------

const connectManual = (account, phoneNumberId, waBusinessId) => request(account, 'PUT', '/users/update-user-token-whatsapp',
    { tokenWhatsapp: 'token-manual', phoneNumberId, waBusinessId });

/** Lo que falta para que Waba/Line coincidan con User; [] = al día. */
const issuesOf = async (account) => {
    const owner = await User.findById(account.userId).lean();
    return lineStateIssues({
        owner,
        account: await Account.findById(account.accountId).lean(),
        lines: await Line.find({ accountId: account.accountId }).lean(),
        waba: owner.waBusinessId ? await Waba.findOne({ waBusinessId: owner.waBusinessId }).lean() : null,
    });
};

test('conectar deja Waba y Line al día con User, con el número y el nombre que da Meta', async () => {
    await Waba.init();
    await Line.init();
    const w = await seedAccount('W', { seq: 20 });
    fakeMeta(['9920']);
    const res = await connectManual(w, '9920', 'waba-w');
    onMeta(null);
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(await issuesOf(w), []);
    const line = await Line.findOne({ accountId: w.accountId, status: 'active' }).lean();
    assert.equal(line.displayPhoneNumber, '+1 555 9920');
    assert.equal(line.verifiedName, 'Negocio 9920');
});

test('POST /whatsapp/connect también deja Waba y Line al día', async () => {
    const x = await seedAccount('X', { seq: 21 });
    fakeMeta(['9921']);
    const res = await request(x, 'POST', '/whatsapp/connect', { code: 'x', phoneNumberId: '9921', waBusinessId: 'waba-x' });
    onMeta(null);
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(await issuesOf(x), []);
});

test('un WABA de otra cuenta → 409 sin llamar a Meta', async () => {
    const y = await seedAccount('Y', { seq: 22 });
    await Waba.create({ accountId: a.accountId, waBusinessId: 'waba-de-a' });
    const before = metaCalls.length;
    const res = await connectManual(y, '9922', 'waba-de-a');
    assert.equal(res.status, 409, res.text);
    assert.deepEqual(res.body, [{ message: WABA_TAKEN_MESSAGE }]);
    assert.equal(metaCalls.length, before);
    assert.equal((await User.findById(y.userId).lean()).phoneNumberId, null);
    assert.equal(await Line.countDocuments({ accountId: y.accountId }), 0);
});

// Regresión que vigila (hueco de despliegue): antes de migrar, el WABA de una
// cuenta solo está en su `User`, y `Waba` está vacía para ella.
test('un WABA que otra cuenta tiene solo en User → 409 sin llamar a Meta', async () => {
    const z = await seedAccount('Z', { seq: 23 });
    await User.updateOne({ _id: b.userId }, { waBusinessId: 'waba-solo-en-user' });
    const before = metaCalls.length;
    const res = await request(z, 'POST', '/whatsapp/connect', { code: 'x', phoneNumberId: '9923', waBusinessId: 'waba-solo-en-user' });
    assert.equal(res.status, 409, res.text);
    assert.equal(metaCalls.length, before);
    assert.equal(await Waba.countDocuments({ accountId: z.accountId }), 0);
});

test('si Meta rechaza el número, ni WABA ni línea', async () => {
    const v = await seedAccount('V', { seq: 24 });
    fakeMeta(['9924-otro']);
    const res = await connectManual(v, '9924', 'waba-v');
    onMeta(null);
    assert.equal(res.status, 400, res.text);
    assert.equal(await Waba.countDocuments({ accountId: v.accountId }), 0);
    assert.equal(await Line.countDocuments({ accountId: v.accountId }), 0);
});
