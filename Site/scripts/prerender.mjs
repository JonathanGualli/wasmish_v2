// Escribe el HTML de cada página, ya completo, para que WhatsApp y Google lo
// lean sin ejecutar JavaScript. Corre al final de `npm run build`, después de
// las dos compilaciones de Vite (dist/ para el navegador, dist-ssr/ para Node).
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const ssrDir = join(root, 'dist-ssr')

const SITE_URL = 'https://wasmish.com'

const template = readFileSync(join(dist, 'index.html'), 'utf8')
const { render, listRoutes } = await import(pathToFileURL(join(ssrDir, 'entry-server.js')).href)

// Sin hidratar, la página no necesita el JavaScript de React (el CSS, sí).
const withoutScripts = (html) =>
  html.replace(/\s*<script type="module"[^>]*><\/script>/g, '').replace(/\s*<link rel="modulepreload"[^>]*>/g, '')

const routes = listRoutes()
for (const route of routes) {
  const { html, head } = render(route.path)
  let page = template.replace('<!--head-->', head).replace('<!--app-->', html)
  if (!route.hydrate) page = withoutScripts(page)
  writeFileSync(join(dist, route.file), page)
}

const indexable = routes.filter((route) => !route.meta.noindex)
writeFileSync(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    indexable.map((route) => `  <url><loc>${SITE_URL}${route.path}</loc></url>`).join('\n') +
    `\n</urlset>\n`,
)
writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`)

rmSync(ssrDir, { recursive: true, force: true })
console.log(`Pre-renderizadas ${routes.length} páginas: ${routes.map((r) => r.file).join(', ')}`)
