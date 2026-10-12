import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
    ownerConnection, lineStateIssues, sharedWabas, historicalLines, legacyUserFields, legacyUserIssues, planConnection, sendingLineFor, resolveApiLine, nextDefaultLine, cleanLineName,
} from '../src/utils/line.js';

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

// Fase 2c: `User` es la copia de la línea por defecto, para la imagen anterior.
test('legacyUserFields: la línea activa y el token de su WABA', () => {
    assert.deepEqual(legacyUserFields(line, waba), { tokenWhatsapp: 'cifrado-1', phoneNumberId: '111', waBusinessId: 'w1' });
});

test('legacyUserFields: sin línea, desconectada o sin token → los tres null', () => {
    const none = { tokenWhatsapp: null, phoneNumberId: null, waBusinessId: null };
    assert.deepEqual(legacyUserFields(null, null), none);
    assert.deepEqual(legacyUserFields({ ...line, status: 'disconnected' }, waba), none);
    assert.deepEqual(legacyUserFields(line, { ...waba, tokenWhatsapp: null }), none);
});

test('legacyUserIssues: User es la copia de la línea por defecto → []', () => {
    assert.deepEqual(legacyUserIssues({ owner, defaultLine: line, waba, hasActiveLines: true }), []);
    const empty = { accountId, tokenWhatsapp: null, phoneNumberId: null, waBusinessId: null };
    assert.deepEqual(legacyUserIssues({ owner: empty, defaultLine: null, waba: null }), []);
});

test('legacyUserIssues: User con otro número que la línea por defecto', () => {
    const issues = legacyUserIssues({ owner: { ...owner, phoneNumberId: '222' }, defaultLine: line, waba, hasActiveLines: true });
    assert.equal(issues.length, 1);
    assert.match(issues[0], /222/);
});

test('legacyUserIssues: el token o el WABA de User no son los de la línea por defecto', () => {
    assert.equal(legacyUserIssues({ owner: { ...owner, tokenWhatsapp: 'viejo' }, defaultLine: line, waba }).length, 1);
    assert.equal(legacyUserIssues({ owner: { ...owner, waBusinessId: 'w9' }, defaultLine: line, waba }).length, 1);
});

test('legacyUserIssues: líneas activas sin ninguna por defecto', () => {
    const empty = { accountId, tokenWhatsapp: null, phoneNumberId: null, waBusinessId: null };
    assert.deepEqual(legacyUserIssues({ owner: empty, defaultLine: null, waba: null, hasActiveLines: true }),
        ['ninguna línea activa es la por defecto']);
});

const activeLine = (phoneNumberId) => ({ _id: newId(), phoneNumberId, status: 'active' });

// Fase 2c: qué hace conectar un número, según las líneas activas y el límite.
test('planConnection: el mismo número activo → renew, aunque se esté por encima del límite', () => {
    const one = activeLine('111');
    assert.deepEqual(planConnection({ lines: [one], maxLines: 1, phoneNumberId: '111' }), { action: 'renew', lineId: one._id });
    // Regresión que vigila (Codex, plan de la 2c): con el límite bajado por
    // debajo de las activas, renovar el token desconectaba la línea.
    const two = activeLine('222');
    assert.deepEqual(planConnection({ lines: [one, two], maxLines: 1, phoneNumberId: '222' }), { action: 'renew', lineId: two._id });
});

test('planConnection: por debajo del límite → add, también para reactivar una desconectada', () => {
    assert.deepEqual(planConnection({ lines: [], maxLines: 1, phoneNumberId: '111' }), { action: 'add' });
    assert.deepEqual(planConnection({ lines: [activeLine('111')], maxLines: 2, phoneNumberId: '222' }), { action: 'add' });
    const old = { _id: newId(), phoneNumberId: '222', status: 'disconnected' };
    assert.deepEqual(planConnection({ lines: [activeLine('111'), old], maxLines: 2, phoneNumberId: '222' }), { action: 'add' });
});

// Regresión que vigila (plan de la 2c, Review Focus 1): el «volver a conectar»
// con otro número de siempre, en una cuenta de una línea.
test('planConnection: maxLines 1 y otra activa → replace', () => {
    const one = activeLine('111');
    assert.deepEqual(planConnection({ lines: [one], maxLines: 1, phoneNumberId: '222' }), { action: 'replace', replaceLineIds: [one._id] });
});

test('planConnection: maxLines 2 con dos activas → limit', () => {
    assert.deepEqual(planConnection({ lines: [activeLine('111'), activeLine('222')], maxLines: 2, phoneNumberId: '333' }), { error: 'limit' });
});

test('planConnection: maxLines 1 con dos activas (se bajó) → limit, nunca reemplaza', () => {
    assert.deepEqual(planConnection({ lines: [activeLine('111'), activeLine('222')], maxLines: 1, phoneNumberId: '333' }), { error: 'limit' });
});

// Fase 2c: `Line` y `Waba` son la fuente; una conversación de un número que ya
// no está conectado no se responde desde otro.
test('sendingLineFor: línea activa con token → SendingLine', () => {
    assert.deepEqual(sendingLineFor({ line, waba }), {
        line: { accountId, lineId: line._id, phoneNumberId: '111', waBusinessId: 'w1', tokenWhatsapp: 'cifrado-1' },
    });
});

test('sendingLineFor: línea desconectada o sin token → disconnected si se pidió', () => {
    assert.deepEqual(sendingLineFor({ line: { ...line, status: 'disconnected' }, waba, requested: true }), { issue: 'disconnected' });
    assert.deepEqual(sendingLineFor({ line, waba: { ...waba, tokenWhatsapp: null }, requested: true }), { issue: 'disconnected' });
});

test('sendingLineFor: sin línea → not_connected, o disconnected si se pidió una', () => {
    assert.deepEqual(sendingLineFor({ line: null, waba: null }), { issue: 'not_connected' });
    assert.deepEqual(sendingLineFor({ line: null, waba: null, requested: true }), { issue: 'disconnected' });
});

// Fase 2b: la API pública elige la línea con `lineId` o con `from` (su número).
const lines = [
    { _id: newId(), displayPhoneNumber: '+593 99 123 4567' },
    { _id: newId(), displayPhoneNumber: '+1 555-000-0002' },
    { _id: newId(), displayPhoneNumber: null },   // creada por la migración, sin número todavía
];

test('resolveApiLine: sin lineId ni from, la línea por defecto', () => {
    assert.deepEqual(resolveApiLine(lines, {}), { lineId: null });
});

test('resolveApiLine: lineId de la cuenta → esa línea', () => {
    assert.deepEqual(resolveApiLine(lines, { lineId: String(lines[1]._id) }), { lineId: String(lines[1]._id) });
});

test('resolveApiLine: from con +, espacios y guiones encuentra su línea', () => {
    assert.deepEqual(resolveApiLine(lines, { from: '593991234567' }), { lineId: String(lines[0]._id) });
    assert.deepEqual(resolveApiLine(lines, { from: '+1 (555) 000-0002' }), { lineId: String(lines[1]._id) });
});

test('resolveApiLine: lineId que no es de la cuenta → 404', () => {
    assert.deepEqual(resolveApiLine(lines, { lineId: String(newId()) }), { statusCode: 404, message: 'La línea no existe en tu cuenta.' });
});

test('resolveApiLine: from que no es de ninguna línea → 404', () => {
    assert.equal(resolveApiLine(lines, { from: '593990000000' }).statusCode, 404);
});

test('resolveApiLine: lineId y from de líneas distintas → 400', () => {
    const result = resolveApiLine(lines, { lineId: String(lines[1]._id), from: '593991234567' });
    assert.deepEqual(result, { statusCode: 400, message: 'lineId y from no son la misma línea.' });
});

test('resolveApiLine: lineId y from de la misma línea → esa línea', () => {
    assert.deepEqual(resolveApiLine(lines, { lineId: String(lines[0]._id), from: '+593991234567' }), { lineId: String(lines[0]._id) });
});

// Regresión que vigila (Codex, PR #16): el esquema acepta el id en mayúsculas
// (y Mongo también), pero la comparación era literal y daba 404.
test('resolveApiLine: un lineId en mayúsculas es la misma línea', () => {
    const upper = String(lines[0]._id).toUpperCase();
    assert.deepEqual(resolveApiLine(lines, { lineId: upper }), { lineId: String(lines[0]._id) });
});

// Fase 2c: al desconectar la línea por defecto, la siguiente.
test('nextDefaultLine: la activa conectada más recientemente que no es la quitada', () => {
    const removed = { _id: newId(), status: 'active', connectedAt: new Date('2026-10-12') };
    const older = { _id: newId(), status: 'active', connectedAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-12') };
    const newer = { _id: newId(), status: 'active', connectedAt: new Date('2026-10-10') };
    const off = { _id: newId(), status: 'disconnected', connectedAt: new Date('2026-10-11') };
    // Regresión que vigila (Tarea 3 de la 2c): con `updatedAt`, renombrar una línea la volvía «la más reciente».
    assert.equal(nextDefaultLine([removed, older, newer, off], removed._id), newer);
    // Una línea anterior a `connectedAt` cuenta por su `createdAt`.
    const legacy = { _id: newId(), status: 'active', connectedAt: null, createdAt: new Date('2026-10-11') };
    assert.equal(nextDefaultLine([removed, older, newer, legacy], removed._id), legacy);
});

test('nextDefaultLine: sin otra activa → null', () => {
    const removed = { _id: newId(), status: 'active', updatedAt: new Date() };
    assert.equal(nextDefaultLine([removed, { _id: newId(), status: 'disconnected', updatedAt: new Date() }], removed._id), null);
});

test('cleanLineName: sin espacios de sobra; vacío → null', () => {
    assert.equal(cleanLineName('  Ventas   Quito '), 'Ventas Quito');
    assert.equal(cleanLineName('   '), null);
    assert.equal(cleanLineName(null), null);
});
