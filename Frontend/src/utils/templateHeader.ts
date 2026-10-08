import type { Template, TemplateHeaderMedia } from '../models/template.model';
import { formatFileSize } from './fileSize';

/**
 * Lo que admite la cabecera de cada formato al subir su archivo. Mismos tipos y
 * topes que `HEADER_MEDIA_RULES` del backend (utils/template.header.js), que es
 * quien decide: esto solo avisa antes de subir. Llevan también las palabras
 * con las que se nombra el archivo, porque concuerdan con su tipo: «la imagen»,
 * «el vídeo», «otra», «otro»…
 */
export const HEADER_MEDIA = {
    IMAGE: {
        accept: 'image/jpeg,image/png', types: 'JPG o PNG', maxBytes: 5 * 1024 * 1024,
        noun: 'imagen', title: 'Imagen', the: 'la', article: 'una', another: 'otra', toThe: 'a la',
        saved: 'guardada', noneSaved: 'ninguna guardada', upload: 'súbela', dropHint: 'o arrástrala aquí',
    },
    VIDEO: {
        accept: 'video/mp4,video/3gpp', types: 'MP4 o 3GP', maxBytes: 16 * 1024 * 1024,
        noun: 'vídeo', title: 'Vídeo', the: 'el', article: 'un', another: 'otro', toThe: 'al',
        saved: 'guardado', noneSaved: 'ninguno guardado', upload: 'súbelo', dropHint: 'o arrástralo aquí',
    },
    DOCUMENT: {
        accept: 'application/pdf', types: 'PDF', maxBytes: 16 * 1024 * 1024,
        noun: 'documento', title: 'Documento', the: 'el', article: 'un', another: 'otro', toThe: 'al',
        saved: 'guardado', noneSaved: 'ninguno guardado', upload: 'súbelo', dropHint: 'o arrástralo aquí',
    },
} as const;

export type HeaderMediaFormat = keyof typeof HEADER_MEDIA;
export type HeaderMediaRule = (typeof HEADER_MEDIA)[HeaderMediaFormat];

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

/**
 * Por qué no vale el archivo para la cabecera, o `null` si vale. Se mira antes
 * de subirlo para no mandar megas para nada; el backend lo vuelve a comprobar
 * (`headerMediaFileIssue`), y además mira que los bytes sean de ese tipo.
 */
export const headerFileIssue = (rule: HeaderMediaRule, file: { name: string; type: string; size: number }) => {
    if (!rule.accept.split(',').includes(file.type)) {
        return `La cabecera pide ${rule.article} ${rule.noun}: elige un archivo ${rule.types}. «${file.name}» no lo es.`;
    }
    if (file.size > rule.maxBytes) {
        return `El archivo pesa ${formatFileSize(file.size)}: el máximo es ${formatFileSize(rule.maxBytes)}.`;
    }
    return null;
};

const FILE_EXTENSION: Record<string, string> = {
    'image/jpeg': 'JPG', 'image/png': 'PNG', 'video/mp4': 'MP4', 'video/3gpp': '3GP', 'application/pdf': 'PDF',
};

/** «JPG · 312 KB»: el tipo y el peso de un archivo de cabecera. */
export const headerFileMeta = (media: TemplateHeaderMedia) =>
    [FILE_EXTENSION[media.mimeType], formatFileSize(media.size)].filter(Boolean).join(' · ');

/** De dónde sale el archivo que se manda en un envío. */
export type HeaderSource = 'template' | 'campaign';

export const HEADER_SOURCE_LABEL: Record<HeaderSource, string> = {
    template: 'De la plantilla',
    campaign: 'Solo para esta campaña',
};

/** «Imagen de la plantilla», «Vídeo solo para esta campaña»: debajo de la vista previa. */
export const headerSourceNote = (template: Template, source: HeaderSource | null) => {
    const rule = headerMediaRule(template);
    return rule && source ? `${rule.title} ${HEADER_SOURCE_LABEL[source].toLowerCase()}` : null;
};
