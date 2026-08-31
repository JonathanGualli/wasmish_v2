import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TOKEN_SECRET = 'secreto-de-pruebas-no-usar-en-produccion';
const { buildButtonComponents, renderTemplateBody } =
    await import('../src/controllers/template.controller.js');

// Definiciones tal como las guarda el sync desde Meta (Template.buttons)
const BOTON_OTP = { type: 'OTP', text: 'Copiar código' };
const BOTON_COPY_CODE = { type: 'COPY_CODE', text: 'Copiar código' };
const BOTON_URL_VARIABLE = { type: 'URL', text: 'Ver pedido', url: 'https://x.com/{{1}}' };
const BOTON_URL_FIJA = { type: 'URL', text: 'Ver web', url: 'https://x.com' };

// ---------------------------------------------------------------------------
// El caso de PractyCo: el mismo botón «Copiar código» necesita un sub_type
// distinto según el tipo de plantilla. Por fuera son idénticos; la definición
// sincronizada es la única forma de distinguirlos.
// ---------------------------------------------------------------------------

test('OTP (plantilla AUTHENTICATION) → sub_type url con parámetro de texto', () => {
    const [componente] = buildButtonComponents(
        [{ parameters: ['123456'] }],
        [BOTON_OTP],
    );

    assert.equal(componente.sub_type, 'url');
    assert.deepEqual(componente.parameters, [{ type: 'text', text: '123456' }]);
});

test('COPY_CODE (cupón) → sub_type copy_code con coupon_code', () => {
    const [componente] = buildButtonComponents(
        [{ parameters: ['DESCUENTO50'] }],
        [BOTON_COPY_CODE],
    );

    assert.equal(componente.sub_type, 'copy_code');
    assert.deepEqual(componente.parameters, [{ type: 'coupon_code', coupon_code: 'DESCUENTO50' }]);
});

test('la definición manda sobre el subType que envíe el cliente', () => {
    const [componente] = buildButtonComponents(
        [{ subType: 'copy_code', parameters: ['123456'] }],   // el cliente se equivoca
        [BOTON_OTP],                                          // la plantilla dice OTP
    );

    assert.equal(componente.sub_type, 'url');
});

test('sin plantilla sincronizada cae al subType del cliente', () => {
    const [componente] = buildButtonComponents(
        [{ subType: 'quick_reply', parameters: ['SI'] }],
        [],                                                   // nunca se sincronizó
    );

    assert.equal(componente.sub_type, 'quick_reply');
    assert.deepEqual(componente.parameters, [{ type: 'payload', payload: 'SI' }]);
});

test('el index es posicional y va como string (lo pide Meta)', () => {
    const componentes = buildButtonComponents(
        [{ parameters: ['a'] }, { parameters: ['b'] }],
        [BOTON_URL_VARIABLE, BOTON_URL_VARIABLE],
    );

    assert.equal(componentes[0].index, '0');
    assert.equal(componentes[1].index, '1');
    assert.equal(typeof componentes[0].index, 'string');
});

// ---------------------------------------------------------------------------
// Errores que atajamos ANTES de llamar a Meta
// ---------------------------------------------------------------------------

test('índice inexistente → 400 (Meta lo descartaba en silencio)', () => {
    assert.throws(
        () => buildButtonComponents([{ index: 5, parameters: ['x'] }], [BOTON_OTP]),
        (error) => error.statusCode === 400 && /no tiene un botón en el índice 5/.test(error.message),
    );
});

test('URL fija sin {{1}} → 400 (Meta respondía 132018)', () => {
    assert.throws(
        () => buildButtonComponents([{ parameters: ['x'] }], [BOTON_URL_FIJA]),
        (error) => error.statusCode === 400 && /URL fija/.test(error.message),
    );
});

test('botón sin parámetros → 400', () => {
    assert.throws(
        () => buildButtonComponents([{ parameters: [] }], [BOTON_OTP]),
        (error) => error.statusCode === 400,
    );
});

test('sin botones devuelve lista vacía', () => {
    assert.deepEqual(buildButtonComponents([], []), []);
});

// ---------------------------------------------------------------------------
// Cuerpo de la plantilla
// ---------------------------------------------------------------------------

test('parámetros posicionales sustituyen {{1}}, {{2}}...', () => {
    assert.equal(
        renderTemplateBody('Hola {{1}}, tu pedido {{2}} salió', ['Juan', 'A-123']),
        'Hola Juan, tu pedido A-123 salió',
    );
});

test('parámetros nombrados sustituyen {{nombre}}', () => {
    assert.equal(
        renderTemplateBody('Hola {{nombre}}', [{ name: 'nombre', value: 'Juan' }]),
        'Hola Juan',
    );
});

test('un placeholder sin valor se deja tal cual', () => {
    assert.equal(renderTemplateBody('Hola {{1}} y {{2}}', ['Juan']), 'Hola Juan y {{2}}');
});

test('sin parámetros devuelve el texto intacto', () => {
    assert.equal(renderTemplateBody('Texto sin variables', []), 'Texto sin variables');
    assert.equal(renderTemplateBody(null, ['x']), null);
});
