import { WHATSAPP_NUMBER } from '../site.ts'

// El texto prellenado dice de qué página viene: así Jonathan sabe, en su
// WhatsApp, qué nicho trajo cada demostración (medición sin cookies).
export function demoMessage(label: string): string {
  return `Hola, quiero ver una demostración de Wasmish (${label})`
}

export function buildDemoHref(number: string, label: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(demoMessage(label))}`
}

// «+593 98 415 2777» a partir de «593984152777», igual en toda la página.
export function formatPhone(number: string): string {
  return `+${number.slice(0, 3)} ${number.slice(3, 5)} ${number.slice(5, 8)} ${number.slice(8)}`
}

// `null` mientras no haya número: el botón se dibuja como hueco.
export function demoHref(label: string): string | null {
  return WHATSAPP_NUMBER ? buildDemoHref(WHATSAPP_NUMBER, label) : null
}
