import type { ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { NOT_FOUND, ROUTES, type Route } from './routes.ts'
import { renderHead } from './lib/head.ts'
import { renderSalesPage } from './salesPages.tsx'
import { LegalPage } from './pages/LegalPage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { markdownToHtml } from './lib/markdown.ts'
import privacidad from './legal/privacidad.md?raw'
import terminos from './legal/terminos.md?raw'

const LEGAL: Record<string, string> = { '/privacidad': privacidad, '/terminos': terminos }

// Lo usa scripts/prerender.mjs, al compilar, para escribir cada página.
export function listRoutes(): Route[] {
  return [...ROUTES, NOT_FOUND]
}

function pageFor(route: Route): ReactElement {
  if (route.hydrate) return renderSalesPage(route.path)
  if (route === NOT_FOUND) return <NotFoundPage />
  const md = LEGAL[route.path]
  if (!md) throw new Error(`Sin contenido para ${route.path}`)
  return <LegalPage title={route.meta.title.replace(/ · Wasmish$/, '')} html={markdownToHtml(md)} />
}

export function render(path: string): { html: string; head: string } {
  const route = listRoutes().find((r) => r.path === path)
  if (!route) throw new Error(`Ruta desconocida: ${path}`)
  return { html: renderToString(pageFor(route)), head: renderHead(route.meta) }
}
