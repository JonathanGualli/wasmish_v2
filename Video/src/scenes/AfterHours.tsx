import { AppChat } from '../components/AppChat.tsx'
import { Headline } from '../components/Headline.tsx'
import { contentLayer, Stage } from '../components/Stage.tsx'
import { Subtitle } from '../components/Subtitle.tsx'
import { clockBetween } from '../lib/clock.ts'
import { progress, valueAt } from '../lib/motion.ts'
import { sceneCues } from '../story/cues.ts'
import type { Story } from '../story/types.ts'
import { rowsFor, useSceneTime } from './shared.ts'

// Escena 4 (32–43 s, noche y luego gris claro): de noche pregunta José Luis y
// el bot responde con lo que el centro dejó preparado; al abrir, sigue Gabriela.
export function AfterHours({ story }: { story: Story }) {
  const { frame, seconds } = useSceneTime(story, 'afterHours')
  const at = sceneCues(story, 'afterHours')
  const { contact, thread } = story.afterHours
  const timeOf = (id: string) => {
    const item = thread.find((m) => m.id === id)
    return item && 'time' in item ? item.time : ''
  }

  // Amanece en 0,7 s: el fondo, el titular y la pastilla de la hora cambian a la
  // vez (el titular claro aparece sobre el de noche), y la hora rueda en 1 s.
  const dawn = progress(frame, at('dawn'), 21)
  const roll = progress(frame, at('dawn'), 30)
  const day = dawn >= 0.5
  const time = clockBetween(timeOf('question'), timeOf('reply'), roll)
  const kicker = (night: boolean) => ({
    text: night && roll === 0 ? `${time} · cerrado` : time,
    icon: night ? 'moon' as const : 'sun' as const,
    shown: progress(frame, at('clock'), 15),
  })
  const headlineShown = progress(frame, at('headline'), 18)

  const rows = rowsFor(thread, {
    night: {},
    question: { appear: progress(frame, at('question'), 15) },
    bot: { appear: progress(frame, at('bot'), 15) },
    ...(frame >= at('reply') ? { morning: { appear: progress(frame, at('reply'), 15) }, reply: { appear: progress(frame, at('reply'), 15), markWho: progress(frame, at('reply') + 15, 15) } } : {}),
  })
  // El hilo sube para dejar sitio a la respuesta de la mañana.
  const scroll = valueAt(frame, [{ at: -1, value: 0 }, { at: at('bot'), value: 120 }, { at: at('reply'), value: 450 }])
  const chatShown = progress(frame, at('chat'), 15)

  return (
    <Stage tone="light" from="night" changeAt={at('dawn')}>
      {frame < at('headline') + 10 && <Headline text={story.headlines.assign} tone="night" leaving={progress(frame, 0, 10)} />}
      <div style={{ opacity: 1 - dawn }}>
        <Headline text={story.headlines.afterHours} tone="night" shown={headlineShown} kicker={kicker(true)} />
      </div>
      {dawn > 0 && (
        <div style={{ opacity: dawn }}>
          <Headline text={story.headlines.afterHours} tone="light" shown={headlineShown} kicker={kicker(false)} />
        </div>
      )}
      <div style={{ ...contentLayer, opacity: chatShown, transform: `translateY(${(1 - chatShown) * 28}px)` }}>
        <AppChat tone={day ? 'light' : 'night'} contact={contact} rows={rows} scroll={scroll} />
      </div>
      <Subtitle subtitles={story.subtitles} seconds={seconds} tone={day ? 'light' : 'night'} />
    </Stage>
  )
}
