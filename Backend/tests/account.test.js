import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { planAccountMigration, sessionAuthFor } from '../src/utils/account.js';

const newId = () => new mongoose.Types.ObjectId();

test('planAccountMigration: un admin sin cuenta → cuenta con su mismo _id y él de owner', () => {
    const _id = newId();
    assert.deepEqual(planAccountMigration({ _id, name: 'Ana', rol: 'admin' }), {
        action: 'create',
        account: { _id, name: 'Ana', ownerId: _id },
        userUpdate: { accountId: _id, role: 'owner', isSuperadmin: false },
    });
});

test('planAccountMigration: el superadmin pasa a isSuperadmin: true', () => {
    const plan = planAccountMigration({ _id: newId(), name: 'Jonathan', rol: 'superadmin' });
    assert.equal(plan.action, 'create');
    assert.equal(plan.userUpdate.isSuperadmin, true);
    assert.equal(plan.userUpdate.role, 'owner');
});

// Un agent sin cuenta no tiene a qué cuenta pertenecer: inventarle una lo
// convertiría en owner de algo que no es suyo.
test('planAccountMigration: un agent sin cuenta propia para la migración', () => {
    const plan = planAccountMigration({ _id: newId(), name: 'Luis', rol: 'agent' });
    assert.equal(plan.action, 'stop');
    assert.match(plan.reason, /agent/);
});

// Regresión que vigila: la segunda pasada no toca a nadie, aunque su rol viejo sea agent.
test('planAccountMigration: con accountId ya puesto no hace nada', () => {
    assert.deepEqual(planAccountMigration({ _id: newId(), name: 'Ana', rol: 'admin', accountId: newId() }), { action: 'skip' });
    assert.deepEqual(planAccountMigration({ _id: newId(), name: 'Luis', rol: 'agent', accountId: newId() }), { action: 'skip' });
});

test('sessionAuthFor: deja ids como texto y lineIds vacío', () => {
    const _id = newId();
    const accountId = newId();
    assert.deepEqual(sessionAuthFor({ _id, accountId, role: 'owner', status: 'active', isSuperadmin: false }), {
        userId: String(_id), accountId: String(accountId), role: 'owner', lineIds: [], isSuperadmin: false,
    });
});

test('sessionAuthFor: las líneas también salen como texto', () => {
    const lineId = newId();
    const auth = sessionAuthFor({ _id: newId(), accountId: newId(), role: 'agent', lineIds: [lineId] });
    assert.deepEqual(auth.lineIds, [String(lineId)]);
    assert.equal(auth.isSuperadmin, false);
});

// Regresión que vigila: sin cuenta, `String(undefined)` daría 'undefined' como
// cuenta, y una consulta con eso respondería un 500 en vez de un 401.
test('sessionAuthFor: inactivo, sin cuenta o sin usuario → null', () => {
    assert.equal(sessionAuthFor({ _id: newId(), accountId: newId(), role: 'owner', status: 'inactive' }), null);
    assert.equal(sessionAuthFor({ _id: newId(), role: 'owner', status: 'active' }), null);
    assert.equal(sessionAuthFor(null), null);
});
