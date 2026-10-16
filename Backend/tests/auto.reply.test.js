import test from 'node:test';
import assert from 'node:assert/strict';

import { inboundMatchText, matchesKeyword, normalizeForMatch } from '../src/utils/auto.reply.js';

test('normalizeForMatch quita tildes, mayúsculas y puntuación', () => {
    assert.equal(normalizeForMatch('¿Cuánto   CUESTA, el Envío?'), 'cuanto cuesta el envio');
    assert.equal(normalizeForMatch('Ñandú!!'), 'nandu');
});

test('matchesKeyword encuentra frases como palabras completas', () => {
    const texto = normalizeForMatch('hola, cuál es el precio?');

    assert.equal(matchesKeyword(texto, 'precio'), true);
    assert.equal(matchesKeyword(texto, 'Precio'), true);
    assert.equal(matchesKeyword(texto, 'el precio'), true);
    assert.equal(matchesKeyword(texto, 'cual es'), true);
});

// «preciosa» contiene «precio»: buscando por subcadena, un piropo a la muñeca
// respondía con la lista de precios.
test('matchesKeyword no encuentra una palabra dentro de otra', () => {
    assert.equal(matchesKeyword(normalizeForMatch('qué preciosa la muñeca'), 'precio'), false);
});

test('una frase que queda vacía al normalizar no coincide con nada', () => {
    assert.equal(matchesKeyword(normalizeForMatch('hola'), '¿?'), false);
});

test('inboundMatchText usa el texto o lo que se escribió junto al archivo', () => {
    assert.equal(inboundMatchText({ type: 'text', text: 'precio' }), 'precio');
    assert.equal(inboundMatchText({ type: 'image', text: 'cuánto este?', caption: 'cuánto este?' }), 'cuánto este?');
});

// La etiqueta automática («Imagen», «Nota de voz») no la escribió el contacto:
// nunca puede disparar una regla.
test('inboundMatchText ignora la etiqueta de un adjunto sin texto', () => {
    assert.equal(inboundMatchText({ type: 'image', text: 'Imagen', caption: null }), null);
    assert.equal(inboundMatchText({ type: 'audio', text: 'Nota de voz' }), null);
});
