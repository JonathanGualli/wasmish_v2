import { AbsoluteFill } from 'remotion'
import { Highlight } from '../../../Site/src/components/Highlight.tsx'
import { Logo } from '../../../Site/src/components/Logo.tsx'
import { Headline } from '../components/Headline.tsx'
import { contentLayer, Stage } from '../components/Stage.tsx'
import { Subtitle } from '../components/Subtitle.tsx'
import { TONES } from '../components/tones.ts'
import { progress } from '../lib/motion.ts'
import { sceneCues } from '../story/cues.ts'
import type { Story, VideoChatItem } from '../story/types.ts'
import { useSceneTime } from './shared.ts'

// Escena 6 (56–72 s, gris claro y luego tinta): la computadora y el celular,
// el mismo número y la conexión oficial; después, Jonathan y el logo.
const ICON_PHONE = 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2'
const ICON_CHECK = 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4'

const textOf = (thread: VideoChatItem[], id: string) => {
  const item = thread.find((m) => m.id === id)
  return item && 'text' in item ? item.text : ''
}

export function Closing({ story }: { story: Story }) {
  const { frame, seconds } = useSceneTime(story, 'closing')
  const at = sceneCues(story, 'closing')
  const ink = progress(frame, at('ink'), 18)
  return (
    <Stage tone="light" from="mint" changeAt={0} sweep="up">
      <Headline text={story.headlines.closing} tone="light" shown={progress(frame, at('headline'), 18)} />
      <div style={contentLayer}>
        <Devices story={story} frame={frame} at={at} />
      </div>
      <Subtitle subtitles={story.subtitles} seconds={seconds} tone="light" />
      {ink > 0 && <AbsoluteFill style={{ background: TONES.dark.bg, opacity: ink }} />}
      {ink > 0 && <End story={story} frame={frame} at={at} />}
    </Stage>
  )
}

function Devices({ story, frame, at }: { story: Story; frame: number; at: (name: string) => number }) {
  const { kevin, afterHours, broadcast } = story
  const desk = progress(frame, at('devices'), 24)
  const phone = progress(frame, at('devices') + 9, 24)
  // La cámara se acerca al celular: la computadora retrocede un poco y el
  // celular crece (×1,24, dentro del ×1,5 del video).
  const zoom = progress(frame, at('zoomPhone'), 30)
  const rows = [
    { initials: kevin.contact.initials, name: kevin.contact.name, preview: textOf(kevin.thread, 'back'), selected: true },
    { initials: afterHours.contact.initials, name: afterHours.contact.name, preview: textOf(afterHours.thread, 'question') },
    { initials: broadcast.reply.name[0], name: broadcast.reply.name, preview: broadcast.reply.text },
  ]
  const reply = kevin.thread.find((m) => m.id === 'reply')
  const invoice = kevin.thread.find((m) => m.id === 'invoice')
  const appMessage = progress(frame, at('appMessage'), 15)
  const chips = [
    { icon: ICON_PHONE, text: 'Su número de siempre', shown: progress(frame, at('pillNumber'), 15) },
    { icon: ICON_CHECK, text: 'Conexión oficial de WhatsApp', shown: progress(frame, at('pillOfficial'), 15) },
  ]
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{
        position: 'absolute', left: -150, top: 30, width: 880, height: 580, background: '#ffffff', borderRadius: 30, boxShadow: TONES.light.cardShadow,
        overflow: 'hidden', display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr)', transformOrigin: '0 50%',
        opacity: desk, transform: `translateX(${-(1 - desk) * 300 - zoom * 80}px) scale(${1 - zoom * 0.06})`,
      }}>
        <div style={{ background: '#0b3b2e', padding: '30px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>
          <span style={{ width: 64, height: 64, display: 'flex' }}><Logo variant="mint" className="w-full h-full" /></span>
          <span style={{ width: 70, height: 10, borderRadius: 5, background: '#6fe3ae' }} />
          <span style={{ width: 70, height: 10, borderRadius: 5, background: '#2c6a56' }} />
          <span style={{ width: 70, height: 10, borderRadius: 5, background: '#2c6a56' }} />
        </div>
        <div style={{ display: 'grid', alignContent: 'start' }}>
          <div style={{ height: 96, display: 'flex', alignItems: 'center', padding: '0 30px', borderBottom: '2px solid #eef1f4', fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em' }}>Chats</div>
          {rows.map((row) => (
            <div key={row.name} style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '20px 30px', borderBottom: '2px solid #f1f3f5', background: row.selected ? '#f1fbf6' : '#ffffff' }}>
              <span style={{ flex: 'none', width: 60, height: 60, borderRadius: 15, background: '#e4e7eb', color: '#2e3540', fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{row.initials}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{row.name}</div>
                <div style={{ fontSize: 24, color: '#6b7684', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.preview}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        position: 'absolute', right: 0, top: 150, width: 450, height: 560, boxSizing: 'border-box', background: '#0e1116', borderRadius: 64, padding: 14,
        boxShadow: '0 24px 60px rgba(14, 17, 22, 0.28)', transformOrigin: '50% 100%',
        opacity: phone, transform: `translate(${-zoom * 120}px, ${(1 - phone) * 400 - zoom * 30}px) scale(${1 + zoom * 0.24})`,
      }}>
        <div style={{ height: '100%', background: '#ffffff', borderRadius: 52, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 'none', height: 110, boxSizing: 'border-box', borderBottom: '2px solid #e4e7eb', display: 'flex', alignItems: 'center', gap: 14, padding: '20px 26px 0' }}>
            <span style={{ width: 56, height: 56, borderRadius: 15, background: '#d6f8e7', color: '#12523f', fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{kevin.contact.initials}</span>
            <span style={{ fontSize: 30, fontWeight: 700 }}>{kevin.contact.name}</span>
          </div>
          <div style={{ flex: 1, background: '#f4f6f8', padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 14 }}>
            {reply && reply.kind === 'out' && <PhoneMessage text={reply.text} time={reply.time} who={reply.who} />}
            {invoice && invoice.kind === 'out-app' && frame >= at('appMessage') && (
              <div style={{ opacity: appMessage, transform: `translateY(${(1 - appMessage) * 24}px)` }}>
                <PhoneMessage text={invoice.text} time={invoice.time} fromApp />
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {chips.map((chip) => (
          <span key={chip.text} style={{
            display: 'inline-flex', alignItems: 'center', gap: 14, height: 80, boxSizing: 'border-box', padding: '0 30px', borderRadius: 40,
            background: '#ffffff', border: '2px solid #e4e7eb', boxShadow: '0 6px 0 #dfe3e8', fontSize: 31, fontWeight: 700, color: '#0e1116',
            opacity: chip.shown, transform: `translateY(${(1 - chip.shown) * 20}px)`,
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#12523f" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d={chip.icon} /></svg>
            {chip.text}
          </span>
        ))}
      </div>
    </div>
  )
}

function PhoneMessage({ text, time, who, fromApp = false }: { text: string; time: string; who?: string; fromApp?: boolean }) {
  return (
    <div style={{ alignSelf: 'flex-end', maxWidth: '92%' }}>
      <div style={{ background: '#0b3b2e', color: '#ffffff', borderRadius: '22px 22px 6px 22px', padding: '14px 18px', fontSize: 27, lineHeight: 1.32 }}>{text}</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 20, color: '#6b7684' }}>
        <span style={{ fontFamily: 'var(--font-mono)' }}>{time}</span>
        {who && <span style={{ fontWeight: 700, color: '#0e1116' }}>{who}</span>}
        {fromApp && <span style={{ fontWeight: 700, color: '#2e3540', background: '#e4e7eb', borderRadius: 8, padding: '2px 10px' }}>Desde la app de WhatsApp</span>}
      </div>
    </div>
  )
}

// Sobre tinta y sin subtítulo: el texto en pantalla ya es la voz.
function End({ story, frame, at }: { story: Story; frame: number; at: (name: string) => number }) {
  const { closing } = story
  const first = progress(frame, at('ink') + 9, 18)
  const second = progress(frame, at('second'), 18)
  const logo = progress(frame, at('logo'), 18)
  return (
    <div style={{ position: 'absolute', left: 80, right: 80, top: 300, bottom: 340, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 36 }}>
      <div style={{ fontSize: 104, lineHeight: 1.02, fontWeight: 800, letterSpacing: '-0.05em', color: '#ffffff', textWrap: 'balance', opacity: first }}>{closing.first}</div>
      <div style={{ fontSize: 66, lineHeight: 1.12, fontWeight: 800, letterSpacing: '-0.04em', color: '#a8f0ce', textWrap: 'balance', opacity: second }}>
        {closing.second.before}
        <Highlight mint>{closing.second.highlight}</Highlight>
        {closing.second.after}
      </div>
      <div style={{ marginTop: 70, display: 'grid', gap: 30, justifyItems: 'start', opacity: logo }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
          <span style={{ width: 120, height: 120, display: 'flex' }}><Logo variant="mint" className="w-full h-full" /></span>
          <span style={{ fontSize: 104, fontWeight: 800, letterSpacing: '-0.05em', color: '#ffffff' }}>wasmish</span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 46, fontWeight: 600, color: '#06251c', background: '#6fe3ae', borderRadius: 20, padding: '16px 30px' }}>{closing.url}</span>
      </div>
    </div>
  )
}
