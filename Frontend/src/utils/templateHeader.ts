import type { Template } from '../models/template.model';

/**
 * Lo que admite la cabecera de cada formato al subir su archivo. Mismos tipos y
 * topes que `HEADER_MEDIA_RULES` del backend (utils/template.header.js), que es
 * quien decide: esto solo avisa antes de subir.
 */
export const HEADER_MEDIA = {
    IMAGE: { accept: 'image/jpeg,image/png', types: 'JPG o PNG', maxBytes: 5 * 1024 * 1024, noun: 'imagen', article: 'una', upload: 'súbela' },
    VIDEO: { accept: 'video/mp4,video/3gpp', types: 'MP4 o 3GP', maxBytes: 16 * 1024 * 1024, noun: 'vídeo', article: 'un', upload: 'súbelo' },
    DOCUMENT: { accept: 'application/pdf', types: 'PDF', maxBytes: 16 * 1024 * 1024, noun: 'documento', article: 'un', upload: 'súbelo' },
} as const;

export type HeaderMediaFormat = keyof typeof HEADER_MEDIA;

/** Las reglas del archivo que pide la cabecera, o `null` si no pide ninguno. */
export const headerMediaRule = (template?: Template | null) =>
    HEADER_MEDIA[template?.header?.format as HeaderMediaFormat] ?? null;

/** Dónde se ve el archivo de la cabecera (misma sesión, mismo origen). */
export const headerMediaUrl = (mediaId: string) => `/api/templates/media/${mediaId}`;

const HAS_VARIABLE = /\{\{\s*[^}]+?\s*\}\}/;

/**
 * Por qué no se puede enviar la plantilla por su cabecera (`null` = sí se
 * puede). Mismo criterio que `templateHeaderIssue` del backend, que lo vuelve
 * a mirar al enviar. Se usa como `disabledReason` de los selectores.
 */
export const templateHeaderIssue = (template: Template): string | null => {
    const header = template.header;
    if (!header) return null;

    const rule = headerMediaRule(template);
    if (rule) return template.headerMedia ? null : `Falta ${rule.article} ${rule.noun} para la cabecera: ${rule.upload} en Plantillas.`;
    if (header.format === 'TEXT') {
        return HAS_VARIABLE.test(header.text ?? '') ? 'Tiene una variable en la cabecera: todavía no se puede enviar desde Wasmish.' : null;
    }
    if (header.format === 'LOCATION') return 'Lleva una ubicación en la cabecera: todavía no se puede enviar desde Wasmish.';
    return 'Su cabecera es de un tipo que Wasmish no sabe enviar.';
};

/** «1,4 MB», «312 KB». */
export const formatFileSize = (bytes: number) =>
    bytes < 1024 * 1024
        ? `${Math.max(1, Math.round(bytes / 1024))} KB`
        : `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
