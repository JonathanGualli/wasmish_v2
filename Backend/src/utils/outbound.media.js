// Los archivos que se envían desde el chat: qué admite WhatsApp, hasta qué
// tamaño y cómo se le manda cada uno. Todo puro. El frontend lo replica
// (`utils/outboundMedia.ts`) para avisar antes de subir nada; esto es lo que
// manda, por si algo se cuela.
import { matchesSignature } from './file.signature.js';
import { ETIQUETAS } from './inbound.message.js';
import { mimeBase } from './media.storage.js';

const MB = 1024 * 1024;

// El tipo de mensaje de WhatsApp de cada formato que admite.
const KIND_BY_MIME = {
    'image/jpeg': 'image',
    'image/png': 'image',
    'video/mp4': 'video',
    'video/3gpp': 'video',
    'audio/aac': 'audio',
    'audio/mp4': 'audio',
    'audio/mpeg': 'audio',
    'audio/amr': 'audio',
    'audio/ogg': 'audio',
    'application/pdf': 'document',
    'text/plain': 'document',
    'application/msword': 'document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
    'application/vnd.ms-excel': 'document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
    'application/vnd.ms-powerpoint': 'document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'document',
};

// Los de Meta, salvo los documentos: admite 100 MB y se bajan a 16 (nginx deja
// pasar 20 MB y el archivo se lee entero a memoria).
export const OUTBOUND_MAX_BYTES = { image: 5 * MB, video: 16 * MB, audio: 16 * MB, document: 16 * MB };

/** El tope de WhatsApp para el texto que acompaña a un archivo. */
export const CAPTION_MAX = 1024;

const KIND_NAMES = { image: 'La imagen', video: 'El video', audio: 'El audio', document: 'El documento' };

const formatMb = (bytes) => `${(bytes / MB).toFixed(1).replace('.', ',').replace(/,0$/, '')} MB`;

/**
 * Cómo se manda: 'image', 'video', 'audio' o 'document', o `null` si WhatsApp
 * no admite ese formato. Con `asDocument`, una imagen va como documento: llega
 * sin comprimir y admite hasta 16 MB.
 */
export const outboundMediaKind = (mimeType, { asDocument = false } = {}) => {
    const kind = KIND_BY_MIME[mimeBase(mimeType)] ?? null;
    return asDocument && kind === 'image' ? 'document' : kind;
};

/** Por qué no se puede enviar el archivo, o `null` si se puede. */
export const outboundMediaIssue = ({ mimeType, size, buffer, asDocument = false }) => {
    const kind = outboundMediaKind(mimeType, { asDocument });
    if (!kind) {
        return 'WhatsApp no admite ese tipo de archivo. Envía una imagen JPG o PNG, un video MP4, un audio o un documento (PDF, Word, Excel, PowerPoint o TXT).';
    }
    if (!size) return 'El archivo está vacío.';
    const max = OUTBOUND_MAX_BYTES[kind];
    if (size > max) return `${KIND_NAMES[kind]} pesa ${formatMb(size)} y el máximo es ${formatMb(max)}.`;
    if (buffer && !matchesSignature(mimeBase(mimeType), buffer)) {
        return 'El contenido del archivo no corresponde a su formato: puede estar dañado o tener otra extensión.';
    }
    return null;
};

/** WhatsApp no pone texto en los audios. */
export const captionAllowed = (kind) => kind !== 'audio';

/**
 * El texto del mensaje (lo que se ve en la bandeja): lo que se escribió, el
 * nombre del documento o la etiqueta del tipo, como los que llegan.
 */
export const outboundMediaText = (kind, { caption, filename }) =>
    caption || (kind === 'document' && filename) || ETIQUETAS[kind];

/** Lo que va en el mensaje a Meta dentro de `image`, `video`, `audio` o `document`. */
export const buildMediaObject = (kind, { mediaId, caption, filename }) => ({
    id: mediaId,
    ...(caption && captionAllowed(kind) ? { caption } : {}),
    ...(kind === 'document' && filename ? { filename } : {}),
});
