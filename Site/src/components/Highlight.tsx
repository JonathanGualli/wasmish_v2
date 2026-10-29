import type { ReactNode } from 'react'
import type { HighlightedText } from '../content/types.ts'

// La palabra resaltada de los titulares, en una píldora inclinada (diseño v3).
// `enter`: en el hero, entra creciendo. `inverse`: sobre verde profundo, píldora
// blanca con texto verde. `mint`: píldora menta, para el video (gana a
// `inverse`). `wraps`: cuando la frase es larga y puede no caber en un renglón
// («qué se le cotizó»), la píldora va en línea, con
// `box-decoration-break: clone`, para que cada renglón lleve su trozo en lugar
// de un bloque enorme; un elemento en línea no se rota, así que entra con un fundido.
export function Highlight({ children, enter = false, inverse = false, mint = false, wraps = false }: { children: ReactNode; enter?: boolean; inverse?: boolean; mint?: boolean; wraps?: boolean }) {
  const colors = mint ? 'bg-brand-accent text-brand-ink' : inverse ? 'bg-white text-brand-deep' : 'bg-brand-deep text-white'
  const shape = wraps
    ? `[box-decoration-break:clone] [-webkit-box-decoration-break:clone] ${enter ? 'motion-safe:animate-[wm-fade_0.6s_ease_0.35s_both]' : ''}`
    : `inline-block rotate-[-1.5deg] ${enter ? 'motion-safe:animate-[wm-pill_0.6s_cubic-bezier(0.2,0.7,0.2,1.2)_0.35s_both]' : ''}`
  return <span className={`rounded-[0.2em] px-[0.18em] pb-[0.06em] ${colors} ${shape}`}>{children}</span>
}

export function HighlightedTitle({ text, enter, inverse }: { text: HighlightedText; enter?: boolean; inverse?: boolean }) {
  return (
    <>
      {text.before}
      <Highlight enter={enter} inverse={inverse} wraps={text.wraps}>{text.highlight}</Highlight>
      {text.after}
    </>
  )
}
