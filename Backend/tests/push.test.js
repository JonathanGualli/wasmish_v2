// Avisos push: qué servicios se aceptan, qué dice el aviso y quién lo recibe.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    assignmentPushTarget, buildAssignmentPush, buildInboundPush, isAllowedPushEndpoint, isGonePushError, lostMode, pushLineName,
    pushRecipientIds,
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

test('pushRecipientIds: una conversación asignada avisa solo a quien la atiende (decisión del 2026-10-27)', () => {
    const member = (id, role, lineIds = []) => ({ _id: id, accountId: 'acc-1', role, lineIds, status: 'active' });
    const members = [
        member('owner', 'owner'),
        member('supervisor', 'supervisor', ['l1']),
        member('ana', 'agent', ['l1']),
        member('luis', 'agent', ['l1']),
    ];
    assert.deepEqual(pushRecipientIds(members, 'acc-1', { lineId: 'l1', assignedTo: 'ana' }), ['ana']);
    assert.deepEqual(pushRecipientIds(members, 'acc-1', { lineId: 'l1', assignedTo: null }), ['owner', 'supervisor', 'ana', 'luis']);
    // Si quien la atiende ya no la ve (otra línea), no avisa a nadie: no a los demás.
    assert.deepEqual(pushRecipientIds(members, 'acc-1', { lineId: 'l2', assignedTo: 'ana' }), []);
});

test('isGonePushError: 404 y 410 son suscripciones que ya no existen', () => {
    assert.equal(isGonePushError({ statusCode: 410 }), true);
    assert.equal(isGonePushError({ statusCode: 404 }), true);
    assert.equal(isGonePushError({ statusCode: 500 }), false);
    assert.equal(isGonePushError(new Error('caído')), false);
    assert.equal(isGonePushError(null), false);
});

// Avisos de la asignación (spec § 7, diseño m3): título = contacto, cuerpo = qué pasó.
test('buildAssignmentPush: asignar y pasar, con el nombre de pila de quien lo hizo', () => {
    const contact = { name: 'Marisol Ruiz', phone: '593981112233' };
    const assigned = buildAssignmentPush({ conversationId: 'c1', contact, actorName: 'Carla Ríos', kind: 'assigned' });
    assert.equal(assigned.title, 'Marisol Ruiz');
    assert.equal(assigned.body, 'Carla te asignó esta conversación.');
    assert.equal(assigned.conversationId, 'c1');
    assert.equal(assigned.url, '/private/chats?c=c1');
    const passed = buildAssignmentPush({ conversationId: 'c1', contact, actorName: 'Ana Vera', kind: 'passed' });
    assert.equal(passed.body, 'Ana te pasó esta conversación.');
});

test('buildAssignmentPush: sin nombre, «Alguien»; con varias líneas, la línea en el título', () => {
    const contact = { name: 'Marisol Ruiz', phone: '593981112233' };
    assert.equal(buildAssignmentPush({ conversationId: 'c1', contact, actorName: null, kind: 'assigned' }).body,
        'Alguien te asignó esta conversación.');
    assert.equal(buildAssignmentPush({ conversationId: 'c1', contact, actorName: '  ', kind: 'passed' }).body,
        'Alguien te pasó esta conversación.');
    assert.equal(buildAssignmentPush({ conversationId: 'c1', contact, lineName: 'Ventas', actorName: 'Carla', kind: 'assigned' }).title,
        'Marisol Ruiz · Ventas');
});

// Lo que salió de probar la 1.0.34 (decisiones del 2026-10-29): rechazar,
// pedir y quitar la conversación también suenan en el celular.
test('buildAssignmentPush: rechazar y pedir', () => {
    const contact = { name: 'Marisol Ruiz', phone: '593981112233' };
    const rejected = buildAssignmentPush({ conversationId: 'c1', contact, actorName: 'Ana Vera', kind: 'rejected', open: false });
    assert.equal(rejected.body, 'Ana no te pasó esta conversación.');
    const requested = buildAssignmentPush({ conversationId: 'c1', contact, actorName: 'Luis', kind: 'requested' });
    assert.equal(requested.body, 'Luis pide esta conversación.');
    assert.equal(requested.url, '/private/chats?c=c1');
});

test('buildAssignmentPush: te quitaron la conversación, según quién la tiene ahora', () => {
    const contact = { name: 'Juan', phone: '593981112233' };
    const lost = (targetId, targetName = null) => buildAssignmentPush({
        conversationId: 'c1', contact, actorName: 'Carla Ríos', actorId: 'carla', kind: 'lost', targetId, targetName,
    }).body;
    assert.equal(lost('carla', 'Carla Ríos'), 'Carla tomó esta conversación.');
    assert.equal(lost('ana', 'Ana Vera'), 'Carla le pasó esta conversación a Ana.');
    assert.equal(lost(null), 'Carla dejó sin asignar esta conversación.');
});

// Quien ya no la puede abrir (un rechazo, o se la quitaron): tocar el aviso
// lleva a la bandeja, no a una conversación que daría 404, y no se agrupa con
// los avisos de esa conversación (el `tag` del service worker).
test('buildAssignmentPush: sin `open`, ni conversación ni enlace a ella', () => {
    const push = buildAssignmentPush({ conversationId: 'c1', contact: { name: 'Juan' }, actorName: 'Ana', kind: 'rejected', open: false });
    assert.equal(push.conversationId, null);
    assert.equal(push.url, '/private/chats');
});

test('lostMode: la tomó, se la pasó a otro o la dejó sin asignar', () => {
    assert.equal(lostMode({ actorId: 'm', targetId: 'm' }), 'took');
    assert.equal(lostMode({ actorId: 'm', targetId: 'a' }), 'passed');
    assert.equal(lostMode({ actorId: 'm', targetId: null }), 'released');
});

const authOf = (userId, role, lineIds = ['l1']) => ({ userId, accountId: 'acc-1', role, lineIds });
const pushConversation = (assignedTo, extra = {}) => ({ lineId: 'l1', assignedTo, transferRequest: null, ...extra });

test('assignmentPushTarget: asignar y pasar, solo si sigue siendo suya y con la línea', () => {
    const ana = authOf('ana', 'agent');
    assert.deepEqual(assignmentPushTarget('assigned', ana, pushConversation('ana')), { open: true });
    assert.equal(assignmentPushTarget('passed', ana, pushConversation('luis')), null);
    assert.equal(assignmentPushTarget('assigned', authOf('ana', 'agent', ['l2']), pushConversation('ana')), null);
    assert.equal(assignmentPushTarget('assigned', null, pushConversation('ana')), null);
    assert.equal(assignmentPushTarget('assigned', ana, null), null);
});

// Los owner y admin que responden una solicitud no la tienen asignada: la
// regla de «que siga siendo suya» los dejaría sin aviso.
test('assignmentPushTarget: pedir, mientras la solicitud siga pendiente y la vea', () => {
    const owner = authOf('owner', 'owner', []);
    const pending = pushConversation('ana', { transferRequest: { id: 'r1' } });
    assert.deepEqual(assignmentPushTarget('requested', authOf('ana', 'agent'), pending, { requestId: 'r1' }), { open: true });
    assert.deepEqual(assignmentPushTarget('requested', owner, pending, { requestId: 'r1' }), { open: true });
    assert.equal(assignmentPushTarget('requested', owner, pushConversation('ana'), { requestId: 'r1' }), null, 'ya respondida');
    assert.equal(assignmentPushTarget('requested', owner, pushConversation('ana', { transferRequest: { id: 'r2' } }), { requestId: 'r1' }),
        null, 'reemplazada');
    assert.equal(assignmentPushTarget('requested', owner, pending), null, 'sin requestId');
    // Un agente que no la atiende no la ve.
    assert.equal(assignmentPushTarget('requested', authOf('marta', 'agent'), pending, { requestId: 'r1' }), null);
});

test('assignmentPushTarget: rechazar, sin abrir la conversación; nada si mientras tanto se la dieron', () => {
    const luis = authOf('luis', 'agent');
    assert.deepEqual(assignmentPushTarget('rejected', luis, pushConversation('ana')), { open: false });
    assert.equal(assignmentPushTarget('rejected', luis, pushConversation('luis')), null);
    assert.equal(assignmentPushTarget('rejected', authOf('luis', 'agent', ['l2']), pushConversation('ana')), null);
});

test('assignmentPushTarget: te la quitaron; la abre solo si la sigue viendo', () => {
    const ana = authOf('ana', 'agent');
    assert.deepEqual(assignmentPushTarget('lost', ana, pushConversation('carla')), { open: false });
    assert.deepEqual(assignmentPushTarget('lost', ana, pushConversation(null)), { open: true }, 'sin asignar, el agente la ve');
    assert.deepEqual(assignmentPushTarget('lost', authOf('sup', 'supervisor'), pushConversation('carla')), { open: true });
    assert.equal(assignmentPushTarget('lost', ana, pushConversation('ana')), null, 'se la devolvieron');
    assert.equal(assignmentPushTarget('lost', authOf('ana', 'agent', ['l2']), pushConversation(null)), null, 'sin la línea');
});
