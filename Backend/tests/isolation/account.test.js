// Lo de la cuenta: las API keys de A (con una, B enviaría plantillas como A),
// el panel de admin, que solo abre un superadmin, y la sesión: el registro crea
// la cuenta, y un usuario desactivado o sin cuenta no entra.
import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import {
    seedAccount, seedMember, request, sessionFrom, ANONYMOUS, assertNoLeak, assertHasOwn, connectWhatsapp, onMeta, metaCalls,
    Account, ApiKey, Conversation, Line, User,
} from './helpers.js';

const { hashApiKey } = await import('../../src/utils/crypto.js');

const a = await seedAccount('A', { seq: 1 });
const b = await seedAccount('B', { seq: 2 });
const admin = await seedAccount('ADMIN', { seq: 3, isSuperadmin: true });

test('GET /api-key: B no ve las API keys de A', async () => {
    assertNoLeak(await request(b, 'GET', '/api-key'), a);
    assertHasOwn(await request(a, 'GET', '/api-key'), a);
});

test('DELETE /api-key/:id: B no revoca una API key de A', async () => {
    const asB = await request(b, 'DELETE', `/api-key/${a.apiKeyId}`);
    assert.equal(asB.status, 404);
    assert.ok(await ApiKey.findById(a.apiKeyId).lean(), 'la API key de A desapareció');

    const asA = await request(a, 'DELETE', `/api-key/${a.apiKeyId}`);
    assert.equal(asA.status, 200, asA.text);
});

for (const url of ['/admin/stats', '/admin/clients']) {
    test(`GET ${url}: solo el superadmin`, async () => {
        assert.equal((await request(b, 'GET', url)).status, 403);
        const asAdmin = await request(admin, 'GET', url);
        assert.equal(asAdmin.status, 200, asAdmin.text);
    });
}

test('POST /register crea la cuenta y su owner con el mismo _id', async () => {
    const res = await request(ANONYMOUS, 'POST', '/register', { name: 'Nueva', email: 'nueva@pruebas.local', password: 'secreta123' });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.isSuperadmin, false);

    const user = await User.findOne({ email: 'nueva@pruebas.local' }).lean();
    assert.equal(String(user.accountId), String(user._id));
    assert.equal(user.role, 'owner');
    assert.equal(user.isSuperadmin, false);
    const account = await Account.findById(user._id).lean();
    assert.equal(String(account.ownerId), String(user._id));

    assert.equal((await request(sessionFrom(res), 'GET', '/profile')).status, 200);
});

// Regresión que vigila: el registro aceptaba `rol` y `status` del cuerpo.
test('POST /register ignora los privilegios del cuerpo', async () => {
    const res = await request(ANONYMOUS, 'POST', '/register', {
        name: 'Lista', email: 'lista@pruebas.local', password: 'secreta123',
        rol: 'superadmin', isSuperadmin: true, role: 'agent', status: 'inactive', accountId: a.accountId,
    });
    assert.equal(res.status, 200, res.text);

    const user = await User.findOne({ email: 'lista@pruebas.local' }).lean();
    assert.notEqual(String(user.accountId), a.accountId);
    assert.equal(String(user.accountId), String(user._id));
    assert.equal(user.role, 'owner');
    assert.equal(user.status, 'active');
    assert.equal(user.isSuperadmin, false);
    assert.equal(user.rol, 'admin');
    assert.equal((await request(sessionFrom(res), 'GET', '/admin/stats')).status, 403);
});

test('un usuario desactivado: su cookie deja de valer y el login lo dice', async () => {
    const c = await seedAccount('C', { seq: 4 });
    await User.updateOne({ _id: c.userId }, { password: await bcrypt.hash('secreta123', 4) });
    assert.equal((await request(c, 'GET', '/contacts')).status, 200);

    await User.updateOne({ _id: c.userId }, { status: 'inactive' });
    assert.equal((await request(c, 'GET', '/contacts')).status, 401);

    const right = await request(ANONYMOUS, 'POST', '/login', { email: 'c@pruebas.local', password: 'secreta123' });
    assert.equal(right.status, 403);
    assert.deepEqual(right.body, [{ message: 'Tu usuario está desactivado. Habla con el administrador de tu cuenta.' }]);
    assert.equal(right.setCookie, null);

    // Con la contraseña mal, lo mismo que un correo que no existe: no se puede
    // averiguar quién está desactivado.
    const wrong = await request(ANONYMOUS, 'POST', '/login', { email: 'c@pruebas.local', password: 'otra-cosa' });
    const unknown = await request(ANONYMOUS, 'POST', '/login', { email: 'nadie@pruebas.local', password: 'otra-cosa' });
    assert.equal(wrong.status, 400);
    assert.deepEqual(wrong.body, unknown.body);
});

// Regresión que vigila: un usuario sin migrar no puede acabar consultando con
// `accountId: 'undefined'` (un 500); se le cierra la puerta.
test('un usuario sin cuenta (sin migrar) recibe 401, no 500', async () => {
    const d = await seedAccount('D', { seq: 5 });
    await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(d.userId) }, { $unset: { accountId: 1 } });
    assert.equal((await request(d, 'GET', '/contacts')).status, 401);
    assert.equal((await request(d, 'GET', '/verify')).status, 401);
});

// La sesión dura 30 días desde el último uso (2026-10-15): un token de más de
// un día se cambia por uno nuevo en la respuesta, como mucho uno al día.
const DAY_S = 24 * 60 * 60;
const tokenFromDaysAgo = (account, days) => ({
    token: jwt.sign({ id: account.userId, iat: Math.floor(Date.now() / 1000) - days * DAY_S }, process.env.TOKEN_SECRET, { expiresIn: '30d' }),
});
const daysLeft = (session) => (jwt.decode(session.token).exp - Date.now() / 1000) / DAY_S;

test('sesión: un token recién emitido no se renueva en cada petición', async () => {
    assert.equal((await request(a, 'GET', '/contacts')).setCookie, null);
    assert.equal((await request(a, 'GET', '/verify')).setCookie, null);
});

// Regresión (revisión de Codex del PR #58): solo `/verify` renovaba, y la app
// suspendida o la pestaña abierta sin recargar no lo vuelven a llamar: la
// sesión caducaba a los 30 días aunque se usara a diario.
test('sesión: usarla tras más de un día la renueva, también sin pasar por /verify', async () => {
    const res = await request(tokenFromDaysAgo(a, 2), 'GET', '/contacts');
    assert.equal(res.status, 200, res.text);
    assert.match(res.setCookie ?? '', /Max-Age=2592000/);
    const renewed = sessionFrom(res);
    assert.ok(daysLeft(renewed) > 29.9, `al token nuevo le quedan ${daysLeft(renewed)} días`);
    assert.equal((await request(renewed, 'GET', '/contacts')).setCookie, null);
});

test('sesión: abrir la app (/verify) tras más de un día también la renueva', async () => {
    const res = await request(tokenFromDaysAgo(a, 2), 'GET', '/verify');
    assert.equal(res.status, 200, res.text);
    assert.ok(daysLeft(sessionFrom(res)) > 29.9);
});

test('sesión: un usuario desactivado no recibe una sesión nueva', async () => {
    const f = await seedAccount('F', { seq: 9 });
    await User.updateOne({ _id: f.userId }, { status: 'inactive' });
    for (const url of ['/contacts', '/verify']) {
        const res = await request(tokenFromDaysAgo(f, 2), 'GET', url);
        assert.equal(res.status, 401);
        assert.equal(res.setCookie, null);
    }
});

test('el superadmin sale de isSuperadmin, no de rol', async () => {
    const e = await seedAccount('E', { seq: 6 });
    await User.updateOne({ _id: e.userId }, { rol: 'superadmin' });
    assert.equal((await request(e, 'GET', '/admin/stats')).status, 403);

    const verify = await request(admin, 'GET', '/verify');
    assert.equal(verify.status, 200, verify.text);
    assert.equal(verify.body.isSuperadmin, true);
});

test('una API key cuya cuenta no existe → 401', async () => {
    await ApiKey.create({
        userId: new mongoose.Types.ObjectId(), keyHash: hashApiKey('wm_sin_cuenta'), keyPreview: 'wm_sin', name: 'huérfana',
    });
    const res = await request(ANONYMOUS, 'POST', '/v1/templates/send',
        { destinationNumber: '593990000001', templateName: 'x' }, { Authorization: 'Bearer wm_sin_cuenta' });
    assert.equal(res.status, 401, res.text);
});

// Es lo que usa el cliente de la API pública: la cuenta de A no tiene el `_id`
// de ningún usuario, y la respuesta tiene que ser la de siempre.
test('POST /v1/templates/send con la key de A: sale del número de A y responde como siempre', async () => {
    await connectWhatsapp(a);
    await ApiKey.create({ userId: a.accountId, keyHash: hashApiKey('wm_prueba_a'), keyPreview: 'wm_prueba', name: 'v1' });
    onMeta(async (config) => (config.method === 'post' && config.url === `/99${a.seq}/messages`
        ? { data: { messages: [{ id: 'wamid.v1' }] } }
        : undefined));
    try {
        const res = await request(ANONYMOUS, 'POST', '/v1/templates/send',
            { destinationNumber: a.phone, templateName: a.templateName }, { Authorization: 'Bearer wm_prueba_a' });
        assert.equal(res.status, 200, res.text);
        assert.deepEqual(Object.keys(res.body).sort(), ['conversationId', 'success', 'waMessageId']);
        assert.equal(res.body.success, true);
        assert.equal(res.body.waMessageId, 'wamid.v1');
        assert.ok(await Conversation.exists({ _id: res.body.conversationId, userId: a.accountId }));
        assert.deepEqual(metaCalls.at(-1), { method: 'post', url: `/99${a.seq}/messages` });
    } finally {
        onMeta(null);
    }
});

// Fase 2c: `Line` es la fuente y `User` solo una copia para la imagen anterior.
// Una copia desajustada (aquí, otro número en `User`) no cambia por dónde sale el OTP.
test('POST /v1/templates/send con un User desajustado sale por la línea por defecto', async () => {
    await User.updateOne({ _id: a.userId }, { phoneNumberId: `98${a.seq}` });
    onMeta(async (config) => (config.method === 'post' && config.url === `/99${a.seq}/messages`
        ? { data: { messages: [{ id: 'wamid.linea' }] } }
        : undefined));
    try {
        const res = await request(ANONYMOUS, 'POST', '/v1/templates/send',
            { destinationNumber: a.phone, templateName: a.templateName }, { Authorization: 'Bearer wm_prueba_a' });
        assert.equal(res.status, 200, res.text);
        assert.deepEqual(metaCalls.at(-1), { method: 'post', url: `/99${a.seq}/messages` });
    } finally {
        onMeta(null);
        await User.updateOne({ _id: a.userId }, { phoneNumberId: `99${a.seq}` });
    }
});

// Regresión que vigila (plan de la 2c, Review Focus 1): el «volver a conectar»
// con otro número de siempre. Con `maxLines: 1`, el nuevo reemplaza al anterior,
// que se queda con su historial, y el OTP sale por el nuevo.
test('conectar otro número con maxLines 1 lo reemplaza y /v1 sale por el nuevo', async () => {
    const r = await seedAccount('R', { seq: 7 });
    await connectWhatsapp(r);
    await ApiKey.create({ userId: r.accountId, keyHash: hashApiKey('wm_prueba_r'), keyPreview: 'wm_prueba', name: 'v1' });
    const { lineId } = await connectWhatsapp(r, { phoneNumberId: '9707' });

    assert.equal((await Line.findOne({ accountId: r.accountId, phoneNumberId: `99${r.seq}` }).lean()).status, 'disconnected');
    assert.equal(String((await Account.findById(r.accountId).lean()).defaultLineId), String(lineId));
    assert.equal((await User.findById(r.userId).lean()).phoneNumberId, '9707');
    onMeta(async (config) => (config.method === 'post' && config.url === '/9707/messages'
        ? { data: { messages: [{ id: 'wamid.nuevo' }] } }
        : undefined));
    try {
        const res = await request(ANONYMOUS, 'POST', '/v1/templates/send',
            { destinationNumber: r.phone, templateName: r.templateName }, { Authorization: 'Bearer wm_prueba_r' });
        assert.equal(res.status, 200, res.text);
        assert.deepEqual(metaCalls.at(-1), { method: 'post', url: '/9707/messages' });
    } finally {
        onMeta(null);
    }
});

// Fase 2b: el cliente de la API elige la línea con `lineId` o `from`.
const sendWithKeyOfA = (body) => request(ANONYMOUS, 'POST', '/v1/templates/send',
    { destinationNumber: a.phone, templateName: a.templateName, ...body }, { Authorization: 'Bearer wm_prueba_a' });

test('POST /v1/templates/send con un lineId de otra cuenta → 404 sin llamar a Meta', async () => {
    const foreign = await Line.create({ accountId: b.accountId, phoneNumberId: '7090', status: 'active' });
    const calls = metaCalls.length;
    const res = await sendWithKeyOfA({ lineId: String(foreign._id) });
    assert.equal(res.status, 404, res.text);
    assert.equal(metaCalls.length, calls);
});

test('POST /v1/templates/send con from elige esa línea; con otro número, 404', async () => {
    await Line.updateOne({ accountId: a.accountId, phoneNumberId: `99${a.seq}` }, { displayPhoneNumber: '+1 555-000-0991' });
    onMeta(async (config) => (config.method === 'post' && config.url === `/99${a.seq}/messages`
        ? { data: { messages: [{ id: 'wamid.from' }] } }
        : undefined));
    try {
        const res = await sendWithKeyOfA({ from: '+15550000991' });
        assert.equal(res.status, 200, res.text);
        assert.deepEqual(Object.keys(res.body).sort(), ['conversationId', 'success', 'waMessageId']);
        assert.deepEqual(metaCalls.at(-1), { method: 'post', url: `/99${a.seq}/messages` });
    } finally {
        onMeta(null);
    }
    assert.equal((await sendWithKeyOfA({ from: '+15550000000' })).status, 404);
});

// Regresión que vigila (Codex, PR #16): un lineId en mayúsculas daba 404.
test('POST /v1/templates/send con el lineId propio en mayúsculas sale por esa línea', async () => {
    const own = await Line.findOne({ accountId: a.accountId, phoneNumberId: `99${a.seq}` }).lean();
    onMeta(async (config) => (config.method === 'post' && config.url === `/99${a.seq}/messages`
        ? { data: { messages: [{ id: 'wamid.mayusculas' }] } }
        : undefined));
    try {
        const res = await sendWithKeyOfA({ lineId: String(own._id).toUpperCase() });
        assert.equal(res.status, 200, res.text);
    } finally {
        onMeta(null);
    }
});

test('POST /v1/templates/send con un lineId mal formado → 400', async () => {
    assert.equal((await sendWithKeyOfA({ lineId: 'no-es-un-id' })).status, 400);
});

// Regresión que vigila: el panel buscaba la actividad por el `_id` del usuario.
test('GET /admin/clients cuenta la actividad de una cuenta cuyo _id no es el del owner', async () => {
    const res = await request(admin, 'GET', '/admin/clients?limit=50');
    assert.equal(res.status, 200, res.text);
    const entry = res.body.clients.find(client => client.email === 'a@pruebas.local');
    assert.ok(entry.conversations >= 1, res.text);
    assert.ok(entry.messages >= 1, res.text);
});

// Fase 2c: el superadmin decide cuántas líneas puede tener cada cuenta.
test('PATCH /admin/accounts/:id/limits: solo el superadmin (403), y una cuenta inexistente → 404', async () => {
    const asB = await request(b, 'PATCH', `/admin/accounts/${b.accountId}/limits`, { maxLines: 5 });
    assert.equal(asB.status, 403, asB.text);
    assert.equal((await Account.findById(b.accountId).lean()).limits.maxLines, 1);

    const missing = await request(admin, 'PATCH', `/admin/accounts/${new mongoose.Types.ObjectId()}/limits`, { maxLines: 2 });
    assert.equal(missing.status, 404, missing.text);
    assert.equal((await request(admin, 'PATCH', '/admin/accounts/no-es-un-id/limits', { maxLines: 2 })).status, 404);
    for (const maxLines of [0, 51, 1.5, '2']) {
        assert.equal((await request(admin, 'PATCH', `/admin/accounts/${b.accountId}/limits`, { maxLines })).status, 400, String(maxLines));
    }

    const res = await request(admin, 'PATCH', `/admin/accounts/${b.accountId}/limits`, { maxLines: 3 });
    assert.equal(res.status, 200, res.text);
    assert.equal((await Account.findById(b.accountId).lean()).limits.maxLines, 3);
    await Account.updateOne({ _id: b.accountId }, { 'limits.maxLines': 1 });
});

test('GET /admin/clients cuenta las líneas activas de cada cuenta', async () => {
    const m = await seedAccount('M', { seq: 8, maxLines: 2 });
    await connectWhatsapp(m, { phoneNumberId: '7581' });
    await connectWhatsapp(m, { phoneNumberId: '7582' });
    const res = await request(admin, 'GET', '/admin/clients?limit=50');
    assert.equal(res.status, 200, res.text);
    const entry = res.body.clients.find(client => client.email === 'm@pruebas.local');
    assert.deepEqual(entry.lines, { active: 2, max: 2 });
    assert.equal(entry.accountId, m.accountId);
    assert.equal(entry.whatsappConnected, true);
    assert.equal(entry.extraWabas, 0);

    await Account.updateOne({ _id: m.accountId }, { 'limits.maxLines': 3 });
    await connectWhatsapp(m, { phoneNumberId: '7583', waBusinessId: 'waba-M2' });
    const after = (await request(admin, 'GET', '/admin/clients?limit=50')).body.clients.find(client => client.email === 'm@pruebas.local');
    assert.equal(after.extraWabas, 1);
    assert.ok(!JSON.stringify(after).includes('token'));
});

// Fase 3: la sesión dice qué puede hacer cada uno; el frontend decide con eso
// qué enseña (la autoridad sigue siendo el backend).
test('/verify: el rol, los permisos, las líneas y la cuenta (sin correos ajenos)', async () => {
    const owner = await seedAccount('VO', { seq: 30 });
    const own = await request(owner, 'GET', '/verify');
    assert.equal(own.status, 200, own.text);
    assert.equal(own.body.role, 'owner');
    assert.deepEqual(own.body.permissions, [
        'contacts.import', 'contacts.delete', 'tags.manage', 'templates.manage',
        'campaigns.manage', 'apiKeys.manage', 'lines.manage', 'team.manage', 'autoReplies.manage',
        'conversations.assign',
    ]);
    assert.equal(own.body.lineIds, null);
    assert.equal(own.body.account.memberCount, 1);

    const { lineId } = await connectWhatsapp(owner);
    const agent = await seedMember(owner, { role: 'agent', lineIds: [lineId], label: 'VA' });
    await seedMember(owner, { role: 'agent', label: 'VX' }).then(member =>
        User.updateOne({ _id: member.userId }, { status: 'inactive' }));
    const asAgent = await request(agent, 'GET', '/verify');
    assert.equal(asAgent.status, 200, asAgent.text);
    assert.equal(asAgent.body.role, 'agent');
    assert.deepEqual(asAgent.body.permissions, []);
    assert.deepEqual(asAgent.body.lineIds, [String(lineId)]);
    assert.equal(asAgent.body.account.memberCount, 2, 'el desactivado no cuenta');
    assert.deepEqual(asAgent.body.account.managers, [{ name: `SECRETO-VO`, role: 'owner' }]);
    assert.ok(!asAgent.text.includes('vo@pruebas.local'), 'no enseña el correo del owner');
});
