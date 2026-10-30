import type { VoiceScene } from './voice.ts'

// Los tiempos del video. Las escenas y los cues se escriben en segundos (como
// los da el storyboard y, más adelante, la voz) y Remotion trabaja en cuadros.

export const FPS = 30

export type Scene = { id: string; from: number; to: number }

export function toFrames(seconds: number, fps = FPS): number {
  return Math.round(seconds * fps)
}

export function sceneFrames(scenes: Scene[], fps = FPS): { id: string; from: number; durationInFrames: number }[] {
  return scenes.map((scene) => ({
    id: scene.id,
    from: toFrames(scene.from, fps),
    durationInFrames: toFrames(scene.to, fps) - toFrames(scene.from, fps),
  }))
}

export function totalFrames(scenes: Scene[], fps = FPS): number {
  return scenes.length === 0 ? 0 : toFrames(scenes[scenes.length - 1].to, fps)
}

// Las escenas van una tras otra desde 0, sin huecos ni solapes: un hueco
// dejaría el video en negro y un solape pintaría dos escenas a la vez.
export function checkScenes(scenes: Scene[]): string[] {
  const errors: string[] = []
  if (scenes.length > 0 && scenes[0].from !== 0) {
    errors.push(`La primera escena (${scenes[0].id}) empieza en ${scenes[0].from} s, no en 0.`)
  }
  scenes.forEach((scene, i) => {
    if (scene.to <= scene.from) errors.push(`La escena ${scene.id} no dura nada.`)
    const next = scenes[i + 1]
    if (!next) return
    if (next.from > scene.to) errors.push(`Hay un hueco entre ${scene.id} y ${next.id}.`)
    if (next.from < scene.to) errors.push(`${scene.id} y ${next.id} se solapan.`)
  })
  return errors
}

// Un cue (segundos desde el inicio del video), en cuadros del <Sequence> de su escena.
export function localFrame(cue: number, scene: Scene, fps = FPS): number {
  return toFrames(cue, fps) - toFrames(scene.from, fps)
}

// Las escenas una tras otra, cada una tan larga como su voz más un respiro
// (`holds` para la que necesite más; si no, `defaultHold`), en centésimas.
export function scenesFromVoice<T extends string>(order: T[], voice: Record<T, VoiceScene>, holds: Partial<Record<T, number>>, defaultHold: number): (Scene & { id: T })[] {
  let from = 0
  return order.map((id) => {
    const scene = voice[id]
    if (!scene) throw new Error(`No hay voz para la escena «${id}».`)
    const to = Math.round((from + scene.end + (holds[id] ?? defaultHold)) * 100) / 100
    const result = { id, from, to }
    from = to
    return result
  })
}
