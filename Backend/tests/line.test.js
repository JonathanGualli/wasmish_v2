import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { ownerConnection, lineStateIssues } from '../src/utils/line.js';

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
