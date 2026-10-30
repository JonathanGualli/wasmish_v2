import type { ChatItem, ExampleContact, HighlightedText } from '../../../Site/src/content/types.ts'
import type { Subtitle, SubtitlePhrase } from '../lib/subtitles.ts'
import type { Scene } from '../lib/timeline.ts'
import type { VoiceScene } from '../lib/voice.ts'
import type { CueAnchor } from './cues.ts'

// La forma de una historia del video. Las escenas son las mismas en cada nicho;
// cambian los datos (capacitación hoy, imprentas después).

export type SceneId = 'hook' | 'recap' | 'assign' | 'afterHours' | 'broadcast' | 'closing'

export const SCENE_ORDER: SceneId[] = ['hook', 'recap', 'assign', 'afterHours', 'broadcast', 'closing']

// El audio de la voz de cada escena, dentro de public/ (la importa
// `npm run voice:import`; no está en el repo).
export const voiceFile = (id: SceneId) => `voz/escena-${SCENE_ORDER.indexOf(id) + 1}.flac`

// Los mensajes de la página, más lo que el video necesita: un evento del hilo
// («Mónica le asignó…», no es un mensaje) y lo enviado desde la app de WhatsApp
// Business (sale sin el nombre de quién).
export type VideoChatItem =
  | ChatItem
  | { id: string; kind: 'event'; text: string; time: string }
  | { id: string; kind: 'out-app'; text: string; time: string }

export type Story = {
  scenes: (Scene & { id: SceneId })[]
  // Segundos desde el inicio del video, con nombre `escena.momento`.
  cues: Record<string, number>
  subtitles: Subtitle[]
  headlines: Record<SceneId, HighlightedText>
  kevin: {
    contact: ExampleContact
    thread: VideoChatItem[]
    // La parte del mensaje de hoy que se marca en el gancho.
    hookMark: string
    // Quien lo atendió la primera vez, y a quien se le asigna.
    agent: string
    note: { text: string; highlight: string; author: string; date: string }
  }
  notification: { title: string; body: string; time: string; date: string }
  afterHours: { contact: ExampleContact; thread: VideoChatItem[] }
  broadcast: {
    title: string
    tag: string
    contacts: number
    sent: number
    delivered: number
    read: number
    reply: { name: string; text: string }
  }
  closing: { first: string; second: HighlightedText; url: string }
}

// La historia como se escribe: sin segundos. Las escenas duran lo que su voz
// más un respiro (`holds` para la que necesite más), los cues se atan a la voz
// y las frases de los subtítulos se buscan en ella. `resolveStory` la vuelve un
// `Story`, que es lo que reciben las escenas.
export type StoryDraft = Omit<Story, 'scenes' | 'cues' | 'subtitles'> & {
  voice: Record<SceneId, VoiceScene>
  holds: Partial<Record<SceneId, number>>
  cues: Record<string, CueAnchor>
  phrases: SubtitlePhrase[]
}
