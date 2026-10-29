import { splitHighlight, subtitleAt, type Subtitle as SubtitleLine } from '../lib/subtitles.ts'
import { LAYOUT } from './Stage.tsx'
import { MINT, TONES, type Tone } from './tones.ts'

// La tarjeta del subtítulo: dos líneas como mucho, la frase clave sobre menta.
// `seconds`: el segundo del video entero, no de la escena.
export function Subtitle({ subtitles, seconds, tone }: { subtitles: SubtitleLine[]; seconds: number; tone: Tone }) {
  const line = subtitleAt(subtitles, seconds)
  if (!line) return null
  const [before, highlight, after] = splitHighlight(line.text, line.highlight)
  return (
    <div style={{ position: 'absolute', left: LAYOUT.subtitle.side, right: LAYOUT.subtitle.side, bottom: LAYOUT.subtitle.bottom, display: 'flex', justifyContent: 'center' }}>
      <div style={{
        maxWidth: 936, maxHeight: 168, overflow: 'hidden', boxSizing: 'border-box',
        background: '#ffffff', color: '#0e1116', borderRadius: 28, boxShadow: TONES[tone].subtitleShadow,
        padding: '20px 32px 22px', fontSize: 48, lineHeight: 1.3, fontWeight: 700, letterSpacing: '-0.02em',
        textAlign: 'center', textWrap: 'balance',
      }}>
        {before}
        {highlight && <span style={{ background: MINT, borderRadius: 8 }}>{highlight}</span>}
        {after}
      </div>
    </div>
  )
}
