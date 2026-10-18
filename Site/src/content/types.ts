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

// Una historia animada simple (el chat del bot): qué aparece en cada fase y cuánto dura.
export type StoryPhase = { show?: string[]; compose?: string; step: number; ms: number }

// «Lo que pasa hoy» → «con Wasmish». Una hora como «22:00» se dibuja en mono.
export type BeforeAfter = { before: string; after: string }

// Las pantallas de «Lo que ve su equipo» (componente «PantallaFuncion» del diseño).
export type FeatureMessage = { from: 'in' | 'out'; text: string; time: string; by?: string; fromApp?: boolean }
export type FeatureScreen =
  | { kind: 'chat'; contact: ExampleContact; messages: FeatureMessage[] }
  | { kind: 'ficha'; contact: ExampleContact; tags: string[]; newTag: string; note: { text: string; author: string; date: string } }
  | { kind: 'campaign'; title: string; detail: string; message: string; sent: number; delivered: number; read: number }
  | { kind: 'phone'; notifications: { name: string; text: string }[] }
export type Feature = { title: string; text: string; screen: FeatureScreen }

// Las respuestas automáticas: el chat de una noche y los ejemplos de «Probar»
// (son datos, sin lógica: cada pregunta trae su respuesta y por qué sale).
export type BotScene = { contact: ExampleContact; labels: string[]; items: ChatItem[]; phases: StoryPhase[] }
export type ProbeExample = { question: string; answer: string; reason: string }

// Una página de venta (el inicio o un nicho). Todo su texto vive aquí: el molde
// es VentaPage.
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
  beforeAfter: BeforeAfter[]
  features: Feature[]
  bot: { scene: BotScene; examples: ProbeExample[]; selected: number }
}
