import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { canReassign, isValidAssignee, releaseFilter, replyAcquisition, requestRecipients } from '../src/utils/assignment.js';

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

// Avisos de la asignación (spec § 4): a quién le llega «Luis pide la conversación».
test('requestRecipients: quien la atiende y quienes pueden responderla con esa línea, nunca el solicitante', () => {
    const ana = member('agent', ['l1']);
    const owner = member('owner');
    const admin = member('admin');
    const supL1 = member('supervisor', ['l1']);
    const supL2 = member('supervisor', ['l2']);
    const luis = member('agent', ['l1']);
    const offAdmin = member('admin', [], { status: 'inactive' });
    const otherAgent = member('agent', ['l1']);
    const members = [ana, owner, admin, supL1, supL2, luis, offAdmin, otherAgent];
    const ids = (list) => list.map(m => String(m._id)).sort();

    const got = requestRecipients(members, { lineId: 'l1', assignedTo: ana._id }, String(luis._id));
    assert.deepEqual(got.sort(), ids([ana, owner, admin, supL1]));
});

test('requestRecipients: el solicitante no se avisa aunque sea supervisor, y sin repetir', () => {
    const ana = member('agent', ['l1']);
    const supL1 = member('supervisor', ['l1']);
    const got = requestRecipients([ana, supL1, ana], { lineId: 'l1', assignedTo: ana._id }, String(supL1._id));
    assert.deepEqual(got, [String(ana._id)]);
});

test('requestRecipients: quien la atiende sin la línea (aún no soltada) no la recibe', () => {
    const ana = member('agent', ['l2']);
    const owner = member('owner');
    const got = requestRecipients([ana, owner], { lineId: 'l1', assignedTo: ana._id }, 'x');
    assert.deepEqual(got, [String(owner._id)]);
});

