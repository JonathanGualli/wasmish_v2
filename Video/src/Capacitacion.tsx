import type { ComponentType } from 'react'
import { Audio, getStaticFiles, Sequence, staticFile } from 'remotion'
import { musicVolume } from './lib/music.ts'
import { FPS, sceneFrames, toFrames } from './lib/timeline.ts'
import { AfterHours } from './scenes/AfterHours.tsx'
import { Assign } from './scenes/Assign.tsx'
import { Broadcast } from './scenes/Broadcast.tsx'
import { Closing } from './scenes/Closing.tsx'
import { Hook } from './scenes/Hook.tsx'
import { Recap } from './scenes/Recap.tsx'
import { MUSIC_FILE, voiceFile, type SceneId, type Story } from './story/types.ts'

type SceneProps = { story: Story }

const SCENES: Record<SceneId, ComponentType<SceneProps>> = {
  hook: Hook,
  recap: Recap,
  assign: Assign,
  afterHours: AfterHours,
  broadcast: Broadcast,
  closing: Closing,
}

// El video entero: cada escena en su <Sequence>, una tras otra, con su voz, y
// la música de fondo debajo. El audio no está en el repo (lo copia
// `npm run voice:import`): sin él, en el CI o en un clon nuevo, el video sale
// mudo en vez de fallar.
export function Capacitacion({ story }: SceneProps) {
  const files = new Set(getStaticFiles().map((file) => file.name))
  return (
    <>
      {sceneFrames(story.scenes).map(({ id, from, durationInFrames }) => {
        const sceneId = id as SceneId
        const Scene = SCENES[sceneId]
        return (
          <Sequence key={id} from={from} durationInFrames={durationInFrames} name={id}>
            <Scene story={story} />
            {files.has(voiceFile(sceneId)) && <Audio src={staticFile(voiceFile(sceneId))} />}
          </Sequence>
        )
      })}
      {files.has(MUSIC_FILE) && (
        <Sequence from={toFrames(story.music.start)} name="música">
          <Audio src={staticFile(MUSIC_FILE)} volume={(frame) => musicVolume(story.music.start + frame / FPS, story.speech, story.music.start)} />
        </Sequence>
      )}
    </>
  )
}
