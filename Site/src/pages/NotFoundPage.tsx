import { Header } from '../components/Header.tsx'
import { Footer } from '../components/Footer.tsx'

export function NotFoundPage() {
  return (
    <>
      <Header onHome={false} />
      <main className="mx-auto max-w-3xl px-5 py-24">
        <p className="font-mono text-sm text-brand-muted">404</p>
        <h1 className="mt-2 text-[clamp(34px,5vw,52px)] leading-[1.05] font-extrabold tracking-[-0.04em]">Esta página no existe.</h1>
        <p className="mt-4 text-brand-strong">
          Puede que el enlace esté mal escrito. <a href="/" className="font-semibold text-brand-accent-strong underline">Volver al inicio</a>.
        </p>
      </main>
      <Footer />
    </>
  )
}
