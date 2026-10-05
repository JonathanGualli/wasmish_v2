import test from 'node:test';
import assert from 'node:assert/strict';

import { cleanTagName, tagKey, splitTagCell } from '../src/utils/contact.tags.js';

test('el nombre se guarda sin espacios de más', () => {
    assert.equal(cleanTagName('  Feria   octubre '), 'Feria octubre');
    assert.equal(cleanTagName('   '), null);
    assert.equal(cleanTagName(undefined), null);
});

// Si la clave distinguiera mayúsculas o tildes, crear al vuelo duplicaría
// «VIP» en «vip», y una campaña «a los VIP» se dejaría fuera a la mitad.
test('mayúsculas, tildes y espacios no hacen otra etiqueta', () => {
    assert.equal(tagKey('VIP'), tagKey(' vip '));
    assert.equal(tagKey('Estándar'), tagKey('ESTANDAR'));
    assert.equal(tagKey('Feria  octubre'), 'feria octubre');
    assert.equal(tagKey(''), null);
});

test('una celda se separa por coma o punto y coma, sin repetidas', () => {
    assert.deepEqual(splitTagCell('VIP, Quito; Norte'), ['VIP', 'Quito', 'Norte']);
    assert.deepEqual(splitTagCell('VIP, vip , Vip'), ['VIP']);
    assert.deepEqual(splitTagCell(' , ;'), []);
    assert.deepEqual(splitTagCell(null), []);
});
