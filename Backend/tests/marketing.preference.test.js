import test from 'node:test';
import assert from 'node:assert/strict';

import {
    describeUserPreference,
    isMarketingOptOutFailure,
    resolveMarketingPreference,
} from '../src/utils/marketing.preference.js';

const T1 = new Date('2026-10-04T10:00:00Z');
const T2 = new Date('2026-10-04T10:05:00Z');
const T3 = new Date('2026-10-04T10:10:00Z');

// --- describeUserPreference --------------------------------------------------

// Forma copiada de la referencia del webhook `user_preferences` de Meta.
test('una baja de marketing trae teléfono, BSUID y la fecha del webhook', () => {
    const pref = describeUserPreference({
        wa_id: '16505551234',
        user_id: 'US.13491208655302741918',
        detail: 'User requested to stop marketing messages',
        category: 'marketing_messages',
        value: 'stop',
        timestamp: 1731705721,
    });

    assert.deepEqual(pref, {
        phone: '16505551234',
        waUserId: 'US.13491208655302741918',
        optOut: true,
        at: new Date(1731705721 * 1000),
    });
});

test('resume es un alta', () => {
    const pref = describeUserPreference({ wa_id: '1', category: 'marketing_messages', value: 'resume', timestamp: '1731705721' });
    assert.equal(pref.optOut, false);
});

// Quien activó su nombre de usuario puede llegar solo con el BSUID.
test('sin wa_id, el teléfono queda en null y el BSUID basta', () => {
    const pref = describeUserPreference({ user_id: 'EC.1', category: 'marketing_messages', value: 'stop', timestamp: 1 });
    assert.equal(pref.phone, null);
    assert.equal(pref.waUserId, 'EC.1');
});

// Una categoría o un valor que Meta invente mañana NO debe leerse como baja.
test('categoría o valor desconocidos devuelven null', () => {
    assert.equal(describeUserPreference({ wa_id: '1', category: 'otra_cosa', value: 'stop' }), null);
    assert.equal(describeUserPreference({ wa_id: '1', category: 'marketing_messages', value: 'pause' }), null);
    assert.equal(describeUserPreference(null), null);
});

// --- isMarketingOptOutFailure ------------------------------------------------

test('el 131050 en un acuse fallido es una baja, venga como número o como texto', () => {
    assert.equal(isMarketingOptOutFailure([{ code: 131050 }]), true);
    assert.equal(isMarketingOptOutFailure([{ code: '131050' }]), true);
    assert.equal(isMarketingOptOutFailure([{ code: 131047 }]), false);
    assert.equal(isMarketingOptOutFailure(undefined), false);
});

// --- resolveMarketingPreference ----------------------------------------------

test('baja de un contacto que acepta publicidad', () => {
    const changes = resolveMarketingPreference({ marketingOptOut: false }, { optOut: true, at: T1 });
    assert.deepEqual(changes, { marketingOptOut: true, marketingOptOutAt: T1, marketingPreferenceAt: T1 });
});

test('alta: vuelve a aceptar y se vacía la fecha de la baja', () => {
    const current = { marketingOptOut: true, marketingOptOutAt: T1, marketingPreferenceAt: T1 };
    const changes = resolveMarketingPreference(current, { optOut: false, at: T2 });
    assert.deepEqual(changes, { marketingOptOut: false, marketingOptOutAt: null, marketingPreferenceAt: T2 });
});

// Meta no garantiza el orden: la baja vieja que llega tarde no puede ganarle
// al alta más reciente.
test('una baja más vieja que el último cambio se ignora', () => {
    const current = { marketingOptOut: false, marketingOptOutAt: null, marketingPreferenceAt: T2 };
    assert.equal(resolveMarketingPreference(current, { optOut: true, at: T1 }), null);
});

// Meta da la hora en segundos. Con `<=` una baja y un alta en el mismo segundo
// descartaban la segunda, y quien se arrepintió se quedaba de baja (lo destapó
// el simulador, que manda las dos en el mismo segundo).
test('en un empate de fecha gana el que llega después', () => {
    const current = { marketingOptOut: true, marketingOptOutAt: T1, marketingPreferenceAt: T1 };
    assert.deepEqual(
        resolveMarketingPreference(current, { optOut: false, at: T1 }),
        { marketingOptOut: false, marketingOptOutAt: null, marketingPreferenceAt: T1 },
    );
});

// Una segunda baja (otro 131050) no mueve la fecha de la baja, pero sí la del
// último cambio: así un alta de en medio que llegue después no gana.
test('repetir el mismo estado solo avanza marketingPreferenceAt', () => {
    const current = { marketingOptOut: true, marketingOptOutAt: T1, marketingPreferenceAt: T1 };
    assert.deepEqual(resolveMarketingPreference(current, { optOut: true, at: T3 }), { marketingPreferenceAt: T3 });

    const after = { ...current, marketingPreferenceAt: T3 };
    assert.equal(resolveMarketingPreference(after, { optOut: false, at: T2 }), null);
});

test('un contacto sin historial acepta cualquier cambio', () => {
    assert.deepEqual(resolveMarketingPreference({}, { optOut: false, at: T1 }), { marketingPreferenceAt: T1 });
});

test('una fecha inválida no cambia nada', () => {
    assert.equal(resolveMarketingPreference({}, { optOut: true, at: new Date('x') }), null);
});
