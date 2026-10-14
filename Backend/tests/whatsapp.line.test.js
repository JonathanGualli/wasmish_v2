import test from 'node:test';
import assert from 'node:assert/strict';
import { describeWabaPhoneNumber, generateTwoStepPin, needsRegistration, nextPageCursor } from '../src/utils/whatsapp.line.js';

const BODY = { data: [
    { id: '111', display_phone_number: '+1 555 000 0001', verified_name: 'Negocio de prueba' },
    { id: '222', display_phone_number: '+1 555 000 0002' },
] };

test('devuelve el número del WABA con sus datos', () => {
    assert.deepEqual(describeWabaPhoneNumber(BODY, '111'),
        { phoneNumberId: '111', displayPhoneNumber: '+1 555 000 0001', verifiedName: 'Negocio de prueba', platformType: null });
});

test('un dato que Meta no manda queda en null', () => {
    assert.equal(describeWabaPhoneNumber(BODY, '222').verifiedName, null);
});

// Regresión que vigila: el número que llega en la petición tiene que estar en el WABA del token.
test('un número que no está en el WABA da null', () => {
    assert.equal(describeWabaPhoneNumber(BODY, '333'), null);
});

test('una respuesta sin data, vacía o rara da null sin lanzar', () => {
    for (const body of [undefined, null, {}, { data: [] }, { data: 'x' }]) {
        assert.equal(describeWabaPhoneNumber(body, '111'), null);
    }
});

test('describeWabaPhoneNumber devuelve platform_type como platformType', () => {
    const body = { data: [{ id: '111', platform_type: 'CLOUD_API' }, { id: '222' }] };
    assert.equal(describeWabaPhoneNumber(body, '111').platformType, 'CLOUD_API');
    assert.equal(describeWabaPhoneNumber(body, '222').platformType, null);
});

// Regresión que vigila: un número nuevo del Embedded Signup no se registraba y no podía enviar (133010).
test('needsRegistration: solo un número que Meta dice que no está registrado', () => {
    assert.equal(needsRegistration({ platformType: 'NOT_APPLICABLE' }), true);
    for (const platformType of ['CLOUD_API', 'ON_PREMISE', 'ALGO_NUEVO', null, undefined]) {
        assert.equal(needsRegistration({ platformType }), false, String(platformType));
    }
    assert.equal(needsRegistration(null), false);
});

test('generateTwoStepPin: seis dígitos, con ceros a la izquierda, y no siempre el mismo', () => {
    const pins = Array.from({ length: 200 }, generateTwoStepPin);
    assert.ok(pins.every(pin => /^\d{6}$/.test(pin)));
    assert.ok(new Set(pins).size > 1);
});

test('un id vacío nunca coincide', () => {
    assert.equal(describeWabaPhoneNumber({ data: [{ id: '' }] }, ''), null);
});

test('nextPageCursor: con `paging.next`, el cursor de la página siguiente', () => {
    assert.equal(nextPageCursor({ data: [], paging: { cursors: { after: 'abc' }, next: 'https://graph…' } }), 'abc');
});

test('nextPageCursor: sin `paging.next` es la última página, aunque haya cursor', () => {
    for (const body of [undefined, {}, { paging: { cursors: { after: 'abc' } } }, { paging: { next: 'x', cursors: {} } }]) {
        assert.equal(nextPageCursor(body), null);
    }
});
