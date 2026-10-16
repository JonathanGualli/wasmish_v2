import test from 'node:test';
import assert from 'node:assert/strict';

import { closedPeriodKey, isValidTimeZone, localClock, scheduleIssue } from '../src/utils/business.hours.js';

const TZ = 'America/Guayaquil';
// Una hora local de Ecuador (UTC−5, sin horario de verano) como instante.
const ecuador = (localIso) => new Date(`${localIso}-05:00`);

const weekday = { closed: false, ranges: [{ start: '08:00', end: '13:00' }, { start: '14:30', end: '18:00' }] };
const SCHEDULE = {
    mon: weekday, tue: weekday, wed: weekday, thu: weekday, fri: weekday,
    sat: { closed: false, ranges: [{ start: '09:00', end: '13:00' }] },
    sun: { closed: true, ranges: [] },
};

test('localClock da la fecha, el día y los minutos en la zona de la cuenta', () => {
    assert.deepEqual(localClock(ecuador('2026-10-14T10:05'), TZ), { dateKey: '2026-10-14', day: 'wed', minutes: 605 });
});

test('dentro de un tramo está abierto', () => {
    assert.equal(closedPeriodKey(SCHEDULE, TZ, ecuador('2026-10-14T10:00')), null);
});

test('al mediodía está cerrado desde las 13:00', () => {
    assert.equal(closedPeriodKey(SCHEDULE, TZ, ecuador('2026-10-14T13:30')), '2026-10-14T13:00');
});

test('de la noche a la mañana siguiente es un solo tramo cerrado', () => {
    assert.equal(closedPeriodKey(SCHEDULE, TZ, ecuador('2026-10-16T19:00')), '2026-10-16T18:00');
    assert.equal(closedPeriodKey(SCHEDULE, TZ, ecuador('2026-10-17T08:59')), '2026-10-16T18:00');
    assert.equal(closedPeriodKey(SCHEDULE, TZ, ecuador('2026-10-17T09:00')), null);
});

// El aviso del sábado por la tarde vale hasta que se abre el lunes: quien
// escribe el domingo no recibe otro.
test('del sábado al lunes es un solo tramo cerrado', () => {
    for (const at of ['2026-10-17T15:00', '2026-10-18T12:00', '2026-10-19T07:59']) {
        assert.equal(closedPeriodKey(SCHEDULE, TZ, ecuador(at)), '2026-10-17T13:00', at);
    }
    assert.equal(closedPeriodKey(SCHEDULE, TZ, ecuador('2026-10-19T08:00')), null);
});

test('un día abierto de 00:00 a 24:00 está abierto a las 23:59', () => {
    const allDay = { closed: false, ranges: [{ start: '00:00', end: '24:00' }] };
    const schedule = { ...SCHEDULE, wed: allDay };
    assert.equal(closedPeriodKey(schedule, TZ, ecuador('2026-10-14T23:59')), null);
});

test('el mismo instante se mira en la zona de cada cuenta', () => {
    const instant = new Date('2026-10-16T00:30:00Z');
    // Jueves 19:30 en Ecuador; viernes 02:30 en Madrid. Los dos, cerrados desde el jueves a las 18:00 locales.
    assert.equal(closedPeriodKey(SCHEDULE, TZ, instant), '2026-10-15T18:00');
    assert.equal(closedPeriodKey(SCHEDULE, 'Europe/Madrid', instant), '2026-10-15T18:00');
    assert.equal(closedPeriodKey(SCHEDULE, 'Europe/Madrid', new Date('2026-10-16T07:00:00Z')), null);
});

test('sin ningún día abierto la clave es fija', () => {
    const closed = { closed: true, ranges: [] };
    const schedule = Object.fromEntries(Object.keys(SCHEDULE).map(day => [day, closed]));
    assert.equal(closedPeriodKey(schedule, TZ, ecuador('2026-10-14T10:00')), 'closed');
});

test('scheduleIssue acepta un horario bien formado', () => {
    assert.equal(scheduleIssue(SCHEDULE), null);
    assert.equal(scheduleIssue({ ...SCHEDULE, wed: { closed: false, ranges: [{ start: '18:00', end: '24:00' }] } }), null);
});

test('scheduleIssue rechaza lo que no es un horario', () => {
    const tres = { closed: false, ranges: [{ start: '08:00', end: '09:00' }, { start: '10:00', end: '11:00' }, { start: '12:00', end: '13:00' }] };
    const vacio = { closed: false, ranges: [{ start: '08:00', end: '08:00' }] };
    const solapados = { closed: false, ranges: [{ start: '08:00', end: '13:00' }, { start: '12:00', end: '18:00' }] };
    const horaMala = { closed: false, ranges: [{ start: '08:00', end: '25:00' }] };
    const sinTramos = { closed: false, ranges: [] };
    const sinDomingo = Object.fromEntries(Object.entries(SCHEDULE).filter(([day]) => day !== 'sun'));

    for (const [nombre, schedule] of Object.entries({
        tres: { ...SCHEDULE, mon: tres },
        vacio: { ...SCHEDULE, mon: vacio },
        solapados: { ...SCHEDULE, mon: solapados },
        horaMala: { ...SCHEDULE, mon: horaMala },
        sinTramos: { ...SCHEDULE, mon: sinTramos },
        sinDomingo,
    })) {
        assert.equal(typeof scheduleIssue(schedule), 'string', nombre);
    }
});

test('isValidTimeZone', () => {
    assert.equal(isValidTimeZone('America/Guayaquil'), true);
    assert.equal(isValidTimeZone('Marte/Base'), false);
    assert.equal(isValidTimeZone(''), false);
});
