import { capacitacionVoice } from './capacitacion.voice.ts'
import { resolveStory } from './resolve.ts'
import type { Story } from './types.ts'

// Academia Horizonte, la cuenta de demostración de capacitación
// (Backend/scripts/fixtures/demo.scenarios.js): el video muestra lo mismo que
// Jonathan enseña en una videollamada. Los textos de la voz son los del guion
// (borrador 2) y los tiempos salen de la voz de Jonathan (capacitacion.voice.ts):
// cada momento se ata a una palabra que dice. Las cuatro correcciones del
// storyboard tienen su test.

// Las respuestas de la demostración, resumidas (el guion lo permite): enteras
// eran diez líneas y no cabían en el chat.
const bot = {
  requirements: 'Para inscribirse necesita: copia de cédula, el pago del curso y llenar la ficha que le enviamos por aquí. 😊',
  closed: 'Atendemos de lunes a viernes de 8:30 a 18:00. Le respondemos apenas abramos.',
}

export const capacitacion: Story = resolveStory({
  voice: capacitacionVoice,
  // Más respiro donde una animación lo necesita: Mónica termina de escribir
  // (recap), el aviso se queda en la pantalla bloqueada (assign) y el logo,
  // quieto 3 s al final (closing).
  holds: { recap: 1.2, assign: 1.2, closing: 3.3 },

  cues: {
    'hook.headline': { at: 0.6 },
    'hook.mark': { word: 'después' },
    'hook.shrink': { word: 'equipo' },
    'hook.headlineOut': { beforeEnd: 0.4 },
    'recap.change': { at: 0 },
    'recap.headline': { at: 0.35 },
    'recap.question': { word: 'cada' },
    'recap.answer': { word: 'usuario' },
    'recap.pdf': { word: 'WhatsApp' },
    'recap.zoomName': { word: 'Mónica' },
    'recap.markName': { word: 'Gabriela' },
    'recap.toPdf': { word: 'temario', shift: -0.2 },
    'recap.noteUp': { word: 'nota', shift: -0.6 },
    'recap.zoomNote': { word: 'quizá', shift: -0.4 },
    'recap.markNote': { word: 'quizá' },
    'recap.backToToday': { word: 'más', edge: 'end', shift: 0.4 },
    'recap.reply': { word: 'Así' },
    'recap.send': { beforeEnd: 0.6 },
    'assign.headline': { at: 0.2 },
    // Entre «asigna» y «y a Gabriela» hay menos de 1 s: la pastilla cambia
    // antes, con «Mónica», para que el chat asignado se vea antes del corte.
    'assign.pill': { word: 'Mónica' },
    'assign.event': { word: 'asigna' },
    'assign.lock': { word: 'Gabriela', nth: 2, edge: 'end' },
    'assign.notification': { word: 'aviso', shift: -0.3 },
    'afterHours.headline': { at: 0.2 },
    'afterHours.clock': { at: 0.4 },
    'afterHours.chat': { at: 0.8 },
    'afterHours.question': { word: 'requisitos', shift: 0.3 },
    'afterHours.bot': { word: 'responde' },
    'afterHours.dawn': { word: 'abrir', shift: -0.2 },
    'afterHours.reply': { word: 'equipo' },
    'broadcast.sweep': { at: 0 },
    'broadcast.label': { at: 0.4 },
    'broadcast.headline': { at: 0.7 },
    'broadcast.card': { at: 1 },
    'broadcast.tag': { word: 'interesados' },
    'broadcast.consent': { word: 'campaña' },
    'broadcast.stats': { word: 'Ve' },
    'broadcast.reply': { word: 'respuestas', shift: -0.2 },
    'closing.devices': { at: 0 },
    'closing.headline': { at: 0.4 },
    'closing.pillNumber': { word: 'número' },
    'closing.pillOfficial': { word: 'oficial' },
    'closing.zoomPhone': { word: 'Puede', shift: -0.3 },
    'closing.appMessage': { word: 'app' },
    'closing.ink': { word: 'Soy', shift: -0.5 },
    'closing.second': { word: 'Si' },
    'closing.logo': { word: 'funcionando' },
  },

  // Lo que dice la voz, frase a frase. «Soy Jonathan…» no lleva subtítulo: ya
  // está escrito en pantalla.
  phrases: [
    { scene: 'hook', text: 'Un interesado vuelve a escribir después de dos semanas.', highlight: 'dos semanas' },
    { scene: 'hook', text: '¿Su equipo sabe qué le ofrecieron?', highlight: 'qué le ofrecieron' },
    { scene: 'recap', text: 'Con Wasmish, cada persona atiende con su usuario', highlight: 'con su usuario' },
    { scene: 'recap', text: 'en el mismo WhatsApp.', highlight: 'mismo WhatsApp' },
    { scene: 'recap', text: 'Mónica abre el chat' },
    { scene: 'recap', text: 'y ve lo que respondió Gabriela,', highlight: 'Gabriela' },
    { scene: 'recap', text: 'el temario que le mandó', highlight: 'el temario' },
    { scene: 'recap', text: 'y su nota: «quizá inscriba a dos compañeros más».', highlight: 'quizá inscriba a dos compañeros más' },
    { scene: 'recap', text: 'Así retoma la conversación sin empezar de cero.', highlight: 'sin empezar de cero' },
    { scene: 'assign', text: 'Si debe seguir Gabriela, Mónica se lo asigna,', highlight: 'se lo asigna' },
    { scene: 'assign', text: 'y a Gabriela le llega el aviso al celular.', highlight: 'el aviso' },
    { scene: 'afterHours', text: '¿Le preguntan los requisitos a las diez de la noche?', highlight: 'a las diez de la noche' },
    { scene: 'afterHours', text: 'Wasmish responde solo, con lo que usted dejó preparado,', highlight: 'responde solo' },
    { scene: 'afterHours', text: 'y al abrir, su equipo sigue la conversación.', highlight: 'su equipo' },
    { scene: 'broadcast', text: 'Y cuando abre otro grupo, les avisa de una vez', highlight: 'de una vez' },
    { scene: 'broadcast', text: 'a los interesados de ese curso, por medio de una campaña.', highlight: 'una campaña' },
    { scene: 'broadcast', text: 'Ve cuántos lo leyeron, y las respuestas llegan al chat.', highlight: 'cuántos lo leyeron' },
    { scene: 'closing', text: 'Funciona en la computadora' },
    { scene: 'closing', text: 'y en el celular, con su mismo número', highlight: 'su mismo número' },
    { scene: 'closing', text: 'y la conexión oficial de WhatsApp.' },
    { scene: 'closing', text: 'Puede seguir usando su app de WhatsApp Business.', highlight: 'su app de WhatsApp Business' },
  ],

  headlines: {
    hook: { before: '¿Qué le ', highlight: 'ofrecieron', after: '?' },
    recap: { before: 'Sin empezar ', highlight: 'de cero', after: '' },
    assign: { before: 'Asignada a ', highlight: 'Gabriela', after: '' },
    afterHours: { before: 'Responde aunque estén ', highlight: 'cerrados', after: '' },
    broadcast: { before: 'Grupo nuevo: avíseles ', highlight: 'de una vez', after: '' },
    // El espacio duro deja el «·» al final del renglón, no al principio del siguiente.
    closing: { before: 'Su mismo número\u00a0· ', highlight: 'Conexión oficial', after: '' },
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
    hookMark: 'Seríamos 3 personas',
    agent: 'Gabriela',
    note: {
      text: 'Le interesa Excel Avanzado, grupo de los sábados. Pidió la factura a nombre de su empresa. Quizá inscriba a 2 compañeros más.',
      highlight: 'Quizá inscriba a 2 compañeros más.',
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
})
