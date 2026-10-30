import type { ComponentType } from 'react'
import { Sequence } from 'remotion'
import { sceneFrames } from './lib/timeline.ts'
import { AfterHours } from './scenes/AfterHours.tsx'
import { Assign } from './scenes/Assign.tsx'
import { Broadcast } from './scenes/Broadcast.tsx'
import { Closing } from './scenes/Closing.tsx'
import { Hook } from './scenes/Hook.tsx'
import { Recap } from './scenes/Recap.tsx'
import type { SceneId, Story } from './story/types.ts'

type SceneProps = { story: Story }

const SCENES: Record<SceneId, ComponentType<SceneProps>> = {
  hook: Hook,
  recap: Recap,
  assign: Assign,
  afterHours: AfterHours,
  broadcast: Broadcast,
  closing: Closing,
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
