// Respuestas automáticas: la configuración de la cuenta tal como la devuelve
// `GET /api/auto-replies` (docs/arquitectura/respuestas-automaticas.md).

export const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WeekDay = typeof WEEK_DAYS[number];

export interface TimeRange {
    start: string;
    end: string;
}

export interface DaySchedule {
    closed: boolean;
    ranges: TimeRange[];
}

export type WeekSchedule = Record<WeekDay, DaySchedule>;

export const HANDOFF_HOURS = [1, 4, 12, 24] as const;
export type HandoffHours = typeof HANDOFF_HOURS[number];

/** Días sin escribir para volver a saludar; `null` = nunca. */
export const RETURN_AFTER_DAYS = [7, 30, 90, null] as const;
export type ReturnAfterDays = typeof RETURN_AFTER_DAYS[number];

export interface KeywordRule {
    /** El de la BD; una regla nueva no lo tiene hasta guardarse. */
    id?: string;
    enabled: boolean;
    keywords: string[];
    text: string;
    lineIds: string[];
}

export interface AutoReplySettings {
    enabled: boolean;
    timezone: string;
    handoffHours: HandoffHours;
    welcome: { enabled: boolean; text: string; returnAfterDays: ReturnAfterDays };
    outOfHours: { enabled: boolean; text: string; schedule: WeekSchedule };
    keywordRules: KeywordRule[];
    /** «Si no entiende»: solo cuando no saldría nada más. */
    fallback: { enabled: boolean; text: string };
}

export interface AutoRepliesResponse extends AutoReplySettings {
    /** Si la cuenta ya guardó alguna vez: sin eso, la página abre el asistente. */
    configured: boolean;
}

/** Una parte de una respuesta de prueba, con su origen. */
export interface AutoReplyPreviewPart {
    kind: 'welcome' | 'keyword' | 'outOfHours' | 'fallback';
    text: string;
    /** En `keyword`: la posición de la regla y la frase que coincidió. */
    ruleIndex?: number;
    keyword?: string;
}

/** Un mensaje de la conversación de prueba: qué respondería el bot, o por qué no. */
export interface AutoReplyPreviewTurn {
    reply: string | null;
    parts: AutoReplyPreviewPart[];
    /** Reglas que coincidían pero ya habían respondido en la conversación. */
    repeated: { ruleIndex: number; keyword: string }[];
    /** El «no entiendo» habría salido, pero ya salió. */
    fallbackRepeated: boolean;
    skip: string | null;
}

/** Cuántos mensajes admite la conversación de prueba (`PREVIEW_MESSAGES_MAX` del backend). */
export const PREVIEW_MESSAGES_MAX = 20;

export const AUTO_REPLY_TEXT_MAX = 800;
export const KEYWORD_RULES_MAX = 30;
export const KEYWORDS_PER_RULE_MAX = 20;
export const KEYWORD_MAX = 60;
export const KEYWORD_REPLIES_MAX = 3;
