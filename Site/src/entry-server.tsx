import type { ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { NOT_FOUND, ROUTES, type Route } from './routes.ts'
import { renderHead } from './lib/head.ts'
import { renderSalesPage } from './salesPages.tsx'
import { LegalPage } from './pages/LegalPage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'

// Lo usa scripts/prerender.mjs, al compilar, para escribir cada página.
export function listRoutes(): Route[] {
  return [...ROUTES, NOT_FOUND]
}

function pageFor(route: Route): ReactElement {
  if (route.hydrate) return renderSalesPage(route.path)
  if (route === NOT_FOUND) return <NotFoundPage />
  // Privacidad y Términos: el contenido real llega con el Markdown (tarea 3).
  return <LegalPage title={route.meta.title.replace(/ · Wasmish$/, '')} html="<p>Contenido en preparación.</p>" />
}

export function render(path: string): { html: string; head: string } {
  const route = listRoutes().find((r) => r.path === path)
  if (!route) throw new Error(`Ruta desconocida: ${path}`)
  return { html: renderToString(pageFor(route)), head: renderHead(route.meta) }
}
