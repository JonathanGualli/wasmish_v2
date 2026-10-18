import type { ReactNode } from 'react'
import type { HighlightedText } from '../content/types.ts'

// La palabra resaltada de los titulares, en una píldora (diseño v3). En el hero
// entra con una animación; en las demás secciones queda inclinada. `inverse`,
// para los titulares sobre verde profundo: píldora blanca con texto verde.
export function Highlight({ children, enter = false, inverse = false }: { children: ReactNode; enter?: boolean; inverse?: boolean }) {
  const colors = inverse ? 'bg-white text-brand-deep' : 'bg-brand-deep text-white'
  const motion = enter
    ? 'motion-safe:animate-[wm-pill_0.6s_cubic-bezier(0.2,0.7,0.2,1.2)_0.35s_both] rotate-[-1.5deg]'
    : 'rotate-[-1.5deg]'
  return <span className={`inline-block rounded-[0.2em] px-[0.18em] pb-[0.06em] ${colors} ${motion}`}>{children}</span>
}

export function HighlightedTitle({ text, enter, inverse }: { text: HighlightedText; enter?: boolean; inverse?: boolean }) {
  return (
    <>
      {text.before}
      <Highlight enter={enter} inverse={inverse}>{text.highlight}</Highlight>
      {text.after}
    </>
  )
}
