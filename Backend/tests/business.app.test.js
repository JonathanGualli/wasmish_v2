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

test('sin id o sin destinatario (ni teléfono ni BSUID), se descarta', () => {
    assert.equal(describeEcho(echo({ id: undefined })), null);
    assert.equal(describeEcho(echo({ to: undefined })), null);
    assert.equal(describeEcho(echo({ to: '' })), null);
    assert.equal(describeEcho(echo({ to: undefined, to_user_id: '  ' })), null);
    assert.equal(describeEcho(null), null);
});

// Regresión que vigila: Meta omite `to` si la persona tiene nombre de usuario y
// no comparte su teléfono, y esos ecos se descartaban en silencio (2026-10-19).
test('sin teléfono pero con BSUID (to_user_id), el eco se guarda', () => {
    const result = describeEcho(echo({ to: undefined, to_user_id: 'CO.1830780421280372' }));
    assert.equal(result.toPhone, null);
    assert.equal(result.toUserId, 'CO.1830780421280372');
});

test('con teléfono y BSUID, llegan los dos', () => {
    const result = describeEcho(echo({ to_user_id: 'CO.1433329108757971' }));
    assert.equal(result.toPhone, '593990001111');
    assert.equal(result.toUserId, 'CO.1433329108757971');
});

test('el teléfono del cliente, solo con dígitos (Meta lo manda con y sin +)', () => {
    assert.equal(describeEcho(echo({ to: '+593 99 000 1111' })).toPhone, '593990001111');
});

// Regresión que vigila (diagnóstico de Codex): un `to` con forma de BSUID se
// convertía en un teléfono inventado («CO.1830…» → «1830…»).
test('un to con letras no es un teléfono', () => {
    assert.equal(describeEcho(echo({ to: 'CO.1830780421280372' })), null);
    const withBsuid = describeEcho(echo({ to: 'CO.1830780421280372', to_user_id: 'CO.1830780421280372' }));
    assert.equal(withBsuid.toPhone, null);
    assert.equal(withBsuid.toUserId, 'CO.1830780421280372');
});

// Regresión que vigila: un número que pasó a otra cuenta recibía ahí un eco viejo de la anterior.
test('un eco anterior a la conexión de la línea se descarta', () => {
    const connectedAt = new Date(1760630500 * 1000);
    assert.equal(describeEcho(echo(), { connectedAt }), null);
    assert.ok(describeEcho(echo({ timestamp: '1760630600' }), { connectedAt }));
    assert.ok(describeEcho(echo(), { connectedAt: null }), 'sin fecha de conexión (la reserva de User) no filtra');
});

// Regresión que vigila (revisión de Codex del PR #79): conectar a las 12:00:00.100 y responder a las
// 12:00:00.900 da un eco de las 12:00:00 (Meta manda segundos) que se descartaba.
test('un eco del mismo segundo de la conexión se conserva', () => {
    assert.ok(describeEcho(echo({ timestamp: '1760630400' }), { connectedAt: new Date(1760630400 * 1000 + 100) }));
    assert.equal(describeEcho(echo({ timestamp: '1760630399' }), { connectedAt: new Date(1760630400 * 1000 + 100) }), null);
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

// --- PARTNER_REMOVED (account_update) ---

const { parsePartnerRemoved, isStalePartnerRemoval } = await import('../src/utils/business.app.js');

// El ejemplo de la referencia de Meta: `entry.id` NO es el WABA.
const removedEntry = { id: '2949482758682047', time: 1748477359 };
const removedChange = (value = {}) => ({ field: 'account_update', value: {
    event: 'PARTNER_REMOVED', waba_info: { waba_id: '980198427658004', owner_business_id: '2329417887457253' },
    disconnection_info: { reason: 'PRIMARY_INACTIVITY', initiated_by: 'SYSTEM' }, ...value,
} });

// Regresión que vigila: el primer diseño tomaba el WABA de `entry.id`, que en el ejemplo de Meta es otro.
test('parsePartnerRemoved: el WABA de waba_info, la hora de entry.time y el motivo', () => {
    const removal = parsePartnerRemoved(removedEntry, removedChange());
    assert.equal(removal.waBusinessId, '980198427658004');
    assert.equal(removal.reason, 'PRIMARY_INACTIVITY');
    assert.equal(removal.initiatedBy, 'SYSTEM');
    assert.equal(removal.at.getTime(), 1748477359 * 1000);
});

test('parsePartnerRemoved: sin disconnection_info (un cliente normal), el motivo es null', () => {
    const removal = parsePartnerRemoved(removedEntry, removedChange({ disconnection_info: undefined }));
    assert.equal(removal.reason, null);
    assert.equal(removal.initiatedBy, null);
});

test('parsePartnerRemoved: otro evento, otro campo o sin waba_info → null', () => {
    assert.equal(parsePartnerRemoved(removedEntry, removedChange({ event: 'ACCOUNT_OFFBOARDED' })), null);
    assert.equal(parsePartnerRemoved(removedEntry, { ...removedChange(), field: 'messages' }), null);
    assert.equal(parsePartnerRemoved(removedEntry, removedChange({ waba_info: undefined })), null);
    assert.equal(parsePartnerRemoved(null, null), null);
});

test('isStalePartnerRemoval: un aviso anterior o del mismo segundo que la última conexión es viejo', () => {
    const authorizedAt = new Date('2026-10-16T12:00:00.500Z');
    assert.equal(isStalePartnerRemoval(new Date('2026-10-16T11:59:59Z'), authorizedAt), true);
    assert.equal(isStalePartnerRemoval(new Date('2026-10-16T12:00:00Z'), authorizedAt), true);
    assert.equal(isStalePartnerRemoval(new Date('2026-10-16T12:00:01Z'), authorizedAt), false);
    assert.equal(isStalePartnerRemoval(new Date('2026-10-16T12:00:00Z'), null), false, 'un Waba sin authorizedAt aplica el evento');
});
