import { timeSubtitles } from '../lib/subtitles.ts'
import { scenesFromVoice } from '../lib/timeline.ts'
import { resolveCues } from './cues.ts'
import { SCENE_ORDER, type Story, type StoryDraft } from './types.ts'

// El respiro al final de cada escena, después de la última palabra (decisión
// de Jonathan, 2026-10-30: «medio»). La que necesite más lo pide en `holds`.
export const DEFAULT_HOLD = 0.8

// De la historia escrita (anclas y frases) a la que reciben las escenas
// (segundos): las escenas, los cues y los subtítulos salen de la voz.
export function resolveStory(draft: StoryDraft): Story {
  const { voice, holds, cues, phrases, ...story } = draft
  const scenes = scenesFromVoice(SCENE_ORDER, voice, holds, DEFAULT_HOLD)
  return { ...story, scenes, cues: resolveCues(cues, scenes, voice), subtitles: timeSubtitles(phrases, scenes, voice) }
}
