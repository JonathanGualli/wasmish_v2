import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { ownerConnection, lineStateIssues, sharedWabas, historicalLines } from '../src/utils/line.js';

const newId = () => new mongoose.Types.ObjectId();

const accountId = newId();
const owner = { accountId, tokenWhatsapp: 'cifrado-1', phoneNumberId: '111', waBusinessId: 'w1' };
const waba = { _id: newId(), accountId, waBusinessId: 'w1', tokenWhatsapp: 'cifrado-1' };
const line = { _id: newId(), accountId, wabaId: waba._id, phoneNumberId: '111', status: 'active' };
const account = { _id: accountId, defaultLineId: line._id };

test('ownerConnection: con los tres campos, la conexión; si falta uno, null', () => {
    assert.deepEqual(ownerConnection(owner), { tokenWhatsapp: 'cifrado-1', phoneNumberId: '111', waBusinessId: 'w1' });
    assert.equal(ownerConnection({ ...owner, tokenWhatsapp: null }), null);
    assert.equal(ownerConnection({ ...owner, phoneNumberId: null }), null);
    assert.equal(ownerConnection({ ...owner, waBusinessId: null }), null);
    assert.equal(ownerConnection(null), null);
});

test('lineStateIssues: proyección al día → []', () => {
    assert.deepEqual(lineStateIssues({ owner, account, lines: [line], waba }), []);
});

test('lineStateIssues: las líneas desconectadas de números anteriores no molestan', () => {
    const old = { _id: newId(), accountId, wabaId: null, phoneNumberId: '000', status: 'disconnected' };
    assert.deepEqual(lineStateIssues({ owner, account, lines: [line, old], waba }), []);
});

test('lineStateIssues: sin la línea activa del número actual', () => {
    const off = { ...line, status: 'disconnected' };
    assert.notDeepEqual(lineStateIssues({ owner, account, lines: [off], waba }), []);
});

test('lineStateIssues: dos líneas activas', () => {
    const other = { _id: newId(), accountId, wabaId: waba._id, phoneNumberId: '222', status: 'active' };
    assert.notDeepEqual(lineStateIssues({ owner, account, lines: [line, other], waba }), []);
});

test('lineStateIssues: defaultLineId apunta a otra línea', () => {
    assert.notDeepEqual(lineStateIssues({ owner, account: { ...account, defaultLineId: newId() }, lines: [line], waba }), []);
});

test('lineStateIssues: el token del Waba no es el de User', () => {
    assert.notDeepEqual(lineStateIssues({ owner, account, lines: [line], waba: { ...waba, tokenWhatsapp: 'cifrado-viejo' } }), []);
});

test('lineStateIssues: falta el Waba, es de otra cuenta o la línea no apunta a él', () => {
    assert.notDeepEqual(lineStateIssues({ owner, account, lines: [line], waba: null }), []);
    assert.notDeepEqual(lineStateIssues({ owner, account, lines: [line], waba: { ...waba, accountId: newId() } }), []);
    assert.notDeepEqual(lineStateIssues({ owner, account, lines: [{ ...line, wabaId: newId() }], waba }), []);
});

test('lineStateIssues: sin conexión, cualquier línea activa o línea por defecto sobra', () => {
    const disconnectedOwner = { ...owner, tokenWhatsapp: null };
    assert.notDeepEqual(lineStateIssues({ owner: disconnectedOwner, account, lines: [line], waba }), []);
    const off = { ...line, status: 'disconnected' };
    assert.deepEqual(lineStateIssues({ owner: disconnectedOwner, account: { ...account, defaultLineId: null }, lines: [off], waba: null }), []);
});

test('sharedWabas: un WABA en dos cuentas aparece con las dos', () => {
    const [a, b] = [newId(), newId()];
    assert.deepEqual(sharedWabas([
        { waBusinessId: 'w1', accountId: a },
        { waBusinessId: 'w1', accountId: b },
        { waBusinessId: 'w2', accountId: a },
    ]), [{ waBusinessId: 'w1', accountIds: [String(a), String(b)] }]);
});

// El mismo WABA en `User` y en `Waba` de UNA cuenta es lo normal tras migrar.
test('sharedWabas: el mismo WABA repetido en una sola cuenta no cuenta', () => {
    const a = newId();
    assert.deepEqual(sharedWabas([{ waBusinessId: 'w1', accountId: a }, { waBusinessId: 'w1', accountId: String(a) }]), []);
});

test('historicalLines: solo los números anteriores que aún no tienen línea', () => {
    assert.deepEqual(historicalLines(['111', '222', '333'], ['222'], '111'), { create: ['333'] });
    assert.deepEqual(historicalLines(['111'], [], '111'), { create: [] });
});

// Regresión que vigila (Codex, plan de la Fase 1): migrar a medias con datos ambiguos.
test('historicalLines: una conversación sin número para la migración', () => {
    assert.ok(historicalLines(['111', null], [], '111').stop);
    assert.ok(historicalLines([''], [], null).stop);
});
