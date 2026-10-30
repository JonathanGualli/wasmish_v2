import { Headline } from '../components/Headline.tsx'
import { contentLayer, Stage } from '../components/Stage.tsx'
import { Subtitle } from '../components/Subtitle.tsx'
import { TONES } from '../components/tones.ts'
import { countUp, progress } from '../lib/motion.ts'
import { sceneCues } from '../story/cues.ts'
import type { Story } from '../story/types.ts'
import { useSceneTime } from './shared.ts'

// Escena 5 (43–56 s, menta): otro ejemplo, el aviso a un grupo. Se ve cuántos
// lo leyeron, nunca quiénes, y la respuesta llega como un mensaje más.
const COUNT_FRAMES = 12

export function Broadcast({ story }: { story: Story }) {
  const { frame, seconds } = useSceneTime(story, 'broadcast')
  const at = sceneCues(story, 'broadcast')
  const { broadcast } = story
  const card = progress(frame, at('card'), 21)
  const tag = progress(frame, at('tag'), 15)
  const consent = progress(frame, at('consent'), 15)
  const done = frame >= at('stats')
  const reply = progress(frame, at('reply'), 21)
  // Las tres cifras cuentan desde 0, una tras otra (1,2 s en total).
  const stats = [
    { label: 'Enviados', value: broadcast.sent },
    { label: 'Entregados', value: broadcast.delivered },
    { label: 'Leídos', value: broadcast.read, strong: true },
  ].map((stat, i) => ({ ...stat, shown: countUp(frame, at('stats') + i * COUNT_FRAMES, COUNT_FRAMES, stat.value) }))

  return (
    <Stage tone="mint" from="light" changeAt={0} sweep="right">
      <Headline
        text={story.headlines.broadcast}
        tone="mint"
        shown={progress(frame, at('headline'), 18)}
        kicker={{ text: 'Otro ejemplo', shown: progress(frame, at('label'), 12) }}
      />
      <div style={{ ...contentLayer, display: 'flex', flexDirection: 'column', gap: 30 }}>
        <div style={{
          background: '#ffffff', borderRadius: 40, boxShadow: TONES.mint.cardShadow, padding: '40px 40px 44px', display: 'grid', gap: 26,
          opacity: card, transform: `translateY(${(1 - card) * 300}px)`,
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 24, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4b5361' }}>Aviso a un grupo</span>
          <div style={{ fontSize: 50, lineHeight: 1.12, fontWeight: 800, letterSpacing: '-0.03em', textWrap: 'balance' }}>{broadcast.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 28, color: '#4b5361' }}>Para</span>
            <span style={{ height: 58, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', padding: '0 20px', border: '2px solid #c3c9d1', borderRadius: 12, fontSize: 28, fontWeight: 600, color: '#2e3540', opacity: tag, transform: `translateY(${(1 - tag) * 16}px)` }}>{broadcast.tag}</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 28, color: '#2e3540', opacity: tag }}>{broadcast.contacts} contactos</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 27, color: '#4b5361', opacity: consent, transform: `translateY(${(1 - consent) * 16}px)` }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#12523f" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            A contactos que aceptaron recibir avisos
          </div>
          <div style={{ height: 2, background: '#eef1f4' }} />
          {done ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 20 }}>
              {stats.map((stat) => (
                <div key={stat.label} style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontSize: 100, lineHeight: 1, fontWeight: 800, letterSpacing: '-0.05em', color: stat.strong ? '#0b3b2e' : '#2e3540', fontVariantNumeric: 'tabular-nums' }}>{stat.shown}</span>
                  <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7684' }}>{stat.label}</span>
                </div>
              ))}
            </div>
          ) : (
            // En tinta, no menta sobre menta (corrección 3 del storyboard).
            <span style={{ height: 104, borderRadius: 26, background: '#0b3b2e', boxShadow: '0 6px 0 #06251c', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, fontSize: 36, fontWeight: 700 }}>
              Enviar a {broadcast.contacts} contactos
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          )}
        </div>
        <div style={{ alignSelf: 'flex-start', maxWidth: '88%', display: 'grid', gap: 10, opacity: reply, transform: `translateY(${(1 - reply) * 60}px)` }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, fontSize: 27, fontWeight: 700, color: '#06251c' }}>
            <span style={{ width: 48, height: 48, borderRadius: 13, background: '#ffffff', color: '#12523f', fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{broadcast.reply.name[0]}</span>
            {broadcast.reply.name} respondió al aviso
          </span>
          <div style={{ background: '#ffffff', borderRadius: '28px 28px 28px 8px', boxShadow: '0 8px 0 #3fbf86', padding: '20px 26px', fontSize: 40, lineHeight: 1.32 }}>{broadcast.reply.text}</div>
        </div>
      </div>
      <Subtitle subtitles={story.subtitles} seconds={seconds} tone="mint" />
    </Stage>
  )
}
