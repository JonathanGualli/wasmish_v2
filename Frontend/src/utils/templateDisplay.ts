import type { PillTone } from '../components/Pill/Pill';
import type { Template, TemplateButton, TemplateUsage } from '../models/template.model';
import { formatShortDate } from './formatChatTime';
import { headerMediaRule } from './templateHeader';
import { orderedPlaceholders } from './templatePlaceholders';

// ---------------------------------------------------------------------------
// Las palabras de una plantilla: su estado, su calidad, el motivo del rechazo
// y los avisos del detalle. Sale del diseño «Plantillas - Detalle» (3c).
// ---------------------------------------------------------------------------

export interface TemplateStatusWords {
    label: string;
    /** Para la tabla, donde no cabe la larga («Pendiente», «Borrada»). */
    short: string;
    tone: PillTone;
}

const STATUS: Record<string, TemplateStatusWords> = {
    APPROVED: { label: 'Aprobada', short: 'Aprobada', tone: 'positive' },
    PENDING: { label: 'Pendiente de revisión', short: 'Pendiente', tone: 'warning' },
    REJECTED: { label: 'Rechazada', short: 'Rechazada', tone: 'danger' },
    // Las de antes del sync nuevo pueden traer «REJECT».
    REJECT: { label: 'Rechazada', short: 'Rechazada', tone: 'danger' },
    PAUSED: { label: 'En pausa', short: 'En pausa', tone: 'warning' },
    DISABLED: { label: 'Desactivada', short: 'Desactivada', tone: 'danger' },
    IN_APPEAL: { label: 'En apelación', short: 'En apelación', tone: 'info' },
    LIMIT_EXCEEDED: { label: 'Límite alcanzado', short: 'Límite', tone: 'warning' },
    ARCHIVED: { label: 'Archivada', short: 'Archivada', tone: 'neutral' },
    PENDING_DELETION: { label: 'Borrándose', short: 'Borrándose', tone: 'neutral' },
};

const DELETED: TemplateStatusWords = { label: 'Borrada en Meta', short: 'Borrada', tone: 'danger' };

/** El estado en palabras. Borrada en Meta manda sobre el último estado que tenía. */
export const templateStatusWords = (template: Template): TemplateStatusWords =>
    template.deletedInMetaAt
        ? DELETED
        : STATUS[template.status] ?? { label: template.status, short: template.status, tone: 'neutral' };

const isRejected = (template: Template) => template.status === 'REJECTED' || template.status === 'REJECT';

export interface TemplateQualityWords {
    label: string;
    /** El punto de color: verde, amarillo, rojo o gris. */
    dot: 'success' | 'yellow' | 'danger' | 'subtle' | 'border';
    note: string;
}

/** La calidad que le da WhatsApp. `neverSent`: sin ningún envío (cambia la nota de «sin datos»). */
export const templateQualityWords = (template: Template, { neverSent = false } = {}): TemplateQualityWords => {
    if (template.deletedInMetaAt) return { label: '—', dot: 'border', note: 'Ya no la mide WhatsApp.' };
    switch (template.qualityScore) {
        case 'GREEN': return { label: 'Alta', dot: 'success', note: 'Los contactos no la bloquean ni la reportan.' };
        case 'YELLOW': return { label: 'Media', dot: 'yellow', note: 'Algunos contactos la bloquean o la reportan.' };
        case 'RED': return { label: 'Baja', dot: 'danger', note: 'Muchos contactos la bloquean o la reportan.' };
    }
    if (isRejected(template) || (neverSent && template.status !== 'APPROVED')) {
        return { label: 'Sin datos', dot: 'subtle', note: 'Nunca se ha enviado.' };
    }
    return { label: 'Sin datos todavía', dot: 'subtle', note: 'WhatsApp la mide cuando empieza a enviarse.' };
};

const CATEGORY_LABEL: Record<string, string> = {
    MARKETING: 'Marketing',
    UTILITY: 'Utilidad',
    AUTHENTICATION: 'Autenticación',
};

export const categoryLabel = (category?: string | null) => (category ? CATEGORY_LABEL[category] ?? category : '');

/** La nota de la categoría: si WhatsApp la cambió, de cuál, y qué implica. */
export const templateCategoryNote = (template: Template) => {
    if (template.previousCategory && template.previousCategory !== template.category) {
        const before = categoryLabel(template.previousCategory);
        return template.category === 'MARKETING'
            ? `WhatsApp la pasó de ${before}. Se cobra como publicidad y las campañas dejan fuera a quien se dio de baja.`
            : `WhatsApp la pasó de ${before}.`;
    }
    return isRejected(template) ? 'Con la que se mandó a revisión.' : '';
};

const LANGUAGES: Record<string, string> = {
    es: 'Español',
    es_EC: 'Español',
    es_MX: 'Español',
    es_ES: 'Español',
    en: 'Inglés',
    en_US: 'Inglés',
    pt_BR: 'Portugués',
};

export const languageName = (code: string) => LANGUAGES[code] ?? code;

/** La nota del estado, bajo la píldora. */
export const templateStatusNote = (template: Template) => {
    if (template.deletedInMetaAt) return `Desde el ${formatShortDate(template.deletedInMetaAt)}. No se puede enviar.`;
    if (template.status === 'APPROVED') return 'Se puede enviar.';
    if (template.status === 'PENDING') return 'WhatsApp la está revisando.';
    if (isRejected(template) && template.metaUpdatedAt) {
        return `El ${formatShortDate(template.metaUpdatedAt)}. No se puede enviar.`;
    }
    return 'No se puede enviar.';
};

// ---------------------------------------------------------------------------
// Los avisos del detalle, en el orden de 3c: uno por problema.
// ---------------------------------------------------------------------------

export interface TemplateNotice {
    tone: 'info' | 'warning' | 'danger' | 'neutral';
    title: string;
    text: string;
    /** El código de Meta, en mono bajo el texto. */
    code?: string;
    /** Con «Abrir en Meta»: lo que lo arregla está en el Administrador de WhatsApp. */
    openInMeta?: boolean;
}

const FIX_IN_META = 'Corrígela en el Administrador de WhatsApp de Meta y vuelve a mandarla a revisión. Cuando la aprueben, aparece aquí al sincronizar.';

const REJECTION: Record<string, { reason: string; text: string }> = {
    INVALID_FORMAT: {
        reason: 'formato no válido',
        text: `Algo de su forma no cumple las reglas de WhatsApp: por ejemplo, una variable al principio o al final, dos seguidas, o un carácter que no admite. ${FIX_IN_META}`,
    },
    INCORRECT_CATEGORY: {
        reason: 'categoría incorrecta',
        text: `La categoría con la que se mandó no corresponde a lo que dice el mensaje. ${FIX_IN_META}`,
    },
    ABUSIVE_CONTENT: {
        reason: 'contenido abusivo',
        text: 'Para WhatsApp, el texto incumple sus políticas. Revísalo en el Administrador de WhatsApp de Meta y vuelve a mandarla, o crea otra con un texto distinto.',
    },
    SCAM: {
        reason: 'parece una estafa',
        text: 'Para WhatsApp, el mensaje podría usarse para engañar a los contactos. Revisa el texto y los enlaces en el Administrador de WhatsApp de Meta y vuelve a mandarla.',
    },
    PROMOTIONAL: {
        reason: 'contenido promocional en una plantilla de utilidad',
        text: `Se mandó como Utilidad, pero ofrece algo (un descuento, una promoción), y para WhatsApp eso es marketing. Quita esa parte o cámbiala a Marketing. ${FIX_IN_META}`,
    },
    TAG_CONTENT_MISMATCH: {
        reason: 'las variables no coinciden con el ejemplo',
        text: `Cada variable necesita un ejemplo que tenga sentido en la frase. ${FIX_IN_META}`,
    },
};

const rejectionNotice = (template: Template): TemplateNotice => {
    const code = template.rejectedReason ?? null;
    const known = code ? REJECTION[code] : undefined;
    if (known) {
        return {
            tone: 'danger', title: `WhatsApp la rechazó: ${known.reason}.`, text: known.text,
            code: `Motivo de Meta: ${code}`, openInMeta: true,
        };
    }
    return {
        tone: 'danger', title: 'WhatsApp la rechazó.',
        text: code
            ? `Meta no dio más detalle que el código ${code}. Revísala en el Administrador de WhatsApp de Meta y vuelve a mandarla.`
            : 'Meta no dio el motivo. Revísala en el Administrador de WhatsApp de Meta y vuelve a mandarla.',
        openInMeta: true,
    };
};

/** Lo que le pasa a la plantilla, de lo que impide enviarla a lo que solo avisa. */
export const templateNotices = (template: Template): TemplateNotice[] => {
    if (template.deletedInMetaAt) {
        return [{
            tone: 'neutral',
            title: `Se borró en Meta el ${formatShortDate(template.deletedInMetaAt)}: ya no se puede enviar.`,
            text: 'Sigue aquí por los mensajes y las campañas que la usaron. Una campaña ya creada con ella va a fallar.',
        }];
    }
    const notices: TemplateNotice[] = [];
    if (isRejected(template)) notices.push(rejectionNotice(template));
    if (template.status === 'PAUSED') {
        notices.push({
            tone: 'warning', title: 'WhatsApp la pausó por su calidad: no se puede enviar.',
            text: 'Muchos contactos la bloquearon o la reportaron. Vuelve a enviarse cuando WhatsApp la reactive; mientras tanto, usa otra.',
        });
    }
    if (template.status === 'DISABLED') {
        notices.push({
            tone: 'danger', title: 'WhatsApp la desactivó por su calidad: no se puede enviar.',
            text: 'Ya no vuelve sola. Crea otra en Meta con un texto distinto, o apela la decisión en el Administrador de WhatsApp de Meta.',
            openInMeta: true,
        });
    }
    if (template.status === 'APPROVED' && template.qualityScore === 'RED') {
        notices.push({
            tone: 'warning', title: 'Calidad baja: todavía se envía, pero WhatsApp puede pausarla.',
            text: 'Muchos contactos la bloquean o la reportan. Si sigue bajando, la pausa. Envíala solo a quien la espera o cambia el texto.',
        });
    }
    if (template.status === 'PENDING') {
        notices.push({
            tone: 'info', title: 'WhatsApp la está revisando.',
            text: 'Suele tardar entre unos minutos y unas horas. Al abrir esta página se comprueba sola.',
        });
    }
    const rule = headerMediaRule(template);
    if (rule && !template.headerMedia && template.status === 'APPROVED') {
        notices.push({
            tone: 'warning',
            title: `Falta ${rule.the} ${rule.noun} de la cabecera: sin ${rule.the === 'la' ? 'ella' : 'él'}, WhatsApp no envía este mensaje.`,
            text: `WhatsApp aprueba que lleve ${rule.article} ${rule.noun}, pero no cuál. ${rule.upload.charAt(0).toUpperCase()}${rule.upload.slice(1)} en «Archivo de la cabecera»; en una campaña se elige al prepararla.`,
        });
    }
    return notices;
};

/** El Administrador de WhatsApp, en la lista de plantillas de su cuenta (decisión del 2026-11-08). */
export const metaTemplatesUrl = (template: Template) =>
    template.waBusinessId
        ? `https://business.facebook.com/wa/manage/message-templates/?waba_id=${encodeURIComponent(template.waBusinessId)}`
        : 'https://business.facebook.com/wa/manage/message-templates/';

// ---------------------------------------------------------------------------
// Las variables y los botones.
// ---------------------------------------------------------------------------

/** Los ejemplos del cuerpo como valores de la burbuja: `{ '1': 'María' }`. */
export const bodyExampleValues = (template: Template): Record<string, string> =>
    Object.fromEntries((template.bodyExamples ?? []).map(e => [e.key, e.example]));

const firstExample = (example?: string | string[]) =>
    (Array.isArray(example) ? example[0] : example)?.trim() || null;

/** La parte variable de una URL de ejemplo: lo que queda tras la parte fija. */
const urlVariablePart = (url: string, example: string | null) => {
    const fixed = url.slice(0, url.indexOf('{{'));
    if (!example) return null;
    return example.startsWith(fixed) ? example.slice(fixed.length) || null : example;
};

export interface TemplateButtonDetail {
    text: string;
    type: string;
    kind: 'url' | 'phone' | 'reply' | 'code';
    /** A dónde lleva, en mono; `destVariable` es la parte que cambia en cada envío. */
    dest: string | null;
    destVariable: string | null;
    note: string;
}

/** Cada botón con su destino, como en la tarjeta «Botones». */
export const templateButtonDetails = (buttons?: TemplateButton[]): TemplateButtonDetail[] =>
    (buttons ?? []).map((button): TemplateButtonDetail => {
        const text = button.text || 'Botón';
        if (button.type === 'URL') {
            const url = button.url ?? '';
            const variable = url.match(/\{\{\s*[^}]+?\s*\}\}/)?.[0] ?? null;
            if (!variable) {
                return { text, type: 'Enlace', kind: 'url', dest: url || null, destVariable: null, note: 'Abre esa página.' };
            }
            const example = urlVariablePart(url, firstExample(button.example));
            return {
                text, type: 'Enlace', kind: 'url', dest: url.slice(0, url.indexOf('{{')), destVariable: variable,
                note: example ? `La parte final cambia en cada envío. Ejemplo: ${example}.` : 'La parte final cambia en cada envío.',
            };
        }
        if (button.type === 'PHONE_NUMBER') {
            return { text, type: 'Teléfono', kind: 'phone', dest: button.phone_number ?? null, destVariable: null, note: 'Abre la llamada a ese número.' };
        }
        if (button.type === 'COPY_CODE') {
            return { text, type: 'Copiar código', kind: 'code', dest: null, destVariable: null, note: 'Copia un código que se pone en cada envío.' };
        }
        if (button.type === 'OTP') {
            return { text, type: 'Código de verificación', kind: 'code', dest: null, destVariable: null, note: 'Copia el código de verificación que se pone en cada envío.' };
        }
        return {
            text, type: 'Respuesta rápida', kind: 'reply', dest: null, destVariable: null,
            note: 'No abre nada: el contacto te contesta con ese texto y llega al chat.',
        };
    });

export interface TemplateVariable {
    key: string;
    /** `null` = sin ejemplo. */
    example: string | null;
    where: string;
}

/** Las variables de la cabecera, el cuerpo y los botones, con su ejemplo. */
export const templateVariables = (template: Template): TemplateVariable[] => {
    const variables: TemplateVariable[] = [];
    if (template.header?.format === 'TEXT' && template.header.text) {
        for (const key of orderedPlaceholders(template.header.text)) {
            variables.push({ key: `{{${key}}}`, example: template.headerExample || null, where: 'Cabecera' });
        }
    }
    const examples = bodyExampleValues(template);
    for (const key of orderedPlaceholders(template.bodyText)) {
        variables.push({ key: `{{${key}}}`, example: examples[key]?.trim() || null, where: 'Cuerpo' });
    }
    for (const button of template.buttons ?? []) {
        const url = button.url ?? '';
        const variable = button.type === 'URL' ? url.match(/\{\{\s*[^}]+?\s*\}\}/)?.[0] : null;
        if (variable) {
            variables.push({
                key: variable, example: urlVariablePart(url, firstExample(button.example)),
                where: `Botón «${button.text || 'sin texto'}»`,
            });
        }
    }
    return variables;
};

// ---------------------------------------------------------------------------
// El uso.
// ---------------------------------------------------------------------------

export interface UsageSegment {
    key: 'read' | 'delivered' | 'unconfirmed' | 'failed';
    label: string;
    count: number;
    /** Sobre los enviados, de 0 a 100. */
    percent: number;
}

/**
 * La barra del uso, sin solaparse: un leído también es entregado, así que la
 * barra separa leídos, entregados sin leer, sin confirmar y fallidos. Los
 * tramos vacíos no salen.
 */
export const usageSegments = (usage: TemplateUsage): UsageSegment[] => {
    if (usage.sent <= 0) return [];
    const unconfirmed = Math.max(0, usage.sent - usage.delivered - usage.failed);
    const segments: Omit<UsageSegment, 'percent'>[] = [
        { key: 'read', label: 'Leídos', count: usage.read },
        { key: 'delivered', label: 'Entregados sin leer', count: Math.max(0, usage.delivered - usage.read) },
        { key: 'unconfirmed', label: 'Sin confirmar', count: unconfirmed },
        { key: 'failed', label: 'Fallidos', count: usage.failed },
    ];
    return segments
        .filter(s => s.count > 0)
        .map(s => ({ ...s, percent: (s.count / usage.sent) * 100 }));
};

/**
 * Si al abrirla el backend va a sincronizar antes (`fresh`): sin sync completo
 * o con más de 10 minutos. Los mismos 10 minutos que `TEMPLATE_SYNC_MAX_AGE_MS`
 * del backend, que es quien decide: aquí solo se avisa «Comprobando cambios».
 */
export const isTemplateSyncStale = (syncedAt: string | null | undefined, now = Date.now()) =>
    !syncedAt || now - new Date(syncedAt).getTime() > 10 * 60 * 1000;
