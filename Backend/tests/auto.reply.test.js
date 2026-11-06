import test from 'node:test';
import assert from 'node:assert/strict';

import {
    simulateConversation, applyBotStateUpdate,
    autoReplyOutcome, botStateUpdate, decideAutoReply, defaultAutoReplySettings, inboundMatchText, matchesKeyword, normalizeForMatch,
    withAutoReplyDefaults,
} from '../src/utils/auto.reply.js';

test('normalizeForMatch quita tildes, mayúsculas y puntuación', () => {
    assert.equal(normalizeForMatch('¿Cuánto   CUESTA, el Envío?'), 'cuanto cuesta el envio');
    assert.equal(normalizeForMatch('Ñandú!!'), 'nandu');
});

test('matchesKeyword encuentra frases como palabras completas', () => {
    const texto = normalizeForMatch('hola, cuál es el precio?');

    assert.equal(matchesKeyword(texto, 'precio'), true);
    assert.equal(matchesKeyword(texto, 'Precio'), true);
    assert.equal(matchesKeyword(texto, 'el precio'), true);
    assert.equal(matchesKeyword(texto, 'cual es'), true);
});

// «preciosa» contiene «precio»: buscando por subcadena, un piropo a la muñeca
// respondía con la lista de precios.
test('matchesKeyword no encuentra una palabra dentro de otra', () => {
    assert.equal(matchesKeyword(normalizeForMatch('qué preciosa la muñeca'), 'precio'), false);
});

test('una frase que queda vacía al normalizar no coincide con nada', () => {
    assert.equal(matchesKeyword(normalizeForMatch('hola'), '¿?'), false);
});

test('inboundMatchText usa el texto o lo que se escribió junto al archivo', () => {
    assert.equal(inboundMatchText({ type: 'text', text: 'precio' }), 'precio');
    assert.equal(inboundMatchText({ type: 'image', text: 'cuánto este?', caption: 'cuánto este?' }), 'cuánto este?');
});

// La etiqueta automática («Imagen», «Nota de voz») no la escribió el contacto:
// nunca puede disparar una regla.
test('inboundMatchText ignora la etiqueta de un adjunto sin texto', () => {
    assert.equal(inboundMatchText({ type: 'image', text: 'Imagen', caption: null }), null);
    assert.equal(inboundMatchText({ type: 'audio', text: 'Nota de voz' }), null);
});

// Bot con menús: un toque viejo (su respuesta ya no existe) se trata como si el
// contacto hubiera escrito el título del botón (spec 2026-11-05 § 4.3). Los
// botones de una plantilla siguen sin disparar palabras clave.
test('inboundMatchText usa el título de un toque, no el de un botón de plantilla', () => {
    assert.equal(inboundMatchText({ type: 'interactive', text: 'Precios', caption: null }), 'Precios');
    assert.equal(inboundMatchText({ type: 'button', text: 'Confirmar', caption: null }), null);
});

// --- decideAutoReply -------------------------------------------------------

const ecuador = (localIso) => new Date(`${localIso}-05:00`);
// Miércoles a las 10:00: abierto. Sábado a las 22:00: cerrado desde las 13:00.
const OPEN = ecuador('2026-10-14T10:00');
const CLOSED = ecuador('2026-10-17T22:00');
const hoursBefore = (date, hours) => new Date(date.getTime() - hours * 60 * 60 * 1000);
const minutesBefore = (date, minutes) => new Date(date.getTime() - minutes * 60 * 1000);

const weekday = { closed: false, ranges: [{ start: '08:00', end: '13:00' }, { start: '14:30', end: '18:00' }] };
const rule = (id, keywords, text, extra = {}) => ({ _id: id, enabled: true, keywords, text, lineIds: [], ...extra });

const SETTINGS = {
    enabled: true,
    timezone: 'America/Guayaquil',
    handoffHours: 12,
    welcome: { enabled: true, text: '¡Hola!', returnAfterDays: 30 },
    outOfHours: {
        enabled: true,
        text: 'Estamos cerrados',
        schedule: {
            mon: weekday, tue: weekday, wed: weekday, thu: weekday, fri: weekday,
            sat: { closed: false, ranges: [{ start: '09:00', end: '13:00' }] },
            sun: { closed: true, ranges: [] },
        },
    },
    keywordRules: [
        rule('r-precio', ['precio', 'cuanto cuesta'], 'Cuesta $10'),
        rule('r-ubicacion', ['ubicacion', 'donde quedan'], 'Estamos en el centro'),
    ],
};

const text = (body) => ({ type: 'text', text: body, caption: null });
const KNOWN = hoursBefore(OPEN, 24); // ya escribió ayer: no es nuevo

const decide = (overrides = {}) => decideAutoReply({
    settings: SETTINGS,
    state: {},
    welcomedAt: null,
    message: text('hola'),
    previousInboundAt: null,
    lineId: 'l1',
    now: OPEN,
    ...overrides,
});

test('con el interruptor apagado no responde', () => {
    assert.deepEqual(decide({ settings: { ...SETTINGS, enabled: false } }), { skip: 'disabled' });
});

test('un contacto nuevo fuera de horario que pregunta dos cosas recibe todo en un mensaje', () => {
    const result = decide({ message: text('hola, precio y dónde quedan?'), now: CLOSED });

    assert.deepEqual(result.parts, ['¡Hola!', 'Cuesta $10', 'Estamos en el centro', 'Estamos cerrados']);
    assert.equal(result.text, '¡Hola!\n\nCuesta $10\n\nEstamos en el centro\n\nEstamos cerrados');
    assert.deepEqual(result.claims, {
        welcomed: true,
        outOfHoursKey: '2026-10-17T13:00',
        keywordRuleIds: ['r-precio', 'r-ubicacion'],
        fallback: false,
    });
});

test('la bienvenida vuelve después de returnAfterDays sin escribir', () => {
    const at = (days) => decide({ previousInboundAt: hoursBefore(OPEN, days * 24) });

    assert.equal(at(31).claims.welcomed, true);
    assert.equal(at(29).skip, 'no_match');
});

test('con returnAfterDays null solo saluda a quien nunca escribió', () => {
    const settings = { ...SETTINGS, welcome: { ...SETTINGS.welcome, returnAfterDays: null } };

    assert.equal(decide({ settings, previousInboundAt: hoursBefore(OPEN, 24 * 365) }).skip, 'no_match');
    assert.equal(decide({ settings }).claims.welcomed, true);
    assert.equal(decide({ settings, welcomedAt: hoursBefore(OPEN, 24 * 365) }).skip, 'no_match');
});

// La ráfaga del primer contacto: el segundo mensaje todavía ve
// `previousInboundAt: null`, pero ya se le saludó. Sin mirar `welcomedAt`
// salían dos bienvenidas.
test('no saluda dos veces en la misma ráfaga', () => {
    assert.equal(decide({ welcomedAt: hoursBefore(OPEN, 1) }).skip, 'no_match');
});

test('una persona atendiendo calla al bot durante handoffHours', () => {
    assert.deepEqual(decide({ state: { humanRepliedAt: hoursBefore(OPEN, 11) } }), { skip: 'human' });
    assert.equal(decide({ state: { humanRepliedAt: hoursBefore(OPEN, 13) } }).claims.welcomed, true);
});

test('el freno: como mucho 3 respuestas en 10 minutos', () => {
    const recent = (minutes) => minutes.map(m => minutesBefore(OPEN, m));

    assert.deepEqual(decide({ state: { recentReplies: recent([1, 4, 9]) } }), { skip: 'burst' });
    assert.equal(decide({ state: { recentReplies: recent([1, 4]) } }).claims.welcomed, true);
    assert.equal(decide({ state: { recentReplies: recent([1, 4, 11]) } }).claims.welcomed, true);
});

test('una reacción no dispara nada', () => {
    assert.deepEqual(decide({ message: { type: 'reaction', text: 'Reaccionó con 👍', caption: null } }), { skip: 'ignored_type' });
});

test('fuera de horario se avisa una vez por tramo cerrado', () => {
    const state = { outOfHoursNotified: '2026-10-17T13:00' };

    assert.equal(decide({ state, now: CLOSED, previousInboundAt: KNOWN }).skip, 'no_match');
    assert.deepEqual(
        decide({ state: { outOfHoursNotified: '2026-10-16T18:00' }, now: CLOSED, previousInboundAt: KNOWN }).parts,
        ['Estamos cerrados'],
    );
});

test('como mucho 3 palabras clave, en el orden de la lista', () => {
    const settings = {
        ...SETTINGS,
        keywordRules: [
            rule('a', ['envio'], 'A'), rule('b', ['envio'], 'B'), rule('c', ['envio'], 'C'), rule('d', ['envio'], 'D'),
        ],
    };
    const result = decide({ settings, message: text('envío?'), previousInboundAt: KNOWN });

    assert.deepEqual(result.parts, ['A', 'B', 'C']);
    assert.deepEqual(result.claims.keywordRuleIds, ['a', 'b', 'c']);
});

test('una regla apagada no responde', () => {
    const settings = { ...SETTINGS, keywordRules: [rule('r', ['precio'], 'Cuesta $10', { enabled: false })] };
    assert.equal(decide({ settings, message: text('precio'), previousInboundAt: KNOWN }).skip, 'no_match');
});

// Regresión: la ventana eran 24 h fijas (KEYWORD_COOLDOWN_MS); desde el
// 2026-10-15 son las horas de «Cuándo se calla», también para el «no entiendo».
test('la misma regla no se repite en la conversación durante handoffHours', () => {
    const at = (handoffHours, minutesAgo, state = (date) => new Map([['r-precio', date]])) => decide({
        settings: { ...SETTINGS, handoffHours },
        state: { keywordRepliedAt: state(minutesBefore(OPEN, minutesAgo)) },
        message: text('precio'),
        previousInboundAt: KNOWN,
    });

    assert.equal(at(1, 30).skip, 'no_match');
    assert.deepEqual(at(1, 120).parts, ['Cuesta $10']);
    // En el límite exacto todavía no; un minuto después, sí. Con Map (documento) y con objeto (`.lean()`).
    assert.equal(at(24, 24 * 60).skip, 'no_match');
    assert.deepEqual(at(24, 24 * 60 + 1).parts, ['Cuesta $10']);
    const plain = (date) => ({ 'r-precio': date });
    assert.equal(at(24, 24 * 60, plain).skip, 'no_match');
    assert.deepEqual(at(24, 24 * 60 + 1, plain).parts, ['Cuesta $10']);
});

test('que una regla haya respondido no calla a las demás', () => {
    const result = decide({
        state: { keywordRepliedAt: { 'r-precio': hoursBefore(OPEN, 1) } },
        message: text('precio y ubicación?'),
        previousInboundAt: KNOWN,
    });

    assert.deepEqual(result.parts, ['Estamos en el centro']);
    assert.deepEqual(result.claims.keywordRuleIds, ['r-ubicacion']);
});

test('dos reglas con el mismo texto salen una vez', () => {
    const settings = { ...SETTINGS, keywordRules: [rule('a', ['precio'], 'Cuesta $10'), rule('b', ['valor'], 'Cuesta $10')] };
    const result = decide({ settings, message: text('precio y valor'), previousInboundAt: KNOWN });

    assert.deepEqual(result.parts, ['Cuesta $10']);
    assert.deepEqual(result.claims.keywordRuleIds, ['a', 'b']);
});

test('una regla con líneas solo responde en ellas', () => {
    const settings = { ...SETTINGS, keywordRules: [rule('r', ['precio'], 'Cuesta $10', { lineIds: ['l2'] })] };

    assert.equal(decide({ settings, message: text('precio'), previousInboundAt: KNOWN, lineId: 'l1' }).skip, 'no_match');
    assert.deepEqual(decide({ settings, message: text('precio'), previousInboundAt: KNOWN, lineId: 'l2' }).parts, ['Cuesta $10']);
});

test('un sticker de un contacto nuevo recibe la bienvenida; una imagen sin texto no dispara palabras clave', () => {
    assert.deepEqual(decide({ message: { type: 'sticker', text: 'Sticker', caption: null } }).parts, ['¡Hola!']);
    const settings = { ...SETTINGS, keywordRules: [rule('r', ['imagen'], 'No')] };
    assert.equal(
        decide({ settings, message: { type: 'image', text: 'Imagen', caption: null }, previousInboundAt: KNOWN }).skip,
        'no_match',
    );
});

test('sin nada que responder dice por qué', () => {
    assert.equal(decide({ message: text('gracias'), previousInboundAt: KNOWN }).skip, 'no_match');
});

// --- «Si no entiende» ---------------------------------------------------------

const WITH_FALLBACK = { ...SETTINGS, fallback: { enabled: true, text: 'No te entendí' } };

/**
 * Una conversación real, mensaje a mensaje, separados `gapMinutes`: lo que
 * marcaría el worker tras cada respuesta, y `previousInboundAt` con CADA entrante.
 */
const converse = (settings, bodies, { start = OPEN, gapMinutes = 11 } = {}) => {
    let state = {};
    let welcomedAt = null;
    let previousInboundAt = null;
    return bodies.map((body, index) => {
        const now = new Date(start.getTime() + index * gapMinutes * 60 * 1000);
        const result = decideAutoReply({ settings, state, welcomedAt, message: text(body), previousInboundAt, lineId: 'l1', now });
        if (!result.skip) {
            if (result.claims.welcomed) welcomedAt = now;
            state = applyBotStateUpdate(state, botStateUpdate(state, result.claims, now));
        }
        previousInboundAt = now;
        return result;
    });
};

// El ejemplo de Jonathan (spec § 10). Con 11 minutos entre mensajes, el freno
// de ráfagas (10 minutos) no entra: lo que calla al bot es haber respondido ya.
test('la tabla de Jonathan: bienvenida, no entiendo, nada, precio, nada', () => {
    const turns = converse(WITH_FALLBACK, [
        'me gusta el café con pan', 'me gusta el café con pan', 'me gusta el café con pan', 'cuál es el precio', 'cuál es el precio',
    ]);

    assert.deepEqual(turns.map(turn => turn.skip ?? turn.parts), [
        ['¡Hola!'], ['No te entendí'], 'no_match', ['Cuesta $10'], 'no_match',
    ]);
    assert.equal(turns[1].claims.fallback, true);
    assert.equal(turns[2].explain.fallbackRepeated, true);
    assert.deepEqual(turns[4].explain.repeatedKeywords, [{ id: 'r-precio', keyword: 'precio' }]);
});

test('el freno, la pausa y una reacción ganan al no entiendo', () => {
    const recent = [minutesBefore(OPEN, 1), minutesBefore(OPEN, 2), minutesBefore(OPEN, 3)];
    const base = { settings: WITH_FALLBACK, message: text('café'), previousInboundAt: KNOWN, welcomedAt: KNOWN };

    assert.deepEqual(decide({ ...base, state: { humanRepliedAt: hoursBefore(OPEN, 1) } }), { skip: 'human' });
    assert.deepEqual(decide({ ...base, state: { recentReplies: recent } }), { skip: 'burst' });
    assert.deepEqual(decide({ ...base, message: { type: 'reaction', text: '👍', caption: null } }), { skip: 'ignored_type' });
});

test('el no entiendo no se suma a otra respuesta', () => {
    const welcome = decide({ settings: WITH_FALLBACK, message: text('café') });
    const keyword = decide({ settings: WITH_FALLBACK, message: text('precio'), previousInboundAt: KNOWN });
    const closed = decide({ settings: WITH_FALLBACK, message: text('café'), previousInboundAt: KNOWN, now: CLOSED });

    assert.deepEqual([welcome.parts, keyword.parts, closed.parts], [['¡Hola!'], ['Cuesta $10'], ['Estamos cerrados']]);
    for (const result of [welcome, keyword, closed]) assert.equal(result.claims.fallback, false);
});

test('de noche: fuera de horario y después no entiendo', () => {
    const settings = { ...WITH_FALLBACK, welcome: { ...WITH_FALLBACK.welcome, enabled: false } };
    const turns = converse(settings, ['café', 'café con pan', 'café'], { start: CLOSED });

    assert.deepEqual(turns.map(turn => turn.skip ?? turn.parts), [['Estamos cerrados'], ['No te entendí'], 'no_match']);
});

test('sin algo escrito no hay no entiendo', () => {
    const known = { settings: WITH_FALLBACK, previousInboundAt: KNOWN, welcomedAt: KNOWN };

    assert.equal(decide({ ...known, message: { type: 'image', text: 'Imagen', caption: null } }).skip, 'no_match');
    assert.equal(decide({ ...known, message: { type: 'audio', text: 'Nota de voz', caption: null } }).skip, 'no_match');
    // Lo escrito junto a la foto sí cuenta; la etiqueta automática («Imagen»), nunca.
    assert.deepEqual(decide({ ...known, message: { type: 'image', text: 'me gusta el café', caption: 'me gusta el café' } }).parts, ['No te entendí']);
});

test('una configuración sin fallback no responde no entiendo', () => {
    // Guardada antes del 2026-10-15 y leída con `.lean()`: sin la clave.
    assert.equal(decide({ message: text('café'), previousInboundAt: KNOWN }).skip, 'no_match');
});

test('el no entiendo vuelve tras handoffHours', () => {
    const at = (minutesAgo) => decide({
        settings: { ...WITH_FALLBACK, handoffHours: 24 },
        state: { fallbackRepliedAt: minutesBefore(OPEN, minutesAgo) },
        message: text('café'),
        previousInboundAt: KNOWN,
        welcomedAt: KNOWN,
    });

    assert.equal(at(60).skip, 'no_match');
    assert.equal(at(24 * 60).skip, 'no_match');
    assert.deepEqual(at(24 * 60 + 1).parts, ['No te entendí']);
});

test('explain dice qué salió y qué se calló', () => {
    const settings = {
        ...WITH_FALLBACK,
        keywordRules: [
            rule('a', ['precio'], 'Cuesta $10'),
            rule('b', ['valor'], 'Cuesta $10'),
            rule('off', ['precio'], 'Apagada', { enabled: false }),
            rule('c', ['envio'], 'Envíos'),
            rule('d', ['pago'], 'Pagos'),
            rule('e', ['horario'], 'Horario'),
            rule('f', ['color'], 'Colores'),
        ],
    };
    const result = decide({
        settings,
        state: { keywordRepliedAt: { f: minutesBefore(OPEN, 5) } },
        message: text('precio, valor, envío, pago, horario y color'),
        previousInboundAt: KNOWN,
    });

    // Textos repetidos salen una vez; la apagada no aparece; de las que quedan, tres textos.
    assert.deepEqual(result.parts, ['Cuesta $10', 'Envíos', 'Pagos']);
    assert.deepEqual(result.explain.keywords, [
        { id: 'a', keyword: 'precio' }, { id: 'b', keyword: 'valor' }, { id: 'c', keyword: 'envio' }, { id: 'd', keyword: 'pago' },
    ]);
    // Regresión (revisión de Codex del PR 4): al llenarse los tres textos se dejaba
    // de mirar, y la «f», callada por repetida, no aparecía.
    assert.deepEqual(result.explain.repeatedKeywords, [{ id: 'f', keyword: 'color' }]);
    assert.equal(result.explain.welcome, false);
    assert.equal(result.explain.fallback, false);
});

test('botStateUpdate marca el no entiendo', () => {
    const update = botStateUpdate({}, { welcomed: false, outOfHoursKey: null, keywordRuleIds: [], fallback: true }, OPEN);
    assert.equal(update['bot.fallbackRepliedAt'], OPEN);
});

// --- Probar como conversación (spec § 10) ------------------------------------

// En la prueba, cada regla es su posición: 'Cuesta $10' es la 0.
const simulate = (settings, messages, now = OPEN) => simulateConversation({ settings, messages, now });
const kinds = (turn) => turn.skip ?? turn.parts.map(part => part.kind);

test('simulateConversation reproduce la tabla de Jonathan, sin freno de ráfagas', () => {
    // Todos en el mismo minuto: con el freno, el quinto sería `burst`.
    const turns = simulate(WITH_FALLBACK, [
        'me gusta el café con pan', 'me gusta el café con pan', 'me gusta el café con pan', 'cuál es el precio', 'cuál es el precio',
    ]);

    assert.deepEqual(turns.map(kinds), [['welcome'], ['fallback'], 'no_match', ['keyword'], 'no_match']);
    assert.equal(turns[0].reply, '¡Hola!');
    assert.equal(turns[2].fallbackRepeated, true);
    assert.deepEqual(turns[3].parts, [{ kind: 'keyword', text: 'Cuesta $10', ruleIndex: 0, keyword: 'precio' }]);
    assert.deepEqual(turns[4].repeated, [{ ruleIndex: 0, keyword: 'precio' }]);
    assert.equal(turns[4].reply, null);
});

test('simulateConversation no frena las ráfagas', () => {
    const settings = {
        ...SETTINGS,
        welcome: { ...SETTINGS.welcome, enabled: false },
        keywordRules: ['a', 'b', 'c', 'd', 'e'].map(word => rule(word, [word], `Sobre ${word}`)),
    };
    const turns = simulate(settings, ['a', 'b', 'c', 'd', 'e']);

    assert.deepEqual(turns.map(turn => turn.reply), ['Sobre a', 'Sobre b', 'Sobre c', 'Sobre d', 'Sobre e']);
});

test('simulateConversation responde con el interruptor general apagado', () => {
    const [turn] = simulate({ ...WITH_FALLBACK, enabled: false }, ['hola']);
    assert.deepEqual(kinds(turn), ['welcome']);
});

test('simulateConversation de noche: el fuera de horario una vez por cierre', () => {
    const turns = simulate(SETTINGS, ['hola', 'precio?', 'hola'], CLOSED);
    assert.deepEqual(turns.map(kinds), [['welcome', 'outOfHours'], ['keyword'], 'no_match']);
});

test('applyBotStateUpdate deja el estado como lo deja el worker', () => {
    const state = { keywordRepliedAt: new Map([['a', hoursBefore(OPEN, 5)]]) };
    const next = applyBotStateUpdate(state, botStateUpdate(state, { welcomed: false, outOfHoursKey: 'k', keywordRuleIds: ['b'], fallback: true }, OPEN));

    assert.deepEqual(next.keywordRepliedAt, { a: hoursBefore(OPEN, 5), b: OPEN });
    assert.equal(next.outOfHoursNotified, 'k');
    assert.equal(next.fallbackRepliedAt, OPEN);
    assert.deepEqual(next.recentReplies, [OPEN]);
});

test('defaultAutoReplySettings: apagado y con un horario de ejemplo válido', () => {
    const settings = defaultAutoReplySettings();

    assert.equal(settings.enabled, false);
    assert.equal(settings.timezone, 'America/Guayaquil');
    assert.equal(settings.handoffHours, 12);
    assert.equal(settings.welcome.returnAfterDays, 30);
    assert.deepEqual(settings.keywordRules, []);
    assert.deepEqual(settings.outOfHours.schedule.mon.ranges, [{ start: '08:00', end: '18:00' }]);
    assert.equal(settings.outOfHours.schedule.sun.closed, true);
});

test('botStateUpdate guarda el tramo, las reglas y el freno', () => {
    const state = { recentReplies: [minutesBefore(OPEN, 2), minutesBefore(OPEN, 5), minutesBefore(OPEN, 30)] };
    const update = botStateUpdate(state, { welcomed: true, outOfHoursKey: 'k', keywordRuleIds: ['a'] }, OPEN);

    assert.deepEqual(update, {
        'bot.outOfHoursNotified': 'k',
        'bot.keywordRepliedAt.a': OPEN,
        'bot.recentReplies': [minutesBefore(OPEN, 5), minutesBefore(OPEN, 2), OPEN],
    });
});

test('autoReplyOutcome: aceptado, rechazado o incierto', () => {
    assert.deepEqual(autoReplyOutcome({ result: { status: 'sent' }, error: null, sendStarted: true }), { status: 'done', applyClaims: true });
    assert.deepEqual(autoReplyOutcome({ result: { status: 'failed', errorCode: '131026' }, error: null, sendStarted: true }), { status: 'failed', applyClaims: false });
    assert.deepEqual(autoReplyOutcome({ result: null, error: new Error('línea'), sendStarted: false }), { status: 'failed', applyClaims: false });
});

// Meta pudo aceptarlo y fallar después (al guardar): no se sabe si salió.
// Reintentarlo lo mandaría y lo cobraría dos veces.
test('autoReplyOutcome: un error después de empezar a enviar es incierto', () => {
    assert.deepEqual(autoReplyOutcome({ result: null, error: new Error('Mongo'), sendStarted: true }), { status: 'uncertain', applyClaims: false });
});

// `processMessageSending` devuelve `failed` también con un timeout, sin código
// de Meta: no es un rechazo, Meta pudo recibirlo (revisión de Codex del PR #69).
test('autoReplyOutcome: un fallo sin código de Meta (un corte de red) es incierto', () => {
    assert.deepEqual(autoReplyOutcome({ result: { status: 'failed', errorCode: null }, error: null, sendStarted: true }), { status: 'uncertain', applyClaims: false });
});

// --- Bot con menús: la configuración de antes (spec 2026-11-05) ------------

// Revisión de Codex del plan, 5: los defaults del modelo no se aplican al leer
// con `.lean()`; una configuración de la v1 llega sin los campos nuevos.
test('withAutoReplyDefaults completa una configuración de la v1 sin tocar lo que ya tenía', () => {
    const v1 = {
        enabled: true, timezone: 'America/Guayaquil', handoffHours: 4,
        welcome: { enabled: true, text: 'Hola', returnAfterDays: 7 },
        outOfHours: { enabled: false, text: '', schedule: {} },
        keywordRules: [{ _id: 'r1', enabled: true, keywords: ['precio'], text: 'Cuesta $10', lineIds: [] }],
    };
    const settings = withAutoReplyDefaults(v1);

    assert.deepEqual(settings.handoff, { text: 'Enseguida te atiende alguien del equipo', position: null });
    assert.deepEqual(settings.welcome, { enabled: true, text: 'Hola', returnAfterDays: 7, options: [], position: null });
    assert.deepEqual(settings.keywordRules, [{ _id: 'r1', enabled: true, keywords: ['precio'], text: 'Cuesta $10', lineIds: [], name: '', options: [], position: null }]);
    assert.deepEqual(settings.fallback, { enabled: false, text: '', options: [], position: null });
    assert.equal(settings.handoffHours, 4);
    assert.equal(v1.handoff, undefined, 'no cambia el original');

    const withMenus = { ...v1, handoff: { text: 'Ya va' }, welcome: { ...v1.welcome, options: [{ title: 'A', target: 'start', ruleId: null }] } };
    assert.deepEqual(withAutoReplyDefaults(withMenus).handoff, { text: 'Ya va', position: null });
    assert.equal(withAutoReplyDefaults(withMenus).welcome.options.length, 1);
});

// --- Bot con menús: toques y opciones (spec 2026-11-05) --------------------

const PRECIOS = '6729a1b2c3d4e5f6a7b8c901';
const ENVIOS = '6729a1b2c3d4e5f6a7b8c902';
const INICIO = '6729a1b2c3d4e5f6a7b8c903';
const MENU = {
    ...SETTINGS,
    welcome: {
        enabled: true, text: '¡Hola!', returnAfterDays: 30,
        options: [{ title: 'Precios', target: 'rule', ruleId: PRECIOS }, { title: 'Hablar con alguien', target: 'person', ruleId: null }],
    },
    keywordRules: [
        rule(PRECIOS, ['precio'], 'Cuesta $10', {
            options: [{ title: 'Envíos', target: 'rule', ruleId: ENVIOS }, { title: 'Hablar con alguien', target: 'person', ruleId: null }],
        }),
        rule(ENVIOS, [], 'Enviamos en 48 h', { options: [] }),
        rule(INICIO, ['inicio'], 'Escribiste inicio', { options: [] }),
    ],
    fallback: { enabled: true, text: 'No te entendí', options: [{ title: 'Volver', target: 'start', ruleId: null }] },
    handoff: { text: 'Ya te atiende alguien' },
};
const tap = (choiceId, title) => ({ type: 'interactive', text: title, caption: null, choiceId });
const decideMenu = (overrides = {}) => decide({ settings: MENU, previousInboundAt: KNOWN, ...overrides });

test('un toque a otra respuesta la responde con sus opciones, aunque haya salido hace una hora', () => {
    const result = decideMenu({
        message: tap(`wasmish:r:${ENVIOS}`, 'Envíos'),
        state: { keywordRepliedAt: { [ENVIOS]: hoursBefore(OPEN, 1) } },
    });
    assert.deepEqual(result.parts, ['Enviamos en 48 h']);
    assert.deepEqual(result.options, []);
    // Decisión D del spec: el toque cuenta como que esa respuesta salió.
    assert.deepEqual(result.claims.keywordRuleIds, [ENVIOS]);
    assert.equal(result.claims.welcomed, false);
    assert.equal(result.handoffRequested, undefined);
    assert.equal(result.explain.choice, 'rule');

    const precios = decideMenu({ message: tap(`wasmish:r:${PRECIOS}`, 'Precios') });
    assert.deepEqual(precios.options, [
        { id: `wasmish:r:${ENVIOS}`, title: 'Envíos' },
        { id: 'wasmish:person', title: 'Hablar con alguien' },
    ]);
});

test('un toque nunca saluda, ni a un contacto nuevo', () => {
    const result = decideMenu({ message: tap(`wasmish:r:${ENVIOS}`, 'Envíos'), previousInboundAt: null });
    assert.deepEqual(result.parts, ['Enviamos en 48 h']);
    assert.equal(result.claims.welcomed, false);
});

// Revisión de Codex del PR #181, 1: un toque viejo seguía el camino de un texto
// escrito y saludaba (y marcaba el saludo) a quien volvía tras `returnAfterDays`.
test('un toque viejo tampoco saluda a quien vuelve tras returnAfterDays', () => {
    const back = hoursBefore(OPEN, 24 * 31);
    const result = decideMenu({ message: tap('wasmish:r:6729a1b2c3d4e5f6a7b8c9ff', 'precio'), previousInboundAt: back, welcomedAt: back });
    assert.deepEqual(result.parts, ['Cuesta $10']);
    assert.equal(result.claims.welcomed, false);
    assert.equal(result.explain.welcome, false);
});

test('«volver al inicio» responde la bienvenida con sus opciones, sin marcar el saludo', () => {
    const result = decideMenu({ message: tap('wasmish:start', 'Volver'), previousInboundAt: null });
    assert.deepEqual(result.parts, ['¡Hola!']);
    assert.deepEqual(result.options.map(option => option.id), [`wasmish:r:${PRECIOS}`, 'wasmish:person']);
    assert.equal(result.claims.welcomed, false);
    assert.equal(result.explain.choice, 'start');
});

// Un toque viejo (spec § 4.3): se trata como si hubiera escrito el título.
test('«volver al inicio» con la bienvenida apagada se trata como texto escrito', () => {
    const settings = { ...MENU, welcome: { ...MENU.welcome, enabled: false } };
    const result = decideMenu({ settings, message: tap('wasmish:start', 'Inicio') });
    assert.deepEqual(result.parts, ['Escribiste inicio']);
    assert.equal(result.explain.choice, null);
});

test('un toque a una respuesta borrada o apagada se trata como texto escrito', () => {
    const borrada = decideMenu({ message: tap('wasmish:r:6729a1b2c3d4e5f6a7b8c9ff', 'Colores') });
    assert.deepEqual(borrada.parts, ['No te entendí']);
    assert.deepEqual(borrada.options, [{ id: 'wasmish:start', title: 'Volver' }]);

    const apagada = { ...MENU, keywordRules: MENU.keywordRules.map(r => (r._id === ENVIOS ? { ...r, enabled: false } : r)) };
    assert.deepEqual(decideMenu({ settings: apagada, message: tap(`wasmish:r:${ENVIOS}`, 'precio') }).parts, ['Cuesta $10']);

    const otraLinea = { ...MENU, keywordRules: MENU.keywordRules.map(r => (r._id === ENVIOS ? { ...r, lineIds: ['l9'] } : r)) };
    assert.deepEqual(decideMenu({ settings: otraLinea, message: tap(`wasmish:r:${ENVIOS}`, 'Envíos') }).parts, ['No te entendí']);

    // Un id que no es de Wasmish (otra integración).
    assert.deepEqual(decideMenu({ message: tap('b1', 'precio') }).parts, ['Cuesta $10']);
});

test('«hablar con una persona» responde su texto, sin opciones, y pide marcar', () => {
    const result = decideMenu({ message: tap('wasmish:person', 'Hablar con alguien') });
    assert.deepEqual(result.parts, ['Ya te atiende alguien']);
    assert.deepEqual(result.options, []);
    assert.equal(result.handoffRequested, true);
    assert.equal(result.explain.choice, 'person');

    const cerrado = decideMenu({ message: tap('wasmish:person', 'Hablar con alguien'), now: CLOSED });
    assert.deepEqual(cerrado.parts, ['Ya te atiende alguien', 'Estamos cerrados']);
    assert.ok(cerrado.claims.outOfHoursKey);

    // Sin `handoff` (la prueba de una página de antes): el texto por defecto.
    const { handoff, ...withoutHandoff } = MENU;
    assert.deepEqual(decideMenu({ settings: withoutHandoff, message: tap('wasmish:person', 'Hablar') }).parts, ['Enseguida te atiende alguien del equipo']);
});

// Decisión C del spec: la pausa calla la respuesta, no el aviso.
test('«hablar con una persona» con el bot callado: no responde, pero pide marcar', () => {
    const human = decideMenu({ message: tap('wasmish:person', 'Hablar'), state: { humanRepliedAt: hoursBefore(OPEN, 1) } });
    assert.deepEqual(human, { skip: 'human', handoffRequested: true });
});

// Probando en local (2026-11-05), el cuarto toque seguido de un menú lo calló el
// freno de ráfagas, pensado contra un bucle con otro bot. Decisión de Jonathan:
// un toque solo lo hace una persona, así que el freno ni lo para ni lo cuenta.
test('el freno de ráfagas no para ni cuenta los toques; a los textos, sí', () => {
    const recent = [1, 2, 3].map(minutes => minutesBefore(OPEN, minutes));
    const toque = decideMenu({ message: tap(`wasmish:r:${ENVIOS}`, 'Envíos'), state: { recentReplies: recent } });
    assert.deepEqual(toque.parts, ['Enviamos en 48 h']);
    assert.equal(toque.claims.tap, true);
    const persona = decideMenu({ message: tap('wasmish:person', 'Hablar'), state: { recentReplies: recent } });
    assert.equal(persona.handoffRequested, true);
    assert.deepEqual(persona.parts, ['Ya te atiende alguien']);
    // Un toque viejo también es de una persona.
    assert.deepEqual(decideMenu({ message: tap('b1', 'precio'), state: { recentReplies: recent } }).parts, ['Cuesta $10']);

    // No cuenta: el `$set` no toca `recentReplies`.
    assert.equal('bot.recentReplies' in botStateUpdate({ recentReplies: recent }, toque.claims, OPEN), false);

    assert.deepEqual(decideMenu({ message: text('precio'), state: { recentReplies: recent } }), { skip: 'burst' });
    assert.equal(decideMenu({ message: text('precio') }).claims.tap, undefined);
});

test('con la conversación marcada el bot se calla: textos y toques', () => {
    const handoffRequest = { at: hoursBefore(OPEN, 30), messageId: 'm1' };
    assert.deepEqual(decideMenu({ handoffRequest, message: text('precio') }), { skip: 'handoff' });
    assert.deepEqual(decideMenu({ handoffRequest, message: tap(`wasmish:r:${ENVIOS}`, 'Envíos') }), { skip: 'handoff' });
    assert.deepEqual(decideMenu({ handoffRequest, message: tap('wasmish:person', 'Hablar') }), { skip: 'handoff' });
    // Apagado sigue ganando.
    assert.deepEqual(decideMenu({ handoffRequest, settings: { ...MENU, enabled: false } }), { skip: 'disabled' });
});

test('las opciones de un texto escrito: las de la primera respuesta que las tenga; si no, las de la bienvenida', () => {
    const conPrecios = decideMenu({ message: text('hola, precio'), previousInboundAt: null });
    assert.deepEqual(conPrecios.parts, ['¡Hola!', 'Cuesta $10']);
    assert.deepEqual(conPrecios.options.map(option => option.title), ['Envíos', 'Hablar con alguien']);

    const sinOpciones = { ...MENU, keywordRules: MENU.keywordRules.map(r => ({ ...r, options: [] })) };
    const bienvenida = decideMenu({ settings: sinOpciones, message: text('hola, precio'), previousInboundAt: null });
    assert.deepEqual(bienvenida.options.map(option => option.title), ['Precios', 'Hablar con alguien']);

    // Ya saludado y sin opciones en la regla: sin opciones.
    assert.deepEqual(decideMenu({ settings: sinOpciones, message: text('precio') }).options, []);
    // El «no entiendo» trae las suyas.
    assert.deepEqual(decideMenu({ message: text('me gusta el café') }).options, [{ id: 'wasmish:start', title: 'Volver' }]);
});

test('simulateConversation con toques: «hablar con una persona» deja callado al bot', () => {
    const turns = simulate(MENU, ['hola', { optionId: `wasmish:r:${PRECIOS}`, title: 'Precios' }, { optionId: 'wasmish:person', title: 'Hablar con alguien' }, 'precio']);

    assert.equal(turns[0].reply, '¡Hola!');
    assert.equal(turns[0].optionsFormat, 'buttons');
    assert.deepEqual(turns[0].options.map(option => option.title), ['Precios', 'Hablar con alguien']);
    assert.deepEqual(turns[1].parts, [{ kind: 'option', text: 'Cuesta $10', ruleIndex: 0 }]);
    assert.deepEqual(turns[2].parts, [{ kind: 'handoff', text: 'Ya te atiende alguien' }]);
    assert.equal(turns[2].options.length, 0);
    assert.equal(turns[2].optionsFormat, null);
    assert.equal(turns[3].skip, 'handoff');
    assert.equal(turns[3].reply, null);
});

test('simulateConversation: una respuesta nueva sin id y una de 4 opciones como lista', () => {
    const settings = {
        ...MENU,
        welcome: { ...MENU.welcome, options: ['A', 'B', 'C', 'D'].map(title => ({ title, target: 'start', ruleId: null })) },
        keywordRules: [{ enabled: true, keywords: ['nuevo'], text: 'Regla sin id', lineIds: [], options: [] }],
    };
    const turns = simulate(settings, ['hola', 'nuevo']);
    assert.equal(turns[0].optionsFormat, 'list');
    assert.deepEqual(turns[1].parts, [{ kind: 'keyword', text: 'Regla sin id', ruleIndex: 0, keyword: 'nuevo' }]);
});
