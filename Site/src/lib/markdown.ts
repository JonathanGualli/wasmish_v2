import { marked } from 'marked'

// Privacidad y Términos se escriben en Markdown (src/legal/). Un dato que falta
// se escribe `[pendiente: …]` y sale como el mismo hueco que <Pending>, con
// `data-pending`. Solo lo usa entry-server.tsx: no llega al navegador.
export function markdownToHtml(md: string): string {
  const html = marked.parse(md, { async: false })
  return html.replace(/\[pendiente: ([^\]]+)\]/g, (_match, text: string) => `<span data-pending>${text}</span>`)
}
