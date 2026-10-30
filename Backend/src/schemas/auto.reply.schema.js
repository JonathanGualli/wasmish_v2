import { z } from "zod";
import { objectIdSchema } from "./contact.schema.js";
import {
    AUTO_REPLY_TEXT_MAX, HANDOFF_HOURS, KEYWORD_MAX, KEYWORD_RULES_MAX, KEYWORDS_PER_RULE_MAX, PREVIEW_MESSAGES_MAX, RETURN_AFTER_DAYS,
    normalizeForMatch,
} from "../utils/auto.reply.js";
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

const keywordRuleSchema = z.object({
    // El de una regla ya guardada; sin él, la regla es nueva.
    id: objectIdSchema.optional(),
    enabled: z.boolean(),
    keywords: z.array(keywordSchema)
        .min(1, 'Escribe al menos una frase')
        .max(KEYWORDS_PER_RULE_MAX, `Como mucho ${KEYWORDS_PER_RULE_MAX} frases por regla`),
    text: replyTextSchema,
    lineIds: z.array(objectIdSchema).max(50).default([]),
}).refine(hasTextIfEnabled, textWhenEnabled);

export const autoReplySettingsSchema = z.object({
    enabled: z.boolean(),
    timezone: z.string().refine(isValidTimeZone, 'Zona horaria no válida'),
    handoffHours: oneOf(HANDOFF_HOURS, 'Elige 1, 4, 12 o 24 horas'),
    welcome: z.object({
        enabled: z.boolean(),
        text: replyTextSchema,
        returnAfterDays: oneOf(RETURN_AFTER_DAYS, 'Elige 7, 30 o 90 días, o nunca'),
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
    }).refine(hasTextIfEnabled, textWhenEnabled).default({ enabled: false, text: '' }),
});

const previewMessageSchema = z.string().trim()
    .min(1, 'Escribe un mensaje de prueba')
    .max(PREVIEW_TEXT_MAX, `Máximo ${PREVIEW_TEXT_MAX} caracteres`);

// POST /auto-replies/preview — qué respondería esta configuración, sin guardarla,
// a una conversación (`messages`).
export const autoReplyPreviewSchema = z.object({
    settings: autoReplySettingsSchema,
    messages: z.array(previewMessageSchema)
        .min(1, 'Escribe un mensaje de prueba')
        .max(PREVIEW_MESSAGES_MAX, `Como mucho ${PREVIEW_MESSAGES_MAX} mensajes: reinicia la conversación`),
});
