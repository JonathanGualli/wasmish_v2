import test from 'node:test';
import assert from 'node:assert/strict';

import { extensionParaMime, mimeParaServir, nombreDeArchivo, rutaDeArchivo } from '../src/utils/media.storage.js';

test('la extensión sale del mime, ignorando sus parámetros', () => {
    // Meta manda las notas de voz como "audio/ogg; codecs=opus".
    assert.equal(extensionParaMime('audio/ogg; codecs=opus'), 'ogg');
    assert.equal(extensionParaMime('image/jpeg'), 'jpg');
    assert.equal(extensionParaMime('APPLICATION/PDF'), 'pdf');
});

// Un mime que no conocemos no puede acabar con una extensión que el navegador
// interprete: .bin se descarga, no se ejecuta.
test('un mime desconocido cae a .bin y a octet-stream', () => {
    assert.equal(extensionParaMime('application/x-lo-que-sea'), 'bin');
    assert.equal(extensionParaMime(undefined), 'bin');
    assert.equal(mimeParaServir('text/html'), 'application/octet-stream');
    assert.equal(mimeParaServir('image/svg+xml'), 'application/octet-stream');
});

test('el mime de servir se normaliza al base conocido', () => {
    assert.equal(mimeParaServir('audio/ogg; codecs=opus'), 'audio/ogg');
    assert.equal(mimeParaServir('image/jpeg'), 'image/jpeg');
});

test('el nombre del archivo es el mediaId más su extensión', () => {
    assert.equal(nombreDeArchivo('1394259169526600', 'application/pdf'), '1394259169526600.pdf');
});

// El mediaId viene de un payload externo. Si algún día llega algo que no son
// dígitos, no debe convertirse nunca en una ruta.
test('un mediaId que no son solo dígitos se rechaza', () => {
    assert.equal(nombreDeArchivo('../../etc/passwd', 'image/jpeg'), null);
    assert.equal(nombreDeArchivo('123/456', 'image/jpeg'), null);
    assert.equal(nombreDeArchivo('', 'image/jpeg'), null);
    assert.equal(nombreDeArchivo(null, 'image/jpeg'), null);
});

test('ninguna ruta puede salirse del directorio de medios', () => {
    assert.equal(rutaDeArchivo('/var/media', '../../etc/passwd'), null);
    assert.equal(rutaDeArchivo('/var/media', '/etc/passwd'), null);
    assert.equal(rutaDeArchivo('/var/media', '123.jpg'), '/var/media/123.jpg');
});
