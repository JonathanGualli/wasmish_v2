import test from 'node:test';
import assert from 'node:assert/strict';
import { describeAgendaChange, agendaDisplayName } from '../src/utils/agenda.js';

// El ejemplo de la guía de la coexistencia de Meta (`smb_app_state_sync`, 2026-10-23).
const itemOf = (overrides = {}) => ({
    type: 'contact',
    contact: { full_name: 'Pablo Morales', first_name: 'Pablo', phone_number: '16505551234' },
    action: 'add',
    metadata: { timestamp: '1739321024' },
    ...overrides,
});

test('describeAgendaChange: el ejemplo de Meta, con la hora en segundos como texto', () => {
    assert.deepEqual(describeAgendaChange(itemOf()), {
        phone: '16505551234', fullName: 'Pablo Morales', firstName: 'Pablo', removed: false,
        syncedAt: new Date(1739321024 * 1000),
    });
});

test('describeAgendaChange: la hora también como número', () => {
    assert.deepEqual(describeAgendaChange(itemOf({ metadata: { timestamp: 1739321024 } })).syncedAt, new Date(1739321024 * 1000));
});

test('describeAgendaChange: un remove, sin nombres', () => {
    const change = describeAgendaChange(itemOf({ action: 'remove', contact: { phone_number: '16505551234' } }));
    assert.equal(change.removed, true);
    assert.equal(change.fullName, null);
    assert.equal(change.firstName, null);
});

test('describeAgendaChange: el teléfono con + y espacios queda en dígitos', () => {
    // La documentación no dice si viene con `+` (spec § 3): se aceptan los dos.
    assert.equal(describeAgendaChange(itemOf({ contact: { full_name: 'Pablo', phone_number: '+1 650-555-1234' } })).phone, '16505551234');
});

test('describeAgendaChange: los nombres en blanco cuentan como sin nombre', () => {
    const change = describeAgendaChange(itemOf({ contact: { full_name: '  ', first_name: ' Pablo ', phone_number: '16505551234' } }));
    assert.equal(change.fullName, null);
    assert.equal(change.firstName, 'Pablo');
});

test('describeAgendaChange: null si no es un contacto o le falta el teléfono, la acción o la hora', () => {
    const cases = {
        'otro tipo': itemOf({ type: 'label' }),
        'sin teléfono': itemOf({ contact: { full_name: 'Pablo' } }),
        'teléfono corto': itemOf({ contact: { full_name: 'Pablo', phone_number: '1234567' } }),
        'un BSUID': itemOf({ contact: { full_name: 'Pablo', phone_number: 'US.13491208655302741918' } }),
        'acción desconocida': itemOf({ action: 'edit' }),
        'sin hora': itemOf({ metadata: {} }),
        'hora vacía': itemOf({ metadata: { timestamp: '' } }),
        'hora que no es número': itemOf({ metadata: { timestamp: 'ayer' } }),
        'hora cero': itemOf({ metadata: { timestamp: 0 } }),
    };
    for (const [label, item] of Object.entries(cases)) assert.equal(describeAgendaChange(item), null, label);
    for (const value of [null, undefined, 'contacto', 42]) assert.equal(describeAgendaChange(value), null, String(value));
});

test('agendaDisplayName: el nombre completo, si no el de pila, si no null', () => {
    assert.equal(agendaDisplayName({ fullName: 'Pablo Morales', firstName: 'Pablo' }), 'Pablo Morales');
    assert.equal(agendaDisplayName({ fullName: null, firstName: 'Pablo' }), 'Pablo');
    assert.equal(agendaDisplayName({ fullName: ' ', firstName: '' }), null);
    assert.equal(agendaDisplayName({}), null);
});
