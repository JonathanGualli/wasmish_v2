// El volumen de la música de fondo en cada momento: la voz manda. Debajo de
// la voz va 20 dB por debajo (el storyboard pedía 18; Jonathan quiere la voz
// bien adelante), en las pausas entre escenas sube un poco y, después de la
// última palabra, queda a su volumen completo: ya no hay voz que tapar.

export type Span = { from: number; to: number }

// En dB respecto del nivel de la pista (la música y la voz se dejan a −16 LUFS).
export const MUSIC_LEVELS = { underVoice: -20, between: -12, ending: 0 }
// Lo que tarda en bajar o subir junto a un tramo de voz, y la entrada.
export const MUSIC_RAMP = 0.25
export const MUSIC_FADE_IN = 0.5

const gain = (db: number) => 10 ** (db / 20)

// `seconds`: el segundo del video; `start`: cuándo empieza la música. Los
// tramos de voz van ordenados (uno por escena: de su primera a su última palabra).
export function musicVolume(seconds: number, speech: Span[], start: number): number {
  if (seconds < start) return 0
  const fadeIn = Math.min(1, (seconds - start) / MUSIC_FADE_IN)
  const last = speech.length > 0 ? speech[speech.length - 1].to : -Infinity
  const target = seconds >= last ? MUSIC_LEVELS.ending : MUSIC_LEVELS.between
  const distance = Math.min(Infinity, ...speech.map((span) => (seconds < span.from ? span.from - seconds : seconds > span.to ? seconds - span.to : 0)))
  const t = Math.min(1, distance / MUSIC_RAMP)
  return gain(MUSIC_LEVELS.underVoice + (target - MUSIC_LEVELS.underVoice) * t) * fadeIn
}
