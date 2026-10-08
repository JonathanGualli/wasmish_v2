import test from 'node:test';
import assert from 'node:assert/strict';

import {
    outboundMediaKind,
    outboundMediaIssue,
    outboundMediaText,
    buildMediaObject,
    captionAllowed,
    OUTBOUND_MAX_BYTES,
} from '../src/utils/outbound.media.js';
import { matchesSignature } from '../src/utils/file.signature.js';

const MB = 1024 * 1024;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PDF = Buffer.from('%PDF-1.7\n%âãÏÓ\n', 'latin1');
const MP4 = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0x00]);
const DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
const DOC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);

test('outboundMediaKind: el tipo de mensaje de WhatsApp de cada formato', () => {
    assert.equal(outboundMediaKind('image/jpeg'), 'image');
    assert.equal(outboundMediaKind('video/3gpp'), 'video');
    assert.equal(outboundMediaKind('audio/ogg; codecs=opus'), 'audio');
    assert.equal(outboundMediaKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'document');
    assert.equal(outboundMediaKind('image/heic'), null);
    assert.equal(outboundMediaKind(''), null);
});

test('outboundMediaKind: una imagen como documento, pero no al revés', () => {
    assert.equal(outboundMediaKind('image/png', { asDocument: true }), 'document');
    assert.equal(outboundMediaKind('video/mp4', { asDocument: true }), 'video');
});

test('outboundMediaIssue: formato, vacío, tamaño y firma', () => {
    assert.equal(outboundMediaIssue({ mimeType: 'image/jpeg', size: JPEG.length, buffer: JPEG }), null);
    assert.match(outboundMediaIssue({ mimeType: 'image/heic', size: 10 }), /no admite ese tipo/);
    assert.equal(outboundMediaIssue({ mimeType: 'image/jpeg', size: 0 }), 'El archivo está vacío.');
    assert.equal(
        outboundMediaIssue({ mimeType: 'image/jpeg', size: 8 * MB }),
        'La imagen pesa 8 MB y el máximo es 5 MB.',
    );
    // Un PDF con Content-Type de imagen: el tipo lo pone quien sube el archivo.
    assert.match(outboundMediaIssue({ mimeType: 'image/jpeg', size: PDF.length, buffer: PDF }), /no corresponde a su formato/);
});

test('outboundMediaIssue: una imagen grande cabe como documento, hasta 16 MB', () => {
    assert.equal(outboundMediaIssue({ mimeType: 'image/png', size: 8 * MB, asDocument: true }), null);
    assert.equal(
        outboundMediaIssue({ mimeType: 'image/png', size: 17 * MB, asDocument: true }),
        'El documento pesa 17 MB y el máximo es 16 MB.',
    );
    assert.equal(OUTBOUND_MAX_BYTES.document, 16 * MB);
});

test('matchesSignature: los formatos nuevos del chat', () => {
    assert.ok(matchesSignature('video/mp4', MP4));
    assert.ok(matchesSignature('audio/mp4', MP4));
    assert.ok(matchesSignature('audio/mpeg', Buffer.from('ID3\x04\x00', 'latin1')));
    assert.ok(matchesSignature('audio/mpeg', Buffer.from([0xff, 0xfb, 0x90, 0x00])));
    assert.ok(matchesSignature('audio/ogg', Buffer.from('OggS\x00\x02', 'latin1')));
    assert.ok(matchesSignature('audio/amr', Buffer.from('#!AMR\n', 'latin1')));
    assert.ok(matchesSignature('application/vnd.openxmlformats-officedocument.wordprocessingml.document', DOCX));
    assert.ok(matchesSignature('application/msword', DOC));
    assert.ok(matchesSignature('text/plain', Buffer.from('Lista de precios\nTaladro: 89\n')));
    // Un binario renombrado a .txt trae bytes nulos.
    assert.equal(matchesSignature('text/plain', DOC), false);
    assert.equal(matchesSignature('application/msword', DOCX), false);
    assert.equal(matchesSignature('image/heic', JPEG), false);
});

test('outboundMediaText: lo escrito, el nombre del documento o la etiqueta', () => {
    assert.equal(outboundMediaText('image', { caption: 'Así quedó', filename: 'foto.jpg' }), 'Así quedó');
    assert.equal(outboundMediaText('image', { caption: null, filename: 'foto.jpg' }), 'Imagen');
    assert.equal(outboundMediaText('document', { caption: null, filename: 'Cotización.pdf' }), 'Cotización.pdf');
    assert.equal(outboundMediaText('document', { caption: null, filename: null }), 'Documento');
    assert.equal(outboundMediaText('audio', { caption: null, filename: 'nota.mp3' }), 'Audio');
});

test('buildMediaObject: el texto solo donde WhatsApp lo admite y el nombre solo en documentos', () => {
    assert.deepEqual(buildMediaObject('image', { mediaId: '1', caption: 'Hola', filename: 'f.jpg' }), { id: '1', caption: 'Hola' });
    assert.deepEqual(buildMediaObject('audio', { mediaId: '2', caption: 'Hola', filename: 'a.mp3' }), { id: '2' });
    assert.deepEqual(
        buildMediaObject('document', { mediaId: '3', caption: null, filename: 'Cotización.pdf' }),
        { id: '3', filename: 'Cotización.pdf' },
    );
    assert.equal(captionAllowed('audio'), false);
    assert.equal(captionAllowed('document'), true);
});
