// Los primeros bytes de cada formato que se envía por WhatsApp. El Content-Type
// lo pone quien sube el archivo; esto comprueba que lo que llega es de verdad lo
// que dice ser. Puro: lo usan la cabecera de las plantillas y los archivos del chat.

const startsWith = (buffer, bytes, offset = 0) =>
    buffer.length >= offset + bytes.length
    && buffer.subarray(offset, offset + bytes.length).equals(Buffer.from(bytes));

const startsWithText = (buffer, text, offset = 0) =>
    startsWith(buffer, [...Buffer.from(text, 'latin1')], offset);

// MP4, 3GP y M4A son contenedores ISO: «ftyp» en el byte 4.
const isIsoMedia = (b) => b.length > 12 && startsWithText(b, 'ftyp', 4);

// Los de Office modernos son ZIP; los antiguos (.doc, .xls, .ppt), OLE.
const isZip = (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]);
const isOle = (b) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

// Un MP3 empieza por su etiqueta ID3 o, sin ella, por la sincronía de un frame.
const isMp3 = (b) => startsWithText(b, 'ID3') || (b.length > 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0);

// AAC suelto (ADTS): 12 bits a uno y la capa a cero.
const isAdts = (b) => b.length > 2 && b[0] === 0xff && (b[1] & 0xf6) === 0xf0;

// Un texto plano no tiene firma: basta con que no traiga bytes nulos, que es
// lo que delata a un binario renombrado a .txt.
const looksLikeText = (b) => !b.subarray(0, 4096).includes(0);

const SIGNATURES = {
    'image/jpeg': (b) => startsWith(b, [0xff, 0xd8, 0xff]),
    'image/png': (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    'video/mp4': isIsoMedia,
    'video/3gpp': isIsoMedia,
    'audio/mp4': isIsoMedia,
    'audio/mpeg': isMp3,
    'audio/aac': (b) => isAdts(b) || isIsoMedia(b),
    'audio/amr': (b) => startsWithText(b, '#!AMR'),
    'audio/ogg': (b) => startsWithText(b, 'OggS'),
    'application/pdf': (b) => startsWithText(b, '%PDF-'),
    'text/plain': looksLikeText,
    'application/msword': isOle,
    'application/vnd.ms-excel': isOle,
    'application/vnd.ms-powerpoint': isOle,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': isZip,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': isZip,
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': isZip,
};

/** ¿El contenido es de verdad de ese tipo? `false` también si el tipo no se conoce. */
export const matchesSignature = (mimeType, buffer) => Boolean(SIGNATURES[mimeType]?.(buffer));
