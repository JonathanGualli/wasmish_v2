import { AppChat } from '../components/AppChat.tsx'
import { Headline } from '../components/Headline.tsx'
import { contentLayer, Stage } from '../components/Stage.tsx'
import { Subtitle } from '../components/Subtitle.tsx'
import { cameraAt, progress, valueAt } from '../lib/motion.ts'
import { sceneCues } from '../story/cues.ts'
import type { Story } from '../story/types.ts'
import { caretOn, rowsFor, TYPING_CHARS_PER_SECOND, useSceneTime } from './shared.ts'

// Escena 2 (6–25 s, gris claro): Mónica abre el chat y lo ve todo, sin
// preguntarle a nadie. Es la escena animada del storyboard, momento a momento.
const CENTER = { scale: 1, x: 480, y: 437 }

export function Recap({ story }: { story: Story }) {
  const { frame, seconds } = useSceneTime(story, 'recap')
  const at = sceneCues(story, 'recap')
  const { kevin } = story
  const reply = kevin.thread.find((item) => item.id === 'reply')
  const replyText = reply && 'text' in reply ? reply.text : ''
  const sent = frame >= at('send')

  const fill = (cue: string) => progress(frame, at(cue), 15)
  // Algo resaltado entre dos momentos: entra en 0,5 s y se va en 0,5 s.
  const between = (on: string, off: string) => progress(frame, at(on), 15) * (1 - progress(frame, at(off), 15))

  const rows = rowsFor(kevin.thread, {
    past: {},
    question: { fill: fill('question') },
    answer: { fill: fill('answer'), markWho: between('markName', 'toPdf') },
    pdf: { fill: fill('pdf'), ring: between('toPdf', 'noteUp') },
    today: {},
    back: {},
    ...(sent ? { reply: { appear: progress(frame, at('send'), 15) } } : {}),
  })

  // El hilo baja al pasado al empezar, sube un poco para el acercamiento y
  // vuelve a hoy; al enviar Mónica su respuesta, sigue hasta ella.
  const scroll = valueAt(frame, [
    { at: -1, value: 420 },
    { at: at('change'), value: 0 },
    { at: at('zoomName'), value: 110 },
    { at: at('backToToday'), value: 420 },
    { at: at('send'), value: 720 },
  ])
  const camera = cameraAt(frame, [
    { at: 0, ...CENTER },
    { at: at('zoomName'), scale: 1.45, x: 820, y: 520 },
    { at: at('toPdf'), scale: 1.45, x: 700, y: 660 },
    { at: at('noteUp'), ...CENTER },
    // El storyboard pedía ×1,28, pero recortaba el principio de cada renglón de
    // la nota (revisión de Codex): con el chat entero escalado, el texto cabe
    // hasta ×1,1.
    { at: at('zoomNote'), scale: 1.1, x: 480, y: 700 },
    { at: at('backToToday'), ...CENTER },
  ])

  const typed = Math.max(0, Math.min(replyText.length, Math.floor(((frame - at('reply')) / 30) * TYPING_CHARS_PER_SECOND)))

  return (
    <Stage tone="light" from="dark" changeAt={at('change')}>
      <Headline text={story.headlines.recap} tone="light" shown={progress(frame, at('headline'), 18)} />
      <div style={contentLayer}>
        <AppChat
          tone="light"
          contact={kevin.contact}
          assignee={{ name: kevin.agent, progress: 0 }}
          rows={rows}
          scroll={scroll}
          camera={camera}
          note={{
            ...kevin.note,
            shown: progress(frame, at('noteUp'), 24) * (1 - progress(frame, at('backToToday'), 24)),
            mark: progress(frame, at('markNote'), 18),
          }}
          composer={!sent && typed > 0 ? replyText.slice(0, typed) : undefined}
          caret={caretOn(frame)}
        />
      </div>
      <Subtitle subtitles={story.subtitles} seconds={seconds} tone="light" />
    </Stage>
  )
}
