# Brief de diseño: los avisos de la asignación

> Para la IA de diseño. Describe **qué** tiene que poder hacer cada persona y **qué información** ve, no cómo se ve. Ya conoces la marca, Chats y el diseño de «Asignar conversaciones» (`Design/Wasmish Chats - Asignar conversaciones.html`, brief `2026-10-27-asignacion-brief-ui.md`), que está en producción desde la 1.0.33. Esto lo completa: el diseño tiene que sentirse parte de él y reutilizar sus piezas.

---

## 1. Contexto: qué avisos hay hoy

Jonathan probó la asignación en producción el 2026-10-28 y funciona. Lo que falla son **los avisos**: unos no convencen, otros se pierden, y de lo que pasó con una conversación no queda rastro.

| Aviso | Dónde y cómo | Para qué se usa hoy |
|---|---|---|
| **A. El aviso flotante del hilo** | Abajo y al centro del chat, oscuro, se va solo a los 3 segundos | Confirmar lo que hizo quien mira («Ahora la atiendes tú.», «Ahora está sin asignar.», «Ahora la atiende Luis.», «Respondiste: ahora la atiendes tú.», «Se la pasaste a Luis.», «Rechazaste la solicitud. Se le avisa a Luis.»), y dos errores que ya existían antes de la asignación: una reacción que no salió y una cita a un mensaje demasiado antiguo |
| **B. La barra bajo la cabecera** | Dentro del chat, con una ✕ para cerrarla | «Carla te pasó esta conversación» y «La conversación cambió de manos. Vuelve a intentarlo.» |
| **C. El aviso global** | Arriba a la derecha, en cualquier pantalla; se va solo a los 5 segundos y solo cabe uno | La respuesta a una solicitud de transferencia: «Carla te pasó la conversación con Pedro. Abrir» o «Carla no te pasó la conversación con Pedro.» |
| **D. La barra de la solicitud** | En el chat de quien puede responderla | «Luis pide que se la pases», con Rechazar y Pasársela |
| **E. El aviso al celular (push)** | Notificación del sistema | **Solo** cuando el cliente escribe. Asignar o transferir no avisa |

**Los problemas:**
- **A no convence a Jonathan.** Hay que proponer otra forma de confirmar algo al momento, que sirva también para los dos errores de reacciones y citas.
- **C se pierde.** Si el agente está en otra pestaña o con el celular en el bolsillo, el aviso se va sin que lo vea, y después no hay dónde encontrarlo.
- **Asignar no avisa a nadie.** La conversación aparece en silencio en «Mías» de quien la recibe.
- **No queda historia.** Quien abre una conversación no sabe quién la tuvo antes, quién se la pasó ni cuándo.

---

## 2. Lo que se necesita

### 2.1 La historia de la conversación, dentro del hilo

Cada cambio de manos queda **en el hilo, en su momento**, entre los mensajes y por hora. **No es un mensaje**: no lo ve el cliente, no cuenta como no leído y no sale en la vista previa de la bandeja.

Los eventos y cómo se leen (se usa «tú» cuando es quien mira):
- **Tomar:** «Luis tomó esta conversación», o «Tomaste esta conversación». Responder una sin asignar también cuenta.
- **Asignar:** «Carla le asignó esta conversación a Luis» / «Carla te asignó esta conversación» / «Le asignaste esta conversación a Luis».
- **Soltar:** «Luis dejó esta conversación sin asignar».
- **La solicitud:** «Marta pidió esta conversación», y después «Luis se la pasó a Marta» o «Luis rechazó pasársela a Marta».
- **Al quitar el acceso:** «Esta conversación quedó sin asignar: Luis ya no tiene acceso a la línea».

Cada evento lleva **la hora**. Tienen que poder leerse de un vistazo sin competir con los mensajes del cliente. Empiezan a contar desde que esto se publique: las conversaciones de antes no tienen historia.

Con esto, varias confirmaciones de A sobran: la línea nueva del hilo ya dice lo que pasó.

### 2.2 Los avisos que se quedan (la campanita)

Un sitio, **accesible desde cualquier pantalla de Wasmish, en la computadora y en el celular**, con los avisos de cada persona. **No se van solos**: quedan hasta que la persona los ve.
- **Qué se ve:** la lista, la más reciente arriba, con quién, qué conversación (el nombre del contacto y su línea) y cuándo. Cuáles no ha visto todavía y **cuántas son**, a la vista desde cualquier pantalla.
- **Qué se puede hacer:** pulsar un aviso lleva a la conversación. Marcarlos como vistos (todos de una vez, o al abrirlos).
- **Qué avisos llegan** (solo a quien le toca):
  - **te asignaron una conversación**, o te la pasaron al aceptar tu solicitud;
  - **rechazaron tu solicitud**;
  - **te piden una conversación**: a quien la atiende y a quienes pueden responder la solicitud. Si se puede aceptar o rechazar desde el mismo aviso sin abrir el chat, mejor, pero no es obligatorio.
- **Si la conversación ya no es de quien mira** (se la volvieron a quitar), el aviso sigue en la lista, pero no abre lo que ya no puede ver.
- **En una cuenta de una sola persona no aparece**, como el resto de la asignación: Wasmish se ve igual que hoy.

El aviso global C deja de usarse para esto. Puede seguir saliendo un momento al llegar el aviso, pero lo que cuenta es que quede en la campanita.

### 2.3 Al celular

«**Te asignaron una conversación**» (y «te la pasaron») llega también como **notificación push**, igual que hoy llega un mensaje del cliente. Al tocarla, abre esa conversación. El texto de la notificación también hay que proponerlo.

### 2.4 Confirmar al momento (lo que hoy hace A)

Hace falta una forma de confirmar al momento lo que **no** queda en el hilo: los dos errores de reacciones y citas, y lo que no es un cambio de manos («La solicitud cambió. Revísala de nuevo.»). Puede ser el aviso global C, si encaja; si no, otra cosa que se use igual en toda la app.

---

## 3. Lo que el diseño tiene que transmitir

- **Nada se pierde:** lo que le toca a una persona la espera hasta que lo ve.
- **La conversación cuenta su propia historia**, sin mezclarse con lo que dijo el cliente.
- **Pocos avisos y claros:** solo llega lo que le toca a cada uno.

## 4. Lo que no entra

- Avisos de otras cosas (una campaña que terminó, una línea desconectada…): la campanita tiene que poder crecer, pero ahora solo lleva la asignación.
- Notas internas al transferir, cerrar conversaciones, repartir automáticamente y métricas por agente: siguen para después.
- Ajustes de qué avisos recibir: todavía no.
