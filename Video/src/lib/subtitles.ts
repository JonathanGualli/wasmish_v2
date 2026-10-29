import type { Scene } from './timeline.ts'

// Los subtítulos de la voz: una frase a la vez, con su parte clave en menta.

export const SUBTITLE_MAX_CHARS = 60

export type Subtitle = { text: string; highlight?: string; from: number; to: number }

export function subtitleAt(subtitles: Subtitle[], seconds: number): Subtitle | null {
  return subtitles.find((sub) => seconds >= sub.from && seconds < sub.to) ?? null
}

// Lo que se vería mal: dos a la vez, uno partido por un corte de escena, una
// frase clave que no está en el texto o una frase que no cabe en dos líneas.
export function checkSubtitles(subtitles: Subtitle[], scenes: Scene[]): string[] {
  const errors: string[] = []
  const sorted = [...subtitles].sort((a, b) => a.from - b.from)
  sorted.forEach((sub, i) => {
    const label = `«${sub.text.slice(0, 30)}»`
    if (sub.to <= sub.from) errors.push(`${label} no dura nada.`)
    if (!scenes.some((scene) => scene.from <= sub.from && sub.to <= scene.to)) {
      errors.push(`${label} cruza un cambio de escena o queda fuera del video.`)
    }
    if (sub.highlight && !sub.text.includes(sub.highlight)) errors.push(`${label} no contiene «${sub.highlight}».`)
    if (sub.text.length > SUBTITLE_MAX_CHARS) errors.push(`${label} tiene más de ${SUBTITLE_MAX_CHARS} caracteres.`)
    const next = sorted[i + 1]
    if (next && next.from < sub.to) errors.push(`${label} se pisa con el siguiente.`)
  })
  return errors
}
