// Avisos push: qué servicios se aceptan, qué dice el aviso y quién lo recibe.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildInboundPush, isAllowedPushEndpoint, isGonePushError, pushLineName, pushRecipientIds,
} from '../src/utils/push.js';

test('isAllowedPushEndpoint acepta los servicios de push conocidos', () => {
    for (const endpoint of [
        'https://fcm.googleapis.com/fcm/send/abc',
        'https://web.push.apple.com/QKabc',
        'https://updates.push.services.mozilla.com/wpush/v2/x',
        'https://wns2-bl2p.notify.windows.com/w/?token=x',
    ]) {
        assert.equal(isAllowedPushEndpoint(endpoint), true, endpoint);
    }
});

// El backend hace un POST al `endpoint` que manda el navegador: aceptar
// cualquiera sería poder hacerle llamar a cualquier URL (también de la red interna).
test('isAllowedPushEndpoint rechaza otro host, http y basura', () => {
    for (const endpoint of [
        'https://10.0.0.5/push',
        'https://evil.com/fcm.googleapis.com',
        'https://fcm.googleapis.com.evil.com/x',
        'https://evilpush.apple.com/x',
        'http://fcm.googleapis.com/x',
        '',
        'no es url',
        null,
    ]) {
        assert.equal(isAllowedPushEndpoint(endpoint), false, String(endpoint));
    }
});

test('buildInboundPush usa el nombre del contacto y el texto', () => {
    assert.deepEqual(
        buildInboundPush({ conversationId: 'c1', contact: { name: 'María López' }, text: '¿Tienen turno?' }),
        { title: 'María López', body: '¿Tienen turno?', conversationId: 'c1', url: '/private/chats?c=c1' },
    );
});

test('buildInboundPush corta lo largo', () => {
    const push = buildInboundPush({ conversationId: 'c1', contact: { name: 'N'.repeat(100) }, text: 'x'.repeat(500) });
    assert.equal(push.title.length, 60);
    assert.ok(push.title.endsWith('…'));
    assert.equal(push.body.length, 180);
    assert.ok(push.body.endsWith('…'));
});

test('buildInboundPush sin nombre usa lo mismo que la bandeja', () => {
    const push = buildInboundPush({ conversationId: { toString: () => 'c9' }, contact: { phone: '593991234567' }, text: 'Imagen' });
    assert.equal(push.title, '593991234567');
    assert.equal(push.conversationId, 'c9');
    assert.equal(push.url, '/private/chats?c=c9');
});

test('buildInboundPush: un adjunto lleva su emoji; sin texto, el tipo (diseño D1)', () => {
    const body = (type, text, caption = null) => buildInboundPush({ conversationId: 'c1', contact: {}, text, type, caption }).body;
    assert.equal(body('image', 'Imagen'), '📷 Foto');
    assert.equal(body('video', 'Video'), '🎥 Video');
    assert.equal(body('audio', 'Audio'), '🎤 Audio');
    assert.equal(body('document', 'Documento'), '📄 Documento');
    assert.equal(body('image', 'Mira el pedido', 'Mira el pedido'), '📷 Mira el pedido');
    // Lo que no es un archivo, como en la bandeja.
    assert.equal(body('location', 'Ubicación: Oficina'), 'Ubicación: Oficina');
    assert.equal(body('text', 'hola'), 'hola');
});

test('buildInboundPush: con varias líneas, la línea va en el título y no se corta', () => {
    const push = buildInboundPush({ conversationId: 'c1', contact: { name: 'María López' }, text: 'hola', lineName: 'Ventas' });
    assert.equal(push.title, 'María López · Ventas');
    const long = buildInboundPush({ conversationId: 'c1', contact: { name: 'N'.repeat(100) }, text: 'hola', lineName: 'Ventas' });
    assert.equal(long.title.length, 60);
    assert.ok(long.title.endsWith('… · Ventas'));
});

test('pushLineName: el nombre de la línea solo si la cuenta tiene más de una', () => {
    const ventas = { _id: 'l1', name: 'Ventas', phoneNumberId: '111' };
    const soporte = { _id: 'l2', name: null, verifiedName: 'Soporte SA', phoneNumberId: '222' };
    assert.equal(pushLineName([ventas], 'l1'), null);
    assert.equal(pushLineName([ventas, soporte], 'l1'), 'Ventas');
    assert.equal(pushLineName([ventas, soporte], 'l2'), 'Soporte SA');
    // Una conversación sin línea, o de una línea que ya no está activa.
    assert.equal(pushLineName([ventas, soporte], null), null);
    assert.equal(pushLineName([ventas, soporte], 'l9'), null);
});

test('pushRecipientIds aplica la regla del SSE', () => {
    const member = (id, role, lineIds = [], extra = {}) => ({ _id: id, accountId: 'acc-1', role, lineIds, status: 'active', ...extra });
    const members = [
        member('owner', 'owner'),
        member('admin', 'admin'),
        member('agent-l1', 'agent', ['l1']),
        member('agent-l2', 'agent', ['l2']),
        member('agent-off', 'agent', ['l1'], { status: 'inactive' }),
        member('other-owner', 'owner', [], { accountId: 'acc-2' }),
    ];
    assert.deepEqual(pushRecipientIds(members, 'acc-1', { lineId: 'l1' }), ['owner', 'admin', 'agent-l1']);
    assert.deepEqual(pushRecipientIds(members, 'acc-1', { lineId: null }), ['owner', 'admin']);
});

test('isGonePushError: 404 y 410 son suscripciones que ya no existen', () => {
    assert.equal(isGonePushError({ statusCode: 410 }), true);
    assert.equal(isGonePushError({ statusCode: 404 }), true);
    assert.equal(isGonePushError({ statusCode: 500 }), false);
    assert.equal(isGonePushError(new Error('caído')), false);
    assert.equal(isGonePushError(null), false);
});
