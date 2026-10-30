// Las palabras de la voz de Jonathan con sus tiempos, como las da el «forced
// alignment» de ElevenLabs (el audio y el texto exacto de cada escena). Los
// tiempos van en segundos desde el inicio del archivo de la escena.

export type VoiceWord = { text: string; start: number; end: number }

// Las palabras de una escena y cuándo termina la última.
export type VoiceScene = { words: VoiceWord[]; end: number }

const cents = (seconds: number) => Math.round(seconds * 100) / 100

// El JSON de la alineación trae los espacios como «palabras»: se descartan.
export function parseAlignment(json: unknown): VoiceScene {
  const raw = (json as { words?: unknown })?.words
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('La alineación no trae «words».')
  const words = raw
    .filter((word: VoiceWord) => word.text.trim() !== '')
    .map((word: VoiceWord) => ({ text: word.text, start: cents(word.start), end: cents(word.end) }))
  if (words.length === 0) throw new Error('La alineación no trae «words» con texto.')
  return { words, end: words[words.length - 1].end }
}

// Para comparar una palabra del texto con una de la voz: «quizá» es «quiza» y
// «WhatsApp.» es «whatsapp».
export function normalizeWord(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[^\p{L}\p{N}]/gu, '')
}

// La `nth` vez que aparece `word` (la primera es 1), o null.
export function findWord(words: VoiceWord[], word: string, nth = 1): VoiceWord | null {
  const target = normalizeWord(word)
  return words.filter((w) => normalizeWord(w.text) === target)[nth - 1] ?? null
}
