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
    caption: { strong: 'Luis no atendió la primera vez.', soft: 'Igual supo qué se le ofreció.' },
    // La escena «muebles» del diseño v3.
    scene: {
      contact: { initials: 'MC', name: 'María Cevallos', phone: '+593 98 214 7730' },
      tags: ['Sillas', 'Cotización'],
      note: { text: 'Quiere 3 unidades. Volver a escribirle el lunes.', author: 'Ana', date: '12 oct' },
      labels: {
        side: ['Ana atiende a María', 'Ana deja una nota en la ficha', 'Días después, Luis abre la conversación', 'Luis responde sabiendo todo'],
        sheet: ['Ana atiende a María', 'Ana abre la ficha y deja una nota', 'Días después, Luis abre la ficha', 'Luis responde sabiendo todo'],
      },
      items: [
        { id: 'd1', kind: 'chip', text: 'Martes 12' },
        { id: 'm1', kind: 'in', text: 'Hola, ¿tienen la silla Oslo? ¿Qué precio tiene?', time: '10:14' },
        { id: 'm2', kind: 'out', text: 'Hola, María. Sí, la tenemos: USD 189. Le envío el catálogo con colores y medidas.', time: '10:16', who: 'Ana' },
        { id: 'm3', kind: 'pdf', file: 'Catálogo sillas 2026.pdf', size: '2,4 MB', time: '10:16', who: 'Ana' },
        { id: 'm4', kind: 'in', text: 'Gracias, lo reviso y le aviso.', time: '10:21' },
        { id: 'd2', kind: 'chip', text: 'Lunes 18' },
        { id: 'm5', kind: 'in', text: 'Buenos días, ya me decidí. ¿Me confirma el precio de las 3?', time: '09:02' },
        { id: 'm6', kind: 'out', text: 'Buenos días, María. Son 3 sillas Oslo a USD 189: USD 567 en total. ¿Las prefiere en negro, como en el catálogo?', time: '09:05', who: 'Luis' },
      ],
    },
  },
}
