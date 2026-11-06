// ---------------------------------------------------------------------------
// Respuestas automáticas: qué responder a un mensaje entrante. Todo puro, sin
// BD ni Meta: el worker (`workers/auto.reply.worker.js`) carga los datos, llama
// a `decideAutoReply` y envía. El porqué de cada regla está en
// docs/superpowers/specs/2026-10-15-respuestas-automaticas-design.md.
// ---------------------------------------------------------------------------

import { closedPeriodKey } from './business.hours.js';
import { DEFAULT_HANDOFF_TEXT, buildInteractivePayload, optionId, parseOptionId } from './auto.reply.options.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Cada texto cabe con holgura: bienvenida + 3 palabras clave + fuera de
// horario, unidos, no pasan de los 4096 caracteres de WhatsApp.
export const AUTO_REPLY_TEXT_MAX = 800;
// Un menú de varios niveles necesita más respuestas que la v1 (30).
export const KEYWORD_RULES_MAX = 50;
export const RULE_NAME_MAX = 40;
export const KEYWORDS_PER_RULE_MAX = 20;
export const KEYWORD_MAX = 60;
// Cuántas reglas de palabras clave entran en una misma respuesta.
export const KEYWORD_REPLIES_MAX = 3;
// El freno anti-bucle: como mucho BURST_MAX respuestas en BURST_WINDOW_MS por
// conversación, por si al otro lado hay otro bot. Los toques de un menú ni se
// frenan ni cuentan: solo los hace una persona (decisión del 2026-11-05).
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
 * («Imagen»): esa no la escribió nadie. De un toque en un menú, su título: un
 * toque viejo se trata como si lo hubiera escrito (spec del bot con menús,
 * § 4.3). Los botones de una plantilla (`button`) no.
 */
export const inboundMatchText = ({ type, text, caption }) => {
    if (type === 'text' || type === 'interactive') return text ?? null;
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
    welcome: { enabled: false, text: '', returnAfterDays: 30, options: [], position: null },
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
    fallback: { enabled: false, text: '', options: [], position: null },
    handoff: { text: DEFAULT_HANDOFF_TEXT, position: null },
});

/**
 * Una configuración leída de la BD con todo lo que se añadió después de
 * guardarla: con `.lean()` los defaults del modelo no se aplican, y una de la
 * v1 no tiene `handoff`, `options` ni `name` (revisión de Codex del plan del
 * bot con menús, 5), ni `position` (la tarjeta del lienzo, de la página nueva), ni `fallback` si es anterior al 2026-10-15. Toda lectura
 * pasa por aquí. No cambia el original.
 */
export const withAutoReplyDefaults = (stored) => ({
    ...stored,
    welcome: { ...stored.welcome, options: stored.welcome?.options ?? [], position: stored.welcome?.position ?? null },
    keywordRules: (stored.keywordRules ?? []).map(rule => ({
        ...rule, name: rule.name ?? '', options: rule.options ?? [], position: rule.position ?? null,
    })),
    fallback: {
        enabled: false, text: '', ...stored.fallback, options: stored.fallback?.options ?? [], position: stored.fallback?.position ?? null,
    },
    handoff: { text: DEFAULT_HANDOFF_TEXT, ...stored.handoff, position: stored.handoff?.position ?? null },
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
    const empty = { texts: [], ruleIds: [], matched: [], repeated: [], rules: [] };
    const matchText = inboundMatchText(message);
    if (!hasText(matchText)) return empty;
    const normalized = normalizeForMatch(matchText);

    const { texts, ruleIds, matched, repeated, rules } = empty;
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
        rules.push(rule);
    }
    return { texts, ruleIds, matched, repeated, rules };
};

// Las opciones como van a Meta: `{ id, title }`, con el id que dice adónde llevan.
const wireOptions = (options = []) => options.map(option => ({
    id: optionId({ target: option.target, ruleId: option.ruleId != null ? String(option.ruleId) : null }),
    title: option.title,
}));

const appliesToLine = (rule, lineId) => {
    const lineIds = (rule.lineIds ?? []).map(String);
    return lineIds.length === 0 || lineIds.includes(String(lineId));
};

const handoffTextOf = (settings) => settings.handoff?.text ?? DEFAULT_HANDOFF_TEXT;

/**
 * El toque de un menú (`choiceId`), si todavía lleva a algún sitio: una regla
 * que existe, encendida, con texto y de esta línea; el inicio con la
 * bienvenida encendida; una persona con su texto. Si no, null: un toque viejo
 * se trata como un texto escrito con su título (spec del bot con menús, § 4.3).
 */
const resolveChoice = (settings, choiceId, lineId) => {
    const choice = parseOptionId(choiceId);
    if (!choice) return null;
    if (choice.target === 'start') {
        return settings.welcome?.enabled && hasText(settings.welcome.text) ? choice : null;
    }
    if (choice.target === 'person') return hasText(handoffTextOf(settings)) ? choice : null;
    const wanted = choice.ruleId.toLowerCase();
    const rule = (settings.keywordRules ?? []).find(candidate => String(ruleIdOf(candidate)).toLowerCase() === wanted);
    if (!rule?.enabled || !hasText(rule.text) || !appliesToLine(rule, lineId)) return null;
    return { ...choice, rule };
};

// El fuera de horario, si está cerrado y ese tramo no se avisó: su clave, o null.
const pendingOutOfHoursKey = (settings, state, now) => {
    const { outOfHours } = settings;
    if (!outOfHours?.enabled || !hasText(outOfHours.text)) return null;
    const key = closedPeriodKey(outOfHours.schedule, settings.timezone, now);
    return key && key !== state.outOfHoursNotified ? key : null;
};

// Lo que responde un toque válido: su texto y sus opciones, más el fuera de
// horario. Una regla tocada responde aunque haya salido hace poco (el contacto
// la pidió) y cuenta como salida (decisión D del spec). Nunca saluda.
const replyToChoice = (settings, state, choice, now) => {
    let parts;
    let options = [];
    if (choice.target === 'rule') {
        parts = [choice.rule.text];
        options = choice.rule.options;
    } else if (choice.target === 'start') {
        parts = [settings.welcome.text];
        options = settings.welcome.options;
    } else {
        parts = [handoffTextOf(settings)];
    }
    const outOfHoursKey = pendingOutOfHoursKey(settings, state, now);
    if (outOfHoursKey) parts.push(settings.outOfHours.text);

    const ruleId = choice.target === 'rule' ? ruleIdOf(choice.rule) : null;
    return {
        parts,
        text: parts.join(PART_SEPARATOR),
        options: wireOptions(options),
        claims: { welcomed: false, outOfHoursKey, keywordRuleIds: ruleId ? [ruleId] : [], fallback: false },
        explain: {
            welcome: false, keywords: [], repeatedKeywords: [], outOfHours: outOfHoursKey !== null,
            fallback: false, fallbackRepeated: false, choice: choice.target, choiceRuleId: ruleId,
        },
        ...(choice.target === 'person' && { handoffRequested: true }),
    };
};

/**
 * Qué responder a un entrante, o por qué no. `state` es `Conversation.bot`;
 * `welcomedAt`, el de `Contact.autoReply` (la bienvenida es de la cuenta);
 * `previousInboundAt`, cuándo había escrito antes el contacto en la cuenta;
 * `handoffRequest`, la marca de «pide una persona» de la conversación.
 * Las partes van en orden: bienvenida, palabras clave y fuera de horario; el
 * «no entiendo», solo si no saldría nada más y el contacto escribió algo.
 * Un toque de un menú (`message.choiceId`) responde lo que eligió (spec del
 * bot con menús, § 4.3). `options` son las opciones del mensaje, ya con su id.
 * `claims` es lo que se marca SOLO si Meta acepta el envío. `explain` dice qué
 * salió y qué se calló por repetido (lo usa la prueba de la página), también
 * en un `skip: 'no_match'`. `handoffRequested: true` (solo entonces está) pide
 * marcar la conversación, también con un `skip` por la pausa o el freno: el
 * contacto pidió una persona y eso se avisa igual (decisión C del spec).
 * Un toque (`type: 'interactive'`) no lo para el freno de ráfagas ni cuenta
 * para él (`claims.tap`): un toque solo lo hace una persona.
 */
export const decideAutoReply = ({ settings, state = {}, welcomedAt = null, message, previousInboundAt = null, lineId = null, handoffRequest = null, now = new Date() }) => {
    state ??= {};
    if (!settings?.enabled) return { skip: 'disabled' };
    // Pide una persona: el bot se calla hasta que alguien responda o la quite.
    if (handoffRequest) return { skip: 'handoff' };
    const choice = resolveChoice(settings, message?.choiceId, lineId);
    const handoff = choice?.target === 'person' ? { handoffRequested: true } : {};
    if (state.humanRepliedAt && !olderThan(state.humanRepliedAt, settings.handoffHours * HOUR_MS, now)) {
        return { skip: 'human', ...handoff };
    }
    const tap = message?.type === 'interactive';
    if (!tap && recentRepliesOf(state, now).length >= BURST_MAX) return { skip: 'burst' };
    if (IGNORED_TYPES.has(message?.type)) return { skip: 'ignored_type' };
    const decision = choice ? replyToChoice(settings, state, choice, now) : decideWritten(settings, state, welcomedAt, message, previousInboundAt, lineId, now);
    if (tap && decision.claims) decision.claims.tap = true;
    return decision;
};

// Lo que responde un texto escrito (o un toque viejo, tratado como texto).
const decideWritten = (settings, state, welcomedAt, message, previousInboundAt, lineId, now) => {
    // Una sola ventana para no repetirse: las horas de «Cuándo se calla».
    const windowMs = settings.handoffHours * HOUR_MS;
    const parts = [];
    // Un toque, aunque sea viejo, nunca saluda (revisión de Codex del PR #181).
    const welcomed = message?.type !== 'interactive' && shouldWelcome(settings, previousInboundAt, welcomedAt, now);
    if (welcomed) parts.push(settings.welcome.text);

    const keywords = matchingKeywordRules(settings, state, message, lineId, now, windowMs);
    parts.push(...keywords.texts);

    const outOfHoursKey = pendingOutOfHoursKey(settings, state, now);
    if (outOfHoursKey) parts.push(settings.outOfHours.text);

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
        choice: null,
    };
    if (parts.length === 0) return { skip: 'no_match', explain };

    // Un mensaje lleva un solo juego de opciones: las de la primera respuesta
    // por palabra clave que tenga; si no, las de la bienvenida o las del «no
    // entiendo», si salieron (spec del bot con menús, § 4.2).
    const optionsSource = keywords.rules.find(rule => rule.options?.length > 0)?.options
        ?? (welcomed && settings.welcome.options?.length > 0 ? settings.welcome.options : null)
        ?? (fallback ? fallbackSettings.options : null);
    return {
        parts,
        text: parts.join(PART_SEPARATOR),
        options: wireOptions(optionsSource ?? []),
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
    // La respuesta a un toque no cuenta para el freno.
    if (!claims.tap) update['bot.recentReplies'] = [...recentRepliesOf(state ?? {}, now), now].slice(-BURST_MAX);
    return update;
};

/**
 * `Conversation.bot` tras aplicarle el `$set` de `botStateUpdate`: lo que el
 * worker deja en la BD, para simular una conversación sin ella.
 */
export const applyBotStateUpdate = (state, update) => {
    const next = { ...state, keywordRepliedAt: { ...(state.keywordRepliedAt instanceof Map ? Object.fromEntries(state.keywordRepliedAt) : state.keywordRepliedAt ?? {}) } };
    for (const [path, value] of Object.entries(update)) {
        const [, field, id] = path.split('.');
        if (field === 'keywordRepliedAt') next.keywordRepliedAt[id] = value;
        else next[field] = value;
    }
    return next;
};

export const PREVIEW_MESSAGES_MAX = 20;

/**
 * «Probar» de la página: qué respondería el bot, mensaje a mensaje, a un
 * contacto nuevo que escribe `messages` ahora (spec § 10). Usa `decideAutoReply`
 * y `botStateUpdate`, los mismos del worker, así la prueba no se desfasa:
 * - con el interruptor general forzado a encendido (se prueba antes de encender);
 * - cada regla con su id, o `new-<posición>` si es nueva y aún no tiene uno
 *   (las opciones apuntan a las reglas por su id);
 * - `previousInboundAt` avanza con cada mensaje, también sin respuesta, y lo
 *   demás solo tras responder, como tras un envío aceptado;
 * - sin el freno de ráfagas (probando se escribe seguido) ni pausa (no responde nadie);
 * - un mensaje es un texto o el toque de una opción, `{ optionId, title }`; un
 *   toque de «persona» deja la conversación marcada y el bot callado, como de verdad.
 * Cada turno dice qué partes salieron, qué se calló por repetido y con qué opciones.
 */
export const simulateConversation = ({ settings, messages, now = new Date() }) => {
    const simulated = {
        ...settings,
        enabled: true,
        keywordRules: (settings.keywordRules ?? []).map((rule, index) => ({ ...rule, _id: rule.id ?? rule._id ?? `new-${index}` })),
    };
    let state = {};
    let welcomedAt = null;
    let previousInboundAt = null;
    let handoffRequest = null;

    return messages.map(entry => {
        const message = typeof entry === 'string'
            ? { type: 'text', text: entry, caption: null }
            : { type: 'interactive', text: entry.title, caption: null, choiceId: entry.optionId };
        const result = decideAutoReply({
            settings: simulated, state, welcomedAt, message, previousInboundAt, lineId: null, handoffRequest, now,
        });
        previousInboundAt = now;
        if (result.handoffRequested) handoffRequest = { at: now };
        if (!result.skip) {
            if (result.claims.welcomed) welcomedAt = now;
            state = { ...applyBotStateUpdate(state, botStateUpdate(state, result.claims, now)), recentReplies: [] };
        }
        return previewTurn(simulated, result);
    });
};

// Las partes con su origen, en el orden del mensaje; una regla con el mismo
// texto que otra no añade parte (sale una vez), como en `decideAutoReply`.
// `ruleIndex` es la posición de la regla en la configuración.
const previewTurn = (settings, result) => {
    const explain = result.explain;
    const indexOf = new Map(settings.keywordRules.map((rule, index) => [String(rule._id), index]));
    const parts = [];
    if (explain?.choice === 'rule') {
        const ruleIndex = indexOf.get(String(explain.choiceRuleId));
        parts.push({ kind: 'option', text: settings.keywordRules[ruleIndex].text, ruleIndex });
    }
    if (explain?.choice === 'start') parts.push({ kind: 'welcome', text: settings.welcome.text });
    if (explain?.choice === 'person') parts.push({ kind: 'handoff', text: handoffTextOf(settings) });
    if (explain?.welcome) parts.push({ kind: 'welcome', text: settings.welcome.text });
    for (const { id, keyword } of explain?.keywords ?? []) {
        const ruleIndex = indexOf.get(String(id));
        const { text } = settings.keywordRules[ruleIndex];
        if (!parts.some(part => part.kind === 'keyword' && part.text === text)) parts.push({ kind: 'keyword', text, ruleIndex, keyword });
    }
    if (explain?.outOfHours) parts.push({ kind: 'outOfHours', text: settings.outOfHours.text });
    if (explain?.fallback) parts.push({ kind: 'fallback', text: settings.fallback.text });

    const options = result.options ?? [];
    return {
        reply: result.text ?? null,
        parts,
        repeated: (explain?.repeatedKeywords ?? []).map(({ id, keyword }) => ({ ruleIndex: indexOf.get(String(id)), keyword })),
        fallbackRepeated: explain?.fallbackRepeated ?? false,
        skip: result.skip ?? null,
        options,
        optionsFormat: options.length > 0 ? buildInteractivePayload({ text: result.text, options }).format : null,
    };
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
