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
    });
});

test('la bienvenida vuelve después de returnAfterDays sin escribir', () => {
    const at = (days) => decide({ previousInboundAt: hoursBefore(OPEN, days * 24) });

    assert.equal(at(31).claims.welcomed, true);
    assert.deepEqual(at(29), { skip: 'no_match' });
});

test('con returnAfterDays null solo saluda a quien nunca escribió', () => {
    const settings = { ...SETTINGS, welcome: { ...SETTINGS.welcome, returnAfterDays: null } };

    assert.deepEqual(decide({ settings, previousInboundAt: hoursBefore(OPEN, 24 * 365) }), { skip: 'no_match' });
    assert.equal(decide({ settings }).claims.welcomed, true);
    assert.deepEqual(decide({ settings, welcomedAt: hoursBefore(OPEN, 24 * 365) }), { skip: 'no_match' });
});

// La ráfaga del primer contacto: el segundo mensaje todavía ve
// `previousInboundAt: null`, pero ya se le saludó. Sin mirar `welcomedAt`
// salían dos bienvenidas.
test('no saluda dos veces en la misma ráfaga', () => {
    assert.deepEqual(decide({ welcomedAt: hoursBefore(OPEN, 1) }), { skip: 'no_match' });
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

    assert.deepEqual(decide({ state, now: CLOSED, previousInboundAt: KNOWN }), { skip: 'no_match' });
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
    assert.deepEqual(decide({ settings, message: text('precio'), previousInboundAt: KNOWN }), { skip: 'no_match' });
});

test('la misma regla no se repite en 24 h en la conversación', () => {
    const at = (hours) => decide({
        state: { keywordRepliedAt: new Map([['r-precio', hoursBefore(OPEN, hours)]]) },
        message: text('precio'),
        previousInboundAt: KNOWN,
    });

    assert.deepEqual(at(2), { skip: 'no_match' });
    assert.deepEqual(at(25).parts, ['Cuesta $10']);
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

    assert.deepEqual(decide({ settings, message: text('precio'), previousInboundAt: KNOWN, lineId: 'l1' }), { skip: 'no_match' });
    assert.deepEqual(decide({ settings, message: text('precio'), previousInboundAt: KNOWN, lineId: 'l2' }).parts, ['Cuesta $10']);
});

test('un sticker de un contacto nuevo recibe la bienvenida; una imagen sin texto no dispara palabras clave', () => {
    assert.deepEqual(decide({ message: { type: 'sticker', text: 'Sticker', caption: null } }).parts, ['¡Hola!']);
    const settings = { ...SETTINGS, keywordRules: [rule('r', ['imagen'], 'No')] };
    assert.deepEqual(
        decide({ settings, message: { type: 'image', text: 'Imagen', caption: null }, previousInboundAt: KNOWN }),
        { skip: 'no_match' },
    );
});

test('sin nada que responder dice por qué', () => {
    assert.deepEqual(decide({ message: text('gracias'), previousInboundAt: KNOWN }), { skip: 'no_match' });
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
    assert.deepEqual(autoReplyOutcome({ result: { status: 'failed' }, error: null, sendStarted: true }), { status: 'failed', applyClaims: false });
    assert.deepEqual(autoReplyOutcome({ result: null, error: new Error('línea'), sendStarted: false }), { status: 'failed', applyClaims: false });
});

// Meta pudo aceptarlo y fallar después (al guardar): no se sabe si salió.
// Reintentarlo lo mandaría y lo cobraría dos veces.
test('autoReplyOutcome: un error después de empezar a enviar es incierto', () => {
    assert.deepEqual(autoReplyOutcome({ result: null, error: new Error('Mongo'), sendStarted: true }), { status: 'uncertain', applyClaims: false });
});
