import type { PageMeta } from '../lib/head.ts'

// Un titular con su palabra resaltada: «Que su equipo sepa [qué se habló] con cada cliente.»
export type HighlightedText = { before: string; highlight: string; after: string }

// Un mensaje de las conversaciones de ejemplo (imitan la app: nunca datos reales).
export type ChatItem =
  | { id: string; kind: 'chip'; text: string }
  | { id: string; kind: 'in'; text: string; time: string }
  | { id: string; kind: 'out'; text: string; time: string; who: string }
  | { id: string; kind: 'pdf'; file: string; size: string; time: string; who: string }

export type ExampleContact = { initials: string; name: string; phone: string }

// La conversación del hero: Ana atiende, deja una nota, y días después Luis
// retoma sabiendo todo. Los pasos y sus tiempos están en sections/HeroDemo.tsx.
export type HeroScene = {
  contact: ExampleContact
  tags: string[]
  note: { text: string; author: string; date: string }
  // Las etiquetas de los 4 pasos: con la ficha al lado (computadora) o como hoja (celular).
  labels: { side: string[]; sheet: string[] }
  // d1, m1… m6 y d2: los ids que usan las fases del hero.
  items: ChatItem[]
}

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
    title: HighlightedText
    subtitle: string
    scene: HeroScene
    // Debajo de la conversación: «Luis no atendió la primera vez. Igual supo qué se le ofreció.»
    caption: { strong: string; soft: string }
  }
}
