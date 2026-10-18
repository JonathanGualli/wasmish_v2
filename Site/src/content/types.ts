import type { PageMeta } from '../lib/head.ts'

// Un titular con una palabra resaltada en la píldora verde («qué se habló»).
export type HighlightedTitle = { before: string; highlight: string; after: string }

// Una página de venta (el inicio o un nicho). Todo su texto vive aquí: el molde
// es VentaPage. Las secciones que faltan se suman a medida que se construyen.
export type Niche = {
  slug: 'inicio' | 'capacitacion' | 'imprentas'
  path: string
  // Va en el texto prellenado del botón: «… demostración de Wasmish (<demoLabel>)».
  demoLabel: string
  meta: Omit<PageMeta, 'path' | 'noindex'>
  hero: {
    eyebrow: string
    title: HighlightedTitle
    subtitle: string
  }
}
