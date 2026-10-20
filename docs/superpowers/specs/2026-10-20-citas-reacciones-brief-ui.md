# Brief de diseño: responder citando y reaccionar en el chat

> Para la IA de diseño. Describe **qué** tiene que poder hacer cada persona y **qué información** ve, no cómo se ve. Ya conoces la marca y todas las pantallas de Wasmish (Chats con su bandeja, hilo, composer y ficha; la app en el celular). El diseño tiene que sentirse parte de ellas y reutilizar sus piezas. Spec técnico: [2026-10-20-citas-reacciones-design.md](2026-10-20-citas-reacciones-design.md).

---

## 1. Contexto

En WhatsApp, la gente responde a un mensaje concreto («responder», que cita el original encima) y reacciona con un emoji. Hoy Wasmish no entiende ninguna de las dos:

- si el contacto responde citando, el agente ve el texto suelto y no sabe a qué contesta;
- si el contacto reacciona, aparece un mensaje nuevo «Reaccionó con 👍» que no dice a qué mensaje, y además cuenta como no leído y manda un aviso;
- desde Wasmish no se puede ni citar ni reaccionar.

Un ejemplo: una imprenta manda tres cotizaciones seguidas (volantes, tarjetas, afiches). El cliente responde «este» citando la de tarjetas y reacciona 👍 a la de volantes. Hoy el agente ve «este» y «Reaccionó con 👍» sueltos, y tiene que adivinar. Con esto, ve la cita de tarjetas sobre «este» y el 👍 pegado a la cotización de volantes. Y él puede contestar «Perfecto, la de tarjetas sale el jueves» citando el mensaje del cliente, para que no haya dudas.

Quien lo usa: los agentes y el resto del equipo, todo el día, en la computadora y en el celular (la app instalada).

---

## 2. Dónde aparece

Todo en el **hilo de una conversación** de Chats y en su **composer**, en la computadora y en el celular. Y un detalle en la **bandeja** (§ 6).

---

## 3. Lo que ve la persona en el hilo

### Una cita dentro de un mensaje

Un mensaje (del contacto o nuestro) que responde a otro muestra, dentro de su burbuja y encima de su contenido, la **cita del original**:

- **quién lo escribió:** el nombre del contacto, o «Tú» / el negocio si era nuestro (decidir cuál se entiende mejor con un equipo de varias personas);
- **un resumen:** el texto (una o dos líneas, recortado), o el tipo con su icono si era un archivo sin texto («Foto», «Nota de voz», «Documento: cotizacion.pdf», «Ubicación»…). Si era una foto o un video, una miniatura ayudaría, pero no es obligatoria;
- **casos especiales:**
  - el original **se borró**: «Mensaje eliminado»;
  - Wasmish **no tiene** el original (es de antes de conectar el número, por ejemplo): «Mensaje no disponible». Tiene que verse como algo normal, no como un error.

**Tocar la cita** lleva al mensaje original en el hilo y lo **resalta un momento**, para que el ojo lo encuentre. Si está muy arriba, Wasmish va cargando el historial hasta encontrarlo (puede tardar un poco: hace falta un estado de «buscando»). Si es demasiado viejo, avisa «Este mensaje es muy antiguo». Si es «no disponible», tocarla no hace nada.

### Reenviado

Un mensaje del contacto que es un reenvío lleva una marca pequeña: **«Reenviado»**, o **«Reenviado muchas veces»** (WhatsApp lo usa para cadenas y bulos; puede merecer otro peso). Discreta: es información, no una alerta.

### Reacciones

Cada mensaje puede tener **hasta dos reacciones**: la del contacto y la nuestra (para el contacto, el negocio es uno solo, aunque seamos varios).

- Se ven **pegadas a la burbuja** del mensaje, como en WhatsApp.
- La nuestra dice **quién del equipo** la puso (al pasar el ratón o al tocarla, por ejemplo), o «desde la app de WhatsApp» si se puso desde el celular del negocio (coexistencia). La del contacto no necesita más.
- **Una reacción nuestra que no salió** (WhatsApp la rechazó, a veces un rato después): tiene que notarse que falló y, al mirarla, por qué. Hoy un mensaje fallido ya tiene su marca y su detalle: algo en la misma línea.
- Las reacciones llegan **en vivo**: si el contacto reacciona mientras miro, aparece; si la quita, desaparece. Sin saltos que muevan el hilo.

---

## 4. Lo que puede hacer

### El menú de un mensaje

Cada mensaje tiene acciones: **Responder** y, si se puede, **Reaccionar**. Tienen que estar a mano sin ensuciar el hilo:

- en la **computadora**, al pasar el ratón por el mensaje (por ejemplo);
- en el **celular**, al mantener pulsado (por ejemplo), sin chocar con lo que ya hace el toque (abrir una foto, el ojito de un mensaje borrado).

**Cuándo se puede:**
- **Responder:** casi siempre. No en un mensaje que no llegó a enviarse (fallido), ni en uno borrado.
- **Reaccionar:** solo a **mensajes del contacto**, de menos de 30 días, no borrados (WhatsApp no deja más). En los demás, la acción **no aparece** (no un botón que luego falla). Wasmish ya sabe para cada mensaje si se puede.

### Reaccionar

- Una **barra con 6 emojis**: 👍 ❤️ 😂 😮 😢 🙏, y un **«+»** que abre un **selector completo** (con buscador y categorías, el habitual). El selector tarda un instante la primera vez que se abre: un estado de carga breve.
- **Tocar el emoji que ya puse lo quita.** Tocar otro lo cambia.
- La reacción **aparece al instante**. Si el servidor la rechaza, desaparece con el motivo (con el aviso de error que ya usa el chat).
- Reaccionar **no** se manda como mensaje ni mueve el composer.

### Responder citando

- Al elegir «Responder», aparece **sobre el composer** una barra «Respondiendo a [quién]» con el resumen del mensaje (el mismo de la cita) y una **✕** para cancelar. El foco va al campo de texto.
- Se puede responder con **texto** o con **un archivo** (la vista previa de archivo que ya existe tiene que convivir con la barra de la cita).
- Al enviar, la barra desaparece y el mensaje sale con su cita.
- **Cambiar de conversación** descarta la cita. Escape (en la computadora) también.
- **No se puede** citar al enviar una **plantilla** (WhatsApp no la muestra): si la ventana de 24 h está cerrada y el composer ofrece «Enviar plantilla», la barra de la cita no aplica. Decidir qué pasa si había una cita a medias cuando la ventana se cierra.

---

## 5. Estados que hay que resolver

- El menú del mensaje abierto, en la computadora y en el celular.
- La barra de reacciones y el selector completo abiertos (en el celular, con poco espacio y el teclado quizás abierto).
- Una reacción nuestra **enviándose**, **puesta**, **fallida**.
- La barra «Respondiendo a» con un texto largo, con una foto, con un documento; junto a un archivo adjunto en el composer.
- **Buscando** el original al tocar una cita; **resaltado** al encontrarlo; **«Este mensaje es muy antiguo»**.
- Una cita a un mensaje **eliminado** y a uno **no disponible**.
- Un mensaje con **todo a la vez**: una cita, «Reenviado», editado («Editado», que ya existe), una reacción de cada lado y la línea de la hora con el acuse.
- Mensajes cortos («ok») con reacciones: que el emoji no tape nada ni quede flotando lejos.

---

## 6. La bandeja

Cuando el contacto reacciona, la conversación **sube** y su vista previa dice **«Reaccionó 👍 a: «Te paso la cotización…»»**. Cuando reacciono yo: **«Reaccionaste 👍 a: «…»»**. Una reacción **no** suma no leídos ni manda aviso al celular. Es solo el texto de la vista previa que ya existe: no hace falta diseñar nada nuevo, salvo que veas un problema.

---

## 7. Lo que no entra

- Reenviar mensajes desde Wasmish.
- El selector de emojis **al escribir** en el composer (llega después, con el mismo selector).
- Citar desde una plantilla, desde las campañas o desde las respuestas automáticas.
- Ver la lista de todas las reacciones de una conversación, o reaccionar con varios emojis a la vez.
