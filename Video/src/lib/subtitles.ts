import type { Scene } from './timeline.ts'
import { normalizeWord, type VoiceScene } from './voice.ts'

// Los subtítulos de la voz: una frase a la vez, con su parte clave en menta.

export const SUBTITLE_MAX_CHARS = 60

// `words`: cada palabra del texto con el segundo en que la dice la voz, para
// marcarlas una a una. Sin voz no hay palabras y se marca la frase clave.
export type SubtitleWord = { text: string; from: number }
export type Subtitle = { text: string; highlight?: string; from: number; to: number; words?: SubtitleWord[] }

// El texto en tres partes para pintar la frase clave aparte. Sin frase clave,
// o si no está en el texto, todo va en la primera.
export function splitHighlight(text: string, highlight?: string): [string, string, string] {
  const at = highlight ? text.indexOf(highlight) : -1
  if (!highlight || at < 0) return [text, '', '']
  return [text.slice(0, at), highlight, text.slice(at + highlight.length)]
}

// La palabra que suena: la última que ya empezó (se queda marcada hasta que
// empieza la siguiente), o -1 si todavía no empieza ninguna o no hay palabras.
export function activeWord(subtitle: Subtitle, seconds: number): number {
  const words = subtitle.words ?? []
  let index = -1
  while (index + 1 < words.length && words[index + 1].from <= seconds) index++
  return index
}

// Los signos pegados a una palabra («quizá, más»., ¿Su) van aparte, para
// marcar solo la palabra.
export function splitPunctuation(token: string): [string, string, string] {
  const match = token.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u)
  return match ? [match[1], match[2], match[3]] : ['', token, '']
}

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

// Una frase del subtítulo tal como se escribe en la historia: su escena y su
// texto, sin tiempos. Los pone `timeSubtitles`, buscándola en la voz.
export type SubtitlePhrase = { scene: string; text: string; highlight?: string }

// Lo que se queda una frase en pantalla después de su última palabra, si no
// viene otra justo detrás.
const SUBTITLE_TAIL = 0.3

const cents = (seconds: number) => Math.round(seconds * 100) / 100

// Cada frase empieza en su primera palabra y dura hasta que empieza la
// siguiente de su escena; si no hay otra justo detrás (es la última, o vienen
// palabras sin subtítulo, como en el cierre), hasta 0,3 s después de su última
// palabra, sin salirse de la escena. Las palabras de una frase se buscan
// seguidas y en orden, después de las de la frase anterior.
export function timeSubtitles(phrases: SubtitlePhrase[], scenes: Scene[], voice: Record<string, VoiceScene>): Subtitle[] {
  const cursor: Record<string, number> = {}
  const placed = phrases.map((phrase) => {
    const scene = scenes.find((s) => s.id === phrase.scene)
    const words = voice[phrase.scene]?.words
    if (!scene || !words) throw new Error(`La frase «${phrase.text}» nombra una escena sin voz: «${phrase.scene}».`)
    const pieces = phrase.text.split(/\s+/).filter((piece) => normalizeWord(piece) !== '')
    const tokens = pieces.map(normalizeWord)
    const spoken = words.map((w) => normalizeWord(w.text))
    let first = -1
    for (let i = cursor[scene.id] ?? 0; i + tokens.length <= spoken.length && first < 0; i++) {
      if (tokens.every((token, k) => spoken[i + k] === token)) first = i
    }
    if (first < 0) throw new Error(`La frase «${phrase.text}» no está en la voz de la escena «${scene.id}».`)
    const last = first + tokens.length - 1
    cursor[scene.id] = last + 1
    return { phrase, scene, first, last, words, pieces }
  })
  return placed.map(({ phrase, scene, first, last, words, pieces }, i) => {
    const next = placed[i + 1]
    const to = next && next.scene.id === scene.id && next.first === last + 1
      ? scene.from + words[next.first].start
      : Math.min(scene.to, scene.from + words[last].end + SUBTITLE_TAIL)
    return {
      text: phrase.text,
      ...(phrase.highlight ? { highlight: phrase.highlight } : {}),
      from: cents(scene.from + words[first].start),
      to: cents(to),
      words: pieces.map((piece, k) => ({ text: piece, from: cents(scene.from + words[first + k].start) })),
    }
  })
}
