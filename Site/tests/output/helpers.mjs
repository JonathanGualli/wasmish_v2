// Lectura de lo que dejó `npm run build` en Site/dist/. Los tests de esta
// carpeta revisan el sitio tal como se publica.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist')

export const read = (file) => readFileSync(join(DIST, file), 'utf8')

export const size = (file) => statSync(join(DIST, file)).size

export const allHtmlFiles = () => readdirSync(DIST).filter((f) => f.endsWith('.html'))

export const title = (file) => read(file).match(/<title>(.*?)<\/title>/s)?.[1]

export const jsonLdBlocks = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]))
