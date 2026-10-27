import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
    PERMISSIONS, assignmentEventFor, can, canReceive, canSeeConversation, conversationLineScope, conversationMeta,
    conversationScope, inLineScope, lineScope, permissionsFor,
} from '../src/utils/permissions.js';

const ALL = Object.keys(PERMISSIONS);
// Un ObjectId de verdad: el alcance del agente lo convierte (Fase 4).
const ME = '64b000000000000000000001';
const auth = (role, lineIds = [], userId = ME) => ({ userId, accountId: 'a', role, lineIds, isSuperadmin: false });
const API = { userId: null, accountId: 'a', role: 'api', lineIds: null, isSuperadmin: false };

test('PERMISSIONS: las acciones de la matriz de la spec (§ 3.3), más las respuestas automáticas', () => {
    assert.deepEqual(ALL, [
        'contacts.import', 'contacts.delete', 'tags.manage', 'templates.manage',
        'campaigns.manage', 'apiKeys.manage', 'lines.manage', 'team.manage', 'autoReplies.manage',
        'conversations.assign',
    ]);
});

test('can: owner y admin, todo; supervisor, sin API keys, líneas, equipo ni respuestas automáticas; agente, nada', () => {
    for (const action of ALL) {
        assert.equal(can(auth('owner'), action), true, action);
        assert.equal(can(auth('admin'), action), true, action);
        assert.equal(can(auth('agent'), action), false, action);
    }
    const supervisor = auth('supervisor');
    for (const action of ['contacts.import', 'contacts.delete', 'tags.manage', 'templates.manage', 'campaigns.manage', 'conversations.assign']) {
        assert.equal(can(supervisor, action), true, action);
    }
    for (const action of ['apiKeys.manage', 'lines.manage', 'team.manage', 'autoReplies.manage']) {
        assert.equal(can(supervisor, action), false, action);
    }
});

test('can: la API key y una acción desconocida, nunca', () => {
    for (const action of ALL) assert.equal(can(API, action), false, action);
    assert.equal(can(auth('owner'), 'no.existe'), false);
    assert.equal(can(null, 'contacts.import'), false);
});

test('lineScope: owner, admin y la API, todas; supervisor y agente, las suyas', () => {
    assert.equal(lineScope(auth('owner', ['l1'])), null);
    assert.equal(lineScope(auth('admin', ['l1'])), null);
    assert.equal(lineScope(API), null);
    assert.deepEqual(lineScope(auth('agent', ['l1', 'l2'])), ['l1', 'l2']);
    assert.deepEqual(lineScope(auth('supervisor', [])), []);
});

test('inLineScope: la línea tiene que estar en la lista; una conversación sin línea queda fuera', () => {
    const l1 = new mongoose.Types.ObjectId();
    const agent = auth('agent', [String(l1)]);
    assert.equal(inLineScope(agent, l1), true);
    assert.equal(inLineScope(agent, String(l1)), true);
    assert.equal(inLineScope(agent, new mongoose.Types.ObjectId()), false);
    assert.equal(inLineScope(agent, null), false);
    assert.equal(inLineScope(auth('owner'), null), true);
});

test('conversationLineScope: sin límite, nada; con líneas, lineId en ellas (como ObjectId)', () => {
    assert.deepEqual(conversationLineScope(auth('owner')), {});
    assert.deepEqual(conversationLineScope(API), {});
    const l1 = new mongoose.Types.ObjectId();
    const scope = conversationLineScope(auth('agent', [String(l1)]));
    assert.deepEqual(scope.lineId.$in.map(String), [String(l1)]);
    assert.ok(scope.lineId.$in[0] instanceof mongoose.Types.ObjectId);
    assert.deepEqual(conversationLineScope(auth('agent', [])), { lineId: { $in: [] } });
    assert.equal('assignedTo' in scope, false, 'la solicitud de transferencia no exige verla');
});

test('conversationScope: el agente, además, solo las sin asignar y las suyas (Fase 4)', () => {
    assert.deepEqual(conversationScope(auth('owner')), {});
    assert.deepEqual(conversationScope(API), {});
    const l1 = new mongoose.Types.ObjectId();
    const supervisor = conversationScope(auth('supervisor', [String(l1)]));
    assert.deepEqual(Object.keys(supervisor), ['lineId'], 'el supervisor ve también las de sus agentes');

    const scope = conversationScope(auth('agent', [String(l1)]));
    assert.deepEqual(scope.lineId.$in.map(String), [String(l1)]);
    assert.equal(scope.assignedTo.$in.length, 2);
    assert.ok(scope.assignedTo.$in[0] instanceof mongoose.Types.ObjectId);
    assert.equal(String(scope.assignedTo.$in[0]), ME);
    assert.equal(scope.assignedTo.$in[1], null, 'null también encuentra el campo ausente');
});

test('canSeeConversation: lo mismo que conversationScope, sobre un documento', () => {
    const l1 = new mongoose.Types.ObjectId();
    const other = new mongoose.Types.ObjectId();
    const agent = auth('agent', [String(l1)]);
    assert.equal(canSeeConversation(agent, { lineId: l1, assignedTo: null }), true);
    assert.equal(canSeeConversation(agent, { lineId: l1 }), true, 'sin el campo');
    assert.equal(canSeeConversation(agent, { lineId: l1, assignedTo: new mongoose.Types.ObjectId(ME) }), true);
    assert.equal(canSeeConversation(agent, { lineId: l1, assignedTo: other }), false, 'la de un compañero');
    assert.equal(canSeeConversation(agent, { lineId: new mongoose.Types.ObjectId(), assignedTo: null }), false);
    assert.equal(canSeeConversation(auth('supervisor', [String(l1)]), { lineId: l1, assignedTo: other }), true);
    assert.equal(canSeeConversation(auth('owner'), { lineId: null, assignedTo: other }), true);
});

test('conversationMeta: la línea y quién la atiende, como texto o null', () => {
    const l1 = new mongoose.Types.ObjectId();
    const ana = new mongoose.Types.ObjectId();
    assert.deepEqual(conversationMeta({ lineId: l1, assignedTo: ana }), { lineId: String(l1), assignedTo: String(ana) });
    assert.deepEqual(conversationMeta({ lineId: null }), { lineId: null, assignedTo: null });
    // Con `populate`, `assignedTo` es el usuario: su _id.
    assert.deepEqual(conversationMeta({ lineId: l1, assignedTo: { _id: ana, name: 'Ana' } }), { lineId: String(l1), assignedTo: String(ana) });
});

test('permissionsFor: la lista de cada rol, en el orden de la tabla', () => {
    assert.deepEqual(permissionsFor(auth('owner')), ALL);
    assert.deepEqual(permissionsFor(auth('admin')), ALL);
    assert.deepEqual(permissionsFor(auth('supervisor')),
        ['contacts.import', 'contacts.delete', 'tags.manage', 'templates.manage', 'campaigns.manage', 'conversations.assign']);
    assert.deepEqual(permissionsFor(auth('agent')), []);
});

test('canReceive: los eventos de una línea, a quien la ve; los de campañas, además con el permiso', () => {
    const agent = auth('agent', ['l1']);
    assert.equal(canReceive(agent, { lineId: 'l1' }), true);
    assert.equal(canReceive(agent, { lineId: 'l2' }), false);
    assert.equal(canReceive(agent, { lineId: null }), false, 'una conversación sin línea');
    assert.equal(canReceive(agent, { lineId: 'l1', permission: 'campaigns.manage' }), false);
    assert.equal(canReceive(auth('supervisor', ['l1']), { lineId: 'l1', permission: 'campaigns.manage' }), true);
    assert.equal(canReceive(auth('supervisor', ['l1']), { lineId: 'l2', permission: 'campaigns.manage' }), false);
    assert.equal(canReceive(auth('owner'), { lineId: 'l2', permission: 'campaigns.manage' }), true);
    assert.equal(canReceive(agent, {}), true, 'lo de toda la cuenta (un contacto)');
    assert.equal(canReceive(agent), true);
});

test('canReceive: con la asignación, el agente solo recibe lo sin asignar y lo suyo (Fase 4)', () => {
    const agent = auth('agent', ['l1']);
    assert.equal(canReceive(agent, { lineId: 'l1', assignedTo: null }), true);
    assert.equal(canReceive(agent, { lineId: 'l1', assignedTo: ME }), true);
    assert.equal(canReceive(agent, { lineId: 'l1', assignedTo: 'otro' }), false);
    assert.equal(canReceive(agent, { lineId: 'l2', assignedTo: null }), false);
    assert.equal(canReceive(auth('supervisor', ['l1']), { lineId: 'l1', assignedTo: 'otro' }), true);
    assert.equal(canReceive(auth('owner'), { lineId: 'l1', assignedTo: 'otro' }), true);
    assert.equal(canReceive(API, { lineId: 'l1', assignedTo: 'otro' }), true);
});

test('assignmentEventFor: a quien la sigue viendo, «assigned»; a quien la pierde, «revoked»', () => {
    const ANA = '64b0000000000000000000aa';
    const LUIS = '64b0000000000000000000bb';
    const ana = auth('agent', ['l1'], ANA);
    const luis = auth('agent', ['l1'], LUIS);
    const free = { lineId: 'l1', assignedTo: null };
    const toAna = { lineId: 'l1', assignedTo: ANA };

    assert.equal(assignmentEventFor(ana, free, toAna), 'conversation_assigned');
    assert.equal(assignmentEventFor(luis, free, toAna), 'conversation_revoked');
    assert.equal(assignmentEventFor(auth('supervisor', ['l1']), free, toAna), 'conversation_assigned');
    assert.equal(assignmentEventFor(auth('agent', ['l2']), free, toAna), null, 'de otra línea: nada');

    // De vuelta a sin asignar: Luis la gana.
    assert.equal(assignmentEventFor(luis, toAna, free), 'conversation_assigned');
    assert.equal(assignmentEventFor(ana, toAna, { lineId: 'l1', assignedTo: LUIS }), 'conversation_revoked');
});
