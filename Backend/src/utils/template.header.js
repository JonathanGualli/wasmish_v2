// La cabecera de una plantilla: qué pide Meta al enviarla y cómo se le manda.
// Todo puro. Lo usan la sincronización, el envío (`processTemplateSending`), la
// validación de las campañas y la subida de la imagen en Plantillas.
//
// Meta aprueba el FORMATO de la cabecera (imagen, vídeo, documento, texto), no
// su contenido: la imagen es un parámetro que va en cada envío, igual que las
// variables del cuerpo. La imagen de ejemplo de la plantilla solo sirve para la
// revisión y no se envía sola; sin parámetro Meta responde 132012
// («expected IMAGE, received UNKNOWN»). Por eso cada plantilla con archivo en la
// cabecera tiene en Wasmish su archivo guardado (`TemplateMedia`).

import { matchesSignature } from './file.signature.js';

/** Formatos de cabecera que llevan un archivo. */
export const MEDIA_HEADER_FORMATS = ['IMAGE', 'VIDEO', 'DOCUMENT'];

// Qué archivo admite cada formato y hasta qué tamaño. Los límites de Meta son
// 5 MB para imágenes y 16 MB para vídeos; el de documentos (100 MB) se baja a
// 16 MB a propósito: el mismo PDF viaja a cada destinatario.
export const HEADER_MEDIA_RULES = {
    IMAGE: { mimeTypes: ['image/jpeg', 'image/png'], maxBytes: 5 * 1024 * 1024, label: 'imagen', article: 'una', upload: 'Súbela' },
    VIDEO: { mimeTypes: ['video/mp4', 'video/3gpp'], maxBytes: 16 * 1024 * 1024, label: 'vídeo', article: 'un', upload: 'Súbelo' },
    DOCUMENT: { mimeTypes: ['application/pdf'], maxBytes: 16 * 1024 * 1024, label: 'documento', article: 'un', upload: 'Súbelo' },
};

// El id de un archivo subido a Meta dura 30 días. Se vuelve a subir antes, para
// no descubrir que caducó a mitad de una campaña.
export const META_MEDIA_TTL_MS = 25 * 24 * 60 * 60 * 1000;

const HAS_VARIABLE = /\{\{\s*[^}]+?\s*\}\}/;

/**
 * La cabecera tal como se guarda, desde los `components` que devuelve Meta:
 * `{ format, text }` o `null` si la plantilla no tiene. `text` solo en las de
 * texto.
 */
export const extractTemplateHeader = (components = []) => {
    const header = components.find(c => c?.type === 'HEADER');
    if (!header?.format) return null;
    return {
        format: String(header.format).toUpperCase(),
        text: header.format === 'TEXT' ? header.text ?? '' : null,
    };
};

/** Las reglas del archivo que pide la cabecera, o `null` si no pide ninguno. */
export const headerMediaRule = (template) =>
    HEADER_MEDIA_RULES[template?.header?.format] ?? null;

/**
 * Por qué no se puede enviar la plantilla por su cabecera, o `null` si se
 * puede. Una plantilla sincronizada antes de guardar la cabecera
 * (`header === undefined`) se deja pasar: no se sabe, y bloquear un envío que
 * funcionaba sería peor.
 */
export const templateHeaderIssue = (template) => {
    const header = template?.header;
    if (!header) return null;

    const rule = HEADER_MEDIA_RULES[header.format];
    if (rule) {
        return template.headerMedia
            ? null
            : `La plantilla lleva ${rule.article} ${rule.label} en la cabecera y no tiene ${rule.article === 'una' ? 'ninguna guardada' : 'ninguno guardado'}. ${rule.upload} en Plantillas.`;
    }
    if (header.format === 'TEXT') {
        return HAS_VARIABLE.test(header.text ?? '')
            ? 'La plantilla tiene una variable en la cabecera: todavía no se puede enviar desde Wasmish.'
            : null;
    }
    if (header.format === 'LOCATION') {
        return 'La plantilla lleva una ubicación en la cabecera: todavía no se puede enviar desde Wasmish.';
    }
    return `La plantilla tiene una cabecera de tipo ${header.format}, que Wasmish no sabe enviar.`;
};

/**
 * Por qué no sirve un archivo ya guardado (`TemplateMedia`) para la cabecera de
 * esta plantilla, o `null` si sirve. Es el caso de elegir, para un envío
 * concreto, un archivo distinto del de la plantilla: hay que comprobar que es
 * del formato que pide (una imagen no vale para una cabecera de vídeo).
 */
export const headerMediaMismatch = (template, media) => {
    const rule = headerMediaRule(template);
    if (!rule) return 'La cabecera de esta plantilla no lleva ningún archivo.';
    if (!media) return 'El archivo de la cabecera no existe en tu cuenta.';
    return rule.mimeTypes.includes(media.mimeType)
        ? null
        : `La cabecera pide ${rule.article} ${rule.label}: el archivo elegido no lo es.`;
};

/**
 * El componente `header` para Meta con el id del archivo subido. El documento
 * lleva su nombre: es el que ve el contacto al abrirlo.
 */
export const buildHeaderComponent = (format, { mediaId, filename } = {}) => {
    const kind = String(format).toLowerCase();
    const media = { id: String(mediaId) };
    if (kind === 'document' && filename) media.filename = filename;
    return { type: 'header', parameters: [{ type: kind, [kind]: media }] };
};

/**
 * ¿Sirve el id que ya se subió a Meta? Caduca, y es de un número concreto: si
 * la cuenta conectó otro, hay que volver a subirlo.
 */
export const isMetaMediaFresh = (media, phoneNumberId, now = new Date()) =>
    Boolean(media?.metaMediaId)
    && media.metaPhoneNumberId === phoneNumberId
    && media.metaUploadedAt instanceof Date
    && now.getTime() - media.metaUploadedAt.getTime() < META_MEDIA_TTL_MS;

/**
 * Por qué no vale el archivo para la cabecera de la plantilla, o `null` si
 * vale. Se mira el formato que pide la cabecera, el tipo, el tamaño y que el
 * contenido sea de verdad de ese tipo.
 */
export const headerMediaFileIssue = (template, { mimeType, size, buffer }) => {
    const rule = headerMediaRule(template);
    if (!rule) return 'La cabecera de esta plantilla no lleva ningún archivo.';

    const type = String(mimeType ?? '').split(';')[0].trim().toLowerCase();
    if (!rule.mimeTypes.includes(type)) {
        const formats = rule.mimeTypes.map(m => m.split('/')[1].toUpperCase()).join(' o ');
        return `La cabecera pide ${rule.article} ${rule.label}: sube un archivo ${formats}.`;
    }
    if (!size) return 'El archivo está vacío.';
    if (size > rule.maxBytes) {
        return `${rule.article === 'una' ? 'La' : 'El'} ${rule.label} pesa demasiado: el máximo es ${rule.maxBytes / (1024 * 1024)} MB.`;
    }
    if (buffer && !matchesSignature(type, buffer)) {
        return `El archivo no es un ${type.split('/')[1].toUpperCase()} válido.`;
    }
    return null;
};
