// La hora que rueda en la escena 4: de las 22:10 a las 08:35 del día
// siguiente, siempre hacia adelante (pasa por la medianoche, no retrocede).

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

const pad = (n: number) => String(n).padStart(2, '0')

// `t` de 0 a 1: la hora de `from` a `to`, en minutos enteros.
export function clockBetween(from: string, to: string, t: number): string {
  const start = toMinutes(from)
  const span = (toMinutes(to) - start + 24 * 60) % (24 * 60)
  const now = (start + Math.round(span * Math.min(1, Math.max(0, t)))) % (24 * 60)
  return `${pad(Math.floor(now / 60))}:${pad(now % 60)}`
}
