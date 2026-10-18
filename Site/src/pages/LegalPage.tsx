// Privacidad y Términos: el HTML ya convertido del Markdown (src/legal/), sin
// JavaScript en el navegador.
export function LegalPage({ title, html }: { title: string; html: string }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="text-4xl font-extrabold tracking-tight">{title}</h1>
      <div className="legal mt-8 text-brand-strong" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  )
}
