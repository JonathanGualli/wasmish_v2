import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isMessageChange, describeMessageChange, serializeMessageChange, DELETED_PREVIEW,
} from '../src/utils/message.change.js';

// Las formas de la referencia de Meta (webhooks `revoke`, `edit` y `smb_message_echoes`, revisadas el 2026-10-20).
const revoke = (overrides = {}) => ({
    from: '16505551234', id: 'wamid.revoke.1', timestamp: '1750090702', type: 'revoke',
    revoke: { original_message_id: 'wamid.original.1' }, ...overrides,
});
const edit = (message, overrides = {}) => ({
    from: '16505551234', id: 'wamid.edit.1', timestamp: '1750090702', type: 'edit',
    edit: { original_message_id: 'wamid.original.1', message }, ...overrides,
});

test('isMessageChange: revoke y edit, con cualquier contenido; nada más', () => {
    assert.equal(isMessageChange({ type: 'revoke' }), true);
    assert.equal(isMessageChange({ type: 'edit' }), true);
    assert.equal(isMessageChange({ type: 'edit', edit: {} }), true);
    assert.equal(isMessageChange({ type: 'text' }), false);
    assert.equal(isMessageChange({}), false);
    assert.equal(isMessageChange(null), false);
});

test('un borrado entrante: el id del evento, el del original y la hora del webhook', () => {
    assert.deepEqual(describeMessageChange(revoke()), {
        kind: 'revoke',
        waMessageId: 'wamid.revoke.1',
        originalWaMessageId: 'wamid.original.1',
        timestamp: new Date(1750090702 * 1000),
        content: null,
    });
});

test('un borrado de eco (con to, sin from) se lee igual', () => {
    const change = describeMessageChange(revoke({ from: '15550783881', to: '16505551234' }));
    assert.equal(change.kind, 'revoke');
    assert.equal(change.originalWaMessageId, 'wamid.original.1');
});

test('una edición de texto: el texto nuevo, recortado', () => {
    const change = describeMessageChange(edit({ type: 'text', text: { body: '  hola  ' } }));
    assert.equal(change.kind, 'edit');
    assert.deepEqual(change.content, { type: 'text', text: 'hola', caption: null });
});

test('la edición del pie de una foto (el ejemplo de eco de Meta, con context M0)', () => {
    const change = describeMessageChange(edit({
        context: { id: 'M0' },
        type: 'image',
        image: { caption: 'Updated image caption', mime_type: 'image/jpeg', sha256: 'abc', id: '1234567890', url: 'https://lookaside.test/x' },
    }, { from: '15550783881', to: '16505551234' }));
    assert.deepEqual(change.content, { type: 'image', text: 'Updated image caption', caption: 'Updated image caption' });
});

test('una foto sin pie: el texto es la etiqueta y el pie null', () => {
    const change = describeMessageChange(edit({ type: 'image', image: { id: '1' } }));
    assert.deepEqual(change.content, { type: 'image', text: 'Imagen', caption: null });
});

test('un documento sin pie: el texto es el nombre del archivo', () => {
    const change = describeMessageChange(edit({ type: 'document', document: { id: '1', filename: 'Temario.pdf' } }));
    assert.deepEqual(change.content, { type: 'document', text: 'Temario.pdf', caption: null });
});

test('un video con pie', () => {
    const change = describeMessageChange(edit({ type: 'video', video: { id: '1', caption: ' El curso ' } }));
    assert.deepEqual(change.content, { type: 'video', text: 'El curso', caption: 'El curso' });
});

// Regresión que vigila (revisión de Codex del spec, 3): `describeInboundMessage` nunca devuelve vacío, y una
// edición rota se habría guardado como «Mensaje no compatible» encima del texto bueno.
test('mal formados → null', () => {
    assert.equal(describeMessageChange(revoke({ revoke: {} })), null, 'revoke sin original_message_id');
    assert.equal(describeMessageChange(revoke({ revoke: undefined })), null, 'revoke sin revoke');
    assert.equal(describeMessageChange(revoke({ id: undefined })), null, 'sin id');
    assert.equal(describeMessageChange(edit({ type: 'text', text: { body: 'x' } }, { edit: { message: { type: 'text', text: { body: 'x' } } } })), null, 'edit sin original_message_id');
    assert.equal(describeMessageChange(edit(undefined)), null, 'edit sin message');
    assert.equal(describeMessageChange(edit({ type: 'text', text: { body: '' } })), null, 'texto vacío');
    assert.equal(describeMessageChange(edit({ type: 'text', text: { body: '   ' } })), null, 'texto con espacios');
    assert.equal(describeMessageChange(edit({ type: 'text' })), null, 'texto sin text');
    for (const type of ['sticker', 'audio', 'location', 'foo']) {
        assert.equal(describeMessageChange(edit({ type, [type]: { id: '1' } })), null, type);
    }
    assert.equal(describeMessageChange(null), null);
    assert.equal(describeMessageChange({ type: 'text', text: { body: 'hola' } }), null, 'no es un cambio');
});

test('sin timestamp válido, la hora es la de ahora', () => {
    const before = Date.now();
    assert.ok(describeMessageChange(revoke({ timestamp: undefined })).timestamp.getTime() >= before);
});

test('serializeMessageChange: un mensaje sin los campos', () => {
    assert.deepEqual(serializeMessageChange({ text: 'hola' }), {
        deletedAt: null, editedAt: null, previousVersions: [], changeVersion: 0,
    });
});

test('serializeMessageChange: fechas en ISO, versiones en orden de llegada y su changeVersion', () => {
    const msg = {
        deletedAt: new Date('2026-10-20T10:05:00Z'),
        editedAt: new Date('2026-10-20T10:02:00Z'),
        previousVersions: [
            { text: 'uno', caption: null, editedAt: new Date('2026-10-20T10:00:00Z') },
            { text: 'dos', caption: null, editedAt: new Date('2026-10-20T10:01:00Z') },
        ],
        changeVersion: 3,
    };
    assert.deepEqual(serializeMessageChange(msg), {
        deletedAt: '2026-10-20T10:05:00.000Z',
        editedAt: '2026-10-20T10:02:00.000Z',
        previousVersions: [
            { text: 'uno', caption: null, editedAt: '2026-10-20T10:00:00.000Z' },
            { text: 'dos', caption: null, editedAt: '2026-10-20T10:01:00.000Z' },
        ],
        changeVersion: 3,
    });
});

test('la vista previa de un eliminado', () => {
    assert.equal(DELETED_PREVIEW, 'Mensaje eliminado');
});
