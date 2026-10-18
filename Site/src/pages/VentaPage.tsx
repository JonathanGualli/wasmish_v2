import type { Niche } from '../content/types.ts'
import { Header } from '../components/Header.tsx'
import { Footer } from '../components/Footer.tsx'
import { useReveal } from '../components/useReveal.ts'
import { Hero } from '../sections/Hero.tsx'

// El molde de las páginas de venta: el inicio y cada nicho, con sus textos.
// Las secciones siguientes al hero (diseño v3) llegan en el PR 3b.
export function VentaPage({ niche }: { niche: Niche }) {
  useReveal()
  return (
    <>
      <Header onHome={niche.path === '/'} />
      <main>
        <Hero niche={niche} />
      </main>
      <Footer />
    </>
  )
}
