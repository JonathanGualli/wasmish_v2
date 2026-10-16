import test from 'node:test';
import assert from 'node:assert/strict';
import { describeEcho, ECHO_IGNORED_TYPES } from '../src/utils/business.app.js';

// Un eco de `smb_message_echoes`, con la forma de la referencia de Meta.
const echo = (overrides = {}) => ({
    from: '15550783881', to: '593990001111', id: 'wamid.eco.1', timestamp: '1760630400', type: 'text',
    text: { body: 'Hola, ya te paso el precio' }, ...overrides,
});

test('un eco de texto: el id, el teléfono del cliente, la hora en segundos y su contenido', () => {
    const result = describeEcho(echo());
    assert.equal(result.waMessageId, 'wamid.eco.1');
    assert.equal(result.toPhone, '593990001111');
    assert.equal(result.timestamp.getTime(), 1760630400 * 1000);
    assert.equal(result.entrante.type, 'text');
    assert.equal(result.entrante.text, 'Hola, ya te paso el precio');
});

test('una foto con pie: el texto es el pie y conserva el archivo de Meta', () => {
    const result = describeEcho(echo({ type: 'image', text: undefined, image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'El horario' } }));
    assert.equal(result.entrante.type, 'image');
    assert.equal(result.entrante.text, 'El horario');
    assert.equal(result.entrante.mediaId, 'media-1');
});

test('un video y un documento, con su etiqueta o su nombre', () => {
    assert.equal(describeEcho(echo({ type: 'video', text: undefined, video: { id: 'media-2' } })).entrante.type, 'video');
    const doc = describeEcho(echo({ type: 'document', text: undefined, document: { id: 'media-3', filename: 'Temario.pdf' } }));
    assert.equal(doc.entrante.text, 'Temario.pdf');
    assert.equal(doc.entrante.filename, 'Temario.pdf');
});

test('las ediciones y eliminaciones desde la app no se guardan en esta versión', () => {
    assert.deepEqual(ECHO_IGNORED_TYPES, ['edit', 'revoke']);
    for (const type of ECHO_IGNORED_TYPES) assert.equal(describeEcho(echo({ type, text: undefined, [type]: {} })), null, type);
});

test('sin id o sin destinatario, se descarta', () => {
    assert.equal(describeEcho(echo({ id: undefined })), null);
    assert.equal(describeEcho(echo({ to: undefined })), null);
    assert.equal(describeEcho(echo({ to: '' })), null);
    assert.equal(describeEcho(null), null);
});

test('el teléfono del cliente, solo con dígitos (Meta lo manda con y sin +)', () => {
    assert.equal(describeEcho(echo({ to: '+593 99 000 1111' })).toPhone, '593990001111');
});

// Regresión que vigila: un número que pasó a otra cuenta recibía ahí un eco viejo de la anterior.
test('un eco anterior a la conexión de la línea se descarta', () => {
    const connectedAt = new Date(1760630500 * 1000);
    assert.equal(describeEcho(echo(), { connectedAt }), null);
    assert.ok(describeEcho(echo({ timestamp: '1760630600' }), { connectedAt }));
    assert.ok(describeEcho(echo(), { connectedAt: null }), 'sin fecha de conexión (la reserva de User) no filtra');
});

test('un tipo desconocido no se descarta y nunca queda con el texto vacío', () => {
    const result = describeEcho(echo({ type: 'algo_nuevo', text: undefined }));
    assert.ok(result);
    assert.ok(result.entrante.text.length > 0);
});

test('sin timestamp válido, la hora es la de ahora', () => {
    const before = Date.now();
    const result = describeEcho(echo({ timestamp: undefined }));
    assert.ok(result.timestamp.getTime() >= before);
});
