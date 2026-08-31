import test from 'node:test';
import assert from 'node:assert/strict';

// crypto.js deriva la clave de TOKEN_SECRET al importarse, así que hay que
// fijarla ANTES del import (por eso es dinámico y no estático).
process.env.TOKEN_SECRET = 'secreto-de-pruebas-no-usar-en-produccion';
const { encrypt, decrypt, hashApiKey } = await import('../src/utils/crypto.js');

const TOKEN_META = 'EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

test('lo cifrado se descifra igual', () => {
    assert.equal(decrypt(encrypt(TOKEN_META)), TOKEN_META);
});

// EL BUG que arreglamos: el IV vivía a nivel de módulo y se reusaba en todo el
// proceso. Como todos los tokens de Meta empiezan por "EAA", los primeros
// bloques cifrados salían idénticos.
test('cifrar dos veces lo mismo da resultados distintos', () => {
    const a = encrypt(TOKEN_META);
    const b = encrypt(TOKEN_META);

    assert.notEqual(a, b);
    assert.equal(decrypt(a), TOKEN_META);
    assert.equal(decrypt(b), TOKEN_META);
});

test('dos tokens con el mismo prefijo no comparten bloque cifrado', () => {
    const cipherA = encrypt('EAAprefijocomun-cliente-uno').split(':')[1];
    const cipherB = encrypt('EAAprefijocomun-cliente-dos').split(':')[1];

    // Primer bloque AES = 16 bytes = 32 caracteres hex
    assert.notEqual(cipherA.slice(0, 32), cipherB.slice(0, 32));
});

test('el formato es iv:ciphertext con un IV de 16 bytes', () => {
    const [iv, ciphertext] = encrypt(TOKEN_META).split(':');

    assert.equal(iv.length, 32);          // 16 bytes en hex
    assert.match(iv, /^[0-9a-f]+$/);
    assert.ok(ciphertext.length > 0);
});

test('descifra valores cifrados con otro IV (retrocompatibilidad)', () => {
    // Los tokens ya guardados en la BD traen su propio IV en el prefijo; el
    // cambio de IV por-cifrado no debe invalidarlos.
    const guardado = encrypt(TOKEN_META);
    const otro = encrypt(TOKEN_META);

    assert.notEqual(guardado.split(':')[0], otro.split(':')[0]);
    assert.equal(decrypt(guardado), TOKEN_META);
});

test('hashApiKey es determinista y no reversible', () => {
    const key = 'wm_clave_de_prueba_123';

    assert.equal(hashApiKey(key), hashApiKey(key));
    assert.equal(hashApiKey(key).length, 64);         // SHA-256 en hex
    assert.ok(!hashApiKey(key).includes(key));
    assert.notEqual(hashApiKey(key), hashApiKey(key + 'x'));
});
