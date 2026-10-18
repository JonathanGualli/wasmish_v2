import { SITE_URL } from '../site.ts'

export type PageMeta = {
  path: string
  title: string
  description: string
  // Ruta absoluta dentro del sitio (`/og-inicio-1.png`); aquí se completa con SITE_URL.
  ogImage: string
  noindex?: boolean
  jsonLd?: object[]
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Un `</script>` dentro de un texto cerraría el bloque antes de tiempo, aunque
// esté dentro de una cadena JSON: `\u003c` es el mismo carácter para JSON.parse.
function jsonLdScript(value: object): string {
  return `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, '\\u003c')}</script>`
}

// Todo va con direcciones completas: WhatsApp no entiende las relativas.
export function renderHead(meta: PageMeta): string {
  const url = SITE_URL + meta.path
  const image = SITE_URL + meta.ogImage
  const title = escapeHtml(meta.title)
  const description = escapeHtml(meta.description)
  const tags = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Wasmish">`,
    `<meta property="og:locale" content="es_EC">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ]
  if (meta.noindex) tags.push(`<meta name="robots" content="noindex">`)
  for (const value of meta.jsonLd ?? []) tags.push(jsonLdScript(value))
  return tags.join('\n    ')
}
