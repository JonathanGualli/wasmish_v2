import type { Niche } from '../types.ts'

// El inicio: para cualquier negocio que atiende por WhatsApp entre varias
// personas. Textos del brief (docs/superpowers/specs/2026-10-17-pagina-publica-brief.md).
export const inicio: Niche = {
  slug: 'inicio',
  path: '/',
  demoLabel: 'web',
  meta: {
    title: 'Wasmish · Que su equipo sepa qué se habló con cada cliente',
    description:
      'Atiendan el WhatsApp del negocio desde Wasmish, con usuarios individuales, notas compartidas y el nombre de quien respondió. Demostración de 15 minutos, en Ecuador.',
    ogImage: '/og-inicio-1.png',
  },
  hero: {
    eyebrow: 'Para negocios que atienden por WhatsApp entre varias personas',
    title: { before: 'Que su equipo sepa ', highlight: 'qué se habló', after: ' con cada cliente.' },
    subtitle:
      'Atiendan el WhatsApp del negocio desde Wasmish, con usuarios individuales, notas compartidas y el nombre de quien respondió.',
  },
}
