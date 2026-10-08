import { formatFileSize } from "./fileSize";
import type { Message, PendingUpload } from "../models/message.mode";

/**
 * Los archivos que se envían desde el chat. Replica las reglas del backend
 * (`utils/outbound.media.js`) para avisar antes de subir nada; el backend las
 * vuelve a comprobar, y además mira que los bytes sean de ese formato.
 */
export type OutboundMediaKind = 'image' | 'video' | 'audio' | 'document';

const MB = 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    mp4: 'video/mp4', '3gp': 'video/3gpp',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', amr: 'audio/amr', ogg: 'audio/ogg', opus: 'audio/ogg',
    pdf: 'application/pdf', txt: 'text/plain',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/** Los formatos que admite WhatsApp, y de qué tipo de mensaje es cada uno. */
const KIND_BY_MIME: Record<string, OutboundMediaKind> = Object.fromEntries(
    Object.values(MIME_BY_EXTENSION).map(mime => [mime, mime.startsWith('image/') ? 'image'
        : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'document']),
);

// Cómo llaman algunos navegadores a los mismos formatos.
const MIME_ALIASES: Record<string, string> = {
    'image/jpg': 'image/jpeg', 'audio/mp3': 'audio/mpeg', 'audio/x-m4a': 'audio/mp4', 'audio/m4a': 'audio/mp4',
    'audio/x-aac': 'audio/aac', 'audio/opus': 'audio/ogg',
};

const MAX_BYTES: Record<OutboundMediaKind, number> = { image: 5 * MB, video: 16 * MB, audio: 16 * MB, document: 16 * MB };

const KIND_NAMES: Record<OutboundMediaKind, string> = {
    image: 'La imagen', video: 'El video', audio: 'El audio', document: 'El documento',
};

export const fileExtension = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');

/**
 * El tipo con el que se sube: el del navegador, con su nombre de WhatsApp, o
 * el de la extensión si el navegador no lo reconoce (pasa con .amr u .ogg).
 */
export const outboundMimeType = (file: { name: string; type: string }) => {
    const declared = MIME_ALIASES[file.type] ?? file.type;
    if (KIND_BY_MIME[declared]) return declared;
    return MIME_BY_EXTENSION[fileExtension(file.name)] ?? declared;
};

/** Cómo se manda, o `null` si WhatsApp no lo admite. Con `asDocument`, una imagen va como documento. */
export const outboundMediaKind = (mimeType: string, asDocument = false): OutboundMediaKind | null => {
    const kind = KIND_BY_MIME[mimeType] ?? null;
    return asDocument && kind === 'image' ? 'document' : kind;
};

export interface OutboundMediaIssue {
    title: string;
    detail?: string;
    /** Una imagen demasiado grande cabe como documento: se ofrece mandarla así. */
    canSendAsDocument?: boolean;
}

/** Por qué no se puede enviar el archivo, o `null` si se puede. */
export const outboundMediaIssue = (file: { name: string; type: string; size: number }, asDocument = false): OutboundMediaIssue | null => {
    const mimeType = outboundMimeType(file);
    const kind = outboundMediaKind(mimeType, asDocument);
    if (!kind) {
        const ext = fileExtension(file.name);
        return {
            title: ext ? `WhatsApp no admite archivos .${ext}.` : 'WhatsApp no admite este tipo de archivo.',
            detail: file.type.startsWith('image/')
                ? 'Conviértelo a JPG o PNG y vuelve a adjuntarlo.'
                : 'Envía una imagen JPG o PNG, un video MP4, un audio o un documento (PDF, Word, Excel, PowerPoint o TXT).',
        };
    }
    if (!file.size) return { title: 'El archivo está vacío.' };
    if (file.size > MAX_BYTES[kind]) {
        const fitsAsDocument = kind === 'image' && file.size <= MAX_BYTES.document;
        return {
            title: `${KIND_NAMES[kind]} pesa ${formatFileSize(file.size)} y el máximo es ${formatFileSize(MAX_BYTES[kind])}.`,
            detail: fitsAsDocument
                ? `Como documento admite hasta ${formatFileSize(MAX_BYTES.document)}; llega sin comprimir y se abre como archivo.`
                : undefined,
            canSendAsDocument: fitsAsDocument,
        };
    }
    return null;
};

/** «PDF», «JPG»: el formato, para la vista previa. */
export const fileTypeLabel = (name: string) => fileExtension(name).toUpperCase() || 'ARCHIVO';

/** Lo que se ve en el mensaje mientras sube (lo mismo que pondrá el backend). */
export const OUTBOUND_KIND_LABEL: Record<OutboundMediaKind, string> = {
    image: 'Imagen', video: 'Video', audio: 'Audio', document: 'Documento',
};

/** El tope de WhatsApp para el texto que acompaña a un archivo. */
export const CAPTION_MAX = 1024;

/** El `accept` del selector de archivos: solo lo que WhatsApp admite. */
export const OUTBOUND_ACCEPT = [
    ...Object.keys(MIME_BY_EXTENSION).map(ext => `.${ext}`),
    ...Object.keys(KIND_BY_MIME),
].join(',');

/** Cuánto lleva subido un archivo que se está enviando, en %. */
export const uploadPercent = ({ loadedBytes, totalBytes }: PendingUpload) =>
    totalBytes ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : 0;

/** ¿Bajo el mensaje va el estado de la subida (en curso, o que no llegó y se puede reintentar)? */
export const showsUploadStatus = (msg: Message): msg is Message & { pending: PendingUpload } =>
    Boolean(msg.pending) && (msg.status !== "failed" || Boolean(msg.pending?.retryable));
