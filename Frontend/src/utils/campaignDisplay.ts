import type { PillTone } from "../components/Pill/Pill";
import { formatChatTime } from "./formatChatTime";
import type {
    CampaignRecipient, CampaignStats, CampaignStatus, RecipientState, SkipReason, VariableSource,
} from "../models/campaign.model";

/** Estado de un envío como píldora. */
export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; tone: PillTone }> = {
    queued: { label: 'En cola', tone: 'outline' },
    sending: { label: 'Enviando', tone: 'info' },
    paused: { label: 'Pausado', tone: 'warning' },
    completed: { label: 'Completado', tone: 'positive' },
    cancelled: { label: 'Cancelado', tone: 'neutral' },
};

/** Los que todavía pueden avanzar: muestran barra de progreso y se pueden cancelar. */
export const isCampaignActive = (status: CampaignStatus) =>
    status === 'queued' || status === 'sending' || status === 'paused';

/**
 * Progreso de un envío sobre los que se iban a enviar (sin los omitidos):
 * procesado es todo lo que ya no está pendiente ni se canceló.
 */
export const campaignProgress = (stats: CampaignStats) => {
    const total = stats.total - stats.skipped;
    const done = total - stats.pending - stats.cancelled;
    return { done, total, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
};

/** Estado de un destinatario como píldora; `plural` para los filtros del detalle. */
export const RECIPIENT_STATE: Record<RecipientState, { label: string; plural: string; tone: PillTone }> = {
    pending: { label: 'Pendiente', plural: 'Pendientes', tone: 'outline' },
    sent: { label: 'Enviado', plural: 'Enviados', tone: 'outline' },
    delivered: { label: 'Entregado', plural: 'Entregados', tone: 'info' },
    read: { label: 'Leído', plural: 'Leídos', tone: 'positive' },
    failed: { label: 'Fallido', plural: 'Fallidos', tone: 'danger' },
    skipped: { label: 'Omitido', plural: 'Omitidos', tone: 'neutral' },
    cancelled: { label: 'Cancelado', plural: 'Cancelados', tone: 'outline' },
    interrupted: { label: 'Interrumpido', plural: 'Interrumpidos', tone: 'warning' },
};

/**
 * Cuántos destinatarios hay en cada estado, sin solaparse: las estadísticas son
 * acumuladas (un leído también cuenta como entregado y enviado) y los filtros
 * del detalle no.
 */
export const recipientStateCounts = (stats: CampaignStats): Record<RecipientState, number> => ({
    pending: stats.pending,
    sent: stats.sent - stats.delivered,
    delivered: stats.delivered - stats.read,
    read: stats.read,
    failed: stats.failed,
    skipped: stats.skipped,
    cancelled: stats.cancelled,
    interrupted: stats.interrupted,
});

export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
    opted_out: 'Excluido: baja de publicidad',
    contact_deleted: 'Contacto borrado',
    no_identity: 'Sin teléfono ni usuario de WhatsApp',
};

/**
 * Los errores de Meta más comunes en un envío masivo, en palabras. El resto se
 * enseña con el detalle que mandó Meta, que viene en inglés.
 */
const WHATSAPP_ERROR_LABEL: Record<string, string> = {
    '131026': 'No se pudo entregar (número sin WhatsApp o app desactualizada)',
    '131047': 'La ventana de 24 h está cerrada',
    '131048': 'Envío frenado por WhatsApp: demasiados reportes de spam',
    '131049': 'WhatsApp no lo entregó para no saturar al usuario con publicidad',
    '131050': 'Pidió no recibir publicidad',
    '130429': 'WhatsApp pidió bajar el ritmo de envío',
    '132012': 'No coincide con el formato de la plantilla (p. ej., falta el archivo de la cabecera)',
    '190': 'El token de WhatsApp caducó',
    '409': 'La cuenta no tenía WhatsApp conectado',
};

/** El motivo de un fallo en una frase: el conocido, o el detalle que mandaron. */
export const failureLabel = (code: string | null, detail: string | null) =>
    (code && WHATSAPP_ERROR_LABEL[code]) || detail || 'Error desconocido';

/** Por qué está así un destinatario: el motivo del fallo o de la omisión. */
export const recipientReason = (r: CampaignRecipient): { text: string; code: string | null } | null => {
    if (r.state === 'failed') return { text: failureLabel(r.errorCode, r.errorDetail), code: r.errorCode };
    if (r.state === 'skipped' && r.skipReason) return { text: SKIP_REASON_LABEL[r.skipReason], code: null };
    if (r.state === 'interrupted') return { text: 'No se sabe si llegó y no se reintenta para no duplicar', code: null };
    return null;
};

/** La hora en que salió (o se procesó), con el formato de la bandeja. */
export const recipientTime = (r: CampaignRecipient) => {
    const at = r.sentAt ?? r.processedAt;
    return at ? formatChatTime(at) : '—';
};

/**
 * Qué arreglar cuando el envío se pausó solo, según el código: a dónde ir.
 * Los de plantilla se arreglan en Plantillas; los de la cuenta, en Ajustes.
 */
export const pauseReasonTarget = (code: string | null): 'settings' | 'templates' | null => {
    if (!code) return null;
    if (code === '190' || code === 'whatsapp_disconnected') return 'settings';
    if (code.startsWith('132') || code === 'template_header') return 'templates';
    return null;
};

export const VARIABLE_SOURCE_LABEL: Record<VariableSource, string> = {
    fixed: 'Texto fijo',
    name: 'Nombre del contacto',
    firstName: 'Nombre de pila',
    company: 'Empresa',
    phone: 'Teléfono',
    email: 'Email',
};

/** Cómo se nombra el dato que falta: «3 contactos no tienen nombre». */
export const VARIABLE_SOURCE_NOUN: Record<Exclude<VariableSource, 'fixed'>, string> = {
    name: 'nombre',
    firstName: 'nombre',
    company: 'empresa',
    phone: 'teléfono',
    email: 'email',
};

/** «unos 20 s», «unos 3 min», «unas 2 h». */
export const formatDuration = (seconds: number) => {
    if (seconds < 60) return `unos ${Math.max(seconds, 1)} s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `unos ${minutes} min`;
    return `unas ${Math.round(minutes / 60)} h`;
};

/** «hace 20 min», con los mismos cortes que el resto de la app. */
export const formatTimeAgo = (iso: string | number, now = Date.now()) => {
    const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
    if (seconds < 60) return 'hace un momento';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.round(hours / 24);
    return days === 1 ? 'hace 1 día' : `hace ${days} días`;
};

/** «04/10/2026 10:12» para la cabecera y la lista. */
export const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString('es-EC', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).replace(',', '');

/** «Promo octubre · 4 oct»: el nombre que se propone para un envío nuevo. */
export const suggestCampaignName = (templateName: string, date = new Date()) => {
    const day = date.toLocaleDateString('es-EC', { day: 'numeric', month: 'short' }).replace('.', '');
    const readable = templateName.replace(/_/g, ' ');
    return `${readable.charAt(0).toUpperCase()}${readable.slice(1)} · ${day}`;
};

/** «1 contacto» / «453 contactos», con el número en el formato local. */
export const pluralize = (count: number, singular: string, plural: string) =>
    `${count.toLocaleString('es-EC')} ${count === 1 ? singular : plural}`;
