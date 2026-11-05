import test from 'node:test';
import assert from 'node:assert/strict';

import {
    BUTTON_BODY_MAX, LIST_BUTTON_TEXT, buildInteractivePayload, optionId, parseOptionId,
} from '../src/utils/auto.reply.options.js';

const RULE_ID = '6729a1b2c3d4e5f6a7b8c9d0';

const options = (count) => Array.from({ length: count }, (_, index) => ({ id: `wasmish:r:${RULE_ID}`, title: `Opción ${index + 1}` }));

test('optionId y parseOptionId van y vuelven para los tres destinos', () => {
    assert.equal(optionId({ target: 'rule', ruleId: RULE_ID }), `wasmish:r:${RULE_ID}`);
    assert.equal(optionId({ target: 'start' }), 'wasmish:start');
    assert.equal(optionId({ target: 'person' }), 'wasmish:person');

    assert.deepEqual(parseOptionId(`wasmish:r:${RULE_ID}`), { target: 'rule', ruleId: RULE_ID });
    assert.deepEqual(parseOptionId('wasmish:start'), { target: 'start' });
    assert.deepEqual(parseOptionId('wasmish:person'), { target: 'person' });
});

test('un id que no es de Wasmish es un toque viejo: null', () => {
    assert.equal(parseOptionId('otra-cosa'), null);
    assert.equal(parseOptionId('wasmish:r:123'), null);
    assert.equal(parseOptionId(`wasmish:r:${RULE_ID}x`), null);
    assert.equal(parseOptionId('wasmish:inicio'), null);
    assert.equal(parseOptionId(''), null);
    assert.equal(parseOptionId(null), null);
});

test('hasta 3 opciones y el cuerpo en 1024: botones de respuesta, en orden', () => {
    const text = 'x'.repeat(BUTTON_BODY_MAX);
    const { format, interactive } = buildInteractivePayload({ text, options: options(3) });

    assert.equal(format, 'buttons');
    assert.equal(interactive.type, 'button');
    assert.equal(interactive.body.text, text);
    assert.deepEqual(interactive.action.buttons, options(3).map(({ id, title }) => ({ type: 'reply', reply: { id, title } })));
});

test('de 4 opciones en adelante: lista con «Ver opciones» y una sección sin título', () => {
    const { format, interactive } = buildInteractivePayload({ text: 'Elige', options: options(4) });

    assert.equal(format, 'list');
    assert.equal(interactive.type, 'list');
    assert.equal(interactive.body.text, 'Elige');
    assert.equal(interactive.action.button, LIST_BUTTON_TEXT);
    assert.equal(LIST_BUTTON_TEXT, 'Ver opciones');
    assert.equal(interactive.action.sections.length, 1);
    assert.equal(interactive.action.sections[0].title, undefined);
    assert.deepEqual(interactive.action.sections[0].rows, options(4).map(({ id, title }) => ({ id, title })));
});

// Decisión A del spec: Meta rechaza los botones con más de 1024 caracteres de
// cuerpo; la lista admite 4096, y así sale un solo mensaje.
test('con dos opciones y el cuerpo de 1025 sale como lista', () => {
    const { format } = buildInteractivePayload({ text: 'x'.repeat(BUTTON_BODY_MAX + 1), options: options(2) });
    assert.equal(format, 'list');
});
