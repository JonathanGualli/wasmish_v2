// Avisos push (app móvil): cada dispositivo suscrito es de una persona de una
// cuenta. Nadie borra ni se queda con la suscripción de otro por sincronizar,
// solo se aceptan los servicios de push de los navegadores, y el aviso de un
// entrante llega a quien recibiría ese mensaje por SSE, sin frenar el webhook.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    seedAccount, seedMember, connectWhatsapp, postWebhook, request, onPush, pushCalls, ANONYMOUS,
    Conversation, Message, PushSubscription, User,
} from './helpers.js';

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

// --- El aviso de un mensaje entrante ---------------------------------------

// La cuenta PC con dos líneas (631 y 632) y un agente de cada una; el tercero se desactiva en el primer test.
const pc = await seedAccount('PC', { seq: 63, maxLines: 2 });
const { lineId: line1 } = await connectWhatsapp(pc, { phoneNumberId: '631' });
const { lineId: line2 } = await connectWhatsapp(pc, { phoneNumberId: '632' });
const agent1 = await seedMember(pc, { role: 'agent', lineIds: [line1], label: 'PCAG1' });
const agent2 = await seedMember(pc, { role: 'agent', lineIds: [line2], label: 'PCAG2' });
const agentOff = await seedMember(pc, { role: 'agent', lineIds: [line1], label: 'PCAGOFF' });

const textMessage = (from, body) => ({
    contacts: [{ profile: { name: 'Cliente de prueba' }, wa_id: from }],
    messages: [{ from, id: `wamid.push.${Date.now()}.${Math.random().toString(36).slice(2)}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body } }],
});

/** Espera (el webhook no espera el envío) hasta que se cumple `predicate`, o 2 s. */
const waitFor = async (predicate, ms = 2000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
        if (await predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    return Boolean(await predicate());
};
const sentTo = (endpoint) => pushCalls.filter(call => call.endpoint === endpoint);

test('un entrante en la línea 1 avisa al owner y al agente de esa línea, y a nadie más', async () => {
    pushCalls.length = 0;
    const endpoints = {};
    for (const [name, account] of [['owner', pc], ['agent1', agent1], ['agent2', agent2], ['agentOff', agentOff], ['otherAccount', b]]) {
        endpoints[name] = newEndpoint();
        assert.equal((await subscribe(account, endpoints[name])).status, 200, name);
    }
    // Desactivado después de suscribirse: lo que cuenta es su estado de ahora.
    await User.updateOne({ _id: agentOff.userId }, { status: 'inactive' });
    const text = `hola-push-${Date.now()}`;
    assert.equal((await postWebhook('631', textMessage('593990006301', text))).status, 200);

    assert.ok(await waitFor(() => sentTo(endpoints.owner).length && sentTo(endpoints.agent1).length), 'no se avisó al owner y al agente de la línea');
    for (const name of ['agent2', 'agentOff', 'otherAccount']) {
        assert.equal(sentTo(endpoints[name]).length, 0, `se avisó a ${name}`);
    }

    const conversation = await Conversation.findOne({ userId: pc.accountId, lineId: line1, contactPhone: '593990006301' }).lean();
    const [call] = sentTo(endpoints.owner);
    assert.deepEqual(call.payload, {
        title: 'Cliente de prueba', body: text, conversationId: String(conversation._id), url: `/private/chats?c=${conversation._id}`,
    });
    assert.deepEqual(call.options, { TTL: 43200, urgency: 'high' });
});

test('quitarle la línea al agente después de suscribirse lo deja sin avisos de ella', async () => {
    const agent = await seedMember(pc, { role: 'agent', lineIds: [line1], label: 'PCAGMOVE' });
    const agentEndpoint = newEndpoint();
    const ownerEndpoint = newEndpoint();
    await subscribe(agent, agentEndpoint);
    await subscribe(pc, ownerEndpoint);
    await User.updateOne({ _id: agent.userId }, { lineIds: [line2] });

    assert.equal((await postWebhook('631', textMessage('593990006302', 'después del cambio'))).status, 200);
    assert.ok(await waitFor(() => sentTo(ownerEndpoint).length), 'no se avisó al owner');
    assert.equal(sentTo(agentEndpoint).length, 0, 'el agente sin la línea recibió el aviso');
});

test('el servicio de push responde 410: la suscripción se borra', async () => {
    const endpoint = newEndpoint();
    await subscribe(pc, endpoint);
    onPush((call) => {
        if (call.endpoint === endpoint) throw Object.assign(new Error('Gone'), { statusCode: 410 });
        return { statusCode: 201 };
    });
    try {
        assert.equal((await postWebhook('631', textMessage('593990006303', 'a un dispositivo muerto'))).status, 200);
        assert.ok(await waitFor(async () => (await PushSubscription.countDocuments({ endpoint })) === 0), 'la suscripción caducada sigue en la BD');
    } finally {
        onPush(null);
    }
});

test('si el envío del aviso lanza, el webhook responde 200 y el mensaje se guarda', async () => {
    const endpoint = newEndpoint();
    await subscribe(pc, endpoint);
    onPush(() => { throw new Error('caído'); });
    try {
        const text = `con-push-caido-${Date.now()}`;
        assert.equal((await postWebhook('631', textMessage('593990006304', text))).status, 200);
        assert.ok(await Message.exists({ text }), 'el mensaje no se guardó');
        assert.ok(await waitFor(() => sentTo(endpoint).length), 'no se intentó el aviso');
        // Un error que no es 404/410 no borra la suscripción.
        assert.equal(await PushSubscription.countDocuments({ endpoint }), 1);
    } finally {
        onPush(null);
    }
});

test('el webhook no espera al servicio de push', async () => {
    const endpoint = newEndpoint();
    await subscribe(pc, endpoint);
    onPush(() => new Promise(resolve => setTimeout(() => resolve({ statusCode: 201 }), 3000)));
    try {
        const started = Date.now();
        assert.equal((await postWebhook('631', textMessage('593990006305', 'push lento'))).status, 200);
        assert.ok(Date.now() - started < 2000, `el webhook tardó ${Date.now() - started} ms: esperó el aviso`);
    } finally {
        onPush(null);
    }
});

test('con el endpoint reasignado a B, un entrante de PC ya no llega a ese dispositivo', async () => {
    const shared = newEndpoint();
    const ownerOther = newEndpoint();
    await subscribe(pc, shared);
    await subscribe(pc, ownerOther);
    await subscribe(b, shared);

    assert.equal((await postWebhook('631', textMessage('593990006306', 'navegador compartido'))).status, 200);
    assert.ok(await waitFor(() => sentTo(ownerOther).length), 'no se avisó al otro dispositivo del owner');
    assert.equal(sentTo(shared).length, 0, 'el dispositivo ahora de B recibió un aviso de PC');
});
