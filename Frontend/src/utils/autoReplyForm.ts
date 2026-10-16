import {
    AUTO_REPLY_TEXT_MAX, WEEK_DAYS,
    type AutoReplySettings, type DaySchedule, type KeywordRule, type WeekDay, type WeekSchedule,
} from "../models/autoReply.model";

/*
 * La página de respuestas automáticas: lo que se edita, cómo se valida antes de
 * guardar (los mismos límites que `schemas/auto.reply.schema.js` y
 * `utils/business.hours.js` del backend, pero marcando cada campo) y los
 * resúmenes de cada paso. Sin React.
 */

/** Una regla en pantalla: `key` identifica la fila aunque aún no tenga `id`. */
export interface EditableRule extends KeywordRule {
    key: string;
}

export interface AutoReplyForm extends Omit<AutoReplySettings, 'keywordRules'> {
    keywordRules: EditableRule[];
}

export type StepKey = 'welcome' | 'outOfHours' | 'keywords' | 'silence' | 'review';

export const STEP_TITLES: Record<StepKey, string> = {
    welcome: 'Bienvenida',
    outOfHours: 'Fuera de horario',
    keywords: 'Palabras clave',
    silence: 'Cuándo se calla',
    review: 'Revisar y encender',
};

/** Los pasos de la página; el asistente añade «Revisar y encender». */
export const EDIT_STEPS: StepKey[] = ['welcome', 'outOfHours', 'keywords', 'silence'];
export const WIZARD_STEPS: StepKey[] = [...EDIT_STEPS, 'review'];

let nextKey = 0;
const newKey = () => `rule-${++nextKey}`;

export const newRule = (): EditableRule => ({ key: newKey(), enabled: true, keywords: [], text: '', lineIds: [] });

export const toForm = (settings: AutoReplySettings): AutoReplyForm => ({
    enabled: settings.enabled,
    timezone: settings.timezone,
    handoffHours: settings.handoffHours,
    welcome: { ...settings.welcome },
    outOfHours: { ...settings.outOfHours, schedule: cloneSchedule(settings.outOfHours.schedule) },
    keywordRules: settings.keywordRules.map(rule => ({ ...rule, keywords: [...rule.keywords], lineIds: [...rule.lineIds], key: rule.id ?? newKey() })),
});

/** Lo que se manda al `PUT` y al «probar»: sin las claves de pantalla. */
export const toPayload = (form: AutoReplyForm): AutoReplySettings => ({
    enabled: form.enabled,
    timezone: form.timezone,
    handoffHours: form.handoffHours,
    welcome: { ...form.welcome },
    outOfHours: { ...form.outOfHours, schedule: cloneSchedule(form.outOfHours.schedule) },
    keywordRules: form.keywordRules.map(({ id, enabled, keywords, text, lineIds }) => ({
        ...(id && { id }), enabled, keywords, text, lineIds,
    })),
});

/** Si hay algo distinto de lo guardado. */
export const isDirty = (form: AutoReplyForm, saved: AutoReplyForm) =>
    JSON.stringify(toPayload(form)) !== JSON.stringify(toPayload(saved));

const cloneSchedule = (schedule: WeekSchedule): WeekSchedule =>
    Object.fromEntries(WEEK_DAYS.map(day => [day, {
        closed: schedule[day].closed,
        ranges: schedule[day].ranges.map(range => ({ ...range })),
    }])) as WeekSchedule;

// ---------------------------------------------------------------------------
// El punto de partida del asistente
// ---------------------------------------------------------------------------

const range = (start: string, end: string) => ({ start, end });
const open = (...ranges: { start: string; end: string }[]): DaySchedule => ({ closed: false, ranges });
const closed = (): DaySchedule => ({ closed: true, ranges: [] });

/**
 * «Empezar con un ejemplo»: una bienvenida y un horario de lunes a viernes ya
 * escritos, todo apagado hasta el último paso. «Desde cero» deja los textos
 * vacíos, pero las respuestas encendidas: el asistente pide escribirlas o apagarlas.
 */
export const wizardStart = (form: AutoReplyForm, { example, businessName }: { example: boolean; businessName?: string }): AutoReplyForm => {
    const name = businessName?.trim();
    const welcomeText = `Hola, gracias por escribir${name ? ` a ${name}` : ''}. En un momento te atiende alguien del equipo.`;
    const workday = () => open(range('08:00', '13:00'), range('14:30', '18:00'));
    return {
        ...form,
        enabled: false,
        welcome: { ...form.welcome, enabled: true, text: example ? welcomeText : '' },
        outOfHours: {
            enabled: true,
            text: example
                ? 'Ahora estamos cerrados. Atendemos de lunes a viernes de 8:00 a 13:00 y de 14:30 a 18:00. Apenas abramos, te respondemos.'
                : '',
            schedule: example
                ? { mon: workday(), tue: workday(), wed: workday(), thu: workday(), fri: workday(), sat: closed(), sun: closed() }
                : cloneSchedule(form.outOfHours.schedule),
        },
    };
};

/**
 * «Terminar luego»: lo hecho, apagado y guardable. Lo que quedó a medias se
 * apaga (una respuesta sin texto, el fuera de horario sin días abiertos) y una
 * regla sin frases se quita, porque el backend no la admite. Lo que no se puede
 * arreglar solo (un tramo mal escrito, un texto de más de 800) sigue marcándose.
 */
export const draftOf = (form: AutoReplyForm): AutoReplyForm => ({
    ...form,
    enabled: false,
    welcome: { ...form.welcome, enabled: form.welcome.enabled && form.welcome.text.trim().length > 0 },
    outOfHours: {
        ...form.outOfHours,
        enabled: form.outOfHours.enabled && form.outOfHours.text.trim().length > 0
            && WEEK_DAYS.some(day => !form.outOfHours.schedule[day].closed),
    },
    keywordRules: form.keywordRules
        .filter(rule => rule.keywords.length > 0)
        .map(rule => ({ ...rule, enabled: rule.enabled && rule.text.trim().length > 0 })),
});

// ---------------------------------------------------------------------------
// Errores, campo a campo
// ---------------------------------------------------------------------------

export interface DayIssue {
    message: string;
    /** El tramo y la hora que se marcan en rojo. */
    rangeIndex: number;
    field: 'start' | 'end';
}

export interface FormIssues {
    welcomeText?: string;
    outOfHoursText?: string;
    /** Fuera de horario encendido sin ningún día abierto. */
    schedule?: string;
    days: Partial<Record<WeekDay, DayIssue>>;
    rules: Record<string, { keywords?: string; text?: string }>;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
};

const textIssue = (text: string, enabled: boolean, emptyMessage: string) => {
    if (text.length > AUTO_REPLY_TEXT_MAX) {
        const extra = text.length - AUTO_REPLY_TEXT_MAX;
        return `Sobra${extra === 1 ? '' : 'n'} ${extra} carácter${extra === 1 ? '' : 'es'}.`;
    }
    if (enabled && !text.trim()) return emptyMessage;
    return undefined;
};

/** El problema de un día abierto, o `undefined`. El backend comprueba lo mismo con `scheduleIssue`. */
export const dayIssue = (day: DaySchedule): DayIssue | undefined => {
    if (day.closed) return undefined;
    for (const [rangeIndex, { start, end }] of day.ranges.entries()) {
        if (!TIME_PATTERN.test(start)) return { message: 'Escribe la hora de apertura.', rangeIndex, field: 'start' };
        if (!TIME_PATTERN.test(end) && end !== '24:00') return { message: 'Escribe la hora de cierre.', rangeIndex, field: 'end' };
        if (toMinutes(start) >= toMinutes(end)) return { message: 'Termina antes de empezar.', rangeIndex, field: 'end' };
    }
    if (day.ranges.length === 2) {
        const [first, second] = day.ranges;
        const laterIndex = toMinutes(second.start) >= toMinutes(first.start) ? 1 : 0;
        const earlier = day.ranges[1 - laterIndex];
        if (toMinutes(day.ranges[laterIndex].start) < toMinutes(earlier.end)) {
            return { message: `Se solapa: empieza antes de las ${earlier.end}.`, rangeIndex: laterIndex, field: 'start' };
        }
    }
    return undefined;
};

export const formIssues = (form: AutoReplyForm): FormIssues => {
    const issues: FormIssues = { days: {}, rules: {} };

    issues.welcomeText = textIssue(form.welcome.text, form.welcome.enabled, 'Escribe la bienvenida, o apágala.');
    issues.outOfHoursText = textIssue(form.outOfHours.text, form.outOfHours.enabled, 'Escribe el mensaje, o apaga «Fuera de horario».');

    // El backend valida el horario aunque «Fuera de horario» esté apagado.
    for (const day of WEEK_DAYS) {
        const issue = dayIssue(form.outOfHours.schedule[day]);
        if (issue) issues.days[day] = issue;
    }
    if (form.outOfHours.enabled && WEEK_DAYS.every(day => form.outOfHours.schedule[day].closed)) {
        issues.schedule = 'Abre al menos un día, o apaga «Fuera de horario».';
    }

    for (const rule of form.keywordRules) {
        const keywords = rule.keywords.length === 0 ? 'Añade al menos una frase, o borra la regla.' : undefined;
        const text = textIssue(rule.text, rule.enabled, 'Escribe la respuesta, o apaga la regla.');
        if (keywords || text) issues.rules[rule.key] = { ...(keywords && { keywords }), ...(text && { text }) };
    }
    return issues;
};

/** Cuántas cosas hay que corregir en cada paso. */
export const issueCounts = (issues: FormIssues): Record<StepKey, number> => {
    const outOfHours = [issues.outOfHoursText, issues.schedule].filter(Boolean).length + Object.keys(issues.days).length;
    const keywords = Object.values(issues.rules).reduce((n, rule) => n + Number(Boolean(rule.keywords)) + Number(Boolean(rule.text)), 0);
    return { welcome: Number(Boolean(issues.welcomeText)), outOfHours, keywords, silence: 0, review: 0 };
};

export const totalIssues = (counts: Record<StepKey, number>) => Object.values(counts).reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------
// Palabras clave (las mismas reglas que `normalizeForMatch` del backend)
// ---------------------------------------------------------------------------

/** Sin tildes ni mayúsculas, la puntuación como espacio: «¿Cuánto CUESTA?» → «cuanto cuesta». */
export const normalizeForMatch = (text: string) => text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** La primera frase de la regla que aparece en `text` como palabras completas. */
export const matchedKeyword = (rule: KeywordRule, text: string) => {
    const normalized = ` ${normalizeForMatch(text)} `;
    return rule.keywords.find(keyword => {
        const key = normalizeForMatch(keyword);
        return key.length > 0 && normalized.includes(` ${key} `);
    });
};

/** La fila de la lista: las tres primeras frases y cuántas más hay. */
export const ruleTitle = (rule: KeywordRule) => {
    if (rule.keywords.length === 0) return 'Sin frases';
    const shown = rule.keywords.slice(0, 3).join(', ');
    return rule.keywords.length > 3 ? `${shown} +${rule.keywords.length - 3}` : shown;
};

// ---------------------------------------------------------------------------
// Resúmenes de cada paso
// ---------------------------------------------------------------------------

const DAY_SHORT: Record<WeekDay, string> = { mon: 'lun', tue: 'mar', wed: 'mié', thu: 'jue', fri: 'vie', sat: 'sáb', sun: 'dom' };
export const DAY_LABEL: Record<WeekDay, string> = { mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb', sun: 'Dom' };

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** `09:00` → `9`, `14:30` → `14:30`: para los resúmenes cortos. */
const shortTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    return minutes === '00' ? String(Number(hours)) : `${Number(hours)}:${minutes}`;
};
/** `09:00` → `9:00`. */
const longTime = (time: string) => time.replace(/^0(\d)/, '$1');

/** Los días seguidos con el mismo horario, juntos: lun a vie, sáb, dom. */
const dayGroups = (schedule: WeekSchedule) => {
    const groups: { days: WeekDay[]; day: DaySchedule }[] = [];
    const same = (a: DaySchedule, b: DaySchedule) => JSON.stringify(a) === JSON.stringify(b);
    for (const day of WEEK_DAYS) {
        const last = groups[groups.length - 1];
        if (last && same(last.day, schedule[day])) last.days.push(day);
        else groups.push({ days: [day], day: schedule[day] });
    }
    return groups;
};

const groupDays = (days: WeekDay[], joiner: string) =>
    days.length === 1 ? DAY_SHORT[days[0]] : `${DAY_SHORT[days[0]]}${joiner}${DAY_SHORT[days[days.length - 1]]}`;

/** «Lun–vie en dos tramos · sáb 9–13»: la barra de pasos. */
export const scheduleSummary = (schedule: WeekSchedule) => {
    const parts = dayGroups(schedule)
        .filter(group => !group.day.closed)
        .map(({ days, day }) => `${groupDays(days, '–')} ${day.ranges.length === 2
            ? 'en dos tramos'
            : `${shortTime(day.ranges[0].start)}–${shortTime(day.ranges[0].end)}`}`);
    return parts.length ? capitalize(parts.join(' · ')) : 'Todos los días cerrado';
};

/** «Lun a vie 8:00–13:00 y 14:30–18:00 · sáb 9:00–13:00 · dom cerrado.»: la revisión. */
export const scheduleDescription = (schedule: WeekSchedule) => capitalize(dayGroups(schedule)
    .map(({ days, day }) => `${groupDays(days, ' a ')} ${day.closed
        ? 'cerrado'
        : day.ranges.map(r => `${longTime(r.start)}–${longTime(r.end)}`).join(' y ')}`)
    .join(' · ')) + '.';

export const welcomeSummary = (returnAfterDays: number | null) =>
    returnAfterDays === null ? 'Saluda solo la primera vez' : `Vuelve a saludar tras ${returnAfterDays} días`;

export const keywordsSummary = (rules: KeywordRule[]) => {
    if (rules.length === 0) return 'Sin reglas';
    const on = rules.filter(rule => rule.enabled).length;
    return `${rules.length} ${rules.length === 1 ? 'regla' : 'reglas'} · ${on} ${on === 1 ? 'encendida' : 'encendidas'}`;
};

export const silenceSummary = (hours: number) => `${hours} h tras una respuesta manual`;

// ---------------------------------------------------------------------------
// Zona horaria y hora
// ---------------------------------------------------------------------------

/** Los países de los clientes, en palabras. Si la cuenta tiene otra zona, se añade tal cual. */
export const TIME_ZONES: { value: string; label: string }[] = [
    { value: 'America/Guayaquil', label: 'Ecuador' },
    { value: 'Pacific/Galapagos', label: 'Ecuador (Galápagos)' },
    { value: 'America/Bogota', label: 'Colombia' },
    { value: 'America/Lima', label: 'Perú' },
    { value: 'America/Caracas', label: 'Venezuela' },
    { value: 'America/La_Paz', label: 'Bolivia' },
    { value: 'America/Santiago', label: 'Chile' },
    { value: 'America/Argentina/Buenos_Aires', label: 'Argentina' },
    { value: 'America/Montevideo', label: 'Uruguay' },
    { value: 'America/Asuncion', label: 'Paraguay' },
    { value: 'America/Sao_Paulo', label: 'Brasil (São Paulo)' },
    { value: 'America/Panama', label: 'Panamá' },
    { value: 'America/Costa_Rica', label: 'Costa Rica' },
    { value: 'America/Managua', label: 'Nicaragua' },
    { value: 'America/Tegucigalpa', label: 'Honduras' },
    { value: 'America/El_Salvador', label: 'El Salvador' },
    { value: 'America/Guatemala', label: 'Guatemala' },
    { value: 'America/Mexico_City', label: 'México (Ciudad de México)' },
    { value: 'America/Santo_Domingo', label: 'República Dominicana' },
    { value: 'America/Puerto_Rico', label: 'Puerto Rico' },
    { value: 'America/New_York', label: 'Estados Unidos (Nueva York)' },
    { value: 'Europe/Madrid', label: 'España' },
];

export const timeZoneOptions = (current: string) =>
    TIME_ZONES.some(zone => zone.value === current) ? TIME_ZONES : [...TIME_ZONES, { value: current, label: current }];

/** «GMT−5»: el desfase de ahora en esa zona. */
export const timeZoneOffset = (timeZone: string, now = new Date()) => {
    try {
        const offset = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
            .formatToParts(now).find(part => part.type === 'timeZoneName')?.value ?? '';
        return offset.replace('-', '−');
    } catch {
        return '';
    }
};

export const timeZoneLabel = (timeZone: string) => {
    const name = timeZoneOptions(timeZone).find(zone => zone.value === timeZone)?.label ?? timeZone;
    const offset = timeZoneOffset(timeZone);
    return `Hora de ${name}${offset ? ` (${offset})` : ''}`;
};

/** «lunes 10:42» y «10:42»: la hora de la prueba, en la zona de la cuenta. */
export const clockIn = (timeZone: string, now = new Date()) => {
    const time = new Intl.DateTimeFormat('es', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
    const weekday = new Intl.DateTimeFormat('es', { timeZone, weekday: 'long' }).format(now);
    return { when: `${weekday} ${time}`, time };
};
