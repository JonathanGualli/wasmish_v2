import test from 'node:test';
import assert from 'node:assert/strict';

import {
    extractTemplateVariables,
    resolveParameterFormat,
    buttonsNeedingValue,
    validateCampaignMessage,
    cleanValue,
    resolveVariableValue,
    buildContactParameters,
    resolveContactValues,
} from '../src/utils/campaign.message.js';

const PROMO = {
    status: 'APPROVED',
    category: 'MARKETING',
    parameterFormat: 'POSITIONAL',
    bodyText: 'Hola {{1}}, este mes tienes 20% de descuento en {{2}}. Te esperamos, {{1}}.',
    buttons: [
        { type: 'URL', text: 'Ver oferta', url: 'https://tienda.ec/o/{{1}}' },
        { type: 'QUICK_REPLY', text: 'No me interesa' },
    ],
};

const ANA = { name: 'Ana Pérez', profileName: 'Anita', company: 'Ferretería Sur', phone: '593991112223', email: 'ana@sur.ec' };
const SIN_DATOS = { profileName: null, phone: null, waUserId: 'EC.1' };

const CONFIG = {
    variables: [
        { key: '1', source: 'firstName', fallback: 'cliente' },
        { key: '2', source: 'fixed', value: 'toda la tienda' },
    ],
    buttons: [{ index: 0, source: 'fixed', value: 'octubre' }],
};

// --- variables y botones de la plantilla -------------------------------------

test('las variables posicionales salen sin repetir y en orden numérico', () => {
    assert.deepEqual(extractTemplateVariables('{{2}} y {{1}} y otra vez {{2}}'), ['1', '2']);
    assert.deepEqual(extractTemplateVariables('Sin variables'), []);
});

test('las variables con nombre conservan el orden en que aparecen', () => {
    assert.deepEqual(extractTemplateVariables('Hola {{ nombre }}, desde {{ciudad}}'), ['nombre', 'ciudad']);
});

// Una plantilla sincronizada antes de guardar `parameterFormat` no lo trae.
test('sin parameterFormat, el formato se deduce del texto', () => {
    assert.equal(resolveParameterFormat({ bodyText: 'Hola {{1}}' }), 'POSITIONAL');
    assert.equal(resolveParameterFormat({ bodyText: 'Hola {{nombre}}' }), 'NAMED');
    assert.equal(resolveParameterFormat({ parameterFormat: 'NAMED', bodyText: 'Hola {{1}}' }), 'NAMED');
});

test('piden valor el cupón y la URL con parte variable; la URL fija y la respuesta rápida no', () => {
    const buttons = [
        { type: 'URL', url: 'https://a.ec/{{1}}' },
        { type: 'URL', url: 'https://a.ec/fija' },
        { type: 'QUICK_REPLY' },
        { type: 'COPY_CODE' },
    ];
    assert.deepEqual(buttonsNeedingValue(buttons), [0, 3]);
});

// --- validar la configuración --------------------------------------------------

test('una configuración completa no da errores', () => {
    assert.deepEqual(validateCampaignMessage(PROMO, CONFIG), []);
});

test('las plantillas de autenticación no se pueden enviar en masivo', () => {
    const errors = validateCampaignMessage({ ...PROMO, category: 'AUTHENTICATION' }, CONFIG);
    assert.ok(errors.some(e => e.field === 'templateId'));
});

test('una plantilla no aprobada no se puede enviar', () => {
    const errors = validateCampaignMessage({ ...PROMO, status: 'PENDING' }, CONFIG);
    assert.ok(errors.some(e => e.field === 'templateId'));
});

test('falta una variable, un texto fijo vacío o un botón sin valor', () => {
    const errors = validateCampaignMessage(PROMO, {
        variables: [{ key: '2', source: 'fixed', value: '   ' }],
        buttons: [],
    });
    assert.deepEqual(errors.map(e => e.field).sort(), ['buttons.0', 'variables.1', 'variables.2']);
});

// Meta rechaza un parámetro vacío, y cualquier dato del contacto puede faltar.
test('un dato del contacto sin valor de reserva es un error', () => {
    const errors = validateCampaignMessage(PROMO, {
        variables: [{ key: '1', source: 'company' }, { key: '2', source: 'fixed', value: 'x' }],
        buttons: CONFIG.buttons,
    });
    assert.deepEqual(errors.map(e => e.field), ['variables.1']);
});

// --- valores por contacto ------------------------------------------------------

// Meta rechaza un parámetro con saltos de línea, tabuladores o más de cuatro
// espacios seguidos: un nombre así haría fallar a ese contacto.
test('cleanValue quita saltos de línea, tabuladores y espacios repetidos', () => {
    assert.equal(cleanValue('  Ana\n\tPérez     López '), 'Ana Pérez López');
    assert.equal(cleanValue(null), '');
    assert.equal(cleanValue('x'.repeat(2000)).length, 1024);
});

test('el nombre prefiere el que puso el negocio al de WhatsApp', () => {
    assert.equal(resolveVariableValue({ source: 'name', fallback: 'cliente' }, ANA).value, 'Ana Pérez');
    assert.equal(resolveVariableValue({ source: 'name', fallback: 'cliente' }, { profileName: 'Anita' }).value, 'Anita');
    assert.equal(resolveVariableValue({ source: 'firstName', fallback: 'cliente' }, ANA).value, 'Ana');
});

test('el teléfono va con + y un dato que falta cae en la reserva', () => {
    assert.equal(resolveVariableValue({ source: 'phone', fallback: '-' }, ANA).value, '+593991112223');
    assert.deepEqual(
        resolveVariableValue({ source: 'company', fallback: 'su empresa' }, SIN_DATOS),
        { value: 'su empresa', usedFallback: true },
    );
});

test('parámetros posicionales en orden, con los botones y las reservas usadas', () => {
    const built = buildContactParameters(PROMO, CONFIG, SIN_DATOS);
    assert.deepEqual(built.parameters, ['cliente', 'toda la tienda']);
    assert.deepEqual(built.buttons, [{ index: 0, parameters: ['octubre'] }]);
    assert.deepEqual(built.fallbacks, ['1']);
});

test('parámetros con nombre como [{ name, value }]', () => {
    const template = { ...PROMO, parameterFormat: 'NAMED', bodyText: 'Hola {{nombre}} de {{empresa}}', buttons: [] };
    const built = buildContactParameters(template, {
        variables: [
            { key: 'nombre', source: 'name', fallback: 'cliente' },
            { key: 'empresa', source: 'company', fallback: 'su empresa' },
        ],
    }, ANA);
    assert.deepEqual(built.parameters, [{ name: 'nombre', value: 'Ana Pérez' }, { name: 'empresa', value: 'Ferretería Sur' }]);
    assert.deepEqual(built.fallbacks, []);
});

test('resolveContactValues da el valor de cada variable y botón y si usó la reserva', () => {
    // La vista previa resalta cada dato dentro del mensaje con esto: si una
    // clave faltara, el dato se pintaría como texto normal.
    assert.deepEqual(resolveContactValues(PROMO, CONFIG, SIN_DATOS), {
        1: { value: 'cliente', usedFallback: true },
        2: { value: 'toda la tienda', usedFallback: false },
        'button.0': { value: 'octubre', usedFallback: false },
    });
});
