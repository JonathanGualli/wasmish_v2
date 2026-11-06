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

/** Adónde lleva una opción de un menú (bot con menús): otra respuesta, el inicio o una persona. */
export type OptionTarget = 'rule' | 'start' | 'person';

export interface MenuOption {
    title: string;
    target: OptionTarget;
    /** Solo con `target: 'rule'`: el id de la respuesta. */
    ruleId: string | null;
}

/** Dónde quedó una tarjeta en el lienzo de la página; `null`, la coloca sola. */
export interface CardPosition {
    x: number;
    y: number;
}

/** Una «respuesta» de la página (en la API, una regla de palabras clave). */
export interface KeywordRule {
    /** El de la BD, o el que puso la página al crearla (las opciones le apuntan por él). */
    id?: string;
    /** Una guardada antes de los menús llega como «Respuesta N». */
    name: string;
    enabled: boolean;
    /** Sin frases, solo se llega por una opción. */
    keywords: string[];
    text: string;
    lineIds: string[];
    options: MenuOption[];
    position: CardPosition | null;
}

export interface AutoReplySettings {
    enabled: boolean;
    timezone: string;
    handoffHours: HandoffHours;
    welcome: { enabled: boolean; text: string; returnAfterDays: ReturnAfterDays; options: MenuOption[]; position: CardPosition | null };
    outOfHours: { enabled: boolean; text: string; schedule: WeekSchedule };
    keywordRules: KeywordRule[];
    /** «Si no entiende»: solo cuando no saldría nada más. */
    fallback: { enabled: boolean; text: string; options: MenuOption[]; position: CardPosition | null };
    /** Lo que responde el bot al pedir una persona, uno para la cuenta, y su tarjeta. */
    handoff: { text: string; position: CardPosition | null };
}

export interface AutoRepliesResponse extends AutoReplySettings {
    /** Si la cuenta ya guardó alguna vez: sin eso, la página abre el asistente. */
    configured: boolean;
}

/** Una parte de una respuesta de prueba, con su origen. */
export interface AutoReplyPreviewPart {
    /** `option`: la respuesta de una opción tocada; `handoff`: el texto de «hablar con una persona». */
    kind: 'welcome' | 'keyword' | 'outOfHours' | 'fallback' | 'option' | 'handoff';
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
    /** Las opciones que saldrían con la respuesta, ya con su id (`wasmish:…`). */
    options: { id: string; title: string }[];
    optionsFormat: 'buttons' | 'list' | null;
}

/** Un mensaje de la conversación de prueba: un texto o el toque de una opción. */
export type PreviewMessage = string | { optionId: string; title: string };

/** Cuántos mensajes admite la conversación de prueba (`PREVIEW_MESSAGES_MAX` del backend). */
export const PREVIEW_MESSAGES_MAX = 20;

export const AUTO_REPLY_TEXT_MAX = 800;
export const KEYWORD_RULES_MAX = 50;
export const RULE_NAME_MAX = 40;
/** Opciones por respuesta: hasta 3 salen como botones; de 4 a 10, como lista. */
export const OPTIONS_MAX = 10;
export const BUTTONS_MAX = 3;
export const OPTION_TITLE_MAX = 20;
export const DEFAULT_HANDOFF_TEXT = 'Enseguida te atiende alguien del equipo';
export const KEYWORDS_PER_RULE_MAX = 20;
export const KEYWORD_MAX = 60;
export const KEYWORD_REPLIES_MAX = 3;
