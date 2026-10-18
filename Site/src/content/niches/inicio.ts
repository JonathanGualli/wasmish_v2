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
  beforeAfter: [
    { before: 'Otra persona retoma el chat y pregunta: «¿Qué le ofrecimos?»', after: 'Lo ve en la conversación y en la ficha del contacto.' },
    { before: 'Preguntan el precio a las 22:00 y nadie contesta hasta mañana.', after: 'La respuesta que usted preparó sale al momento.' },
    { before: 'Un empleado se va y se lleva las conversaciones.', after: 'El historial se queda en el negocio.' },
    { before: 'Para atender desde la computadora hay que dejar la app.', after: 'Sigue con su app de WhatsApp Business y su número.' },
  ],
  features: [
    {
      title: 'Cada mensaje, con el nombre de quien lo envió.',
      text: 'Ana, Luis o quien responda: se ve en cada mensaje. Lo que se responde desde la app de WhatsApp Business también aparece, marcado «Desde la app de WhatsApp», aunque sin el nombre.',
      screen: {
        kind: 'chat',
        contact: { initials: 'MC', name: 'María Cevallos', phone: '+593 98 214 7730' },
        messages: [
          { from: 'in', text: '¿Tienen la silla Oslo en negro?', time: '10:14' },
          { from: 'out', text: 'Sí, en negro y en gris. Cuesta USD 189.', time: '10:16', by: 'Ana' },
          { from: 'in', text: '¿Y entregan en Guayaquil?', time: '13:32' },
          { from: 'out', text: 'Sí, en 3 días hábiles.', time: '13:40', fromApp: true },
          { from: 'out', text: 'María, le confirmo: le llega el jueves.', time: '16:05', by: 'Luis' },
        ],
      },
    },
    {
      title: 'Notas y etiquetas que ve todo el equipo.',
      text: '«Quiere 3 unidades», «cotizó 1.000 volantes». Lo que uno anota en el contacto, lo lee el que sigue.',
      screen: {
        kind: 'ficha',
        contact: { initials: 'MC', name: 'María Cevallos', phone: '+593 98 214 7730' },
        tags: ['Sillas', 'Cotización'],
        newTag: 'Volver a escribir',
        note: { text: 'Quiere 3 unidades, en negro. Volver a escribirle el lunes.', author: 'Ana', date: '12 oct' },
      },
    },
    {
      title: 'Avisos a un grupo, y cuántos se leyeron.',
      text: 'Por ejemplo, «llegó la nueva colección». Ve cuántos llegaron y cuántos se leyeron. Solo a contactos que aceptaron recibirlos: eso lo garantiza su negocio.',
      screen: {
        kind: 'campaign',
        title: 'Nueva colección de sillas',
        detail: 'Etiqueta: Clientes · 240 contactos · lun 09:00',
        message: 'Hola. Llegó la nueva colección de sillas Oslo, en 4 colores. ¿Le enviamos el catálogo?',
        sent: 240, delivered: 236, read: 171,
      },
    },
    {
      title: 'En el celular, con avisos. Y su app sigue funcionando.',
      text: 'Wasmish se instala desde el navegador, sin tienda de aplicaciones, y avisa cuando llega un mensaje. Android y iPhone (en iPhone, desde Safari).',
      screen: {
        kind: 'phone',
        notifications: [
          { name: 'María Cevallos', text: 'Buenos días, ¿me confirma el precio de las 3?' },
          { name: 'Diego Paredes', text: '¿Hacen entregas el sábado?' },
        ],
      },
    },
  ],
  bot: {
    // La escena «bot» del diseño v3.
    scene: {
      contact: { initials: 'JP', name: 'Jorge Paredes', phone: '+593 99 503 1184' },
      labels: ['22:41 · Escribe con el negocio cerrado', 'Al momento · responde lo que el negocio preparó', '09:12 · Ana responde a mano'],
      items: [
        { id: 'd1', kind: 'chip', text: 'Martes 12' },
        { id: 'm1', kind: 'in', text: 'Buenas noches, ¿cuánto cuesta la silla Oslo?', time: '22:41' },
        { id: 'm2', kind: 'out', text: 'Hola, gracias por escribirnos. La silla Oslo cuesta USD 189, con entrega en Quito y Guayaquil. Atendemos de lunes a viernes, de 9:00 a 18:00; mañana le escribe una persona del equipo.', time: '22:41', who: 'Bot' },
        { id: 'd2', kind: 'chip', text: 'Miércoles 13' },
        { id: 'm3', kind: 'out', text: 'Buenos días, Jorge, soy Ana. ¿Le separo una? La tenemos en negro y en gris.', time: '09:12', who: 'Ana' },
        { id: 'm4', kind: 'in', text: 'Sí, una en negro, por favor.', time: '09:15' },
      ],
      phases: [
        { show: ['d1', 'm1'], step: 0, ms: 1900 },
        { show: ['m2'], step: 1, ms: 3400 },
        { show: ['d2'], step: 2, ms: 500 },
        { compose: 'm3', step: 2, ms: 1700 },
        { show: ['m3'], step: 2, ms: 1400 },
        { show: ['m4'], step: 2, ms: 4500 },
      ],
    },
    examples: [
      { question: 'Hola, buenas tardes', answer: '¡Hola! Gracias por escribir a Muebles Andes. ¿En qué le podemos ayudar?', reason: 'Bienvenida' },
      { question: '¿Qué precio tiene la silla Oslo?', answer: 'La silla Oslo cuesta USD 189 y el escritorio Lima, USD 240. Entregamos en Quito y Guayaquil.', reason: 'Palabra clave «precio»' },
      { question: '¿Cuál es su ubicación?', answer: 'Estamos en la Av. Amazonas y Naciones Unidas, Quito. Atendemos de lunes a viernes, de 9:00 a 18:00.', reason: 'Palabra clave «ubicación»' },
      { question: '¿Hacen envíos a Cuenca?', answer: 'Gracias por escribir. En un momento le atiende una persona del equipo.', reason: 'Si no entiende' },
    ],
    keywords: ['precio', 'ubicación'],
    selected: 1,
  },
  closingWord: 'negocio',
  og: { bubble: 'Son 3 sillas a USD 189: USD 567 en total.', by: 'Luis', time: '09:05' },
}
