// ---------------------------------------------------------------------------
// El horario de atención de una cuenta (respuestas automáticas, «fuera de
// horario»). Hasta dos tramos por día; las horas son locales de la zona de la
// cuenta y se calculan con `Intl`, sin librerías. Todo puro.
// ---------------------------------------------------------------------------

export const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const RANGES_PER_DAY_MAX = 2;
// Hasta dónde se busca el último cierre: más de una semana sin abrir es no abrir nunca.
const LOOKBACK_DAYS = 7;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Minutos desde las 00:00 de una hora `HH:mm` (`'24:00'` = 1440). */
const toMinutes = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
};

export const isValidTimeZone = (timeZone) => {
    if (typeof timeZone !== 'string' || !timeZone) return false;
    try {
        new Intl.DateTimeFormat('en', { timeZone });
        return true;
    } catch {
        return false;
    }
};

/** El primer problema del horario, en palabras, o null si está bien. */
export const scheduleIssue = (schedule) => {
    if (!schedule || typeof schedule !== 'object') return 'Falta el horario';

    for (const day of WEEK_DAYS) {
        const entry = schedule[day];
        if (!entry || typeof entry.closed !== 'boolean' || !Array.isArray(entry.ranges)) {
            return 'Falta el horario de algún día';
        }
        if (entry.closed) continue;

        const { ranges } = entry;
        if (ranges.length === 0) return 'Un día abierto necesita al menos un tramo';
        if (ranges.length > RANGES_PER_DAY_MAX) return `Como mucho ${RANGES_PER_DAY_MAX} tramos por día`;

        for (const { start, end } of ranges) {
            if (!TIME_PATTERN.test(start ?? '') || !(TIME_PATTERN.test(end ?? '') || end === '24:00')) {
                return 'Las horas van de 00:00 a 24:00';
            }
            if (toMinutes(start) >= toMinutes(end)) return 'Un tramo tiene que terminar después de empezar';
        }

        if (ranges.length === 2) {
            const [first, second] = [...ranges].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
            if (toMinutes(second.start) < toMinutes(first.end)) return 'Los dos tramos de un día no pueden solaparse';
        }
    }
    return null;
};

/** `{ dateKey: 'YYYY-MM-DD', day: 'mon'…'sun', minutes }` de `now` en `timeZone`. */
export const localClock = (now, timeZone) => {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
            timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(now).map(part => [part.type, part.value]),
    );
    const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
    return { dateKey, day: dayOf(dateKey), minutes: Number(parts.hour) * 60 + Number(parts.minute) };
};

// El calendario se recorre con fechas UTC «de mentira» (medianoche del día
// local): solo importan el día y la fecha, nunca el instante.
const calendarDate = (dateKey) => {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
};

const dayOf = (dateKey) => WEEK_DAYS[(calendarDate(dateKey).getUTCDay() + 6) % 7];

const daysBefore = (dateKey, days) => {
    const date = calendarDate(dateKey);
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
};

/**
 * null si ahora está abierto. Si está cerrado, la clave del tramo cerrado: la
 * fecha y hora LOCALES del último cierre (`'2026-10-16T18:00'`), así el aviso
 * se manda una vez por tramo aunque cruce la medianoche o el fin de semana.
 * `'closed'` si no abrió en la última semana.
 */
export const closedPeriodKey = (schedule, timeZone, now = new Date()) => {
    const clock = localClock(now, timeZone);

    for (let back = 0; back <= LOOKBACK_DAYS; back++) {
        const dateKey = back === 0 ? clock.dateKey : daysBefore(clock.dateKey, back);
        const entry = schedule[dayOf(dateKey)];
        if (!entry || entry.closed) continue;

        if (back === 0 && entry.ranges.some(({ start, end }) => toMinutes(start) <= clock.minutes && clock.minutes < toMinutes(end))) {
            return null;
        }

        // Hoy solo cuentan los cierres que ya pasaron; los días anteriores, todos.
        const closings = entry.ranges
            .map(({ end }) => end)
            .filter(end => back > 0 || toMinutes(end) <= clock.minutes)
            .sort((a, b) => toMinutes(b) - toMinutes(a));
        if (closings.length > 0) return `${dateKey}T${closings[0]}`;
    }
    return 'closed';
};
