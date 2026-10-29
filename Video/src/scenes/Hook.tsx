import type { CSSProperties } from 'react'
import { interpolateColors } from 'remotion'
import { AppChat } from '../components/AppChat.tsx'
import { Headline } from '../components/Headline.tsx'
import { contentLayer, Stage } from '../components/Stage.tsx'
import { Subtitle } from '../components/Subtitle.tsx'
import { CLEAR_MINT, MINT } from '../components/tones.ts'
import { progress } from '../lib/motion.ts'
import { splitHighlight } from '../lib/subtitles.ts'
import { sceneCues } from '../story/cues.ts'
import type { Story } from '../story/types.ts'
import { rowsFor, useSceneTime } from './shared.ts'

// Escena 1 (0–6 s, tinta): Kevin vuelve a escribir y nadie sabe qué se habló.
// El cuadro 0 es la miniatura de WhatsApp: la burbuja de Kevin ya está ahí.
export function Hook({ story }: { story: Story }) {
  const { frame, seconds } = useSceneTime(story, 'hook')
  const at = sceneCues(story, 'hook')
  const { kevin } = story
  const back = kevin.thread.find((item) => item.id === 'back')
  const shrink = progress(frame, at('shrink'), 30)
  // El historial, como siluetas: hay algo, pero nadie sabe qué.
  const rows = rowsFor(kevin.thread, { past: {}, question: { fill: 0 }, answer: { fill: 0 }, pdf: { fill: 0 }, today: {}, back: {} })
  return (
    <Stage tone="dark">
      <Headline text={story.headlines.hook} tone="dark" shown={progress(frame, at('headline'), 18)} leaving={progress(frame, at('headlineOut'), 10)} />
      <div style={contentLayer}>
        {shrink < 1 && back && 'text' in back && (
          <HookBubble
            contact={kevin.contact}
            text={back.text}
            mark={kevin.hookMark}
            time={'time' in back ? back.time : ''}
            marked={progress(frame, at('mark'), 15)}
            style={{ opacity: 1 - progress(frame, at('shrink'), 15), transform: `translateY(${40 * (1 - progress(frame, 0, 12)) + 260 * shrink}px) scale(${1 - 0.4 * shrink})` }}
          />
        )}
        {shrink > 0 && (
          <div style={{ position: 'absolute', inset: 0, opacity: shrink }}>
            <AppChat tone="dark" contact={kevin.contact} assignee={{ name: kevin.agent, progress: 0 }} rows={rows} scroll={420} />
          </div>
        )}
      </div>
      <Subtitle subtitles={story.subtitles} seconds={seconds} tone="dark" />
    </Stage>
  )
}

function HookBubble({ contact, text, mark, time, marked, style }: {
  contact: { initials: string; name: string }
  text: string
  mark: string
  time: string
  marked: number
  style: CSSProperties
}) {
  const [before, highlight, after] = splitHighlight(text, mark)
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22, padding: '0 12px', transformOrigin: '50% 100%', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <span style={{ width: 80, height: 80, borderRadius: 20, background: '#d6f8e7', color: '#12523f', fontSize: 34, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{contact.initials}</span>
        <span style={{ fontSize: 40, fontWeight: 700, color: '#ffffff' }}>{contact.name}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 28, color: '#a8c9bb' }}>ahora</span>
      </div>
      <div style={{ alignSelf: 'flex-start', maxWidth: '94%', boxSizing: 'border-box', background: '#ffffff', borderRadius: '52px 52px 52px 14px', boxShadow: '0 12px 0 #062a20', padding: '44px 52px', fontSize: 62, lineHeight: 1.26, letterSpacing: '-0.025em', fontWeight: 600, color: '#0e1116', textWrap: 'pretty' }}>
        {before}
        <span style={{ background: interpolateColors(marked, [0, 1], [CLEAR_MINT, MINT]), borderRadius: 12, padding: '0 8px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>{highlight}</span>
        {after}
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 28, color: '#a8c9bb' }}>{time}</span>
    </div>
  )
}
