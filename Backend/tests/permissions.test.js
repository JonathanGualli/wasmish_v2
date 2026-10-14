import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
    PERMISSIONS, can, canReceive, conversationScope, inLineScope, lineScope, permissionsFor,
} from '../src/utils/permissions.js';

const ALL = Object.keys(PERMISSIONS);
const auth = (role, lineIds = []) => ({ userId: 'u', accountId: 'a', role, lineIds, isSuperadmin: false });
const API = { userId: null, accountId: 'a', role: 'api', lineIds: null, isSuperadmin: false };

test('PERMISSIONS: las ocho acciones de la matriz de la spec (§ 3.3)', () => {
    assert.deepEqual(ALL, [
        'contacts.import', 'contacts.delete', 'tags.manage', 'templates.manage',
        'campaigns.manage', 'apiKeys.manage', 'lines.manage', 'team.manage',
    ]);
});

test('can: owner y admin, todo; supervisor, sin API keys, líneas ni equipo; agente, nada', () => {
    for (const action of ALL) {
        assert.equal(can(auth('owner'), action), true, action);
        assert.equal(can(auth('admin'), action), true, action);
        assert.equal(can(auth('agent'), action), false, action);
    }
    const supervisor = auth('supervisor');
    for (const action of ['contacts.import', 'contacts.delete', 'tags.manage', 'templates.manage', 'campaigns.manage']) {
        assert.equal(can(supervisor, action), true, action);
    }
    for (const action of ['apiKeys.manage', 'lines.manage', 'team.manage']) {
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

test('conversationScope: sin límite, nada; con líneas, lineId en ellas (como ObjectId)', () => {
    assert.deepEqual(conversationScope(auth('owner')), {});
    assert.deepEqual(conversationScope(API), {});
    const l1 = new mongoose.Types.ObjectId();
    const scope = conversationScope(auth('agent', [String(l1)]));
    assert.deepEqual(scope.lineId.$in.map(String), [String(l1)]);
    assert.ok(scope.lineId.$in[0] instanceof mongoose.Types.ObjectId);
    assert.deepEqual(conversationScope(auth('agent', [])), { lineId: { $in: [] } });
});

test('permissionsFor: la lista de cada rol, en el orden de la tabla', () => {
    assert.deepEqual(permissionsFor(auth('owner')), ALL);
    assert.deepEqual(permissionsFor(auth('admin')), ALL);
    assert.deepEqual(permissionsFor(auth('supervisor')),
        ['contacts.import', 'contacts.delete', 'tags.manage', 'templates.manage', 'campaigns.manage']);
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
