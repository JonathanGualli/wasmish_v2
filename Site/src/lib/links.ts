import { WHATSAPP_NUMBER } from '../site.ts'

// El texto prellenado dice de qué página viene: así Jonathan sabe, en su
// WhatsApp, qué nicho trajo cada demostración (medición sin cookies).
export function demoMessage(label: string): string {
  return `Hola, quiero ver una demostración de Wasmish (${label})`
}

export function buildDemoHref(number: string, label: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(demoMessage(label))}`
}

// `null` mientras no haya número: el botón se dibuja como hueco.
export function demoHref(label: string): string | null {
  return WHATSAPP_NUMBER ? buildDemoHref(WHATSAPP_NUMBER, label) : null
}
