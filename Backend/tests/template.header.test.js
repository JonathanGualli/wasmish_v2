import test from 'node:test';
import assert from 'node:assert/strict';

import {
    extractTemplateHeader,
    templateHeaderIssue,
    buildHeaderComponent,
    isMetaMediaFresh,
    headerMediaFileIssue,
    META_MEDIA_TTL_MS,
} from '../src/utils/template.header.js';
import { validateCampaignMessage } from '../src/utils/campaign.message.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const PDF = Buffer.from('%PDF-1.7\n%âãÏÓ\n', 'latin1');

const CON_IMAGEN = { header: { format: 'IMAGE', text: null }, headerMedia: null };

test('extractTemplateHeader: guarda el formato, y el texto solo en las de texto', () => {
    assert.deepEqual(
        extractTemplateHeader([{ type: 'HEADER', format: 'IMAGE', example: { header_handle: ['https://scontent…'] } }, { type: 'BODY', text: 'Hola' }]),
        { format: 'IMAGE', text: null },
    );
    assert.deepEqual(extractTemplateHeader([{ type: 'HEADER', format: 'TEXT', text: 'Oferta {{1}}' }]), { format: 'TEXT', text: 'Oferta {{1}}' });
    // Sin cabecera es null, no undefined: undefined marca «sincronizada antes
    // de guardar la cabecera» y dispara otra sincronización.
    assert.equal(extractTemplateHeader([{ type: 'BODY', text: 'Hola' }]), null);
    assert.equal(extractTemplateHeader(undefined), null);
});

test('templateHeaderIssue: la imagen de la cabecera tiene que estar guardada', () => {
    // La regresión: Meta respondía 132012 («expected IMAGE, received UNKNOWN»)
    // a cada destinatario porque la cabecera nunca se enviaba.
    assert.equal(templateHeaderIssue(CON_IMAGEN), 'La plantilla lleva una imagen en la cabecera y no tiene ninguna guardada. Súbela en Plantillas.');
    assert.equal(templateHeaderIssue({ ...CON_IMAGEN, headerMedia: 'media-id' }), null);
    assert.match(templateHeaderIssue({ header: { format: 'DOCUMENT' } }), /documento/);
});

test('templateHeaderIssue: texto fijo pasa; variable y ubicación se bloquean con su motivo', () => {
    assert.equal(templateHeaderIssue({ header: { format: 'TEXT', text: 'Nuevos horarios' } }), null);
    assert.match(templateHeaderIssue({ header: { format: 'TEXT', text: 'Hola {{1}}' } }), /variable en la cabecera/);
    assert.match(templateHeaderIssue({ header: { format: 'LOCATION' } }), /ubicación/);
});

test('templateHeaderIssue: sin cabecera, o sin saber si la tiene, no bloquea', () => {
    assert.equal(templateHeaderIssue({ header: null }), null);
    // Sincronizada antes de guardar la cabecera: bloquear rompería envíos que
    // funcionaban (la API pública de un cliente, por ejemplo).
    assert.equal(templateHeaderIssue({ bodyText: 'Hola' }), null);
    assert.equal(templateHeaderIssue(null), null);
});

test('buildHeaderComponent: el formato que espera Meta, con nombre solo en documentos', () => {
    assert.deepEqual(buildHeaderComponent('IMAGE', { mediaId: '123', filename: 'promo.jpg' }), {
        type: 'header', parameters: [{ type: 'image', image: { id: '123' } }],
    });
    assert.deepEqual(buildHeaderComponent('DOCUMENT', { mediaId: '9', filename: 'catalogo.pdf' }), {
        type: 'header', parameters: [{ type: 'document', document: { id: '9', filename: 'catalogo.pdf' } }],
    });
});

test('isMetaMediaFresh: se reutiliza el id del mismo número mientras no caduque', () => {
    const now = new Date('2026-10-04T12:00:00Z');
    const media = { metaMediaId: 'm1', metaPhoneNumberId: '111', metaUploadedAt: new Date(now.getTime() - 24 * 3600 * 1000) };
    assert.equal(isMetaMediaFresh(media, '111', now), true);
    // Otro número (la cuenta conectó otro): el id no le sirve.
    assert.equal(isMetaMediaFresh(media, '222', now), false);
    // Cerca de los 30 días de Meta: se vuelve a subir antes de que falle.
    assert.equal(isMetaMediaFresh({ ...media, metaUploadedAt: new Date(now.getTime() - META_MEDIA_TTL_MS) }, '111', now), false);
    assert.equal(isMetaMediaFresh({ metaMediaId: null }, '111', now), false);
});

test('headerMediaFileIssue: tipo, tamaño y contenido de verdad', () => {
    assert.equal(headerMediaFileIssue(CON_IMAGEN, { mimeType: 'image/jpeg', size: JPEG.length, buffer: JPEG }), null);
    assert.equal(headerMediaFileIssue(CON_IMAGEN, { mimeType: 'image/png', size: PNG.length, buffer: PNG }), null);
    assert.match(headerMediaFileIssue(CON_IMAGEN, { mimeType: 'application/pdf', size: PDF.length, buffer: PDF }), /JPEG o PNG/);
    assert.match(headerMediaFileIssue(CON_IMAGEN, { mimeType: 'image/jpeg', size: 6 * 1024 * 1024, buffer: JPEG }), /máximo es 5 MB/);
    // Un PDF con Content-Type de imagen: el tipo lo pone quien sube.
    assert.match(headerMediaFileIssue(CON_IMAGEN, { mimeType: 'image/jpeg', size: PDF.length, buffer: PDF }), /no es un JPEG válido/);
    assert.match(headerMediaFileIssue(CON_IMAGEN, { mimeType: 'image/jpeg', size: 0, buffer: Buffer.alloc(0) }), /vacío/);
    assert.equal(headerMediaFileIssue({ header: { format: 'DOCUMENT' } }, { mimeType: 'application/pdf', size: PDF.length, buffer: PDF }), null);
    assert.match(headerMediaFileIssue({ header: null }, { mimeType: 'image/jpeg', size: 4, buffer: JPEG }), /no lleva ningún archivo/);
});

test('validateCampaignMessage: una campaña no se crea sin el archivo de la cabecera', () => {
    const template = { status: 'APPROVED', category: 'MARKETING', bodyText: 'Hola', buttons: [], ...CON_IMAGEN };
    assert.deepEqual(validateCampaignMessage(template, {}).map(e => e.field), ['templateId']);
    assert.deepEqual(validateCampaignMessage({ ...template, headerMedia: 'media-id' }, {}), []);
});
