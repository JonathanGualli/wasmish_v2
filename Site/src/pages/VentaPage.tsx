import type { Niche } from '../content/types.ts'
import { demoHref } from '../lib/links.ts'
import { Pending } from '../components/Pending.tsx'

// El molde de las páginas de venta: el inicio y cada nicho, con sus textos.
// Por ahora, solo el titular y el botón; las secciones de la v3 llegan en el PR 3.
export function VentaPage({ niche }: { niche: Niche }) {
  const href = demoHref(niche.demoLabel)
  return (
    <main className="mx-auto max-w-5xl px-5 py-16">
      <p className="font-mono text-xs uppercase tracking-widest text-brand-muted">{niche.hero.eyebrow}</p>
      <h1 className="mt-4 text-5xl font-extrabold tracking-tight">
        {niche.hero.title.before}
        <span className="rounded-lg bg-brand-deep px-2 text-white">{niche.hero.title.highlight}</span>
        {niche.hero.title.after}
      </h1>
      <p className="mt-6 max-w-xl text-lg text-brand-strong">{niche.hero.subtitle}</p>
      {href ? (
        <a href={href} className="mt-8 inline-block rounded-brand-field bg-brand-accent px-6 py-3 font-semibold text-brand-ink">
          Pedir una demostración
        </a>
      ) : (
        <p className="mt-8">
          <Pending>Pedir una demostración</Pending>
        </p>
      )}
    </main>
  )
}
