import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEMO_PLAN, demoPhone, demoTime, firstNameOf, renderDemoBody, demoBulkContacts,
    demoCampaignResults, demoCampaignRecipients, demoSeedAction,
} from '../src/utils/demo.js';

// 2026-10-23 15:00 UTC = 10:00 en Ecuador.
const now = new Date('2026-10-23T15:00:00Z');

test('demoTime: relativo en minutos, horas y días', () => {
    assert.equal(demoTime('45m', now).toISOString(), '2026-10-23T14:15:00.000Z');
    assert.equal(demoTime('3h', now).toISOString(), '2026-10-23T12:00:00.000Z');
    assert.equal(demoTime('12d', now).toISOString(), '2026-10-11T15:00:00.000Z');
});

test('demoTime: «2d 21:34» es hace 2 días a esa hora de Ecuador (UTC-5)', () => {
    assert.equal(demoTime('2d 21:34', now).toISOString(), '2026-10-22T02:34:00.000Z');
    assert.equal(demoTime('1d 08:42', now).toISOString(), '2026-10-22T13:42:00.000Z');
});

test('demoTime: el día es el de Ecuador aunque en UTC ya sea mañana', () => {
    // 2026-10-24 02:00 UTC = 23 de octubre a las 21:00 en Ecuador.
    const night = new Date('2026-10-24T02:00:00Z');
    assert.equal(demoTime('1d 10:00', night).toISOString(), '2026-10-22T15:00:00.000Z');
});

test('demoTime: una hora mal escrita es un error, no una fecha inventada', () => {
    assert.throws(() => demoTime('ayer', now), /no válida/);
    assert.throws(() => demoTime('2d 9:00', now), /no válida/);
});

test('demoPhone: 59300077 y cuatro cifras', () => {
    assert.equal(demoPhone(7), '593000770007');
    assert.equal(demoPhone(1234), '593000771234');
});

test('firstNameOf: el nombre, el de WhatsApp o «cliente»', () => {
    assert.equal(firstNameOf({ name: 'María Fernanda Ríos' }), 'María');
    assert.equal(firstNameOf({ name: null, profileName: 'Andrea 🌻' }), 'Andrea');
    assert.equal(firstNameOf({ name: null, profileName: null }), 'cliente');
});

test('renderDemoBody: reemplaza {{n}} por su valor', () => {
    assert.equal(renderDemoBody('Hola {{1}}, su pedido {{2}} está listo.', ['Roberto', '#1032']), 'Hola Roberto, su pedido #1032 está listo.');
});

test('demoBulkContacts: siempre los mismos, con su número y sin chocar con los protagonistas', () => {
    const bulk = { from: 20, count: 3, first: ['Ana', 'Marco'], last: ['Proaño', 'Torres'], companies: [null, 'X'], tags: [['VIP'], []] };
    const rows = demoBulkContacts(bulk);
    assert.deepEqual(rows.map(r => r.n), [20, 21, 22]);
    assert.deepEqual(rows.map(r => r.key), ['bulk0', 'bulk1', 'bulk2']);
    assert.deepEqual(rows.map(r => r.tags), [['VIP'], [], ['VIP']]);
    assert.deepEqual(demoBulkContacts(bulk), rows);
});

test('demoBulkContacts: ningún nombre se repite mientras alcancen las combinaciones', () => {
    // Regresión: con el apellido en (i * 5) % 8 salían dos «Fernando Montalvo».
    const rows = demoBulkContacts({ from: 20, count: 16, first: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], last: ['1', '2', '3', '4', '5', '6', '7', '8'], companies: [null], tags: [[]] });
    assert.equal(new Set(rows.map(r => r.name)).size, 16);
});

test('demoCampaignResults: los últimos fallan, antes los entregados y el resto leídos', () => {
    assert.deepEqual(demoCampaignResults(6, { failed: 1, delivered: 2 }), ['read', 'read', 'read', 'delivered', 'delivered', 'failed']);
    assert.deepEqual(demoCampaignResults(2, {}), ['read', 'read']);
});

test('demoCampaignRecipients: alguna etiqueta, o todas con `all`', () => {
    const contacts = [{ key: 'a', tags: ['X'] }, { key: 'b', tags: ['X', 'Y'] }, { key: 'c', tags: [] }];
    assert.deepEqual(demoCampaignRecipients(contacts, { tags: ['X', 'Y'] }).map(c => c.key), ['a', 'b']);
    assert.deepEqual(demoCampaignRecipients(contacts, { tags: ['X', 'Y'], all: true }).map(c => c.key), ['b']);
});

test('demoSeedAction: crea si no existe y rehace solo con --reset', () => {
    assert.equal(demoSeedAction({ owner: null, account: null, agentTaken: false, reset: false }).action, 'create');
    assert.equal(demoSeedAction({ owner: null, account: null, agentTaken: false, reset: true }).action, 'create');
    const demo = { owner: { _id: 1 }, account: { plan: DEMO_PLAN }, agentTaken: false };
    assert.equal(demoSeedAction({ ...demo, reset: true }).action, 'reset');
    assert.equal(demoSeedAction({ ...demo, reset: false }).action, 'refuse');
});

test('demoSeedAction: nunca toca una cuenta sin la marca, ni con --reset', () => {
    // Corre en producción: si alguien registró de verdad ese correo, se para.
    const real = { owner: { _id: 1 }, account: { plan: null }, agentTaken: false, reset: true };
    assert.equal(demoSeedAction(real).action, 'refuse');
    assert.equal(demoSeedAction({ ...real, account: null }).action, 'refuse');
    assert.equal(demoSeedAction({ owner: null, account: null, agentTaken: true, reset: true }).action, 'refuse');
});
