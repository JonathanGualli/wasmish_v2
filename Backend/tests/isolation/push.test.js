// Avisos push (app móvil): cada dispositivo suscrito es de una persona de una
// cuenta. Nadie borra ni se queda con la suscripción de otro por sincronizar, y
// solo se aceptan los servicios de push de los navegadores.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seedAccount, request, ANONYMOUS, PushSubscription } from './helpers.js';

const a = await seedAccount('PA', { seq: 61 });
const b = await seedAccount('PB', { seq: 62 });

let seq = 0;
const newEndpoint = () => `https://fcm.googleapis.com/fcm/send/prueba-${Date.now()}-${seq++}`;
const keys = { p256dh: 'BPcl4Zx-clave-publica-de-pruebas', auth: 'secreto-auth' };
const subscribe = (account, endpoint, path = '/push/subscriptions') => request(account, 'POST', path, { endpoint, keys });
const sync = (account, endpoint) => subscribe(account, endpoint, '/push/subscriptions/sync');
const unsubscribe = (account, endpoint) => request(account, 'DELETE', '/push/subscriptions', { endpoint });

test('GET /push/config da la clave pública; sin sesión, 401', async () => {
    const res = await request(a, 'GET', '/push/config');
    assert.equal(res.status, 200);
    assert.equal(res.body.publicKey, process.env.VAPID_PUBLIC_KEY);
    assert.equal((await request(ANONYMOUS, 'GET', '/push/config')).status, 401);
});

test('A activa los avisos de su dispositivo y los quita: 200 y 204; quitarlos otra vez, 404', async () => {
    const endpoint = newEndpoint();
    assert.equal((await subscribe(a, endpoint)).status, 200);
    const saved = await PushSubscription.findOne({ endpoint }).lean();
    assert.equal(String(saved.accountId), a.accountId);
    assert.equal(String(saved.memberId), a.userId);

    assert.equal((await unsubscribe(a, endpoint)).status, 204);
    assert.equal(await PushSubscription.countDocuments({ endpoint }), 0);
    assert.equal((await unsubscribe(a, endpoint)).status, 404);
});

test('B no quita la suscripción de A: 404, y la de A sigue en la BD', async () => {
    const endpoint = newEndpoint();
    await subscribe(a, endpoint);
    assert.equal((await unsubscribe(b, endpoint)).status, 404);
    assert.equal(await PushSubscription.countDocuments({ endpoint, memberId: a.userId }), 1);
    // Control: A sí puede.
    assert.equal((await unsubscribe(a, endpoint)).status, 204);
});

// El backend hace un POST al endpoint de cada suscripción: uno arbitrario sería
// poder hacerle llamar a cualquier URL.
test('un endpoint que no es de un servicio de push da 400 y no se guarda', async () => {
    for (const endpoint of ['https://10.0.0.5/push', 'http://fcm.googleapis.com/x']) {
        assert.equal((await subscribe(a, endpoint)).status, 400, endpoint);
        assert.equal((await sync(a, endpoint)).status, 400, endpoint);
        assert.equal(await PushSubscription.countDocuments({ endpoint }), 0);
    }
});

test('el mismo endpoint activado por B pasa a ser de B', async () => {
    const endpoint = newEndpoint();
    await subscribe(a, endpoint);
    assert.equal((await subscribe(b, endpoint)).status, 200);
    const all = await PushSubscription.find({ endpoint }).lean();
    assert.equal(all.length, 1);
    assert.equal(String(all[0].accountId), b.accountId);
    assert.equal(String(all[0].memberId), b.userId);
});

// Regresión que vigila (revisión de Codex del PR #41): una sincronización vieja
// de A que llegaba después de que B activara los avisos devolvía el dispositivo a A.
test('sincronizar un endpoint de otra persona da 409 y no cambia de dueño', async () => {
    const endpoint = newEndpoint();
    await subscribe(a, endpoint);
    await subscribe(b, endpoint);
    const res = await sync(a, endpoint);
    assert.equal(res.status, 409);
    assert.equal(res.body[0].code, 'push_owned_by_other');
    assert.equal(String((await PushSubscription.findOne({ endpoint }).lean()).memberId), b.userId);
});

test('sincronizar un endpoint que no existe lo crea, y el propio actualiza las claves', async () => {
    const endpoint = newEndpoint();
    assert.equal((await sync(a, endpoint)).status, 200);
    assert.equal(String((await PushSubscription.findOne({ endpoint }).lean()).memberId), a.userId);

    const res = await request(a, 'POST', '/push/subscriptions/sync', { endpoint, keys: { ...keys, auth: 'otra-auth' } });
    assert.equal(res.status, 200);
    const all = await PushSubscription.find({ endpoint }).lean();
    assert.equal(all.length, 1);
    assert.equal(all[0].keys.auth, 'otra-auth');
});
