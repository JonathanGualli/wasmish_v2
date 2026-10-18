import { Header } from '../components/Header.tsx'
import { Footer } from '../components/Footer.tsx'

// Privacidad y Términos: el HTML ya convertido del Markdown (src/legal/), sin
// JavaScript en el navegador.
export function LegalPage({ title, html }: { title: string; html: string }) {
  return (
    <>
      <Header onHome={false} />
      <main className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="text-[clamp(34px,5vw,52px)] leading-[1.05] font-extrabold tracking-[-0.04em]">{title}</h1>
        <div className="legal mt-8 text-brand-strong" dangerouslySetInnerHTML={{ __html: html }} />
      </main>
      <Footer />
    </>
  )
}
