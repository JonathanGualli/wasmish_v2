import type { Rich } from '../content/home.ts'

// Un párrafo del contenido con sus enlaces (content/home.ts).
export function RichText({ parts, linkClass = 'font-semibold text-brand-accent-strong underline' }: { parts: Rich; linkClass?: string }) {
  return (
    <>
      {parts.map((part, i) => (typeof part === 'string' ? part : <a key={i} href={part.href} className={linkClass}>{part.text}</a>))}
    </>
  )
}

// El titular de cada sección: grande, con su palabra resaltada, y aparece al bajar.
export const sectionTitle = 'm-0 text-[clamp(34px,5vw,68px)] leading-[1.02] font-extrabold tracking-[-0.045em] text-balance'

// El contenedor de cada sección: 1320 px más el relleno lateral (diseño v3, con `box-content`).
export const sectionWrap = 'mx-auto box-content max-w-[1320px] px-[clamp(20px,5vw,64px)]'
