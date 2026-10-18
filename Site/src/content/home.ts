// Lo que dicen igual todas las páginas de venta (el brief:
// docs/superpowers/specs/2026-10-17-pagina-publica-brief.md). Lo propio de cada
// nicho está en content/niches/.

// Un párrafo con, como mucho, un enlace dentro: [antes, {enlace}, después].
export type Rich = (string | { href: string; text: string })[]

export const FEATURE_STRIP = [
  { title: 'Un usuario por persona', text: 'El historial se queda en el negocio aunque alguien se vaya.' },
  { title: 'Contactos desde Excel', text: 'Importe la lista de clientes que ya tiene.' },
  { title: 'Documentos e imágenes', text: 'PDF, catálogos y fotos desde la conversación.' },
  { title: 'Plataforma oficial', text: 'Conexión mediante la plataforma oficial de WhatsApp Business.' },
]

// Las cuatro formas de las respuestas automáticas (brief, § 3.3).
export const AUTO_REPLY_FORMS: { name: string; text: Rich; keywords?: string[] }[] = [
  { name: 'Bienvenida', text: ['A quien escribe por primera vez, o vuelve después de un tiempo.'] },
  { name: 'Fuera de horario', text: ['Un aviso con su horario. Una sola vez, no a cada mensaje.'] },
  { name: 'Palabras clave', text: [], keywords: ['precio', 'ubicación'] },
  { name: 'Si no entiende', text: ['Si el mensaje no coincide con nada, la respuesta que usted preparó. Una sola vez por conversación.'] },
]

// La implementación incluida (brief, § 3.5).
export const SETUP_STEPS = [
  'Conversamos 15 minutos.',
  'Conectamos su número juntos, sin dejar su app.',
  'Preparo sus plantillas e importo sus contactos.',
  'Su equipo ya responde.',
]

// Lo que cambia en su WhatsApp (brief, § 3.4): segmentos, en negrita los { strong }.
export const APP_CHANGES: (string | { strong: string })[][] = [
  ['En la app se apagan las ', { strong: 'listas de difusión' }, ' (las de antes quedan de solo lectura; en Wasmish se usan los avisos a un grupo), los mensajes temporales, «ver una vez» y la ubicación en tiempo real.'],
  [{ strong: 'WhatsApp para Windows' }, ' deja de servir para ese número: en la computadora se usa WhatsApp Web o Wasmish.'],
  ['Hay que ', { strong: 'abrir la app de vez en cuando' }, ': Meta desconecta si pasan unas dos semanas sin abrirla.'],
  [{ strong: 'Las conversaciones anteriores se quedan en la app.' }, ' Wasmish muestra lo que llega desde que se conecta.'],
  ['Si prefiere no tocar su app, puede usar un número nuevo solo para Wasmish.'],
]

// Preguntas frecuentes (brief, § 3.7), en ese orden. «¿Qué pasa si cancelo?»
// sigue lo que decidió Jonathan el 2026-10-17.
export const FAQ: { q: string; a: Rich }[] = [
  {
    q: '¿Tengo que dejar la app de WhatsApp Business?',
    a: ['No. Sigue con su app y su número, y además atiende desde Wasmish. En la app se apagan algunas funciones, como las listas de difusión, y las conversaciones anteriores se quedan en ella. Vea ',
      { href: '#cambios', text: 'lo que cambia en su WhatsApp' }, '.'],
  },
  {
    q: '¿Puedo escribirle a un cliente cuando quiera?',
    a: ['Durante las 24 horas siguientes a su último mensaje, sí. Después, con una plantilla aprobada por WhatsApp, y solo a contactos que aceptaron recibir mensajes.'],
  },
  {
    q: '¿Cuánto me cobra Meta?',
    a: ['Depende de cuántos mensajes se entregan, de qué tipo y a qué país. Vea el ', { href: '#precio', text: 'ejemplo de un mes' },
      '. Las conversaciones que empiezan desde un anuncio que abre WhatsApp pueden tener un período sin costo de Meta; el anuncio se paga aparte.'],
  },
  {
    q: '¿Qué pasa si cancelo?',
    a: ['Puede cancelar cuando quiera, sin permanencia ni multa. El mes pagado funciona hasta que termina, y ese día desconectamos su número de Wasmish: el número sigue siendo de su negocio. Durante los 30 días siguientes puede pedirnos sus contactos y sus conversaciones, y se los entregamos en Excel; después se borran.'],
  },
  {
    q: '¿De quién son mis datos?',
    a: ['De su negocio. Wasmish los guarda para que su equipo pueda atender, y no los vende ni los usa para escribirles a sus clientes. Más detalle en la ',
      { href: '/privacidad', text: 'política de privacidad' }, '.'],
  },
  {
    q: '¿Me pueden bloquear el número?',
    a: ['Wasmish usa la plataforma oficial de WhatsApp Business, pero hay que seguir las reglas de WhatsApp; por ejemplo, no escribirle a quien no lo pidió. Si no se siguen, WhatsApp puede limitar o bloquear el número.'],
  },
  {
    q: '¿Qué necesito para empezar?',
    a: ['Su número, una cuenta de Facebook, una tarjeta registrada en Meta para las plantillas y, si usa la app de WhatsApp Business, el celular a mano para escanear un código. Lo demás lo hacemos juntos.'],
  },
  {
    q: '¿Se puede usar desde el celular?',
    a: ['Sí. Se instala desde el navegador y avisa cuando llega un mensaje. No está en la tienda de aplicaciones; en iPhone se agrega a la pantalla de inicio desde Safari.'],
  },
  {
    q: '¿Responde solo?',
    a: ['Lo que su negocio deja preparado: la bienvenida, el aviso fuera de horario, las respuestas a palabras clave y la respuesta para cuando no entiende. Cuando alguien del equipo responde, el bot se calla en esa conversación.'],
  },
]
