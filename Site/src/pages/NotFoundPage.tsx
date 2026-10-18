export function NotFoundPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-24">
      <p className="font-mono text-sm text-brand-muted">404</p>
      <h1 className="mt-2 text-4xl font-extrabold tracking-tight">Esta página no existe.</h1>
      <p className="mt-4 text-brand-strong">
        Puede que el enlace esté mal escrito. <a href="/" className="font-semibold text-brand-accent-strong underline">Volver al inicio</a>.
      </p>
    </main>
  )
}
