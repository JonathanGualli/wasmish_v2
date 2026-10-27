import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { canReassign, isValidAssignee, releaseFilter, replyAcquisition } from '../src/utils/assignment.js';

const ME = '64b000000000000000000001';
const OTHER = '64b000000000000000000002';
const auth = (role, lineIds = []) => ({ userId: ME, accountId: 'a', role, lineIds, isSuperadmin: false });
const member = (role, lineIds = [], extra = {}) => ({
    _id: new mongoose.Types.ObjectId(), accountId: 'a', role, lineIds, status: 'active', ...extra,
});

test('replyAcquisition: sin asignar se toma; la suya se queda; la de otro, conflicto solo para el agente', () => {
    assert.equal(replyAcquisition(auth('agent', ['l1']), null), 'take');
    assert.equal(replyAcquisition(auth('agent', ['l1']), new mongoose.Types.ObjectId(ME)), 'keep');
    assert.equal(replyAcquisition(auth('agent', ['l1']), OTHER), 'conflict');
    // El supervisor que responde una de otro no se la queda (decisión del 2026-10-27).
    assert.equal(replyAcquisition(auth('supervisor', ['l1']), OTHER), 'keep');
    assert.equal(replyAcquisition(auth('owner'), OTHER), 'keep');
    assert.equal(replyAcquisition(auth('owner'), null), 'take');
});

test('canReassign: con el permiso, cualquiera; el agente, solo la suya', () => {
    assert.equal(canReassign(auth('agent', ['l1']), ME), true);
    assert.equal(canReassign(auth('agent', ['l1']), null), false, 'una sin asignar: primero la toma');
    assert.equal(canReassign(auth('agent', ['l1']), OTHER), false);
    assert.equal(canReassign(auth('supervisor', ['l1']), OTHER), true);
    assert.equal(canReassign(auth('admin'), null), true);
});

test('isValidAssignee: activo y con la línea a su alcance', () => {
    const l1 = new mongoose.Types.ObjectId();
    assert.equal(isValidAssignee(member('agent', [l1]), l1), true);
    assert.equal(isValidAssignee(member('agent', [l1], { status: 'inactive' }), l1), false);
    assert.equal(isValidAssignee(member('agent', [new mongoose.Types.ObjectId()]), l1), false);
    assert.equal(isValidAssignee(member('admin'), l1), true);
    assert.equal(isValidAssignee(null, l1), false);
});

test('releaseFilter: desactivado, todas; sin límite de líneas, nada; si no, las de las líneas que ya no tiene', () => {
    const l1 = new mongoose.Types.ObjectId();
    assert.deepEqual(releaseFilter(member('agent', [l1], { status: 'inactive' })), {});
    assert.equal(releaseFilter(member('admin')), null);
    const filter = releaseFilter(member('agent', [l1]));
    assert.deepEqual(filter.lineId.$nin.map(String), [String(l1)]);
    assert.ok(filter.lineId.$nin[0] instanceof mongoose.Types.ObjectId);
});
