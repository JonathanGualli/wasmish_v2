import type { Story } from './types.ts'

// Academia Horizonte, la cuenta de demostración de capacitación
// (Backend/scripts/fixtures/demo.scenarios.js): el video muestra lo mismo que
// Jonathan enseña en una videollamada. Los textos de la voz son los del guion
// (borrador 2) y los tiempos, los del storyboard de Claude Design, hasta que se
// grabe la voz. Las cuatro correcciones del storyboard tienen su test.

const bot = {
  requirements: 'Para inscribirse necesita: copia de cédula, el pago del curso (transferencia o tarjeta) y llenar la ficha que le enviamos por aquí. ¡Es muy fácil! 😊',
  closed: '¡Hola! Gracias por escribir a Academia Horizonte 📚 Atendemos de lunes a viernes de 8:30 a 18:00 y los sábados de 8:00 a 12:00. Le respondemos apenas abramos.',
}

export const capacitacion: Story = {
  scenes: [
    { id: 'hook', from: 0, to: 6 },
    { id: 'recap', from: 6, to: 25 },
    { id: 'assign', from: 25, to: 32 },
    { id: 'afterHours', from: 32, to: 43 },
    { id: 'broadcast', from: 43, to: 56 },
    { id: 'closing', from: 56, to: 72 },
  ],

  cues: {
    'hook.headline': 0.6,
    'hook.mark': 1.5,
    'hook.shrink': 3.5,
    'recap.change': 6,
    'recap.question': 6.8,
    'recap.answer': 8.3,
    'recap.pdf': 9.8,
    'recap.zoomName': 11.2,
    'recap.toPdf': 13.4,
    'recap.noteUp': 15.4,
    'recap.zoomNote': 16.6,
    'recap.markNote': 17.4,
    'recap.backToToday': 20,
    'recap.reply': 20.8,
    'assign.pill': 25.5,
    'assign.event': 26,
    'assign.lock': 28.5,
    'assign.notification': 29,
    'afterHours.clock': 32.4,
    'afterHours.question': 33.5,
    'afterHours.bot': 34.3,
    'afterHours.dawn': 39.5,
    'afterHours.reply': 40.5,
    'broadcast.sweep': 43,
    'broadcast.label': 43.4,
    'broadcast.card': 44,
    'broadcast.stats': 50,
    'broadcast.reply': 52,
    'closing.devices': 56,
    'closing.pillNumber': 58.6,
    'closing.pillOfficial': 61,
    'closing.zoomPhone': 64,
    'closing.appMessage': 64.6,
    'closing.ink': 68,
    'closing.second': 69,
    'closing.logo': 69.8,
  },

  subtitles: [
    { text: 'Un interesado vuelve a escribir después de dos semanas.', highlight: 'dos semanas', from: 0.3, to: 3 },
    { text: '¿Su equipo sabe qué le ofrecieron?', highlight: 'qué le ofrecieron', from: 3, to: 5.6 },
    { text: 'Con Wasmish, cada persona atiende con su usuario', highlight: 'con su usuario', from: 6.4, to: 8.6 },
    { text: 'en el mismo WhatsApp.', from: 8.6, to: 10 },
    { text: 'Mónica abre el chat', from: 10, to: 11.2 },
    { text: 'y ve lo que respondió Gabriela,', highlight: 'Gabriela', from: 11.2, to: 13.4 },
    { text: 'el temario que le mandó', from: 13.4, to: 15.4 },
    { text: 'y su nota: «quizá inscriba a dos compañeros más».', highlight: 'quizá inscriba a dos compañeros más', from: 16, to: 19.6 },
    { text: 'Así retoma la conversación sin empezar de cero.', highlight: 'sin empezar de cero', from: 20, to: 24.4 },
    { text: 'Si debe seguir Gabriela, Mónica se lo asigna,', highlight: 'se lo asigna', from: 25.3, to: 28.3 },
    { text: 'y a Gabriela le llega el aviso al celular.', highlight: 'el aviso', from: 28.5, to: 31.6 },
    { text: '¿Le preguntan los requisitos a las diez de la noche?', highlight: 'a las diez de la noche', from: 32.3, to: 35 },
    { text: 'Wasmish responde solo, con lo que usted dejó preparado,', highlight: 'responde solo', from: 35, to: 39.3 },
    { text: 'y al abrir, su equipo sigue la conversación.', highlight: 'su equipo', from: 39.5, to: 42.6 },
    { text: 'Y cuando abre otro grupo, les avisa de una vez', highlight: 'de una vez', from: 43.6, to: 47 },
    { text: 'a los interesados de ese curso.', from: 47, to: 49.8 },
    { text: 'Ve cuántos lo leyeron, y las respuestas llegan al chat.', highlight: 'cuántos lo leyeron', from: 50, to: 55.6 },
    { text: 'Funciona en la computadora', from: 56.4, to: 58 },
    { text: 'y en el celular, con su mismo número', highlight: 'su mismo número', from: 58, to: 60.6 },
    { text: 'y la conexión oficial de WhatsApp.', from: 60.6, to: 63.6 },
    { text: 'Puede seguir usando su app de WhatsApp Business.', highlight: 'su app de WhatsApp Business', from: 64, to: 67.6 },
  ],

  headlines: {
    hook: { before: '¿Qué le ', highlight: 'ofrecieron', after: '?' },
    recap: { before: 'Sin empezar ', highlight: 'de cero', after: '' },
    assign: { before: 'Asignada a ', highlight: 'Gabriela', after: '' },
    afterHours: { before: 'Responde aunque estén ', highlight: 'cerrados', after: '' },
    broadcast: { before: 'Grupo nuevo: avíseles ', highlight: 'de una vez', after: '' },
    closing: { before: 'Su mismo número · ', highlight: 'Conexión oficial', after: '' },
  },

  kevin: {
    contact: { initials: 'KM', name: 'Kevin Mora', phone: '+593 98 316 4072' },
    thread: [
      { id: 'past', kind: 'chip', text: '18 oct · hace 10 días' },
      { id: 'question', kind: 'in', text: '¿Qué días es el curso de Excel avanzado?', time: '10:12' },
      { id: 'answer', kind: 'out', text: 'Tenemos grupo los sábados de 9:00 a 13:00, cuatro semanas. Le envío el temario.', time: '10:16', who: 'Gabriela' },
      { id: 'pdf', kind: 'pdf', file: 'Excel-Avanzado-Academia-Horizonte.pdf', size: 'PDF · 1,2 MB', time: '10:16', who: 'Gabriela' },
      { id: 'today', kind: 'chip', text: 'Hoy' },
      { id: 'back', kind: 'in', text: 'Hola, ¿todavía hay cupo para el curso de Excel del sábado? Seríamos 3 personas', time: '09:41' },
      { id: 'reply', kind: 'out', text: 'Hola, Kevin. Sí, hay cupo para los 3 el sábado.', time: '09:42', who: 'Mónica' },
      { id: 'assigned', kind: 'event', text: 'Mónica le asignó esta conversación a Gabriela', time: '09:44' },
      { id: 'invoice', kind: 'out-app', text: 'Le paso los datos para la factura de su empresa.', time: '09:52' },
    ],
    note: {
      text: 'Le interesa Excel Avanzado, grupo de los sábados. Pidió la factura a nombre de su empresa. Quizá inscriba a 2 compañeros más.',
      author: 'Gabriela',
      date: '18 oct · 10:20',
    },
  },

  // Como el push de la app (Backend/src/utils/push.js): el contacto de título.
  notification: { title: 'Kevin Mora', body: 'Mónica te asignó esta conversación.', time: '09:44', date: 'miércoles, 28 de octubre' },

  afterHours: {
    contact: { initials: 'JL', name: 'José Luis', phone: '+593 99 482 1170' },
    thread: [
      { id: 'night', kind: 'chip', text: 'Martes' },
      { id: 'question', kind: 'in', text: 'Hola, ¿cuáles son los requisitos para inscribirme?', time: '22:10' },
      // Como decideAutoReply: la palabra clave primero, el horario después, en un mensaje.
      { id: 'bot', kind: 'out', text: `${bot.requirements}\n\n${bot.closed}`, time: '22:10', who: 'Bot' },
      { id: 'morning', kind: 'chip', text: 'Miércoles' },
      { id: 'reply', kind: 'out', text: 'Buenos días. Con gusto le ayudo con la inscripción. ¿Para qué curso sería?', time: '08:35', who: 'Gabriela' },
    ],
  },

  broadcast: {
    title: 'Nuevo grupo de Marketing Digital · noviembre',
    tag: 'Interesado · Marketing digital',
    contacts: 48,
    sent: 48,
    delivered: 46,
    read: 31,
    reply: { name: 'Tatiana', text: 'Sí, resérveme uno por favor 🙋‍♀️' },
  },

  closing: {
    first: 'Soy Jonathan, de Wasmish.',
    second: { before: 'Si le sirve, yo se lo dejo ', highlight: 'funcionando', after: '.' },
    url: 'wasmish.com/capacitacion',
  },
}
