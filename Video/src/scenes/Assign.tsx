import { useVideoConfig } from 'remotion'
import { Logo } from '../../../Site/src/components/Logo.tsx'
import { AppChat } from '../components/AppChat.tsx'
import { Headline } from '../components/Headline.tsx'
import { contentLayer, Stage } from '../components/Stage.tsx'
import { Subtitle } from '../components/Subtitle.tsx'
import { dropOffset, progress, valueAt } from '../lib/motion.ts'
import { sceneCues } from '../story/cues.ts'
import type { Story } from '../story/types.ts'
import { rowsFor, useSceneTime } from './shared.ts'

// Escena 3 (25–32 s, gris claro y luego noche): Mónica le asigna el chat a
// Gabriela y a ella le llega el aviso. Mismo fondo que la escena 2, así que el
// cambio lo marca el titular: el anterior sale hacia arriba y el nuevo entra.
export function Assign({ story }: { story: Story }) {
  const { frame, seconds } = useSceneTime(story, 'assign')
  const { fps } = useVideoConfig()
  const at = sceneCues(story, 'assign')
  const locked = frame >= at('lock')
  const tone = locked ? 'night' : 'light'
  return (
    <Stage tone={tone}>
      {!locked && <Headline text={story.headlines.recap} tone="light" leaving={progress(frame, 0, 10)} />}
      <Headline text={story.headlines.assign} tone={tone} shown={progress(frame, at('headline'), 18)} />
      <div style={contentLayer}>
        {locked
          ? <LockScreen story={story} drop={dropOffset(frame, at('notification'), fps)} shown={progress(frame, at('notification'), 12)} />
          : <AssignChat story={story} frame={frame} at={at} />}
      </div>
      <Subtitle subtitles={story.subtitles} seconds={seconds} tone={tone} />
    </Stage>
  )
}

// El chat como lo dejó la escena 2; nadie hace clic: «Asignar» cambia solo.
function AssignChat({ story, frame, at }: { story: Story; frame: number; at: (name: string) => number }) {
  const { kevin } = story
  const rows = rowsFor(kevin.thread, {
    past: {}, question: {}, answer: {}, pdf: {}, today: {}, back: {}, reply: {},
    assigned: { appear: progress(frame, at('event'), 15) },
  })
  // Sigue donde quedó la escena 2 y sube lo justo para la línea del cambio.
  const scroll = valueAt(frame, [{ at: -1, value: 720 }, { at: at('event'), value: 800 }], 15)
  return <AppChat tone="light" contact={kevin.contact} assignee={{ name: kevin.agent, progress: progress(frame, at('pill'), 15) }} rows={rows} scroll={scroll} />
}

// La pantalla bloqueada del celular de Gabriela, con el aviso de Wasmish.
function LockScreen({ story, drop, shown }: { story: Story; drop: number; shown: number }) {
  const { notification, kevin } = story
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 10 }}>
      <div style={{ fontSize: 180, lineHeight: 1, fontWeight: 700, letterSpacing: '-0.05em', color: '#ffffff' }}>{notification.time}</div>
      <div style={{ marginTop: 14, fontSize: 34, color: '#a8c9bb' }}>{notification.date}</div>
      <div style={{
        marginTop: 80, alignSelf: 'stretch', boxSizing: 'border-box', background: '#ffffff', borderRadius: 40, boxShadow: '0 20px 60px rgba(0, 0, 0, 0.35)',
        padding: '30px 34px 34px', display: 'grid', gap: 10, opacity: shown, transform: `translateY(${drop}px)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ width: 56, height: 56, display: 'flex' }}><Logo variant="mint" className="w-full h-full" /></span>
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4b5361' }}>Wasmish</span>
          <span style={{ marginLeft: 'auto', fontSize: 24, color: '#6b7684' }}>ahora</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 40, fontWeight: 700, letterSpacing: '-0.015em' }}>{notification.title}</div>
        <div style={{ fontSize: 38, lineHeight: 1.35, color: '#2e3540' }}>{notification.body}</div>
      </div>
      <div style={{ marginTop: 30, display: 'inline-flex', alignItems: 'center', gap: 12, fontSize: 30, fontWeight: 600, color: '#a8f0ce' }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></svg>
        Celular de {kevin.agent}
      </div>
    </div>
  )
}
