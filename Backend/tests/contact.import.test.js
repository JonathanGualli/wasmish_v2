import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeImportPhone, cleanImportRow, planImportRows, pickImportSample } from '../src/utils/contact.import.js';

test('los números locales toman el código del país elegido', () => {
    for (const raw of ['0991234567', '099-123-4567', '(099) 123 4567', '991234567']) {
        assert.equal(normalizeImportPhone(raw, 'EC').phone, '593991234567', raw);
    }
});

// El país por defecto es para los que no traen código: uno de Colombia en una
// lista de Ecuador no puede acabar con 593 delante.
test('los que traen código de país se respetan', () => {
    assert.equal(normalizeImportPhone('+57 300 123 4567', 'EC').phone, '573001234567');
    assert.equal(normalizeImportPhone('0057 300 123 4567', 'EC').phone, '573001234567');
    assert.equal(normalizeImportPhone('593991234567', 'EC').phone, '593991234567');
});

// Excel guarda el número como número: llega sin el 0 y como tipo number.
test('un número que Excel guardó como número también vale', () => {
    assert.equal(normalizeImportPhone(593991234567, 'EC').phone, '593991234567');
    assert.equal(normalizeImportPhone(991234567, 'EC').phone, '593991234567');
});

test('el motivo del error se dice en palabras', () => {
    assert.match(normalizeImportPhone('099123', 'EC').error, /6 dígitos: le faltan/);
    assert.match(normalizeImportPhone('099-ABC', 'EC').error, /no es un número/i);
    assert.equal(normalizeImportPhone('  ', 'EC').error, 'Sin teléfono.');
});

// La notación científica de Excel ya perdió dígitos: adivinarlos mandaría la
// campaña a otra persona.
test('la notación científica de Excel es un error, no un número', () => {
    assert.match(normalizeImportPhone('5,93991E+11', 'EC').error, /notación científica/);
    assert.match(normalizeImportPhone('5.93991e+11', 'EC').error, /notación científica/);
});

// La pantalla enseña el valor en su propia columna, al lado del motivo:
// repetirlo dentro del mensaje lo duplicaría.
test('el mensaje no repite el valor que lo causó', () => {
    for (const raw of ['099123', '099-ABC', '5,93991E+11', '022345678']) {
        const { error, warning } = normalizeImportPhone(raw, 'EC');
        assert.ok(!(error ?? warning).includes(raw), raw);
    }
});

test('un fijo se importa, con aviso', () => {
    const result = normalizeImportPhone('022345678', 'EC');
    assert.equal(result.phone, '59322345678');
    assert.match(result.warning, /fijo/);
});

// Un email mal escrito no puede costar el contacto entero.
test('solo el teléfono es error: lo demás es aviso', () => {
    const row = cleanImportRow({ row: 2, phone: '0991234567', name: 'Ana', email: 'ana@' }, 'EC');
    assert.deepEqual(row.errors, []);
    assert.equal(row.fields.email, undefined);
    assert.deepEqual(row.warnings[0], { field: 'email', message: 'No es un email válido: se importa sin email.' });
});

test('nombre y apellido se juntan, y los textos se limpian', () => {
    const row = cleanImportRow({ row: 2, phone: '0991234567', name: '  Ana ', lastName: 'Pérez\n', email: ' ANA@X.COM ', tags: 'VIP; Quito' }, 'EC');
    assert.deepEqual(row.fields, { name: 'Ana Pérez', email: 'ana@x.com' });
    assert.deepEqual(row.tagNames, ['VIP', 'Quito']);
});

test('un texto demasiado largo se recorta, con aviso', () => {
    const row = cleanImportRow({ row: 2, phone: '0991234567', company: 'x'.repeat(100) }, 'EC');
    assert.equal(row.fields.company.length, 80);
    assert.equal(row.warnings[0].field, 'company');
    assert.match(row.warnings[0].message, /se recorta/);
});

const existing = (fields) => new Map([['593991234567', { _id: 'c1', tagKeys: [], marketingOptOut: false, ...fields }]]);

// La regla de la importación: completar lo que falta, nunca pisar.
test('a un contacto existente solo se le rellena lo vacío', () => {
    const plan = planImportRows(
        [{ row: 2, phone: '0991234567', name: 'J. Pérez', email: 'juan@x.com' }],
        { country: 'EC', existingByPhone: existing({ name: 'Juan Pérez', email: null }) },
    );
    assert.equal(plan.entries[0].action, 'update');
    assert.deepEqual(plan.entries[0].fields, { email: 'juan@x.com' });
    // «Se queda el nombre que ya tiene»: lo que el archivo trae y no se aplica.
    assert.deepEqual(plan.entries[0].ignored, { name: 'J. Pérez' });
});

test('si no trae nada nuevo, queda sin cambios', () => {
    const plan = planImportRows(
        [{ row: 2, phone: '0991234567', name: 'Otro nombre', tags: 'vip' }],
        { country: 'EC', existingByPhone: existing({ name: 'Juan', tagKeys: ['vip'] }) },
    );
    assert.equal(plan.entries[0].action, 'unchanged');
    assert.equal(plan.summary.unchanged, 1);
});

test('las etiquetas del archivo y las de todos se suman sin repetir', () => {
    const plan = planImportRows(
        [{ row: 2, phone: '0991234567', tags: 'VIP, Quito' }],
        { country: 'EC', extraTagNames: ['Feria octubre', 'vip'] },
    );
    assert.deepEqual(plan.entries[0].tagNames, ['VIP', 'Quito', 'Feria octubre']);
});

// El mismo número escrito de dos formas es la misma persona: dos contactos
// romperían el índice único y la campaña le llegaría dos veces.
test('los repetidos en el archivo se juntan: gana el primer valor no vacío', () => {
    const plan = planImportRows([
        { row: 2, phone: '0991234567', name: 'Ana' },
        { row: 3, phone: '+593 99 123 4567', name: 'Ana María', email: 'ana@x.com', tags: 'VIP' },
    ], { country: 'EC' });
    assert.equal(plan.entries.length, 1);
    assert.deepEqual(plan.entries[0].rows, [2, 3]);
    assert.deepEqual(plan.entries[0].fields, { name: 'Ana', email: 'ana@x.com' });
    assert.deepEqual(plan.entries[0].tagNames, ['VIP']);
    assert.equal(plan.summary.duplicates, 1);
});

test('las filas con error no entran en el plan y se cuentan', () => {
    const plan = planImportRows([
        { row: 2, phone: '099123' },
        { row: 3, phone: '0991234567' },
    ], { country: 'EC' });
    assert.equal(plan.entries.length, 1);
    assert.equal(plan.summary.errors, 1);
    assert.deepEqual(plan.issues.map(i => [i.row, i.type, i.field]), [[2, 'error', 'phone']]);
});

test('no se pasa del máximo de etiquetas de un contacto existente', () => {
    const tagKeys = Array.from({ length: 19 }, (_, i) => `t${i}`);
    const plan = planImportRows(
        [{ row: 2, phone: '0991234567', tags: 'VIP, Quito' }],
        { country: 'EC', existingByPhone: existing({ tagKeys }) },
    );
    assert.deepEqual(plan.entries[0].tagNames, ['VIP']);
    assert.match(plan.issues[0].message, /no caben/);
});

test('se cuentan los existentes que pidieron no recibir publicidad', () => {
    const plan = planImportRows(
        [{ row: 2, phone: '0991234567' }],
        { country: 'EC', existingByPhone: existing({ marketingOptOut: true }) },
    );
    assert.equal(plan.summary.optedOutExisting, 1);
});

const sampleRows = [
    { row: 2, phone: '0991111111', name: 'Nuevo uno' },
    { row: 3, phone: '0992222222', name: 'Nuevo dos' },
    { row: 4, phone: '0993333333', name: 'Nuevo tres' },
    { row: 5, phone: '0994444444', email: 'roto@' },
    { row: 6, phone: '0991234567', name: 'J. Pérez', email: 'juan@x.com' },
];

// Los primeros por orden serían tres nuevos iguales: la muestra tiene que
// enseñar lo que hay que revisar, un contacto que se completa y uno con aviso.
test('la muestra trae uno que se completa y uno con aviso, por orden de fila', () => {
    const existingByPhone = existing({ name: 'Juan Pérez', email: null, tagNames: ['Quito'] });
    const plan = planImportRows(sampleRows, { country: 'EC', existingByPhone });
    const sample = pickImportSample(plan, existingByPhone, 3);
    assert.deepEqual(sample.map(s => s.rows[0]), [2, 5, 6]);
    assert.deepEqual(sample.map(s => s.action), ['create', 'create', 'update']);
});

test('en la muestra, el existente trae lo que ya tiene', () => {
    const existingByPhone = existing({ name: 'Juan Pérez', email: null, tagNames: ['Quito'] });
    const plan = planImportRows(sampleRows, { country: 'EC', existingByPhone });
    const updated = pickImportSample(plan, existingByPhone, 3).find(s => s.action === 'update');
    assert.deepEqual(updated.current, { name: 'Juan Pérez', email: null, company: null, tagNames: ['Quito'] });
    assert.deepEqual(updated.fields, { email: 'juan@x.com' });
    assert.equal(pickImportSample(plan, existingByPhone, 3)[0].current, null);
});

test('los sin cambios no salen en la muestra', () => {
    const existingByPhone = existing({ name: 'Juan' });
    const plan = planImportRows([{ row: 2, phone: '0991234567', name: 'Juan' }], { country: 'EC', existingByPhone });
    assert.deepEqual(pickImportSample(plan, existingByPhone, 3), []);
});
