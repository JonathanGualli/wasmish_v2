// ---------------------------------------------------------------------------
// Respuestas automáticas: qué responder a un mensaje entrante. Todo puro, sin
// BD ni Meta: el worker (`workers/auto.reply.worker.js`) carga los datos, llama
// a `decideAutoReply` y envía. El porqué de cada regla está en
// docs/superpowers/specs/2026-10-15-respuestas-automaticas-design.md.
// ---------------------------------------------------------------------------

import { closedPeriodKey } from './business.hours.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Cada texto cabe con holgura: bienvenida + 3 palabras clave + fuera de
// horario, unidos, no pasan de los 4096 caracteres de WhatsApp.
export const AUTO_REPLY_TEXT_MAX = 800;
export const KEYWORD_RULES_MAX = 30;
export const KEYWORDS_PER_RULE_MAX = 20;
export const KEYWORD_MAX = 60;
// Cuántas reglas de palabras clave entran en una misma respuesta.
export const KEYWORD_REPLIES_MAX = 3;
// El freno anti-bucle: como mucho BURST_MAX respuestas en BURST_WINDOW_MS por
// conversación, por si al otro lado hay otro bot.
export const BURST_MAX = 3;
export const BURST_WINDOW_MS = 10 * MINUTE_MS;
// Un entrante más viejo que esto ya no se responde (tras una caída, o un
// webhook que Meta entregó tarde).
export const AUTO_REPLY_EXPIRY_MS = 10 * MINUTE_MS;
export const HANDOFF_HOURS = [1, 4, 12, 24];
export const RETURN_AFTER_DAYS = [7, 30, 90, null];
export const DEFAULT_TIMEZONE = 'America/Guayaquil';

/**
 * El texto listo para comparar: sin tildes ni mayúsculas, la puntuación como
 * espacio y los espacios repetidos como uno. «¿Cuánto CUESTA?» → «cuanto cuesta».
 */
export const normalizeForMatch = (text) => String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Si `keyword` aparece en `normalizedText` (ya pasado por `normalizeForMatch`)
 * como palabras completas: «precio» encuentra «el precio?» pero no «preciosa».
 */
export const matchesKeyword = (normalizedText, keyword) => {
    const normalizedKeyword = normalizeForMatch(keyword);
    if (!normalizedKeyword) return false;
    return ` ${normalizedText} `.includes(` ${normalizedKeyword} `);
};

/**
 * Lo que escribió el contacto, para buscar palabras clave: el cuerpo de un
 * texto o lo escrito junto a un archivo. Nunca la etiqueta automática
 * («Imagen»): esa no la escribió nadie.
 */
export const inboundMatchText = ({ type, text, caption }) => {
    if (type === 'text') return text ?? null;
    return caption ?? null;
};

const PART_SEPARATOR = '\n\n';
// Tipos que nunca disparan nada: una reacción (👍) no es un mensaje que contestar.
const IGNORED_TYPES = new Set(['reaction']);

const workday = () => ({ closed: false, ranges: [{ start: '08:00', end: '18:00' }] });

/** La configuración de una cuenta que nunca la guardó: apagada, con un horario de ejemplo. */
export const defaultAutoReplySettings = () => ({
    enabled: false,
    timezone: DEFAULT_TIMEZONE,
    handoffHours: 12,
    welcome: { enabled: false, text: '', returnAfterDays: 30 },
    outOfHours: {
        enabled: false,
        text: '',
        schedule: {
            mon: workday(), tue: workday(), wed: workday(), thu: workday(), fri: workday(),
            sat: { closed: true, ranges: [] },
            sun: { closed: true, ranges: [] },
        },
    },
    keywordRules: [],
    fallback: { enabled: false, text: '' },
});

// El id de una regla: `_id` en la BD; `id` en una configuración sin guardar
// (el «probar» de la página), que puede no tenerlo si la regla es nueva.
const ruleIdOf = (rule) => (rule._id != null ? String(rule._id) : rule.id ?? null);

// `keywordRepliedAt` es un Map en un documento de Mongoose y un objeto con `.lean()`.
const repliedAt = (map, id) => (map instanceof Map ? map.get(id) : map?.[id]) ?? null;

const olderThan = (date, ms, now) => now.getTime() - new Date(date).getTime() > ms;

// Las respuestas del bot de los últimos 10 minutos, de la más vieja a la más nueva.
const recentRepliesOf = (state, now) =>
    (state.recentReplies ?? [])
        .filter(date => !olderThan(date, BURST_WINDOW_MS, now))
        .sort((a, b) => new Date(a) - new Date(b));

const hasText = (text) => typeof text === 'string' && text.trim().length > 0;

const shouldWelcome = ({ welcome }, previousInboundAt, welcomedAt, now) => {
    if (!welcome?.enabled || !hasText(welcome.text)) return false;
    const returnMs = welcome.returnAfterDays == null ? null : welcome.returnAfterDays * DAY_MS;
    // Sin `returnAfterDays`, solo quien nunca escribió (y nunca se saludó).
    const isNewOrBack = previousInboundAt == null || (returnMs != null && olderThan(previousInboundAt, returnMs, now));
    const notWelcomedYet = welcomedAt == null || (returnMs != null && olderThan(welcomedAt, returnMs, now));
    return isNewOrBack && notWelcomedYet;
};

// Las reglas que responden, en el orden de la lista: encendidas, de esta línea,
// con alguna frase en el texto y sin haber respondido aquí en `windowMs` (las
// horas de «Cuándo se calla»). Como mucho KEYWORD_REPLIES_MAX textos distintos;
// una regla con el mismo texto que otra no añade nada, pero también cuenta como
// respondida. `matched` y `repeated` dicen, para explicarlo, qué regla salió o
// se calló por repetida, y con qué frase.
const matchingKeywordRules = (settings, state, message, lineId, now, windowMs) => {
    const empty = { texts: [], ruleIds: [], matched: [], repeated: [] };
    const matchText = inboundMatchText(message);
    if (!hasText(matchText)) return empty;
    const normalized = normalizeForMatch(matchText);

    const { texts, ruleIds, matched, repeated } = empty;
    // Lleno (tres textos), se sigue mirando solo para contar las calladas por repetidas.
    let full = false;
    for (const rule of settings.keywordRules ?? []) {
        if (!rule.enabled || !hasText(rule.text)) continue;
        const lineIds = (rule.lineIds ?? []).map(String);
        if (lineIds.length > 0 && !lineIds.includes(String(lineId))) continue;
        const keyword = (rule.keywords ?? []).find(phrase => matchesKeyword(normalized, phrase));
        if (!keyword) continue;
        const id = ruleIdOf(rule);
        const last = id ? repliedAt(state.keywordRepliedAt, id) : null;
        if (last && !olderThan(last, windowMs, now)) {
            repeated.push({ id, keyword });
            continue;
        }
        if (full) continue;

        if (!texts.includes(rule.text)) {
            if (texts.length === KEYWORD_REPLIES_MAX) {
                full = true;
                continue;
            }
            texts.push(rule.text);
        }
        if (id) ruleIds.push(id);
        matched.push({ id, keyword });
    }
    return { texts, ruleIds, matched, repeated };
};

/**
 * Qué responder a un entrante, o por qué no. `state` es `Conversation.bot`;
 * `welcomedAt`, el de `Contact.autoReply` (la bienvenida es de la cuenta);
 * `previousInboundAt`, cuándo había escrito antes el contacto en la cuenta.
 * Las partes van en orden: bienvenida, palabras clave y fuera de horario; el
 * «no entiendo», solo si no saldría nada más y el contacto escribió algo.
 * `claims` es lo que se marca SOLO si Meta acepta el envío. `explain` dice qué
 * salió y qué se calló por repetido (lo usa la prueba de la página), también
 * en un `skip: 'no_match'`.
 */
export const decideAutoReply = ({ settings, state = {}, welcomedAt = null, message, previousInboundAt = null, lineId = null, now = new Date() }) => {
    state ??= {};
    if (!settings?.enabled) return { skip: 'disabled' };
    if (state.humanRepliedAt && !olderThan(state.humanRepliedAt, settings.handoffHours * HOUR_MS, now)) {
        return { skip: 'human' };
    }
    if (recentRepliesOf(state, now).length >= BURST_MAX) return { skip: 'burst' };
    if (IGNORED_TYPES.has(message?.type)) return { skip: 'ignored_type' };

    // Una sola ventana para no repetirse: las horas de «Cuándo se calla».
    const windowMs = settings.handoffHours * HOUR_MS;
    const parts = [];
    const welcomed = shouldWelcome(settings, previousInboundAt, welcomedAt, now);
    if (welcomed) parts.push(settings.welcome.text);

    const keywords = matchingKeywordRules(settings, state, message, lineId, now, windowMs);
    parts.push(...keywords.texts);

    let outOfHoursKey = null;
    const { outOfHours } = settings;
    if (outOfHours?.enabled && hasText(outOfHours.text)) {
        const key = closedPeriodKey(outOfHours.schedule, settings.timezone, now);
        if (key && key !== state.outOfHoursNotified) {
            outOfHoursKey = key;
            parts.push(outOfHours.text);
        }
    }

    // «Si no entiende»: sin `fallback` (una configuración de antes) está apagado.
    let fallback = false;
    let fallbackRepeated = false;
    const fallbackSettings = settings.fallback;
    if (parts.length === 0 && fallbackSettings?.enabled && hasText(fallbackSettings.text) && hasText(inboundMatchText(message ?? {}))) {
        if (state.fallbackRepliedAt && !olderThan(state.fallbackRepliedAt, windowMs, now)) {
            fallbackRepeated = true;
        } else {
            fallback = true;
            parts.push(fallbackSettings.text);
        }
    }

    const explain = {
        welcome: welcomed,
        keywords: keywords.matched,
        repeatedKeywords: keywords.repeated,
        outOfHours: outOfHoursKey !== null,
        fallback,
        fallbackRepeated,
    };
    if (parts.length === 0) return { skip: 'no_match', explain };
    return {
        parts,
        text: parts.join(PART_SEPARATOR),
        claims: { welcomed, outOfHoursKey, keywordRuleIds: keywords.ruleIds, fallback },
        explain,
    };
};

/**
 * El `$set` de la conversación tras un envío aceptado: el tramo avisado, las
 * reglas que respondieron, el «no entiendo» y el freno (las respuestas de los últimos 10 minutos,
 * como mucho BURST_MAX). La bienvenida se marca aparte, en el contacto.
 */
export const botStateUpdate = (state, claims, now) => {
    const update = {};
    if (claims.outOfHoursKey) update['bot.outOfHoursNotified'] = claims.outOfHoursKey;
    for (const id of claims.keywordRuleIds) update[`bot.keywordRepliedAt.${id}`] = now;
    if (claims.fallback) update['bot.fallbackRepliedAt'] = now;
    update['bot.recentReplies'] = [...recentRepliesOf(state ?? {}, now), now].slice(-BURST_MAX);
    return update;
};

/**
 * Cómo termina un trabajo según lo que pasó al enviar (la tabla del spec,
 * § 4.2). `result` es lo que devuelve `processMessageSending`, que NO lanza ni
 * con un rechazo de Meta ni con un corte de red: vuelve con `status: 'failed'`,
 * y solo el rechazo trae `errorCode`. `error`, si lanzó; `sendStarted`, si ya
 * se había empezado a enviar. Los `claims` solo se marcan con un envío
 * aceptado. Lo que Meta pudo recibir (un error después de empezar, o un fallo
 * sin código: un timeout) es `uncertain`: no se reintenta.
 */
export const autoReplyOutcome = ({ result, error, sendStarted }) => {
    if (error) return { status: sendStarted ? 'uncertain' : 'failed', applyClaims: false };
    if (result?.status === 'sent') return { status: 'done', applyClaims: true };
    if (!result?.errorCode) return { status: 'uncertain', applyClaims: false };
    return { status: 'failed', applyClaims: false };
};
