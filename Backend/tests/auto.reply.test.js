import test from 'node:test';
import assert from 'node:assert/strict';

import {
    autoReplyOutcome, botStateUpdate, decideAutoReply, defaultAutoReplySettings, inboundMatchText, matchesKeyword, normalizeForMatch,
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

// Lo que el worker deja en `Conversation.bot` tras un envío aceptado (`botStateUpdate`).
const applyUpdate = (state, update) => {
    const next = { ...state, keywordRepliedAt: { ...(state.keywordRepliedAt ?? {}) } };
    for (const [path, value] of Object.entries(update)) {
        const [, field, id] = path.split('.');
        if (field === 'keywordRepliedAt') next.keywordRepliedAt[id] = value;
        else next[field] = value;
    }
    return next;
};

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
            state = applyUpdate(state, botStateUpdate(state, result.claims, now));
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
