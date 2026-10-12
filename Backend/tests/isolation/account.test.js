// Lo de la cuenta: las API keys de A (con una, B enviaría plantillas como A),
// el panel de admin, que solo abre un superadmin, y la sesión: el registro crea
// la cuenta, y un usuario desactivado o sin cuenta no entra.
import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import {
    seedAccount, request, sessionFrom, ANONYMOUS, assertNoLeak, assertHasOwn, connectWhatsapp, onMeta, metaCalls,
    Account, ApiKey, Conversation, User,
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

// Regresión que vigila (Codex, plan de la 2b, Review Focus 3): un cambio de número
// que la proyección no reflejó (aquí, solo en `User`) dejaba al OTP del cliente
// sin línea. Sale por la reserva, con el número de `User`.
test('POST /v1/templates/send con un cambio de número a medias sigue saliendo', async () => {
    await User.updateOne({ _id: a.userId }, { phoneNumberId: `98${a.seq}` });
    onMeta(async (config) => (config.method === 'post' && config.url === `/98${a.seq}/messages`
        ? { data: { messages: [{ id: 'wamid.reserva' }] } }
        : undefined));
    try {
        const res = await request(ANONYMOUS, 'POST', '/v1/templates/send',
            { destinationNumber: a.phone, templateName: a.templateName }, { Authorization: 'Bearer wm_prueba_a' });
        assert.equal(res.status, 200, res.text);
        assert.deepEqual(metaCalls.at(-1), { method: 'post', url: `/98${a.seq}/messages` });
    } finally {
        onMeta(null);
        await User.updateOne({ _id: a.userId }, { phoneNumberId: `99${a.seq}` });
    }
});

// Regresión que vigila: el panel buscaba la actividad por el `_id` del usuario.
test('GET /admin/clients cuenta la actividad de una cuenta cuyo _id no es el del owner', async () => {
    const res = await request(admin, 'GET', '/admin/clients?limit=50');
    assert.equal(res.status, 200, res.text);
    const entry = res.body.clients.find(client => client.email === 'a@pruebas.local');
    assert.ok(entry.conversations >= 1, res.text);
    assert.ok(entry.messages >= 1, res.text);
});
