import { localFrame } from '../lib/timeline.ts'
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
