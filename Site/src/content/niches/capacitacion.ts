import type { Niche } from '../types.ts'

// Centros de capacitación y cursos para adultos (plan comercial v2). Las
// escenas son las «capacitacion» y «bot-capacitacion» del diseño v3; los
// textos, los de la 3b, ajustados a la v3 (sigue con su app, cuatro formas del bot).
const contact = { initials: 'DO', name: 'Daniela Ortiz', phone: '+593 98 706 2215' }

export const capacitacion: Niche = {
  slug: 'capacitacion',
  path: '/capacitacion',
  demoLabel: 'capacitación',
  meta: {
    title: 'Wasmish para centros de capacitación · Que su equipo sepa qué se le ofreció a cada interesado',
    description:
      'Atiendan el WhatsApp del centro entre varias personas: notas por interesado, avisos al abrir un grupo nuevo y respuestas a lo que siempre preguntan. Demostración de 15 minutos, en Ecuador.',
    ogImage: '/og-capacitacion-1.png',
  },
  hero: {
    eyebrow: 'Para centros de capacitación que atienden por WhatsApp entre varias personas',
    title: { before: 'Que su equipo sepa ', highlight: 'qué se le ofreció', after: ' a cada interesado.', wraps: true },
    subtitle:
      'Atiendan el WhatsApp del centro desde Wasmish, con usuarios individuales, notas compartidas y el nombre de quien respondió.',
    caption: { strong: 'Luis no atendió la primera vez.', soft: 'Igual supo qué curso le interesaba.' },
    scene: {
      contact,
      tags: ['Contabilidad', 'Interesada'],
      note: { text: 'Contabilidad básica, grupo de los sábados. Quizás lo paga su empresa.', author: 'Ana', date: '12 oct' },
      labels: {
        side: ['Ana atiende a Daniela', 'Ana deja una nota en la ficha', 'Días después, Luis abre la conversación', 'Luis responde sabiendo todo'],
        sheet: ['Ana atiende a Daniela', 'Ana abre la ficha y deja una nota', 'Días después, Luis abre la ficha', 'Luis responde sabiendo todo'],
      },
      items: [
        { id: 'd1', kind: 'chip', text: 'Martes 12' },
        { id: 'm1', kind: 'in', text: 'Hola, ¿cuándo empieza el curso de contabilidad?', time: '10:14' },
        { id: 'm2', kind: 'out', text: 'Hola, Daniela. Contabilidad básica empieza el 7 de noviembre, sábados de 9:00 a 13:00, por USD 120. Le envío el temario.', time: '10:16', who: 'Ana' },
        { id: 'm3', kind: 'pdf', file: 'Temario Contabilidad básica.pdf', size: '420 KB', time: '10:16', who: 'Ana' },
        { id: 'm4', kind: 'in', text: 'Gracias, lo converso en mi trabajo y le aviso.', time: '10:21' },
        { id: 'd2', kind: 'chip', text: 'Lunes 18' },
        { id: 'm5', kind: 'in', text: 'Buenos días, mi empresa sí me paga el curso. ¿Cómo me inscribo?', time: '09:02' },
        { id: 'm6', kind: 'out', text: 'Buenos días, Daniela. Qué bien. Para el grupo de los sábados son USD 120: le envío los datos para la factura a nombre de su empresa.', time: '09:05', who: 'Luis' },
      ],
    },
  },
  beforeAfter: [
    { before: 'El interesado vuelve semanas después y alguien pregunta: «¿Qué curso le ofrecimos?»', after: 'Lo ve en la conversación, en el temario enviado y en la ficha del contacto.' },
    { before: 'Preguntan el precio del curso a las 22:00 y nadie contesta hasta mañana.', after: 'La respuesta que usted preparó sale al momento.' },
    { before: 'Abre un grupo nuevo y nadie vuelve a escribirles a los interesados del anterior.', after: 'Les avisa a todos de una vez, con un aviso a su etiqueta.' },
    { before: 'Para atender desde la computadora hay que dejar la app.', after: 'Sigue con su app de WhatsApp Business y su número.' },
  ],
  features: [
    {
      title: 'Cada mensaje, con el nombre de quien lo envió.',
      text: 'Ana, Luis o quien responda: se ve en cada mensaje. Lo que se responde desde la app de WhatsApp Business también aparece, marcado «Desde la app de WhatsApp», aunque sin el nombre.',
      screen: {
        kind: 'chat',
        contact,
        messages: [
          { from: 'in', text: '¿El curso de contabilidad da certificado?', time: '10:14' },
          { from: 'out', text: 'Sí, al terminar recibe su certificado.', time: '10:16', by: 'Ana' },
          { from: 'in', text: '¿Y puedo pagar en dos partes?', time: '13:32' },
          { from: 'out', text: 'Sí: la mitad al inscribirse.', time: '13:40', fromApp: true },
          { from: 'out', text: 'Daniela, ya le envié los datos para la inscripción.', time: '16:05', by: 'Luis' },
        ],
      },
    },
    {
      title: 'Notas y etiquetas que ve todo el equipo.',
      text: '«Le interesa el grupo de los sábados», «lo paga su empresa». Lo que uno anota en el contacto, lo lee el que sigue.',
      screen: {
        kind: 'ficha',
        contact,
        tags: ['Contabilidad', 'Interesada'],
        newTag: 'Grupo de sábados',
        note: { text: 'Contabilidad básica, grupo de los sábados. Quizás lo paga su empresa.', author: 'Ana', date: '12 oct' },
      },
    },
    {
      title: 'Avisos a un grupo, y cuántos se leyeron.',
      text: 'Por ejemplo, «abrimos un grupo nuevo de Excel». Ve cuántos llegaron y cuántos se leyeron. Solo a contactos que aceptaron recibirlos: eso lo garantiza su centro.',
      screen: {
        kind: 'campaign',
        title: 'Nuevo grupo de Excel',
        detail: 'Etiqueta: Interesados Excel · 320 contactos · lun 09:00',
        message: 'Hola. Abrimos un grupo nuevo de Excel intermedio el 14 de noviembre, sábados de 9:00 a 13:00. ¿Le reservamos un cupo?',
        sent: 320, delivered: 314, read: 236,
      },
    },
    {
      title: 'En el celular, con avisos. Y su app sigue funcionando.',
      text: 'Wasmish se instala desde el navegador, sin tienda de aplicaciones, y avisa cuando llega un mensaje. Android y iPhone (en iPhone, desde Safari).',
      screen: {
        kind: 'phone',
        notifications: [
          { name: 'Daniela Ortiz', text: 'Buenos días, mi empresa sí me paga el curso. ¿Cómo me inscribo?' },
          { name: 'Javier Morales', text: '¿El curso de Excel tiene certificado?' },
        ],
      },
    },
  ],
  stripText: {
    'Contactos desde Excel': 'Importe la lista de alumnos e interesados que ya tiene.',
  },
  bot: {
    scene: {
      contact: { initials: 'JM', name: 'Javier Morales', phone: '+593 96 215 8840' },
      labels: ['22:41 · Escribe con el centro cerrado', 'Al momento · responde lo que el centro preparó', '08:20 · Ana responde a mano'],
      items: [
        { id: 'd1', kind: 'chip', text: 'Martes 12' },
        { id: 'm1', kind: 'in', text: 'Buenas noches, ¿qué precio tiene el curso de Excel?', time: '22:41' },
        { id: 'm2', kind: 'out', text: 'Hola, gracias por escribir al Centro Andino de Capacitación. Excel intermedio cuesta USD 90: 4 sábados, de 9:00 a 13:00, con certificado. Atendemos de lunes a viernes, de 8:00 a 17:00; mañana le escribe una persona del equipo.', time: '22:41', who: 'Bot' },
        { id: 'd2', kind: 'chip', text: 'Miércoles 13' },
        { id: 'm3', kind: 'out', text: 'Buenos días, Javier, soy Ana. Quedan 6 cupos para el grupo de noviembre. ¿Le reservo uno?', time: '08:20', who: 'Ana' },
        { id: 'm4', kind: 'in', text: 'Sí, por favor.', time: '08:31' },
      ],
      phases: [
        { show: ['d1', 'm1'], step: 0, ms: 1900 },
        { show: ['m2'], step: 1, ms: 3600 },
        { show: ['d2'], step: 2, ms: 500 },
        { compose: 'm3', step: 2, ms: 1700 },
        { show: ['m3'], step: 2, ms: 1400 },
        { show: ['m4'], step: 2, ms: 4500 },
      ],
    },
    keywords: ['precio', 'horario'],
    examples: [
      { question: 'Hola, buenas tardes', answer: '¡Hola! Gracias por escribir al Centro Andino de Capacitación. ¿Qué curso le interesa?', reason: 'Bienvenida' },
      { question: '¿Qué horario tiene el curso de contabilidad?', answer: 'Contabilidad básica: sábados de 9:00 a 13:00, desde el 7 de noviembre. También hay grupo entre semana, de 18:30 a 20:30.', reason: 'Palabra clave «horario»' },
      { question: '¿Qué precio tiene?', answer: 'Contabilidad básica cuesta USD 120 y Excel intermedio, USD 90. Los dos incluyen certificado.', reason: 'Palabra clave «precio»' },
      { question: '¿Tienen cursos en línea?', answer: 'Gracias por escribir. En un momento le atiende una persona del equipo.', reason: 'Si no entiende' },
    ],
    selected: 1,
  },
  closingWord: 'centro',
  og: { bubble: 'Para el grupo de los sábados son USD 120.', by: 'Luis', time: '09:05' },
}
