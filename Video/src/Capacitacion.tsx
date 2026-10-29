import type { ComponentType } from 'react'
import { Sequence } from 'remotion'
import { Headline } from './components/Headline.tsx'
import { Stage } from './components/Stage.tsx'
import type { Tone } from './components/tones.ts'
import { sceneFrames } from './lib/timeline.ts'
import { Hook } from './scenes/Hook.tsx'
import { Recap } from './scenes/Recap.tsx'
import type { SceneId, Story } from './story/types.ts'

type SceneProps = { story: Story }

// Hasta «Video 2»: el fondo y el titular de cada escena que falta.
const placeholder = (id: SceneId, tone: Tone): ComponentType<SceneProps> =>
  function Placeholder({ story }: SceneProps) {
    return <Stage tone={tone}><Headline text={story.headlines[id]} tone={tone} /></Stage>
  }

const SCENES: Record<SceneId, ComponentType<SceneProps>> = {
  hook: Hook,
  recap: Recap,
  assign: placeholder('assign', 'light'),
  afterHours: placeholder('afterHours', 'night'),
  broadcast: placeholder('broadcast', 'mint'),
  closing: placeholder('closing', 'light'),
}

// El video entero: cada escena en su <Sequence>, una tras otra.
export function Capacitacion({ story }: SceneProps) {
  return (
    <>
      {sceneFrames(story.scenes).map(({ id, from, durationInFrames }) => {
        const Scene = SCENES[id as SceneId]
        return (
          <Sequence key={id} from={from} durationInFrames={durationInFrames} name={id}>
            <Scene story={story} />
          </Sequence>
        )
      })}
    </>
  )
}
