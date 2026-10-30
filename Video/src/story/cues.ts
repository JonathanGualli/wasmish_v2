import { localFrame, type Scene } from '../lib/timeline.ts'
import { findWord, type VoiceScene } from '../lib/voice.ts'
import type { SceneId, Story } from './types.ts'

// Los cues de una escena, en cuadros de su <Sequence>: `at('question')` lee
// `recap.question`. Un nombre que no existe es un error al escribir la escena,
// no un 0 silencioso que haría aparecer algo al principio.
export function sceneCues(story: Story, id: SceneId): (name: string) => number {
  const scene = story.scenes.find((s) => s.id === id)
  if (!scene) throw new Error(`No hay una escena «${id}».`)
  return (name) => {
    const seconds = story.cues[`${id}.${name}`]
    if (seconds === undefined) throw new Error(`No hay un cue «${id}.${name}».`)
    return localFrame(seconds, scene)
  }
}

// Cómo se escribe un cue en la historia: atado a una palabra de la voz de su
// escena (`nth` si se repite, `edge: 'end'` para su final, `shift` en segundos
// para adelantarlo o atrasarlo), a un tiempo desde el inicio de la escena
// (`at`) o a uno antes de su final (`beforeEnd`), para lo que no tiene palabra.
export type CueAnchor =
  | { word: string; nth?: number; edge?: 'start' | 'end'; shift?: number }
  | { at: number }
  | { beforeEnd: number }

// Los cues en segundos desde el inicio del video. La escena sale del prefijo
// del nombre (`recap.markName` → `recap`); una palabra que no está en la voz de
// su escena es un error que nombra el cue.
export function resolveCues(anchors: Record<string, CueAnchor>, scenes: Scene[], voice: Record<string, VoiceScene>): Record<string, number> {
  const cues: Record<string, number> = {}
  for (const [name, anchor] of Object.entries(anchors)) {
    const scene = scenes.find((s) => s.id === name.split('.')[0])
    if (!scene) throw new Error(`El cue «${name}» no nombra una escena que exista.`)
    let seconds: number
    if ('at' in anchor) seconds = scene.from + anchor.at
    else if ('beforeEnd' in anchor) seconds = scene.to - anchor.beforeEnd
    else {
      const word = findWord(voice[scene.id]?.words ?? [], anchor.word, anchor.nth)
      if (!word) throw new Error(`El cue «${name}» espera la palabra «${anchor.word}»${anchor.nth ? ` (vez ${anchor.nth})` : ''} y no está en la voz de su escena.`)
      seconds = scene.from + (anchor.edge === 'end' ? word.end : word.start) + (anchor.shift ?? 0)
    }
    cues[name] = Math.round(seconds * 100) / 100
  }
  return cues
}
