import test from 'node:test';
import assert from 'node:assert/strict';
import { wamidMessageKey } from '../src/utils/wamid.js';

// wamids de producción (2026-10-22), con el teléfono y el BSUID cambiados por ceros.
const ECHO_BSUID = 'wamid.HBgTUEUuMDAwMDAwMDAwMDAwMDAwMBUUABEYFjNFQjA3NTNFNjIxNzdENzlFMDA4OTMA';
const INBOUND_PHONE = 'wamid.HBgLNTE5MDAwMDAwMDAVAgASGCBBNUFCQkIwMUVGOTMxOTQ5NTA0RkEzMUMxQzc3QTk1RgA=';
const SENT_PHONE = 'wamid.HBgMNTkzMDAwMDAwMDAwFQIAERgUQ0VFQTVERDY3QkQwMzcwMTk2QjUA';

/** Un wamid con esa forma: `1C 18 <largo> <destinatario> 15 ?? 00 ?? 18 <largo> <clave> 00`. */
const wamid = (recipient, key, middle = [0x15, 0x02, 0x00, 0x11]) => 'wamid.' + Buffer.concat([
    Buffer.from([0x1c, 0x18, recipient.length]), Buffer.from(recipient, 'latin1'),
    Buffer.from([...middle, 0x18, key.length]), Buffer.from(key, 'latin1'), Buffer.from([0x00]),
]).toString('base64');

test('wamidMessageKey: la clave de los wamid reales, con teléfono o con BSUID', () => {
    assert.equal(wamidMessageKey(ECHO_BSUID), '3EB0753E62177D79E00893');
    assert.equal(wamidMessageKey(INBOUND_PHONE), 'A5ABBB01EF931949504FA31C1C77A95F');
    assert.equal(wamidMessageKey(SENT_PHONE), 'CEEA5DD67BD0370196B5');
});

// Regresión que vigila: el 2026-10-22 las reacciones del contacto a los ecos de
// la coexistencia (guardados con el wamid del BSUID) quedaron sueltas: Meta
// nombraba el original con otro wamid. Los dos tienen que dar la misma clave.
test('wamidMessageKey: el mismo mensaje con el BSUID o con el teléfono da la misma clave', () => {
    const key = '3EB0753E62177D79E00893';
    const byBsuid = wamid('PE.1000000000000000', key, [0x15, 0x14, 0x00, 0x11]);
    const byPhone = wamid('51900000000', key);
    assert.notEqual(byBsuid, byPhone);
    assert.equal(wamidMessageKey(byBsuid), key);
    assert.equal(wamidMessageKey(byPhone), key);
});

test('wamidMessageKey: lo que no tiene exactamente esa forma da null', () => {
    for (const value of [null, undefined, 42, '', 'wamid.', 'wamid.rx.3', 'wamid.dryrun.1.abc', 'HBgLNTE5MDAwMDAwMDAVAgASGCBBNUFCQkIwMUVGOTMxOTQ5NTA0RkEzMUMxQzc3QTk1RgA=']) {
        assert.equal(wamidMessageKey(value), null, String(value));
    }
    assert.equal(wamidMessageKey(INBOUND_PHONE.slice(0, -4)), null, 'cortado');
    assert.equal(wamidMessageKey(wamid('51900000000', 'ABC123')), null, 'clave demasiado corta');
    assert.equal(wamidMessageKey(wamid('51900000000', '3eb0753e62177d79e00893')), null, 'no es hexadecimal en mayúsculas');
    assert.equal(wamidMessageKey(wamid('51900000000', '3EB0753E62177D79E00893', [0x16, 0x02, 0x00, 0x11])), null, 'otro separador');
});
