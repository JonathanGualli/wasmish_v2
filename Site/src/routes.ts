import type { PageMeta } from './lib/head.ts'
import { normalizePath } from './lib/paths.ts'
import { inicio } from './content/niches/inicio.ts'
import type { Niche } from './content/types.ts'

// Las páginas del sitio: solo datos, sin componentes. Lo importan el navegador
// (para saber qué hidratar) y el pre-renderizado (para escribir cada archivo).
export type Route = {
  path: string
  // El archivo en dist/. Cloudflare Pages sirve `privacidad.html` en `/privacidad`.
  file: string
  hydrate: boolean
  meta: PageMeta
}

export const NICHES: Niche[] = [inicio]

const nicheRoute = (niche: Niche): Route => ({
  path: niche.path,
  file: niche.path === '/' ? 'index.html' : `${niche.path.slice(1)}.html`,
  hydrate: true,
  meta: { path: niche.path, ...niche.meta },
})

export const ROUTES: Route[] = [
  ...NICHES.map(nicheRoute),
  {
    path: '/privacidad',
    file: 'privacidad.html',
    hydrate: false,
    meta: {
      path: '/privacidad',
      title: 'Política de privacidad · Wasmish',
      description:
        'Qué datos guarda Wasmish, para qué, con quién se comparten y cómo pedir que se corrijan o se borren.',
      ogImage: inicio.meta.ogImage,
    },
  },
  {
    path: '/terminos',
    file: 'terminos.html',
    hydrate: false,
    meta: {
      path: '/terminos',
      title: 'Términos del servicio · Wasmish',
      description:
        'Las condiciones para usar Wasmish: precio, implementación, lo que le corresponde a su negocio y cómo cancelar.',
      ogImage: inicio.meta.ogImage,
    },
  },
]

// Cloudflare Pages sirve 404.html a cualquier ruta que no existe. No va al sitemap.
export const NOT_FOUND: Route = {
  path: '/404',
  file: '404.html',
  hydrate: false,
  meta: {
    path: '/404',
    title: 'Página no encontrada · Wasmish',
    description: 'Esta dirección no existe en wasmish.com.',
    ogImage: inicio.meta.ogImage,
    noindex: true,
  },
}

export function findRoute(pathname: string): Route | undefined {
  const path = normalizePath(pathname)
  return ROUTES.find((route) => route.path === path)
}
