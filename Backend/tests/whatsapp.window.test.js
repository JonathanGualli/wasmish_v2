import test from 'node:test';
import assert from 'node:assert/strict';

import { getWindowExpiry, isWindowOpen, WINDOW_MS } from '../src/utils/whatsapp.window.js';

const AHORA = new Date('2026-08-31T12:00:00Z');
const haceHoras = (h) => new Date(AHORA.getTime() - h * 60 * 60 * 1000);

test('la ventana cierra 24 h después del último mensaje del cliente', () => {
    const inbound = new Date('2026-08-31T10:00:00Z');

    assert.deepEqual(getWindowExpiry(inbound), new Date('2026-09-01T10:00:00Z'));
});

test('un mensaje reciente deja la ventana abierta', () => {
    assert.equal(isWindowOpen(haceHoras(3), AHORA), true);
});

test('un mensaje de hace más de 24 h la deja cerrada', () => {
    assert.equal(isWindowOpen(haceHoras(25), AHORA), false);
});

// El límite exacto: a las 24 h clavadas ya está cerrada, no abierta.
test('a las 24 h exactas la ventana está cerrada', () => {
    const inbound = new Date(AHORA.getTime() - WINDOW_MS);

    assert.equal(isWindowOpen(inbound, AHORA), false);
});

test('un segundo antes de las 24 h sigue abierta', () => {
    const inbound = new Date(AHORA.getTime() - WINDOW_MS + 1000);

    assert.equal(isWindowOpen(inbound, AHORA), true);
});

// Contacto que nunca escribió: no hay ventana. Es el caso de las conversaciones
// creadas desde NewConversationDialog y de las viejas sin backfill.
test('sin lastInboundAt no hay ventana', () => {
    assert.equal(getWindowExpiry(null), null);
    assert.equal(getWindowExpiry(undefined), null);
    assert.equal(isWindowOpen(null, AHORA), false);
});

test('una fecha inválida se trata como sin ventana', () => {
    assert.equal(getWindowExpiry('no-es-una-fecha'), null);
    assert.equal(isWindowOpen('no-es-una-fecha', AHORA), false);
});

test('acepta el timestamp como string ISO', () => {
    assert.equal(isWindowOpen(haceHoras(1).toISOString(), AHORA), true);
});
