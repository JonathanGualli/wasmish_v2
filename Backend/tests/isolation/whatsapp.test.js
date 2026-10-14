// Un número de WhatsApp es de una sola cuenta: el webhook enruta por él.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { seedAccount, request, connectWhatsapp, metaCalls, onMeta, ANONYMOUS, Account, ApiKey, Line, User, Waba, Conversation, PNG } from './helpers.js';

const { isPhoneNumberTaken, WABA_TAKEN_MESSAGE } = await import('../../src/services/whatsapp.connection.service.js');
const { applyConnection, writeLegacyUser } = await import('../../src/services/line.service.js');
const { lineLimitMessage, LINE_BUSY_MESSAGE, PHONE_NUMBER_REGISTRATION_FAILED_MESSAGE } = await import('../../src/utils/whatsapp.line.js');
const { encrypt, decrypt, hashApiKey } = await import('../../src/utils/crypto.js');
const { lineStateIssues } = await import('../../src/utils/line.js');

const a = await seedAccount('A', { seq: 1 });
const b = await seedAccount('B', { seq: 2 });
await connectWhatsapp(a);
const A_NUMBER = '991';

// Meta devuelve `numbers` como los números del WABA, con ese `platform_type`
// (`undefined`: sin el campo); el resto de llamadas, OK. `onRegister(config)`
// puede lanzar: con `waErrorCode` es un rechazo de Meta (como lo deja el
// interceptor de `whatsappApi`), sin él, una respuesta que no llegó.
const fakeMeta = (numbers, { onPhoneNumbers, platformType = 'CLOUD_API', onRegister } = {}) => onMeta(async (config) => {
    if (config.url === '/oauth/access_token') return { data: { access_token: 'token-nuevo' } };
    if (config.url.endsWith('/phone_numbers')) {
        await onPhoneNumbers?.();
        return { data: { data: numbers.map(id => ({
            id, display_phone_number: `+1 555 ${id}`, verified_name: `Negocio ${id}`,
            ...(platformType !== undefined && { platform_type: platformType }),
        })) } };
    }
    if (config.url.endsWith('/subscribed_apps')) return { data: { success: true } };
    if (config.url.endsWith('/register')) {
        await onRegister?.(config);
        return { data: { success: true } };
    }
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
    await Line.init();
    const f = await seedAccount('F', { seq: 6 });
    const g = await seedAccount('G', { seq: 7 });
    // Mientras Meta responde a F, G activa el número: F ya pasó la comprobación previa.
    fakeMeta(['996'], { onPhoneNumbers: () => Line.create({ accountId: g.accountId, phoneNumberId: '996', status: 'active' }) });
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
    assert.equal(await isPhoneNumberTaken(a.accountId, A_NUMBER), false);
    assert.equal(await isPhoneNumberTaken(b.accountId, A_NUMBER), true);
});

// Fase 2c: el `User` de otra cuenta con una copia atrasada de un número que esa
// cuenta ya desconectó no lo ocupa; el de una cuenta sin líneas (anterior a
// ellas), sí.
test('isPhoneNumberTaken: una copia atrasada en User no ocupa el número; una cuenta sin líneas, sí', async () => {
    const h = await seedAccount('HH', { seq: 60 });
    await Line.create({ accountId: h.accountId, phoneNumberId: '7760', status: 'disconnected' });
    await User.updateOne({ _id: h.userId }, { phoneNumberId: '7760' });
    assert.equal(await isPhoneNumberTaken(b.accountId, '7760'), false);

    const i = await seedAccount('II', { seq: 61 });
    await User.updateOne({ _id: i.userId }, { phoneNumberId: '7761' });
    assert.equal(await isPhoneNumberTaken(b.accountId, '7761'), true);
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

// Regresión que vigila: la sincronización de plantillas (hoy `syncTemplatesForWaba`) descifraba antes de comprobar el token y respondía 500.
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
    assert.deepEqual(res.body, [{ message: WABA_TAKEN_MESSAGE, code: 'waba_taken' }]);
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

// Regresión que vigila (Codex, código de la 2a): dos cuentas conectando a la vez
// números distintos del mismo WABA pasaban las dos `isWabaTaken`, y las dos
// quedaban conectadas al mismo WABA.
for (const [via, connect] of [
    ['PUT /users/update-user-token-whatsapp', (account, number, waba) => connectManual(account, number, waba)],
    ['POST /whatsapp/connect', (account, number, waba) => request(account, 'POST', '/whatsapp/connect', { code: 'x', phoneNumberId: number, waBusinessId: waba })],
]) {
    test(`${via}: si otra cuenta se queda el WABA mientras Meta responde, 409 y no se guarda nada`, async () => {
        const loser = await seedAccount(`P${via.length}`, { seq: 30 + via.length });
        const winner = await seedAccount(`Q${via.length}`, { seq: 40 + via.length });
        const waba = `waba-carrera-${via.length}`;
        const number = `99${50 + via.length}`;
        // Mientras Meta lista los números para `loser`, `winner` reclama ese WABA.
        fakeMeta([number], { onPhoneNumbers: () => Waba.create({ accountId: winner.accountId, waBusinessId: waba }) });
        const res = await connect(loser, number, waba);
        onMeta(null);
        assert.equal(res.status, 409, res.text);
        assert.equal(res.body[0].message, WABA_TAKEN_MESSAGE);
        const saved = await User.findById(loser.userId).lean();
        assert.equal(saved.phoneNumberId, null);
        assert.equal(saved.waBusinessId ?? null, null);
    });
}

// --- Fase 2c: varias líneas por cuenta ----------------------------------------

const activeNumbers = async (account) =>
    (await Line.find({ accountId: account.accountId, status: 'active' }).sort({ createdAt: 1 }).lean()).map(line => line.phoneNumberId);
const ownerOf = (account) => User.findById(account.userId).lean();
const defaultLineOf = async (account) => {
    const { defaultLineId } = await Account.findById(account.accountId).lean();
    return defaultLineId ? Line.findById(defaultLineId).lean() : null;
};

test('conectar con maxLines 2 añade una segunda línea y conserva la primera', async () => {
    const k = await seedAccount('K2', { seq: 62, maxLines: 2 });
    await connectWhatsapp(k);
    fakeMeta(['7762']);
    const res = await connectManual(k, '7762', `waba-${k.label}`);
    onMeta(null);
    assert.equal(res.status, 200, res.text);
    assert.ok(res.body.lineId);
    assert.deepEqual(await activeNumbers(k), [`99${k.seq}`, '7762']);
    // La por defecto sigue siendo la primera, y User es su copia.
    assert.equal((await defaultLineOf(k)).phoneNumberId, `99${k.seq}`);
    assert.equal((await ownerOf(k)).phoneNumberId, `99${k.seq}`);
});

test('conectar con la cuenta en el límite → 409 sin llamar a Meta', async () => {
    const l = await seedAccount('L2', { seq: 63, maxLines: 2 });
    await connectWhatsapp(l);
    await connectWhatsapp(l, { phoneNumberId: '7763' });
    const before = metaCalls.length;
    for (const connect of [
        () => connectManual(l, '7764', `waba-${l.label}`),
        () => request(l, 'POST', '/whatsapp/connect', { code: 'x', phoneNumberId: '7764', waBusinessId: `waba-${l.label}` }),
    ]) {
        const res = await connect();
        assert.equal(res.status, 409, res.text);
        assert.equal(res.body[0].message, lineLimitMessage(2));
    }
    assert.equal(metaCalls.length, before);
    assert.deepEqual(await activeNumbers(l), [`99${l.seq}`, '7763']);
});

test('conectar un número del mismo WABA reemplaza el token del Waba para las dos líneas', async () => {
    const m = await seedAccount('M2', { seq: 64, maxLines: 2 });
    await connectWhatsapp(m);
    fakeMeta(['7765']);
    const res = await connectManual(m, '7765', `waba-${m.label}`);
    onMeta(null);
    assert.equal(res.status, 200, res.text);
    const lines = await Line.find({ accountId: m.accountId, status: 'active' }).lean();
    assert.equal(lines.length, 2);
    assert.equal(String(lines[0].wabaId), String(lines[1].wabaId));
    const waba = await Waba.findById(lines[0].wabaId).lean();
    assert.notEqual(waba.tokenWhatsapp, encrypt('token-de-pruebas'));   // el del formulario, cifrado
    assert.equal(await Waba.countDocuments({ accountId: m.accountId }), 1);
});

// Regresión que vigila (Codex, plan de la 2c; Review Focus 3): dos conexiones a
// la vez en el límite. Antes, las dos pasaban la comprobación y la compensación
// dejaba la línea por defecto y User en la línea deshecha.
test('dos conexiones a la vez: la segunda da 409 LINE_BUSY y el estado final es el de la primera', async () => {
    const n = await seedAccount('N2', { seq: 65 });
    const connect = (phoneNumberId, options) => applyConnection(
        { accountId: n.accountId, waBusinessId: `waba-${n.label}`, tokenWhatsapp: encrypt('token-de-pruebas'), phoneNumberId },
        options,
    );
    let second = null;
    await connect('7766', {
        afterLock: async () => {
            second = await connect('7767').then(() => null, error => error);
        },
    });

    assert.equal(second?.statusCode, 409);
    assert.equal(second.message, LINE_BUSY_MESSAGE);
    assert.deepEqual(await activeNumbers(n), ['7766']);
    assert.equal((await defaultLineOf(n)).phoneNumberId, '7766');
    assert.equal((await ownerOf(n)).phoneNumberId, '7766');
    assert.equal((await Account.findById(n.accountId).lean()).lineLock, null);
});

test('withLineLock: un candado vencido se puede tomar', async () => {
    const o = await seedAccount('O2', { seq: 66 });
    await Account.updateOne({ _id: o.accountId }, { lineLock: { token: 'muerto', expiresAt: new Date(Date.now() - 1000) } });
    await connectWhatsapp(o);
    assert.deepEqual(await activeNumbers(o), [`99${o.seq}`]);

    await Account.updateOne({ _id: o.accountId }, { lineLock: { token: 'vivo', expiresAt: new Date(Date.now() + 60_000) } });
    await assert.rejects(connectWhatsapp(o), (error) => error.statusCode === 409 && error.message === LINE_BUSY_MESSAGE);
});

// Regresión que vigila (Codex, plan de la 2c; Review Focus 5): con el límite
// bajado por debajo de las activas, renovar el token desconectaba la línea.
test('renovar el token con la cuenta por encima del límite (se bajó) funciona y no desconecta nada', async () => {
    const p = await seedAccount('P2', { seq: 67, maxLines: 2 });
    await connectWhatsapp(p);
    await connectWhatsapp(p, { phoneNumberId: '7768' });
    await Account.updateOne({ _id: p.accountId }, { 'limits.maxLines': 1 });

    fakeMeta(['7768']);
    const res = await connectManual(p, '7768', `waba-${p.label}`);
    onMeta(null);
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(await activeNumbers(p), [`99${p.seq}`, '7768']);
});

test('tras conectar, User es la copia de la línea por defecto', async () => {
    const q = await seedAccount('Q2', { seq: 68 });
    await connectWhatsapp(q);
    const owner = await ownerOf(q);
    const line = await defaultLineOf(q);
    const waba = await Waba.findById(line.wabaId).lean();
    assert.equal(owner.phoneNumberId, line.phoneNumberId);
    assert.equal(owner.waBusinessId, waba.waBusinessId);
    assert.equal(owner.tokenWhatsapp, waba.tokenWhatsapp);
    assert.equal((await Account.findById(q.accountId).lean()).legacyUserStale, false);
});

// Regresión que vigila (Codex, plan de la 2c): la copia en User de otra cuenta,
// atrasada (su línea ya está desconectada), bloqueaba la de esta con E11000.
test('si la copia de User choca con la copia atrasada de otra cuenta, se repara esa y se reintenta', async () => {
    await User.init();
    const r = await seedAccount('R2', { seq: 69 });
    const s = await seedAccount('S2', { seq: 70 });
    await connectWhatsapp(r, { phoneNumberId: '7770' });
    // R desconecta su línea, pero su copia en User se queda con el número.
    await Line.updateOne({ accountId: r.accountId }, { status: 'disconnected' });
    await Account.updateOne({ _id: r.accountId }, { defaultLineId: null });
    assert.equal((await ownerOf(r)).phoneNumberId, '7770');

    await connectWhatsapp(s, { phoneNumberId: '7770' });
    assert.equal((await ownerOf(r)).phoneNumberId, null);
    assert.equal((await ownerOf(s)).phoneNumberId, '7770');
    assert.equal((await Account.findById(s.accountId).lean()).legacyUserStale, false);
});

test('si la copia de User falla, legacyUserStale queda en true y la siguiente la arregla', async (t) => {
    const u = await seedAccount('U2', { seq: 71 });
    const failing = t.mock.method(User, 'updateOne', async () => { throw new Error('Mongo caído'); });
    t.mock.method(console, 'error', () => {});
    await connectWhatsapp(u);
    failing.mock.restore();

    assert.deepEqual(await activeNumbers(u), [`99${u.seq}`]);   // la línea sí: es la fuente
    assert.equal((await Account.findById(u.accountId).lean()).legacyUserStale, true);
    assert.equal((await ownerOf(u)).phoneNumberId, null);

    await writeLegacyUser(u.accountId);
    assert.equal((await Account.findById(u.accountId).lean()).legacyUserStale, false);
    assert.equal((await ownerOf(u)).phoneNumberId, `99${u.seq}`);
});

// Regresión que vigila (Codex, PR #19): con maxLines 1, activar el número nuevo
// y desconectar el anterior no es atómico. Si lo segundo fallaba, reintentar
// daba «renovar»: las dos quedaban activas y la por defecto en la vieja.
test('un reemplazo de número cortado a medias se termina al reintentar', async (t) => {
    const v = await seedAccount('V2', { seq: 72 });
    await connectWhatsapp(v, { phoneNumberId: '7772' });
    let failed = false;
    const original = Line.updateMany.bind(Line);
    t.mock.method(Line, 'updateMany', (...args) => {
        if (!failed) { failed = true; throw new Error('Mongo caído'); }
        return original(...args);
    });
    await assert.rejects(connectWhatsapp(v, { phoneNumberId: '7773' }), /Mongo caído/);
    assert.deepEqual(await activeNumbers(v), ['7772', '7773']);   // a medias

    await connectWhatsapp(v, { phoneNumberId: '7773' });
    assert.deepEqual(await activeNumbers(v), ['7773']);
    assert.equal((await defaultLineOf(v)).phoneNumberId, '7773');
    assert.equal((await ownerOf(v)).phoneNumberId, '7773');
    assert.equal((await Account.findById(v.accountId).lean()).pendingReplace, null);
});

// --- Registrar el número en la Cloud API ----------------------------------------

const connectEmbedded = (account, phoneNumberId) => request(account, 'POST', '/whatsapp/connect',
    { code: 'x', phoneNumberId, waBusinessId: `waba-${account.label}` });

const registerCalls = (since) => metaCalls.slice(since).filter(call => call.url.endsWith('/register'));

/** La línea de ese número en la cuenta, con su PIN descifrado (o null). */
const linePin = async (account, phoneNumberId) => {
    const line = await Line.findOne({ accountId: account.accountId, phoneNumberId }).lean();
    return line?.twoStepPin ? decrypt(line.twoStepPin) : null;
};

const pendingPins = async (account) =>
    (await Waba.findOne({ accountId: account.accountId, waBusinessId: `waba-${account.label}` }).lean())?.pendingTwoStepPins ?? {};

// Regresión que vigila: un número nuevo del Embedded Signup quedaba sin registrar y no podía enviar (133010).
test('POST /whatsapp/connect: un número sin registrar se registra con un PIN, y se guarda cifrado', async () => {
    const r = await seedAccount('RA', { seq: 80 });
    let sent = null;
    fakeMeta(['981'], { platformType: 'NOT_APPLICABLE', onRegister: (config) => { sent = JSON.parse(config.data); } });
    const before = metaCalls.length;
    const res = await connectEmbedded(r, '981');
    onMeta(null);
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(metaCalls.slice(before).map(c => c.url),
        ['/oauth/access_token', '/waba-RA/phone_numbers', '/waba-RA/subscribed_apps', '/981/register']);
    assert.equal(sent.messaging_product, 'whatsapp');
    assert.match(sent.pin, /^\d{6}$/);
    const line = await Line.findOne({ accountId: r.accountId, phoneNumberId: '981' }).lean();
    assert.notEqual(line.twoStepPin, sent.pin);
    assert.equal(decrypt(line.twoStepPin), sent.pin);
    assert.deepEqual(await pendingPins(r), {});
});

test('PUT /users/update-user-token-whatsapp: el formulario manual también registra un número sin registrar', async () => {
    const r = await seedAccount('RB', { seq: 81 });
    fakeMeta(['982'], { platformType: 'NOT_APPLICABLE' });
    const before = metaCalls.length;
    const res = await request(r, 'PUT', '/users/update-user-token-whatsapp',
        { tokenWhatsapp: 'token-manual', phoneNumberId: '982', waBusinessId: 'waba-RB' });
    onMeta(null);
    assert.equal(res.status, 200, res.text);
    assert.equal(registerCalls(before).length, 1);
    assert.match(await linePin(r, '982'), /^\d{6}$/);
});

test('un número ya registrado, sin platform_type o con uno desconocido no se registra', async () => {
    for (const [i, platformType] of ['CLOUD_API', undefined, 'ALGO_NUEVO'].entries()) {
        const r = await seedAccount(`RC${i}`, { seq: 82 + i });
        fakeMeta([`983${i}`], { platformType });
        const before = metaCalls.length;
        const res = await connectEmbedded(r, `983${i}`);
        onMeta(null);
        assert.equal(res.status, 200, `${platformType}: ${res.text}`);
        assert.deepEqual(registerCalls(before), [], String(platformType));
        assert.equal(await linePin(r, `983${i}`), null);
    }
});

// Regresión que vigila: renovar el token de un número ya registrado (el cliente de la API pública) no puede tocar su PIN.
test('renovar el token no vuelve a registrar ni borra el PIN, y /v1 envía con el token nuevo', async () => {
    const r = await seedAccount('RD', { seq: 85 });
    fakeMeta(['984'], { platformType: 'NOT_APPLICABLE' });
    assert.equal((await connectEmbedded(r, '984')).status, 200);
    const pin = await linePin(r, '984');

    fakeMeta(['984']);
    const before = metaCalls.length;
    const res = await connectEmbedded(r, '984');
    onMeta(null);
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(registerCalls(before), []);
    assert.equal(await linePin(r, '984'), pin);

    const key = 'wm_rd';
    await ApiKey.create({ userId: r.accountId, keyHash: hashApiKey(key), keyPreview: 'wm_', name: 'v1' });
    let authorization = null;
    onMeta(async (config) => {
        if (config.method !== 'post' || !config.url.endsWith('/messages')) return undefined;
        authorization = config.headers.Authorization;
        return { data: { messages: [{ id: 'wamid.rd' }] } };
    });
    const sent = await request(ANONYMOUS, 'POST', '/v1/templates/send',
        { destinationNumber: r.phone, templateName: r.templateName }, { Authorization: `Bearer ${key}` });
    onMeta(null);
    assert.equal(sent.status, 200, sent.text);
    assert.equal(authorization, 'Bearer token-nuevo');
});

// Regresión que vigila: un PIN con el que Meta ya registró el número no se puede perder.
test('si la conexión falla después de registrar, al repetir la línea se guarda con el PIN del primer intento', async () => {
    const r = await seedAccount('RE', { seq: 86 });
    const other = await seedAccount('RF', { seq: 87 });
    let pin = null;
    // Mientras Meta registra, otra cuenta activa el número: la conexión choca con el índice.
    fakeMeta(['985'], { platformType: 'NOT_APPLICABLE', onRegister: async (config) => {
        pin = JSON.parse(config.data).pin;
        await Line.create({ accountId: other.accountId, phoneNumberId: '985', status: 'active' });
    } });
    const failed = await connectEmbedded(r, '985');
    onMeta(null);
    assert.equal(failed.status, 409, failed.text);

    await Line.updateOne({ accountId: other.accountId, phoneNumberId: '985' }, { status: 'disconnected' });
    fakeMeta(['985']);
    const before = metaCalls.length;
    const res = await connectEmbedded(r, '985');
    onMeta(null);
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(registerCalls(before), []);
    assert.equal(await linePin(r, '985'), pin);
    assert.deepEqual(await pendingPins(r), {});
});

test('si la respuesta de /register se pierde, al repetir la línea se guarda con ese PIN', async () => {
    const r = await seedAccount('RG', { seq: 88 });
    let pin = null;
    fakeMeta(['986'], { platformType: 'NOT_APPLICABLE', onRegister: (config) => {
        pin = JSON.parse(config.data).pin;
        throw new Error('socket hang up');
    } });
    const failed = await connectEmbedded(r, '986');
    onMeta(null);
    assert.equal(failed.status, 502, failed.text);
    assert.equal(failed.body[0].code, 'phone_number_registration_failed');
    assert.equal(failed.body[0].errorCode, null);

    fakeMeta(['986']);
    const res = await connectEmbedded(r, '986');
    onMeta(null);
    assert.equal(res.status, 200, res.text);
    assert.equal(await linePin(r, '986'), pin);
});

test('si la respuesta se pierde y Meta sigue sin tenerlo registrado, se reintenta con el mismo PIN', async () => {
    const r = await seedAccount('RH', { seq: 89 });
    const pins = [];
    let lost = true;
    fakeMeta(['987'], { platformType: 'NOT_APPLICABLE', onRegister: (config) => {
        pins.push(JSON.parse(config.data).pin);
        if (lost) { lost = false; throw new Error('timeout'); }
    } });
    assert.equal((await connectEmbedded(r, '987')).status, 502);
    const res = await connectEmbedded(r, '987');
    onMeta(null);
    assert.equal(res.status, 200, res.text);
    assert.equal(pins.length, 2);
    assert.equal(pins[1], pins[0]);
    assert.equal(await linePin(r, '987'), pins[0]);
});

test('si Meta rechaza el registro: 502 con el código, el errorCode de Meta, ninguna línea activa y el PIN apuntado borrado', async () => {
    const r = await seedAccount('RI', { seq: 90 });
    fakeMeta(['988'], { platformType: 'NOT_APPLICABLE', onRegister: () => {
        throw Object.assign(new Error('WhatsApp API Error (400): rate limit'), { waErrorCode: 133016, waErrorDetail: 'rate limit' });
    } });
    const res = await connectEmbedded(r, '988');
    onMeta(null);
    assert.equal(res.status, 502, res.text);
    assert.deepEqual(res.body, [{
        message: PHONE_NUMBER_REGISTRATION_FAILED_MESSAGE, code: 'phone_number_registration_failed', errorCode: 133016,
    }]);
    assert.equal(await Line.countDocuments({ accountId: r.accountId, status: 'active' }), 0);
    assert.deepEqual(await pendingPins(r), {});
});
