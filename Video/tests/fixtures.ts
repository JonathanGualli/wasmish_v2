import type { VoiceScene } from '../src/lib/voice.ts'

// Una escena `x` de 10 a 16 s con la voz de la escena 3 y tiempos inventados:
// cada palabra empieza 0,3 s después de la anterior y dura 0,25 s.
const text = 'Si debe seguir Gabriela, Mónica se lo asigna, y a Gabriela le llega el aviso al celular.'

export const scenes = [{ id: 'x', from: 10, to: 16 }]

export const voice: Record<string, VoiceScene> = {
  x: {
    words: text.split(' ').map((word, i) => ({ text: word, start: Math.round(i * 30) / 100, end: Math.round(i * 30 + 25) / 100 })),
    end: 5.05,
  },
}

export const word = (text: string, nth = 1) => voice.x.words.filter((w) => w.text.replace(/[,.]/g, '') === text)[nth - 1]
