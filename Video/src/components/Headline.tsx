import type { HighlightedText } from '../../../Site/src/content/types.ts'
import { Highlight } from '../../../Site/src/components/Highlight.tsx'
import { LAYOUT } from './Stage.tsx'
import { TONES, type Tone } from './tones.ts'

export type Kicker = { text: string; icon?: 'moon' | 'sun'; shown: number }

// El titular de la escena, con su palabra en la pastilla de wasmish.com.
// `shown` (0 a 1) lo hace entrar desde abajo; `leaving` (0 a 1), salir hacia arriba.
export function Headline({ text, tone, shown = 1, leaving = 0, kicker }: {
  text: HighlightedText
  tone: Tone
  shown?: number
  leaving?: number
  kicker?: Kicker
}) {
  const colors = TONES[tone]
  return (
    <div style={{
      position: 'absolute', left: LAYOUT.headline.side, right: LAYOUT.headline.side, top: LAYOUT.headline.top,
      display: 'grid', gap: 24, justifyItems: 'start',
      opacity: shown * (1 - leaving),
      transform: `translateY(${(1 - shown) * 30 - leaving * 30}px)`,
    }}>
      <div style={{ fontSize: 88, lineHeight: 1.04, letterSpacing: '-0.045em', fontWeight: 800, color: colors.headline, textWrap: 'balance' }}>
        {text.before}
        <Highlight mint={colors.mintPill}>{text.highlight}</Highlight>
        {text.after}
      </div>
      {kicker && <KickerPill kicker={kicker} tone={tone} />}
    </div>
  )
}

function KickerPill({ kicker, tone }: { kicker: Kicker; tone: Tone }) {
  const { bg, fg, border } = TONES[tone].kicker
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 14, height: 72, padding: '0 28px', boxSizing: 'border-box',
      borderRadius: 36, background: bg, color: fg, border: `2px solid ${border}`,
      fontFamily: 'var(--font-mono)', fontSize: 34, fontWeight: 600, letterSpacing: '-0.02em',
      opacity: kicker.shown, transform: `translateY(${(1 - kicker.shown) * 20}px)`,
    }}>
      {kicker.icon === 'moon' && (
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      )}
      {kicker.icon === 'sun' && (
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      )}
      {kicker.text}
    </span>
  )
}
