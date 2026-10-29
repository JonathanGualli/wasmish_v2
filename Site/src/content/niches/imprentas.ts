import type { Niche } from '../types.ts'

// Imprentas comerciales pequeñas que cotizan por encargo (plan comercial v2).
// Las escenas son las «imprenta» y «bot-imprenta» del diseño v3; los textos,
// los de la 3a, ajustados a la v3 (sigue con su app, cuatro formas del bot).
const contact = { initials: 'GT', name: 'Gabriela Torres', phone: '+593 99 318 4402' }

export const imprentas: Niche = {
  slug: 'imprentas',
  path: '/imprentas',
  demoLabel: 'imprentas',
  meta: {
    title: 'Wasmish para imprentas · Que su equipo sepa qué se le cotizó a cada cliente',
    description:
      'Atiendan el WhatsApp de la imprenta entre varias personas: cada cotización con su conversación, su PDF y el nombre de quien respondió. Demostración de 15 minutos, en Ecuador.',
    ogImage: '/og-imprentas-1.png',
  },
  hero: {
    eyebrow: 'Para imprentas que cotizan por WhatsApp entre varias personas',
    title: { before: 'Que su equipo sepa ', highlight: 'qué se le cotizó', after: ' a cada cliente.', wraps: true },
    subtitle:
      'Atiendan el WhatsApp de la imprenta desde Wasmish, con usuarios individuales, notas compartidas y el nombre de quien respondió.',
    caption: { strong: 'Luis no atendió la primera vez.', soft: 'Igual supo qué se le cotizó.' },
    scene: {
      contact,
      tags: ['Volantes', 'Cotización'],
      note: { text: 'Cotizó 1.000 volantes A5, couché 115 g: USD 65. Espera el arte.', author: 'Ana', date: '12 oct' },
      labels: {
        side: ['Ana cotiza a Gabriela', 'Ana deja una nota en la ficha', 'Días después, Luis abre la conversación', 'Luis responde sabiendo todo'],
        sheet: ['Ana cotiza a Gabriela', 'Ana abre la ficha y deja una nota', 'Días después, Luis abre la ficha', 'Luis responde sabiendo todo'],
      },
      items: [
        { id: 'd1', kind: 'chip', text: 'Martes 12' },
        { id: 'm1', kind: 'in', text: 'Hola, ¿cuánto cuestan 1.000 volantes A5 a full color?', time: '10:14' },
        { id: 'm2', kind: 'out', text: 'Hola, Gabriela. En couché de 115 g quedan en USD 65. Le envío la cotización.', time: '10:16', who: 'Ana' },
        { id: 'm3', kind: 'pdf', file: 'Cotización volantes A5.pdf', size: '180 KB', time: '10:16', who: 'Ana' },
        { id: 'm4', kind: 'in', text: 'Gracias, le mando el arte la próxima semana.', time: '10:21' },
        { id: 'd2', kind: 'chip', text: 'Lunes 18' },
        { id: 'm5', kind: 'in', text: 'Buenos días, ya tengo el arte. ¿Para cuándo estarían?', time: '09:02' },
        { id: 'm6', kind: 'out', text: 'Buenos días, Gabriela. Con lo que le cotizamos, 1.000 volantes A5 en couché por USD 65, estarían el jueves. Envíeme el arte por aquí.', time: '09:05', who: 'Luis' },
      ],
    },
  },
  beforeAfter: [
    { before: 'El cliente vuelve con el arte y alguien pregunta: «¿Qué papel y qué precio le dimos?»', after: 'Lo ve en la conversación, en la cotización enviada y en la ficha del contacto.' },
    { before: '«¿Cuánto cuestan 1.000 volantes?», «¿hacen tarjetas?». Y a las 22:00 nadie contesta.', after: 'La respuesta que usted preparó sale al momento.' },
    { before: 'Un empleado se va y se lleva las cotizaciones.', after: 'El historial se queda en la imprenta.' },
    { before: 'Dos personas le cotizan lo mismo al cliente, o ninguna.', after: 'Cada conversación tiene a quien la atiende.' },
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
          { from: 'in', text: '¿Me cotiza 1.000 volantes A5?', time: '10:14' },
          { from: 'out', text: 'Sí: en couché de 115 g, USD 65.', time: '10:16', by: 'Ana' },
          { from: 'in', text: '¿Y para cuándo estarían?', time: '13:32' },
          { from: 'out', text: 'Si nos manda el arte hoy, el jueves.', time: '13:40', fromApp: true },
          { from: 'out', text: 'Gabriela, recibimos el arte: quedan para el jueves.', time: '16:05', by: 'Luis' },
        ],
      },
    },
    {
      title: 'Notas y etiquetas que ve todo el equipo.',
      text: '«Cotizó 1.000 volantes», «espera el arte». Lo que uno anota en el contacto, lo lee el que sigue.',
      screen: {
        kind: 'ficha',
        contact,
        tags: ['Volantes', 'Cotización'],
        newTag: 'Espera el arte',
        note: { text: 'Cotizó 1.000 volantes A5, couché 115 g: USD 65. Espera el arte.', author: 'Ana', date: '12 oct' },
      },
    },
    {
      title: 'Avisos a un grupo, y cuántos se leyeron.',
      text: 'Por ejemplo, «ya recibimos pedidos de calendarios 2027». Ve cuántos llegaron y cuántos se leyeron. Solo a contactos que aceptaron recibirlos: eso lo garantiza su imprenta.',
      screen: {
        kind: 'campaign',
        title: 'Calendarios 2027',
        detail: 'Etiqueta: Clientes · 180 contactos · lun 09:00',
        message: 'Hola. Ya recibimos pedidos de calendarios 2027 para empresas. ¿Le enviamos los modelos?',
        sent: 180, delivered: 177, read: 132,
      },
    },
    {
      title: 'En el celular, con avisos. Y su app sigue funcionando.',
      text: 'Wasmish se instala desde el navegador, sin tienda de aplicaciones, y avisa cuando llega un mensaje. Android y iPhone (en iPhone, desde Safari).',
      screen: {
        kind: 'phone',
        notifications: [
          { name: 'Gabriela Torres', text: 'Buenos días, ya tengo el arte. ¿Para cuándo estarían?' },
          { name: 'Rocío Pazmiño', text: '¿Hacen tarjetas en papel kraft?' },
        ],
      },
    },
  ],
  // El límite de los archivos (brief, § 3.3): sirve si cotizan en PDF o con imágenes.
  stripText: {
    'Documentos e imágenes': 'Cotizaciones en PDF e imágenes, de hasta 16 MB. Los archivos editables, como AI o PSD, van por correo o Drive.',
  },
  bot: {
    scene: {
      contact: { initials: 'RP', name: 'Rocío Pazmiño', phone: '+593 99 640 2281' },
      labels: ['22:41 · Escribe con la imprenta cerrada', 'Al momento · responde lo que la imprenta preparó', '08:40 · Ana responde a mano'],
      items: [
        { id: 'd1', kind: 'chip', text: 'Martes 12' },
        { id: 'm1', kind: 'in', text: 'Buenas noches, ¿cuánto cuestan 100 tarjetas de presentación?', time: '22:41' },
        { id: 'm2', kind: 'out', text: 'Hola, gracias por escribir a Imprenta Andrango. 100 tarjetas a full color, en cartulina de 300 g, cuestan USD 18. Atendemos de lunes a sábado, de 8:30 a 18:00; mañana le escribe una persona del equipo.', time: '22:41', who: 'Bot' },
        { id: 'd2', kind: 'chip', text: 'Miércoles 13' },
        { id: 'm3', kind: 'out', text: 'Buenos días, Rocío, soy Ana. ¿Ya tiene el diseño o se lo preparamos?', time: '08:40', who: 'Ana' },
        { id: 'm4', kind: 'in', text: 'Ya lo tengo, se lo envío.', time: '08:44' },
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
    keywords: ['precio', 'ubicación'],
    // La cotización la hace una persona: el bot da precios fijos y deriva lo demás (brief, § 3.3).
    examples: [
      { question: 'Hola, buenas tardes', answer: '¡Hola! Gracias por escribir a Imprenta Andrango. ¿En qué le podemos ayudar?', reason: 'Bienvenida' },
      { question: '¿Qué precio tienen los volantes?', answer: '1.000 volantes A5 a full color: USD 65 en couché de 115 g. Para otras cantidades, le cotiza una persona del equipo.', reason: 'Palabra clave «precio»' },
      { question: '¿Cuál es su ubicación?', answer: 'Estamos en la Av. 10 de Agosto y Colón, Quito. Atendemos de lunes a sábado, de 8:30 a 18:00.', reason: 'Palabra clave «ubicación»' },
      { question: '¿Hacen gigantografías?', answer: 'Gracias por escribir. En un momento le atiende una persona del equipo.', reason: 'Si no entiende' },
    ],
    selected: 1,
  },
  closingWord: 'imprenta',
  og: { bubble: 'Con lo que le cotizamos, estarían el jueves.', by: 'Luis', time: '09:05' },
}
