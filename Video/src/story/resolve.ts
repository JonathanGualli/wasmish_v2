import { timeSubtitles } from '../lib/subtitles.ts'
import { scenesFromVoice } from '../lib/timeline.ts'
import { resolveCues } from './cues.ts'
import { SCENE_ORDER, type Story, type StoryDraft } from './types.ts'

// El respiro al final de cada escena, después de la última palabra (decisión
// de Jonathan, 2026-10-30: «medio»). La que necesite más lo pide en `holds`.
export const DEFAULT_HOLD = 0.8

// De la historia escrita (anclas y frases) a la que reciben las escenas
// (segundos): las escenas, los cues y los subtítulos salen de la voz, y la
// música empieza para que su golpe final caiga en su cue.
export function resolveStory(draft: StoryDraft): Story {
  const { voice, holds, cues: anchors, phrases, music, ...story } = draft
  const scenes = scenesFromVoice(SCENE_ORDER, voice, holds, DEFAULT_HOLD)
  const cues = resolveCues(anchors, scenes, voice)
  if (cues[music.cue] === undefined) throw new Error(`La música espera el cue «${music.cue}».`)
  const speech = scenes.map((scene) => ({ from: scene.from + voice[scene.id].words[0].start, to: scene.from + voice[scene.id].end }))
  return {
    ...story,
    scenes,
    cues,
    subtitles: timeSubtitles(phrases, scenes, voice),
    speech,
    music: { start: Math.max(0, Math.round((cues[music.cue] - music.hit) * 100) / 100) },
  }
}
