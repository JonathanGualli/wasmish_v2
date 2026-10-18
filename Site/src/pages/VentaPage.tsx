import type { Niche } from '../content/types.ts'
import { Header } from '../components/Header.tsx'
import { Footer } from '../components/Footer.tsx'
import { useReveal } from '../components/useReveal.ts'
import { Hero } from '../sections/Hero.tsx'
import { BeforeAfter } from '../sections/BeforeAfter.tsx'
import { Features } from '../sections/Features.tsx'
import { AutoReplies } from '../sections/AutoReplies.tsx'
import { Setup } from '../sections/Setup.tsx'
import { Pricing } from '../sections/Pricing.tsx'
import { WhatChanges } from '../sections/WhatChanges.tsx'
import { Faq } from '../sections/Faq.tsx'
import { ClosingCta } from '../sections/ClosingCta.tsx'

// El molde de las páginas de venta: el inicio y cada nicho, con sus textos.
// El orden de las secciones es el del diseño v3.
export function VentaPage({ niche }: { niche: Niche }) {
  useReveal()
  return (
    <>
      <Header onHome={niche.path === '/'} />
      <main>
        <Hero niche={niche} />
        <BeforeAfter pairs={niche.beforeAfter} />
        <Features features={niche.features} stripText={niche.stripText} />
        <AutoReplies scene={niche.bot.scene} keywords={niche.bot.keywords} examples={niche.bot.examples} selected={niche.bot.selected} />
        <Setup />
        <Pricing />
        <WhatChanges />
        <Faq />
        <ClosingCta demoLabel={niche.demoLabel} caseWord={niche.closingWord} />
      </main>
      <Footer />
    </>
  )
}
