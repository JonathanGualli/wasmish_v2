import test from 'node:test';
import assert from 'node:assert/strict';
import { describePhoneNumberPlatform, describeWabaPhoneNumber, generateTwoStepPin, needsRegistration, nextPageCursor, pickBusinessAppPhoneNumber } from '../src/utils/whatsapp.line.js';

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

test('describePhoneNumberPlatform: si el número está en la app de WhatsApp Business, como lo dice Meta', () => {
    assert.deepEqual(describePhoneNumberPlatform({ is_on_biz_app: true, platform_type: 'CLOUD_API', id: '1' }),
        { onBusinessApp: true, platformType: 'CLOUD_API' });
    assert.deepEqual(describePhoneNumberPlatform({ is_on_biz_app: false, platform_type: 'NOT_APPLICABLE' }),
        { onBusinessApp: false, platformType: 'NOT_APPLICABLE' });
});

test('describePhoneNumberPlatform: sin el campo, o si no es un booleano, no se sabe (null)', () => {
    assert.equal(describePhoneNumberPlatform({ platform_type: 'CLOUD_API' }).onBusinessApp, null);
    assert.equal(describePhoneNumberPlatform({ is_on_biz_app: 'true' }).onBusinessApp, null);
    for (const body of [null, undefined, 'x']) {
        assert.deepEqual(describePhoneNumberPlatform(body), { onBusinessApp: null, platformType: null });
    }
});

// Regresión que vigila: un número de la app con `NOT_APPLICABLE` se registraría con un PIN ajeno y se rompería.
test('needsRegistration: un número de la app nunca se registra', () => {
    for (const platformType of ['NOT_APPLICABLE', 'CLOUD_API', null]) {
        assert.equal(needsRegistration({ platformType }, { onBusinessApp: true }), false, String(platformType));
    }
});

test('needsRegistration: Meta dice que no está en la app → como siempre', () => {
    assert.equal(needsRegistration({ platformType: 'NOT_APPLICABLE' }, { onBusinessApp: false }), true);
    assert.equal(needsRegistration({ platformType: 'NOT_APPLICABLE' }, { onBusinessApp: false, claimedBusinessApp: true }), true);
    assert.equal(needsRegistration({ platformType: 'CLOUD_API' }, { onBusinessApp: false }), false);
});

test('needsRegistration: si no se sabe, no registra lo que el navegador dijo que está en la app', () => {
    assert.equal(needsRegistration({ platformType: 'NOT_APPLICABLE' }, { onBusinessApp: null }), true);
    assert.equal(needsRegistration({ platformType: 'NOT_APPLICABLE' }, { onBusinessApp: null, claimedBusinessApp: true }), false);
    assert.equal(needsRegistration({ platformType: 'CLOUD_API' }, { onBusinessApp: null, claimedBusinessApp: false }), false);
});

test('pickBusinessAppPhoneNumber: uno solo; entre varios, el único que está en la app', () => {
    assert.equal(pickBusinessAppPhoneNumber([{ phoneNumberId: '1', onBusinessApp: null }]), '1');
    assert.equal(pickBusinessAppPhoneNumber([{ phoneNumberId: '1', onBusinessApp: false }, { phoneNumberId: '2', onBusinessApp: true }]), '2');
    assert.equal(pickBusinessAppPhoneNumber([{ phoneNumberId: '1', onBusinessApp: true }, { phoneNumberId: '2', onBusinessApp: true }]), null);
    assert.equal(pickBusinessAppPhoneNumber([{ phoneNumberId: '1', onBusinessApp: false }, { phoneNumberId: '2', onBusinessApp: null }]), null);
    assert.equal(pickBusinessAppPhoneNumber([]), null);
    assert.equal(pickBusinessAppPhoneNumber(undefined), null);
});
