import { useCurrentFrame } from 'remotion'
import type { ChatRow } from '../components/AppChat.tsx'
import { FPS, toFrames } from '../lib/timeline.ts'
import type { SceneId, Story, VideoChatItem } from '../story/types.ts'

// Los mensajes de un hilo que se ven en este cuadro, con su estado: solo los
// que tienen entrada en `states` ({} es «visible, en su estado final»).
export function rowsFor(thread: VideoChatItem[], states: Record<string, Omit<ChatRow, 'item'>>): ChatRow[] {
  return thread.filter((item) => item.id in states).map((item) => ({ item, ...states[item.id] }))
}

// El cuadro de la escena y el segundo del video entero (para los subtítulos).
export function useSceneTime(story: Story, id: SceneId): { frame: number; seconds: number } {
  const frame = useCurrentFrame()
  const scene = story.scenes.find((s) => s.id === id)
  return { frame, seconds: (frame + toFrames(scene ? scene.from : 0)) / FPS }
}

// El cursor del campo de texto parpadea cada medio segundo.
export const caretOn = (frame: number) => Math.floor(frame / (FPS / 2)) % 2 === 0
