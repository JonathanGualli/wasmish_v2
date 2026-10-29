import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, interpolateColors, useCurrentFrame } from 'remotion'
import { TONES, type Tone } from './tones.ts'

// El lienzo de 1080 × 1920 y sus tres capas fijas (storyboard, «Zonas y capas»):
// el titular desde y = 240, el contenido de 560 a 1420 y los subtítulos de 1452
// a 1616. Arriba (230 px) y abajo (288 px) WhatsApp pone el nombre del chat y
// los controles del reproductor: ahí solo hay fondo.
export const LAYOUT = {
  width: 1080,
  height: 1920,
  headline: { top: 240, side: 72 },
  content: { top: 560, height: 860, side: 60 },
  subtitle: { bottom: 304, side: 72 },
  zones: { top: 230, bottom: 288 },
} as const

export const contentLayer: CSSProperties = {
  position: 'absolute',
  left: LAYOUT.content.side,
  right: LAYOUT.content.side,
  top: LAYOUT.content.top,
  height: LAYOUT.content.height,
}

// El fondo pasa de `from` a `tone` en 0,7 s desde `changeAt` (cuadro de la escena).
export function Stage({ tone, from, changeAt = 0, zones = false, children }: {
  tone: Tone
  from?: Tone
  changeAt?: number
  zones?: boolean
  children: ReactNode
}) {
  const frame = useCurrentFrame()
  const background = from
    ? interpolateColors(frame, [changeAt, changeAt + 21], [TONES[from].bg, TONES[tone].bg])
    : TONES[tone].bg
  return (
    <AbsoluteFill style={{ background, overflow: 'hidden', fontFamily: 'var(--font-sans)', color: '#0e1116' }}>
      {children}
      {zones && <Zones />}
    </AbsoluteFill>
  )
}

const stripes = 'repeating-linear-gradient(45deg, rgba(214, 64, 64, 0.18) 0 16px, rgba(214, 64, 64, 0.04) 16px 32px)'
const zoneLabel: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 600, color: '#a12b2b' }

// Solo para revisar en el Studio: lo que tapa WhatsApp.
function Zones() {
  return (
    <>
      <div style={{ ...zoneLabel, position: 'absolute', left: 0, right: 0, top: 0, height: LAYOUT.zones.top, background: stripes, borderBottom: '4px dashed rgba(214, 64, 64, 0.7)', display: 'flex', alignItems: 'flex-end', padding: '0 0 14px 30px', boxSizing: 'border-box' }}>12 % · nombre del chat</div>
      <div style={{ ...zoneLabel, position: 'absolute', left: 0, right: 0, bottom: 0, height: LAYOUT.zones.bottom, background: stripes, borderTop: '4px dashed rgba(214, 64, 64, 0.7)', padding: '14px 0 0 30px', boxSizing: 'border-box' }}>15 % · controles del reproductor</div>
    </>
  )
}
