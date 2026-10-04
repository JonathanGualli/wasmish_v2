import test from 'node:test';
import assert from 'node:assert/strict';

import { pickContactFields, buildContactSearch, escapeRegex } from '../src/utils/contact.query.js';

// Lo que pone WhatsApp no se edita a mano: aunque llegue en el body, se ignora.
test('solo pasan los campos editables', () => {
    const fields = pickContactFields({
        name: 'Ana', profileName: 'Hack', username: 'x', waUserId: 'EC.1',
        source: 'api', marketingOptOut: false, userId: 'otro',
    });

    assert.deepEqual(fields, { name: 'Ana' });
});

test('el texto vacío borra el campo y lo demás se recorta', () => {
    const fields = pickContactFields({ email: '', company: '  Ferretería X  ', notes: '   ' });
    assert.deepEqual(fields, { email: null, company: 'Ferretería X', notes: null });
});

// En un PATCH, lo que no viene no se toca: no puede aparecer como null.
test('los campos ausentes no aparecen', () => {
    assert.deepEqual(pickContactFields({ name: 'Ana' }), { name: 'Ana' });
    assert.deepEqual(pickContactFields(undefined), {});
});

test('sin búsqueda no hay condición', () => {
    assert.equal(buildContactSearch(''), null);
    assert.equal(buildContactSearch('   '), null);
    assert.equal(buildContactSearch(undefined), null);
});

// Regresión que vigila: sin escapar, «+593» es una expresión regular inválida
// (el + no repite nada) y la consulta entera revienta con un 500.
test('lo que escribe el usuario no se interpreta como expresión regular', () => {
    const search = buildContactSearch('a.b(c');
    const name = search.$or.find(c => c.name).name;

    assert.equal(name.test('a.b(c'), true);
    assert.equal(name.test('axb(c'), false);
    assert.doesNotThrow(() => buildContactSearch('+593 ('));
    assert.equal(escapeRegex('+1'), '\\+1');
});

// En pantalla se ve «+593 99 123 4567»; guardado está «593991234567».
test('el teléfono se busca solo por sus dígitos', () => {
    const search = buildContactSearch('+593 99 123');
    const phone = search.$or.find(c => c.phone).phone;

    assert.equal(phone.test('593991234567'), true);
});

test('sin dígitos no se busca por teléfono', () => {
    const search = buildContactSearch('ana');
    assert.equal(search.$or.some(c => c.phone), false);
});

test('«@usuario» busca el usuario sin la arroba', () => {
    const search = buildContactSearch('@ana.p');
    const username = search.$or.find(c => c.username).username;

    assert.equal(username.test('ana.p'), true);
});
