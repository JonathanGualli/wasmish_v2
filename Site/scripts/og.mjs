// Las imágenes de vista previa del enlace (1200 × 630), a partir de las
// tarjetas que se compilan con VITE_OG=1 (src/og/OgCard.tsx). Se corre a mano,
// con `npm run og`, y los PNG se guardan en el repo. Usa el Chrome del sistema
// (playwright-core no descarga navegadores).
//
// WhatsApp guarda la vista previa de un enlace un tiempo: si una imagen cambia,
// cambia también su nombre (`og-inicio-1.png` → `og-inicio-2.png`, en el `meta`
// del nicho).
import { createServer } from 'node:http'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { resolveInside } from './resolveInside.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }

// Solo escucha en 127.0.0.1 y solo entrega archivos de dist/.
const server = createServer((req, res) => {
  const file = resolveInside(dist, req.url ?? '/')
  if (!file) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const base = `http://127.0.0.1:${server.address().port}`

const cards = readdirSync(dist).filter((f) => /^og-[a-z]+\.html$/.test(f))
if (!cards.length) throw new Error('No hay tarjetas: compila con VITE_OG=1 (npm run og)')

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
for (const card of cards) {
  await page.goto(`${base}/${card}`)
  await page.evaluate(() => document.fonts.ready)
  const target = await page.getAttribute('[data-og-file]', 'data-og-file')
  const out = join(root, 'public', target)
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } })
  console.log(`${card} → public${target} (${Math.round(statSync(out).size / 1024)} KB)`)
}
await browser.close()
server.close()
