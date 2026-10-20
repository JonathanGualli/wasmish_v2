# Citas y reacciones

Fecha: 2026-10-20. Diseño acordado con Jonathan en una sesión de Claude (decisiones en § 10). La interfaz la diseña Claude Design con el brief [2026-10-20-citas-reacciones-brief-ui.md](2026-10-20-citas-reacciones-brief-ui.md); este spec dice qué hace, no cómo se ve.

## 1. Qué problema resuelve

- **Las citas se pierden.** Cuando el contacto responde a un mensaje concreto («responder» en WhatsApp), Meta manda en el entrante un `context` con el id del mensaje citado. Wasmish no lo lee: el agente ve el texto suelto y no sabe a qué contesta. Y desde Wasmish no se puede responder citando: `processMessageSending` no manda `context`.
- **Las reacciones son mensajes sueltos.** Una reacción del contacto entra como un mensaje nuevo «Reaccionó con 👍» (`describirReaccion` en `utils/inbound.message.js`): suma un no leído, manda un aviso push, mueve la ventana de 24 h y no dice a qué mensaje fue. El id del mensaje al que reaccionó (`reaction.message_id`) se descarta. Desde Wasmish no se puede reaccionar.
- **No se sabe si algo es reenviado.** El mismo `context` dice si el mensaje se reenvió (`forwarded`) o se reenvió muchas veces (`frequently_forwarded`), y tampoco se lee.

## 2. Qué se construye

1. **Citas entrantes:** un mensaje del contacto que responde a otro muestra la cita (quién escribió el original y un resumen). Tocarla lleva al original.
2. **Responder citando desde Wasmish:** con un texto o un archivo, desde el chat.
3. **Reacciones entrantes:** el emoji del contacto se pega al mensaje al que reaccionó. Si la quita, desaparece. Solo avisa en la bandeja (§ 10).
4. **Reaccionar desde Wasmish** a un mensaje del contacto: 6 emojis rápidos y un selector completo, y quitar la reacción.
5. **Reenviado:** la marca «Reenviado» o «Reenviado muchas veces» en los entrantes.
6. **Coexistencia:** si los ecos de la app de WhatsApp Business traen citas o reacciones, se tratan igual (sin confirmar que lleguen: § 3).

**Fuera de alcance:**
- Responder citando con una **plantilla** (Meta no muestra la cita), desde el **bot** o desde la **API pública**; reaccionar desde la API. Pueden venir después si un cliente lo pide.
- Las reacciones que ya se guardaron como mensajes sueltos se quedan como están: no se migran.
- El selector de emojis en el composer: llega después, reutilizando el de las reacciones.
- Reenviar mensajes desde Wasmish.

## 3. Lo que dice Meta (fuentes oficiales)

Revisado el 2026-10-20 en la documentación de Meta para desarrolladores: [reaction messages](https://developers.facebook.com/docs/whatsapp/cloud-api/messages/reaction-messages), [contextual replies](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages/contextual-replies) y la [referencia del webhook `reaction`](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/reaction).

- **Reacción entrante:** campo `messages`, `type: "reaction"`, con su propio `id` y `reaction: { message_id, emoji }`. `message_id` es el mensaje del negocio al que reaccionó. Si el contacto **quita** la reacción, llega **sin** el campo `emoji` (no vacío: ausente). Solo se avisa de reacciones a mensajes de los **últimos 30 días**. El `timestamp` es cuándo reaccionó.
- La referencia dice «a previous message sent by a business», pero WhatsApp deja reaccionar a los propios mensajes también: la lógica no asume la dirección del original (§ 4).
- **Reaccionar:** `POST /<PHONE_NUMBER_ID>/messages` con `type: "reaction"` y `reaction: { message_id, emoji }`. Solo a **un mensaje recibido del contacto**. Falla si el original tiene **más de 30 días**, no existe, se borró o es una reacción: el error **no** llega en la respuesta, sino por el webhook de estados, con el código **131009**. Una reacción solo genera el acuse `sent`, nunca `delivered` ni `read`.
- **Quitar una reacción enviada:** la página no lo explica. Se asume `emoji: ""` (lo habitual en la API) y se comprueba con Meta de verdad (§ 8).
- **La ventana de 24 h:** la página de reacciones no la menciona. Wasmish no bloquea las reacciones (§ 5) y se comprueba con Meta de verdad.
- **Responder citando:** cualquier mensaje con `context: { message_id }`. La cita no se ve si el original se borró o pasó al almacenamiento de largo plazo (en general, a los **30 días**), ni si la respuesta es una **plantilla**. No se puede responder citando con una reacción.
- **Cita entrante:** el entrante trae `context: { from, id }` (el `id` es el mensaje citado). Un reenvío trae `context: { forwarded: true }` o `context: { frequently_forwarded: true }`, sin `id`.
- **Ecos (`smb_message_echoes`):** ninguna página consultada dice si traen `context` ni si una reacción desde la app llega como eco. Se programa a la defensiva (§ 4) y se comprueba con una línea con coexistencia.

## 4. Lo que llega de Meta

### Leer (funciones puras)

En `utils/inbound.message.js`, que sigue siendo el único sitio que conoce las formas de Meta (con sus tests):

- `describeReaction(messageData)`: para un `type: "reaction"`, devuelve `{ waMessageId, targetWaMessageId, emoji, timestamp }` (`emoji` = `null` si se quitó), o `null` si viene mal formada (sin `id` o sin `reaction.message_id`).
- `describeMessageContext(messageData)`: lee `context` y devuelve `{ replyToWaMessageId, forwarded }`: `replyToWaMessageId` es `context.id` o `null`; `forwarded` es `'many'` con `frequently_forwarded`, `'once'` con `forwarded` y si no `null`. Sin `context`, los dos `null`. La usan los entrantes y los ecos.
- `describirReaccion` se queda para el mensaje suelto (abajo).

### Una reacción del contacto

`procesarEntrante`, **antes** del camino de un mensaje nuevo (después de `isMessageChange`): si `type` es `reaction`, va a `applyReaction` (servicio nuevo, `services/reaction.service.js`) y nada más. Una mal formada se descarta con un aviso en el log (sin contenido).

`applyReaction({ line, reaction, side: 'them', identity })`:

1. **Busca el original** por `waMessageId: targetWaMessageId`, con los mismos controles que `applyMessageChange`: su conversación es de **la cuenta y la línea** del webhook (`conversationLineFilter`) y **del contacto del webhook** (`findContactByIdentity`, sin crearlo). La dirección del original no se exige (§ 3). Se reutilizan las funciones de `message.change.service.js` que hacen esto; si hace falta, se sacan a un sitio común en lugar de copiarlas.
2. **Lo aplica solo hacia delante**, con una escritura condicionada (sin leer y escribir): `reactions.them` pasa a `{ emoji, at, waMessageId }` si no había, o si la guardada es más vieja (`at` menor) o del mismo segundo, **y** su `waMessageId` no está en `reactions.seen` (los ids de las últimas 20 reacciones aplicadas al mensaje, de los dos lados, que la misma escritura amplía con `$push`/`$slice`). Así un reintento de Meta nunca se reaplica, aunque después haya llegado otra del mismo segundo (revisión de Codex del plan, 3). Dos reacciones distintas del mismo segundo quedan en el orden de llegada: Meta da la hora en segundos y no hay otro desempate. **Quitarla** guarda `{ emoji: null, at, waMessageId }`: así una reacción vieja que llega tarde no resucita. `changeVersion` sube en 1.
3. **La bandeja**, solo si puso un emoji (quitarla no toca la bandeja): `lastMessage` = `Reaccionó 👍 a: «resumen»` y `lastMessageAt` = la hora de la reacción, con la condición `lastMessageAt <= at` (como los ecos: si llegó algo más nuevo, no se toca). La conversación sube aunque el original sea viejo (§ 10). El resumen es el texto del original recortado (unos 40 caracteres) o su etiqueta («Foto»), con la función de recortar que ya use la bandeja si la hay.
4. **Lo que NO hace:** crear un `Message`, sumar `unreadCount`, mover `lastInboundAt` (es la opción conservadora: si Meta abre la ventana con una reacción, Wasmish no lo aprovecha, pero nunca deja enviar fuera de ella), mandar push, crear trabajo del bot ni pausarlo.
5. **SSE:** `message_updated` con las reacciones (§ 6) y, si cambió la bandeja, `conversation_updated` con `{ id, lastMessage }` (con `lastMessage`, la UI ya vuelve a pedir la bandeja, que trae el orden nuevo).

**Si no encuentra el original** (anterior a la conexión de la línea, uno que llegó como «no compatible», de otra conversación…): se guarda como hoy, como mensaje suelto `type: 'reaction'` con «Reaccionó con 👍» (o «Quitó su reacción»), **pero** sin sumar `unreadCount`, sin push, sin mover `lastInboundAt` y sin bot (ya hoy una reacción no deja trabajo). Sí actualiza la bandeja, como cualquier mensaje. Para que tampoco abra la ventana por la otra vía, `lastInboundOf` (`chat.controller.js`, que busca el último entrante cuando falta `lastInboundAt`) y `scripts/backfill-last-inbound.js` excluyen `type: 'reaction'` (revisión de Codex del plan, 1). El `waMessageId` de la reacción garantiza que un reintento no la duplique. Quitar una reacción a un mensaje que no tenemos no se guarda (un «Quitó su reacción» suelto no dice nada): solo un aviso en el log.

### Una cita o un reenvío del contacto

En `procesarEntrante`, el camino de siempre más dos campos: `describeMessageContext` da `replyToWaMessageId` y `forwarded`. Si hay cita, se busca el citado **en la misma conversación** (`{ waMessageId, conversationId }`): si está, `replyTo = { waMessageId, messageId }`; si no, `replyTo = { waMessageId, messageId: null }` (la UI dice «Mensaje no disponible»). Nunca se enlaza un mensaje de otra conversación. Lo demás (no leído, push, bot, ventana) no cambia.

`notifyInbound` no cambia: el aviso push de una respuesta es el de un mensaje normal.

### Los ecos de la app (coexistencia)

- **Cita en un eco:** `procesarEco` guarda `replyTo` y `forwarded` igual que un entrante, si el eco trae `context`.
- **Reacción en un eco:** si llega un eco `type: 'reaction'`, va a `applyReaction` con `side: 'me'`, el destinatario como identidad (`describeEchoRecipient`) y `origin: 'businessApp'`, sin `sentBy`. La bandeja dice `Reaccionaste 👍 a: «resumen»`. No pausa al bot: reaccionar no es responder. Sin original, el eco se descarta con un aviso (no es un mensaje del contacto que haya que conservar).
- Hoy `describeEcho` guarda una reacción del negocio como un saliente «Reaccionó con 👍». Con esto deja de hacerlo.

### El acuse de una reacción enviada

`procesarEstado` busca el `Message` por `waMessageId`; si no lo encuentra, busca uno con `reactions.me.waMessageId` igual, con el mismo control de cuenta. Con `failed`, marca `reactions.me.status`, `reactions.me.errorCode` y `reactions.me.errorDetail` (rutas con punto: nunca los campos del mensaje, que son los del original; revisión de Codex del plan, 2), solo si `reactions.me.waMessageId` sigue siendo ese (una reacción más nueva ya lo reemplazó: se ignora), sube `changeVersion` y emite `message_updated`. `sent` no cambia nada (ya se guardó como `sent` al enviar). La búsqueda lleva también `{ 'reactions.me.waMessageId': { $type: 'string' } }`, el predicado del índice parcial (sin él, Mongo no lo usa: el mismo caso de `waMessageId_busqueda`).

**Limitación aceptada:** un `failed` que llegue **antes** de que `sendReaction` guarde el `waMessageId` (los milisegundos entre la respuesta de Meta y la escritura) no encuentra la reacción y se pierde: queda como `sent`. Es el mismo límite que ya tienen los mensajes (`docs/estado.md`, cabos sueltos: «un acuse de Meta que llega antes de que se guarde el saliente se descarta»), y el 131009 de una reacción llega en la práctica segundos después.

## 5. Lo que sale de Wasmish

### Responder citando

- `POST /chats/:id/messages` acepta `replyToMessageId` (opcional, el id de Wasmish). `POST /chats/:id/media` lo recibe en la cabecera `X-Reply-To` (el id, sin codificar). Solo con conversación (`:id`): una conversación nueva no tiene qué citar, y el esquema lo rechaza sin `:id`.
- El citado se busca con `{ _id, conversationId: conversation._id }`, **después** de comprobar la conversación con `findOwnConversation` (cuenta y alcance). Si no está en esa conversación: **404**. Si no tiene `waMessageId` (un envío fallido, uno anterior a guardarlo), está borrado o es una reacción suelta: **400** con `code: 'reply_unavailable'`. La regla vive en una función pura (`canReplyTo(message)`, en `utils/`, con test) que también usa `serializeMessage` (`canReply`).
- `processMessageSending` recibe `replyTo = { waMessageId, messageId }` opcional y lo pasa a `sendToMeta`, que lo pone como `context: { message_id }` en `sendTextMessage` y `sendMediaMessage` (un parámetro opcional `context` en los dos, en `libs/whatsapp.js`). Se guarda en el `Message` saliente igual que en un entrante, también si Meta lo rechaza (el fallido se ve con su cita). Es el mismo camino de envío, no uno nuevo.
- Lo demás no cambia: la ventana de 24 h, `markHumanReply`, `markConversationRead`, `temporalId`.

### Reaccionar

`PUT /chats/:id/messages/:messageId/reaction` con `{ emoji }` (Zod: un texto de hasta 16 caracteres que sea **un solo emoji**, con `\p{Extended_Pictographic}`; `""` quita la reacción). En `chat.controller.js`, sin permiso nuevo: puede quien puede enviar en esa conversación.

1. **La conversación** con `findOwnConversation` (404 si no es suya o no está a su alcance) y **el mensaje** con `{ _id: messageId, conversationId }` (404 si no).
2. **Se puede reaccionar** si es `inbound`, tiene `waMessageId`, no está borrado, no es una reacción suelta y tiene menos de 30 días. Si no: **400** con `code: 'reaction_unavailable'`. La regla vive en una función pura (`canReactTo(message, now)`, en `utils/`, con test) que también usa `serializeMessage` para decirle a la UI si se puede (`canReact`), así las dos no se desfasan.
3. **La línea** con `findConversationLine` (409 si se desconectó).
4. **A Meta** con `sendReactionMessage({ token, phoneNumberId, recipient, targetWaMessageId, emoji })`, nueva en `libs/whatsapp.js`. Si Meta lo rechaza en la respuesta, **no se guarda nada** y responde con el error (el código de Meta en `code`, como los demás envíos), para que la UI deshaga la reacción optimista.
5. **Se guarda** `reactions.me = { emoji | null, previousEmoji, at: ahora, waMessageId, status: 'sent', sentBy, sentByName, origin: 'chat' }` (`previousEmoji`: el que había, para enseñar qué sigue viendo el contacto si esto falla después), sube `changeVersion`, se emite `message_updated` y responde el mensaje serializado.

**Una reacción a la vez por mensaje** (revisión de Codex del plan, 4): antes de llamar a Meta se toma el mensaje con `reactions.sendingUntil` (una escritura condicionada a que esté vacío o vencido, de 15 s) y se suelta al terminar, también si falla. Si otra persona (u otro clic) ya está enviando una reacción a ese mensaje: **409** con `code: 'reaction_in_progress'`, sin llamar a Meta. Así lo guardado es siempre lo último que aceptó Meta: dos respuestas que llegan en otro orden no pueden dejar en Wasmish una reacción distinta de la que ve el contacto.
6. **La bandeja**, solo si puso un emoji: `Reaccionaste 👍 a: «resumen»`, con la hora de ahora (la misma condición de § 4).
7. **Marca la conversación como leída** (`markConversationRead`), como responder. **No** llama a `markHumanReply`: reaccionar no pausa al bot.

**Sin bloqueo por la ventana de 24 h:** Meta no dice que una reacción la necesite. Si la necesita, Meta la rechazará (en la respuesta o por el webhook) y la UI lo enseñará como cualquier fallo. Se comprueba antes de cerrar (§ 8); si hace falta la ventana, se añade el 409 con `freeTextBlockReason`.

## 6. Datos

`Message`, campos nuevos (todos sin default: no se guardan vacíos en cada mensaje; sin migración):

```js
replyTo: { waMessageId: String, messageId: ObjectId | null }   // a qué responde
forwarded: 'once' | 'many'                                      // reenviado (entrantes y ecos)
reactions: {
    them: { emoji: String | null, at: Date, waMessageId: String },
    me:   { emoji: String | null, at: Date, waMessageId: String,
            status: 'sent' | 'failed', errorCode, errorDetail,
            sentBy: ObjectId | null, sentByName: String | null,
            origin: 'chat' | 'businessApp', previousEmoji: String | null },
    seen: [String],          // ids de las últimas 20 reacciones aplicadas (§ 4)
    sendingUntil: Date,      // una reacción nuestra en curso (§ 5)
}
```

- `changeVersion` (ya existe) sube también con cada reacción aplicada y con el fallo de una reacción enviada.
- **Índice nuevo:** `reaction_me_waMessageId` = `{ 'reactions.me.waMessageId': 1 }` **parcial** con `$type: 'string'`, para el acuse de una reacción (§ 4); la consulta repite el predicado para que Mongo lo use. Va en `Backend/AGENTS.md § Índices`.

**Lo que ve la UI** (`serializeMessage`, la lista y el SSE):

- `replyTo`: `null`, o `{ id, sender, type, text, hasMedia, deleted }` del citado (`text` recortado a 200 caracteres), o `{ id: null }` si Wasmish no lo tiene. Se lee **al servir**: `listMessages` busca de una vez los citados de la página (con `conversationId` en el filtro), y un mensaje nuevo lo busca al emitirlo. Una edición o un borrado posterior del citado se ve al recargar; la UI prefiere el original si lo tiene cargado.
- `forwarded`: `'once' | 'many' | null`.
- `reactions`: `{ them: { emoji, at } | null, me: { emoji, previousEmoji, at, status, errorCode, errorDetail, sentBy, origin } | null }`. Una reacción quitada (`emoji: null`) sale como `null`, **salvo** la nuestra con `status: 'failed'`: sale entera, para que la UI diga que no se pudo quitar o cambiar y qué sigue viendo el contacto (`previousEmoji`; revisión de Codex del plan, 6).
- `canReact` y `canReply`: `boolean` (§ 5). La UI enseña las acciones solo si son `true`.
- **`message_updated`** lleva además `reactions`, `canReact` y `canReply` (un borrado quita «Responder» en vivo; revisión de Codex del plan, 8). Los campos de hoy no cambian.
- **Los demás productores de `message_created`** dan los campos nuevos: el entrante pasa a `serializeMessage`; `processTemplateSending`, que arma el suyo a mano, añade `replyTo: null`, `forwarded: null`, `reactions: { them: null, me: null }`, `canReact: false` y `canReply` **solo en el SSE**: la respuesta HTTP de `/v1` no cambia (revisión de Codex del plan, 9).
- **La respuesta HTTP de un envío** es el mismo objeto que su `message_created`, con la cita resuelta (revisión de Codex del plan, 7).

## 7. Aislamiento y seguridad

- **Citar** un mensaje de otra conversación, de otra cuenta o de una línea fuera del alcance: 404, con su caso en `tests/isolation/`. El `messageId` del citado nunca se acepta sin `conversationId`.
- **Reaccionar** a un mensaje de otra conversación, de otra cuenta o de una línea fuera del alcance: 404, con su caso. Un `:id` válido con un `:messageId` de otra conversación de la misma cuenta: 404.
- **Lo que entra:** una reacción o una cita solo enlaza mensajes de la misma conversación de la misma cuenta y línea; un `message_id` ajeno se trata como «no encontrado».
- Los logs, sin contenido: ni el emoji ni el texto citado (`waMessageId`, tipo y motivo bastan).

## 8. Pruebas

- **Unitarias:** `describeReaction` (con emoji, sin emoji, sin `message_id`, sin `id`), `describeMessageContext` (cita, reenviado, muy reenviado, sin `context`, `context` de una edición, que no se lee), `canReactTo` (entrante, saliente, sin `waMessageId`, borrado, 29 y 31 días), `canReplyTo`, la validación del emoji y el resumen de la bandeja.
- **De aislamiento y de servicio** (Mongo en memoria): reacción que llega dos veces, reacciones desordenadas (una vieja después de una nueva), quitar y volver a poner, reacción sin original (mensaje suelto sin no leído, que tampoco abre la ventana en una conversación sin `lastInboundAt`), A → B → reintento de A del mismo segundo, acuse `failed` de una reacción ya reemplazada (sin tocar el estado del original), quitar una reacción que después falla, dos reacciones a la vez (409), cita al mismo mensaje en otra conversación, y los 404 de § 7.
- **`webhook:simulate`:** `reaction --original <wamid> --emoji 👍` (sin `--emoji`, la quita), `--reply-to <wamid>` y `--forwarded [many]` en `text`, y `--eco` en los dos.
- **Navegador:** Chromium contra el backend local, en la computadora y en el teléfono emulado: reaccionar, quitar, responder con texto y con archivo, tocar una cita vieja (más de 20 mensajes atrás), en vivo con dos pestañas.
- **Con Meta de verdad**, antes de dar la funcionalidad por cerrada: una línea con coexistencia y otro celular. Reaccionar desde el celular del contacto y desde Wasmish; quitar la reacción desde Wasmish (`emoji: ""`); reaccionar fuera de la ventana de 24 h; responder citando en los dos sentidos; y desde la app del negocio, responder citando y reaccionar (si llegan los ecos). Lo que salga distinto de este spec se corrige en el spec y en `webhook-adjuntos.md`.

## 9. Orden de trabajo

1. **Spec y plan** (un PR de documentación; Codex revisa el plan).
2. **Backend de lo que entra:** modelo e índice, funciones puras, `applyReaction`, citas y reenvíos en entrantes y ecos, el acuse de una reacción, `serializeMessage` y `message_updated`, el simulador, tests y documentación (`webhook-adjuntos.md`, `chat.md`, `pruebas-y-scripts.md`, `Backend/AGENTS.md`).
3. **Backend de lo que sale:** `replyToMessageId` y `X-Reply-To`, `PUT …/reaction`, `sendReactionMessage`, `canReactTo`, tests de aislamiento y documentación (`whatsapp-envio.md`, `api.md`).
4. **UI**, siguiendo el diseño de Claude Design (el brief sale con este spec, para que el diseño avance en paralelo). Incluye el selector de emojis cargado con `lazy` (la librería se elige en el plan) y saltar a la cita (§ 10).
5. **Versión**, cuando esté todo, y la prueba con Meta de § 8 tras desplegar.

Cada PR de código lleva su revisión de Codex. Si el 2 o el 3 pasan de unas 500 líneas, se parten.

## 10. Decisiones (2026-10-20)

- **Empezar por citas y reacciones juntas**, con «Reenviado»: comparten el enlace entre mensajes, el menú de la burbuja y el camino de los ecos. Las respuestas rápidas (textos guardados con «/») van después.
- **Una reacción del contacto avisa solo en la bandeja:** el emoji sobre el mensaje y la bandeja dice «Reaccionó 👍 a: «…»» y sube la conversación, aunque el original sea viejo. Sin no leído ni push. (Descartado: con push; como un mensaje; en silencio.)
- **Emojis para reaccionar:** 6 rápidos (👍 ❤️ 😂 😮 😢 🙏) y un «+» con el selector completo, cargado solo al abrirlo. El mismo selector llega después al composer. (Descartado: solo los 6; el composer en esta misma funcionalidad.)
- **Tocar una cita** lleva al original y lo resalta; si no está cargado, se piden páginas hasta unos 200 mensajes y, si no aparece, «Este mensaje es muy antiguo». (Descartado: solo si está cargado; no hacer nada.)
- **Una reacción a un mensaje que Wasmish no tiene** queda como mensaje suelto, como hoy, pero sin no leído ni push. (Descartado: descartarla; dejarla exactamente como hoy.)
- **Las reacciones viven en el mensaje original** (`reactions.them` y `reactions.me`), con el patrón de eliminados y editados. (Descartado: cada reacción como un `Message` oculto, que obliga a excluirlas de cada consulta de mensajes.)
- Lo decidió el agente, para revisar: las reacciones no mueven la ventana de 24 h; reaccionar marca leído pero no pausa al bot; Wasmish no bloquea reacciones fuera de la ventana hasta comprobarlo con Meta; no hay cita en una conversación nueva; quitar una reacción no toca la bandeja; quitar una reacción a un mensaje que no tenemos no se guarda.
