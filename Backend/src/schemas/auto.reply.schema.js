import { z } from "zod";
import { objectIdSchema } from "./contact.schema.js";
import {
    AUTO_REPLY_TEXT_MAX, HANDOFF_HOURS, KEYWORD_MAX, KEYWORD_RULES_MAX, KEYWORDS_PER_RULE_MAX, PREVIEW_MESSAGES_MAX, RETURN_AFTER_DAYS,
    RULE_NAME_MAX, normalizeForMatch,
} from "../utils/auto.reply.js";
import { DEFAULT_HANDOFF_TEXT, OPTION_TITLE_MAX, OPTIONS_MAX } from "../utils/auto.reply.options.js";
import { WEEK_DAYS, isValidTimeZone, scheduleIssue } from "../utils/business.hours.js";

// Ojo: `validateSchema` no reemplaza el body. El controlador vuelve a pasar el
// cuerpo por estos esquemas para quedarse con lo limpio (frases sin espacios
// en los bordes, `lineIds` por defecto).

const PREVIEW_TEXT_MAX = 1000;

const replyTextSchema = z.string().max(AUTO_REPLY_TEXT_MAX, `Máximo ${AUTO_REPLY_TEXT_MAX} caracteres`);
// Una respuesta encendida necesita su texto; una apagada puede quedar vacía.
const textWhenEnabled = { message: 'Escribe el texto de la respuesta', path: ['text'] };
const hasTextIfEnabled = (reply) => !reply.enabled || reply.text.trim().length > 0;

const oneOf = (values, message) => z.union(values.map(value => (value === null ? z.null() : z.literal(value))), { error: message });

const daySchema = z.object({
    closed: z.boolean(),
    ranges: z.array(z.object({ start: z.string(), end: z.string() })),
});

const scheduleSchema = z.object(Object.fromEntries(WEEK_DAYS.map(day => [day, daySchema])))
    .superRefine((schedule, ctx) => {
        const issue = scheduleIssue(schedule);
        if (issue) ctx.addIssue({ code: 'custom', message: issue });
    });

const keywordSchema = z.string().trim()
    .max(KEYWORD_MAX, `Cada frase, máximo ${KEYWORD_MAX} caracteres`)
    .refine(keyword => normalizeForMatch(keyword).length > 0, 'Una frase necesita letras o números');

// Una opción de un menú (bot con menús, spec 2026-11-05 § 4.1). `ruleId`
// solo cuenta con `target: 'rule'`; si no, se guarda null.
const optionSchema = z.object({
    title: z.string().trim()
        .min(1, 'Escribe el título de la opción')
        .max(OPTION_TITLE_MAX, `Cada opción, máximo ${OPTION_TITLE_MAX} caracteres`),
    target: z.enum(['rule', 'start', 'person'], { error: 'Elige adónde lleva la opción' }),
    ruleId: objectIdSchema.nullish(),
})
    .refine(option => option.target !== 'rule' || option.ruleId, { message: 'Elige a qué respuesta lleva', path: ['ruleId'] })
    .transform(option => ({ ...option, ruleId: option.target === 'rule' ? option.ruleId : null }));

// Meta rechaza los botones con títulos iguales (decisión B del spec).
const optionsSchema = z.array(optionSchema)
    .max(OPTIONS_MAX, `Como mucho ${OPTIONS_MAX} opciones`)
    .refine(options => {
        const titles = options.map(option => normalizeForMatch(option.title));
        return new Set(titles).size === titles.length;
    }, 'Dos opciones de una respuesta no pueden llamarse igual')
    .default([]);

const keywordRuleSchema = z.object({
    // El de una regla ya guardada, o el que puso la página a una nueva (para
    // poder apuntarle una opción antes de guardar); sin él, la regla es nueva.
    id: objectIdSchema.optional(),
    name: z.string().trim().max(RULE_NAME_MAX, `El nombre, máximo ${RULE_NAME_MAX} caracteres`).default(''),
    enabled: z.boolean(),
    // Sin frases, solo se llega por una opción.
    keywords: z.array(keywordSchema)
        .max(KEYWORDS_PER_RULE_MAX, `Como mucho ${KEYWORDS_PER_RULE_MAX} frases por regla`),
    text: replyTextSchema,
    lineIds: z.array(objectIdSchema).max(50).default([]),
    options: optionsSchema,
}).refine(hasTextIfEnabled, textWhenEnabled);

// Las opciones de toda la configuración: cada `ruleId` apunta a una regla del
// mismo cuerpo (una de otra cuenta, o una borrada, no está) y «hablar con una
// persona» necesita su texto.
const checkMenus = (settings, ctx) => {
    const ruleIds = new Set(settings.keywordRules.filter(rule => rule.id).map(rule => rule.id.toLowerCase()));
    const groups = [
        ['welcome', settings.welcome.options],
        ['fallback', settings.fallback.options],
        ...settings.keywordRules.map((rule, index) => [`keywordRules.${index}`, rule.options]),
    ];
    let person = false;
    for (const [where, options] of groups) {
        options.forEach((option, index) => {
            if (option.target === 'person') person = true;
            if (option.target === 'rule' && !ruleIds.has(option.ruleId.toLowerCase())) {
                ctx.addIssue({ code: 'custom', message: 'Esa respuesta no existe', path: [...where.split('.'), 'options', index, 'ruleId'] });
            }
        });
    }
    const handoffText = settings.handoff?.text ?? DEFAULT_HANDOFF_TEXT;
    if (person && handoffText.trim().length === 0) {
        ctx.addIssue({ code: 'custom', message: 'Escribe lo que responde el bot al pedir una persona', path: ['handoff', 'text'] });
    }
};

export const autoReplySettingsSchema = z.object({
    enabled: z.boolean(),
    timezone: z.string().refine(isValidTimeZone, 'Zona horaria no válida'),
    handoffHours: oneOf(HANDOFF_HOURS, 'Elige 1, 4, 12 o 24 horas'),
    welcome: z.object({
        enabled: z.boolean(),
        text: replyTextSchema,
        returnAfterDays: oneOf(RETURN_AFTER_DAYS, 'Elige 7, 30 o 90 días, o nunca'),
        options: optionsSchema,
    }).refine(hasTextIfEnabled, textWhenEnabled),
    outOfHours: z.object({
        enabled: z.boolean(),
        text: replyTextSchema,
        schedule: scheduleSchema,
    })
        .refine(hasTextIfEnabled, textWhenEnabled)
        .refine(
            ({ enabled, schedule }) => !enabled || WEEK_DAYS.some(day => !schedule[day].closed),
            { message: 'Abre al menos un día', path: ['schedule'] },
        ),
    keywordRules: z.array(keywordRuleSchema)
        .max(KEYWORD_RULES_MAX, `Como mucho ${KEYWORD_RULES_MAX} reglas`)
        // Cada regla recuerda por su id cuándo respondió en cada conversación:
        // dos con el mismo id se callarían la una a la otra durante 24 h.
        .refine(rules => {
            const ids = rules.filter(rule => rule.id).map(rule => rule.id.toLowerCase());
            return new Set(ids).size === ids.length;
        }, 'Dos reglas no pueden tener el mismo id'),
    // Opcional: una pestaña con la página de antes no lo manda.
    fallback: z.object({
        enabled: z.boolean(),
        text: replyTextSchema,
        options: optionsSchema,
    }).refine(hasTextIfEnabled, textWhenEnabled).default({ enabled: false, text: '', options: [] }),
    // Opcional: la página de antes de los menús no lo manda, y así se la
    // reconoce (decisión G del spec: el controlador da 409 si borraría menús).
    handoff: z.object({ text: replyTextSchema }).optional(),
}).superRefine(checkMenus);

const previewMessageSchema = z.string().trim()
    .min(1, 'Escribe un mensaje de prueba')
    .max(PREVIEW_TEXT_MAX, `Máximo ${PREVIEW_TEXT_MAX} caracteres`);

// El toque de una opción en la prueba (bot con menús): su id y su título, que
// es lo que cuenta si el toque ya no lleva a ningún sitio (un toque viejo).
const previewTapSchema = z.object({
    optionId: z.string().max(256, 'Id de opción no válido'),
    title: z.string().trim().min(1, 'Falta el título de la opción').max(24, 'Título de opción no válido'),
});

// POST /auto-replies/preview — qué respondería esta configuración, sin guardarla,
// a una conversación (`messages`): textos escritos o toques de opciones.
export const autoReplyPreviewSchema = z.object({
    settings: autoReplySettingsSchema,
    messages: z.array(z.union([previewMessageSchema, previewTapSchema]))
        .min(1, 'Escribe un mensaje de prueba')
        .max(PREVIEW_MESSAGES_MAX, `Como mucho ${PREVIEW_MESSAGES_MAX} mensajes: reinicia la conversación`),
});
