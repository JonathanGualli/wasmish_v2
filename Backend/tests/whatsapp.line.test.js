import test from 'node:test';
import assert from 'node:assert/strict';
import { describeWabaPhoneNumber } from '../src/utils/whatsapp.line.js';

const BODY = { data: [
    { id: '111', display_phone_number: '+1 555 000 0001', verified_name: 'Negocio de prueba' },
    { id: '222', display_phone_number: '+1 555 000 0002' },
] };

test('devuelve el número del WABA con sus datos', () => {
    assert.deepEqual(describeWabaPhoneNumber(BODY, '111'),
        { phoneNumberId: '111', displayPhoneNumber: '+1 555 000 0001', verifiedName: 'Negocio de prueba' });
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

test('un id vacío nunca coincide', () => {
    assert.equal(describeWabaPhoneNumber({ data: [{ id: '' }] }, ''), null);
});
