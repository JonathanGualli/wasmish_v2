# Citas y reacciones — plan de implementación

> En Wasmish los planes se ejecutan **nativos**: rama, PR y revisión cruzada (ver «Planes» en `AGENTS.md`). Los pasos usan casillas (`- [ ]`).

**Objetivo:** responder citando y reaccionar con emoji en el chat, en los dos sentidos y en los ecos de la coexistencia, y marcar los entrantes reenviados.

**Arquitectura:** las formas de Meta se leen en `utils/inbound.message.js` (`describeReaction`, `describeMessageContext`); las reglas de qué se puede citar o reaccionar y cómo se serializa, en un `utils/message.actions.js` puro. Una reacción **no crea mensaje**: `services/reaction.service.js` la aplica sobre el original (`reactions.them` / `reactions.me`) con una escritura condicionada que solo avanza, como los eliminados y editados, y avisa con `message_updated`. Una cita se guarda en el mensaje (`replyTo`) y el resumen del citado se lee **al servir** (`services/message.reply.service.js`). Enviar reutiliza `processMessageSending` (un `context` más) y una ruta nueva `PUT …/reaction`.

**Stack:** Express 5 + Mongoose; `node:test` y los tests de aislamiento (Mongo en memoria, Meta falso con `onMeta`). React 19 + React Query + Tailwind v4; un selector de emojis propio con `emojibase-data` (en español), cargado con `lazy` (al implementarlo se cambió `emoji-picker-react` por este: sigue la marca y pesa menos; ver el PR #117).

**Spec:** [docs/superpowers/specs/2026-10-20-citas-reacciones-design.md](../specs/2026-10-20-citas-reacciones-design.md). Brief de UI: [2026-10-20-citas-reacciones-brief-ui.md](../specs/2026-10-20-citas-reacciones-brief-ui.md) (lo diseña Claude Design; el PR 4 sigue su diseño).

## Restricciones globales

- Una reacción (del contacto o de un eco) **nunca** crea un `Message` si encuentra su original, ni suma `unreadCount`, mueve `lastInboundAt`, manda push, crea trabajo del bot ni llama a `markHumanReply`.
- El original de una reacción se toca solo si es **de la cuenta y la línea** del webhook (`conversationLineFilter`) y de **la conversación del contacto del webhook** (`findContactByIdentity`, sin crearlo). La dirección del original **no** se exige.
- Una cita o una reacción **solo enlaza mensajes de la misma conversación**: el citado se busca con `{ waMessageId | _id, conversationId }`, nunca solo por id.
- Una reacción solo avanza: aplica si no había o si la guardada tiene `at` menor o igual, **y** su `waMessageId` no está en `reactions.seen` (los últimos **20** ids aplicados, `$push` con `$slice: -20` en la misma escritura). Quitarla guarda `{ emoji: null, at, waMessageId }`. Cada reacción aplicada (y el fallo de una enviada) sube `changeVersion` en 1.
- Una reacción suelta (`type: 'reaction'`) nunca cuenta como entrante para la ventana: ni `lastInboundAt`, ni `lastInboundOf`, ni `backfill-last-inbound.js`.
- Una reacción nuestra a la vez por mensaje: `reactions.sendingUntil` (15 s); otra en curso → 409 `reaction_in_progress` sin llamar a Meta.
- Toda escritura de una reacción usa rutas `reactions.<lado>.<campo>`: nunca `status`, `errorCode` ni `errorDetail` del mensaje.
- Sin original: una reacción **con** emoji del contacto se guarda como hoy (mensaje suelto «Reaccionó con 👍») pero sin no leído, sin `lastInboundAt` y sin push; **quitarla** o una reacción de eco se descarta con un aviso.
- La bandeja: `Reaccionó 👍 a: «resumen»` (contacto) y `Reaccionaste 👍 a: «resumen»` (negocio), resumen de **40** caracteres con «…», con `lastMessageAt` = la hora de la reacción y la condición `lastMessageAt <= at`. Quitar una reacción no toca la bandeja.
- Reaccionar desde Wasmish: solo a `inbound`, con `waMessageId`, sin `deletedAt`, que no sea `type: 'reaction'` y de menos de **30 días**. Responder: con `waMessageId`, sin `deletedAt` y que no sea `type: 'reaction'`.
- El resumen del citado para la UI recorta el texto a **200** caracteres.
- Emojis rápidos: 👍 ❤️ 😂 😮 😢 🙏. Quitar una reacción enviada manda `emoji: ""` a Meta.
- Códigos de error: `reply_unavailable` (400), `reaction_unavailable` (400), `reaction_in_progress` (409). El citado o el mensaje de otra conversación: 404.
- Los logs, sin emoji ni texto: `waMessageId`, tipo y motivo.
- Comentarios, commits, PRs y textos en español; identificadores nuevos en inglés.

## Lo que más puede fallar sin que un test lo vea

1. **Un mensaje guardado antes del campo `reactions`:** la escritura condicionada tiene que encontrarlo (`'reactions.them': null` cubre el campo ausente) → test en la tarea 2 («reacciona a un mensaje sin el campo»).
2. **El contacto reacciona a su propio mensaje** (WhatsApp lo deja, aunque la doc de Meta hable de mensajes del negocio): se aplica igual → test en la tarea 2.
3. **Un emoji compuesto** (👍🏽, ❤️ con selector de variante, 👨‍👩‍👧, 🇪🇨, 1️⃣) se acepta; dos emojis o texto, no → test de `isSingleEmoji` en la tarea 1.
4. **La reacción a un mensaje viejo cuando la bandeja ya tiene algo más nuevo:** la vista previa no retrocede → test en la tarea 2.
5. **El acuse `failed` de una reacción que ya se reemplazó o se quitó:** no marca la nueva como fallida, y nunca el estado del original → test en la tarea 3.

**Limitación aceptada** (spec § 4): un `failed` que llega antes de que se guarde el `waMessageId` de la reacción se pierde, como ya pasa con los mensajes.

---

## PR 1 · Spec y plan (rama `citas-reacciones`)

Solo documentación: el spec, el brief, este plan y «En curso» de `docs/estado.md`. Revisa Codex el plan; Jonathan lo une antes de empezar el código.

---

## PR 2 · Backend: lo que entra (rama `citas-reacciones-backend`, desde `master` con el plan unido)

### Tarea 1: Leer y decidir (funciones puras)

**Archivos:**
- Modificar: `Backend/src/utils/inbound.message.js`
- Crear: `Backend/src/utils/message.actions.js`
- Test: `Backend/tests/inbound.message.test.js`, `Backend/tests/message.actions.test.js` (nuevo)

**Interfaces:**
- Produce (`inbound.message.js`): `describeReaction(messageData)` → `{ waMessageId, targetWaMessageId, emoji: string | null, timestamp: Date } | null`. `null` si `type !== 'reaction'`, sin `id` o sin `reaction.message_id`. `emoji` limpio (`conTexto`) o `null` si falta o está vacío. `timestamp` como en los entrantes (segundos de Meta, o ahora).
- Produce (`inbound.message.js`): `describeMessageContext(messageData)` → `{ replyToWaMessageId: string | null, forwarded: 'once' | 'many' | null }`. `frequently_forwarded` gana a `forwarded`.
- Produce (`message.actions.js`): `REACTION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000`; `QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']` (solo documentación para la UI; el backend acepta cualquier emoji).
- Produce: `isSingleEmoji(value: string)` → `boolean`: un solo grafema (`Intl.Segmenter`), de hasta 16 unidades, que contiene `\p{Extended_Pictographic}`, `\p{Regional_Indicator}` o `⃣`.
- Produce: `canReplyTo(msg)` y `canReactTo(msg, now = new Date())` → `boolean`, con las reglas de «Restricciones».
- Produce: `previewSnippet(msg, max = 40)` → el texto (o el pie, o la etiqueta que ya guarda `text`) en una línea (`\s+` → espacio) y recortado con «…».
- Produce: `reactionPreview({ side: 'them' | 'me', emoji, original })` → `Reaccionó ${emoji} a: «${previewSnippet(original)}»` o `Reaccionaste …`.
- Produce: `serializeReactions(msg)` → `{ them: { emoji, at } | null, me: { emoji, previousEmoji, at, status, errorCode, errorDetail, sentBy: { id, name } | null, origin } | null }` (fechas en ISO; un lado ausente o con `emoji: null` → `null`, salvo `me` con `status: 'failed'`, que sale entero).
- Produce: `serializeQuoted(replyTo, original)` → `null` sin `replyTo`; `{ id: null }` sin `original`; si no, `{ id, sender, type, text (200), hasMedia, deleted }`.

- [ ] **Paso 1: Tests que fallan.**
  - `describeReaction`: la forma de la doc de Meta (`{ from, id, timestamp: '1750090702', type: 'reaction', reaction: { message_id: 'wamid.X', emoji: '👍' } }`) → `{ waMessageId: id, targetWaMessageId: 'wamid.X', emoji: '👍', timestamp: new Date(1750090702000) }`; sin `emoji` → `emoji: null`; `emoji: ''` → `null`; sin `reaction.message_id` o sin `id` → `null`; `type: 'text'` → `null`.
  - `describeMessageContext`: `context: { from, id: 'wamid.Q' }` → `{ replyToWaMessageId: 'wamid.Q', forwarded: null }`; `{ forwarded: true }` → `'once'`; `{ forwarded: true, frequently_forwarded: true }` → `'many'`; sin `context` → los dos `null`.
  - `isSingleEmoji`: `true` con 👍, ❤️, 👍🏽, 👨‍👩‍👧, 🇪🇨, 1️⃣; `false` con `''`, `'a'`, `'1'`, `'👍👍'`, `'hola 👍'`.
  - `canReactTo`: entrante de hace 29 días → `true`; de hace 31 → `false`; saliente, sin `waMessageId`, con `deletedAt` o `type: 'reaction'` → `false`. `canReplyTo`: saliente con `waMessageId` → `true`; sin `waMessageId`, borrado o reacción → `false`.
  - `reactionPreview({ side: 'them', emoji: '👍', original: { text: 'Te paso la cotización de los volantes de mañana' } })` → `'Reaccionó 👍 a: «Te paso la cotización de los volantes de…»'` (40 + «…»); `side: 'me'` → empieza por `'Reaccionaste 👍 a: «'`; un texto con saltos de línea queda en una.
  - `serializeReactions` de un mensaje sin el campo → `{ them: null, me: null }`; con `them.emoji: null` → `them: null`; `me` con `emoji: null`, `previousEmoji: '👍'` y `status: 'failed'` → sale entero. `serializeQuoted(null, x)` → `null`; `(replyTo, null)` → `{ id: null }`; un citado de 300 caracteres → `text` de 200.
- [ ] **Paso 2:** `cd Backend && node --test tests/inbound.message.test.js tests/message.actions.test.js` → FALLA.
- [ ] **Paso 3:** implementar. `describirReaccion` no cambia (lo usa el mensaje suelto).
- [ ] **Paso 4:** el mismo comando → PASA; `npm test` en verde.
- [ ] **Paso 5:** commit «Citas y reacciones: leer y decidir (funciones puras)».

### Tarea 2: Aplicar una reacción (modelo y servicio)

**Archivos:**
- Modificar: `Backend/src/models/message.model.js` (campos e índice), `Backend/src/services/message.change.service.js` (exportar la búsqueda del original)
- Crear: `Backend/src/services/reaction.service.js`
- Modificar: `Backend/src/utils/message.change.js` (`serializeMessageUpdate`)
- Test: `Backend/tests/isolation/reactions.test.js` (nuevo, con el patrón de `message-change.test.js`)

**Interfaces:**
- Consume: `describeReaction`, `reactionPreview`, `serializeReactions`, `canReactTo` (tarea 1).
- Produce (modelo): `replyTo: { waMessageId: String, messageId: ObjectId | null }` (sin `_id`, `default: undefined`), `forwarded: { type: String, enum: ['once', 'many'], default: undefined }`, `reactions: { them: {...}, me: {...}, seen: [String], sendingUntil: Date }` con la forma del spec § 6 (`default: undefined`). Índice `reaction_me_waMessageId` = `{ 'reactions.me.waMessageId': 1 }` parcial `{ 'reactions.me.waMessageId': { $type: 'string' } }`.
- Produce (`message.change.service.js`): `findWebhookTarget({ line, waMessageId, identity, direction = null })` → `{ status: 'found', message, conversation } | { status: 'not_found' } | { status: 'rejected', reason }`. Es `findOriginal` de hoy con `direction` opcional (`null` = cualquiera); `applyMessageChange` la usa con su dirección.
- Produce (`message.change.js`): `serializeMessageUpdate(msg)` → `{ id, conversationId, text, caption, ...serializeMessageChange(msg), reactions: serializeReactions(msg), canReact: canReactTo(msg), canReply: canReplyTo(msg) }`. `applyMessageChange` emite esto (mismos campos de hoy, más tres).
- Produce (`reaction.service.js`): `applyReaction({ line, reaction, side: 'them' | 'me', identity, origin = null })` → `Promise<'applied' | 'unchanged' | 'not_found' | 'rejected'>`. `side: 'me'` guarda `{ emoji, at, waMessageId, status: 'sent', sentBy: null, sentByName: null, origin }`.
- Produce: `syncReactionPreview({ accountId, conversation, messageId, side })` → escribe la bandeja desde la reacción **vigente** de ese lado (no la que llamó) con `{ _id, $or: [{ lastMessageAt: null }, { lastMessageAt: { $lte: at } }] }`, relee y, si otra reacción se cruzó, reescribe (3 intentos, revisión de Codex del PR #115); si escribió, emite `conversation_updated` con `{ id, lastMessage }` leído de la BD. Una reacción quitada no toca la bandeja. La usa también la tarea 6.
- SSE: `message_updated` con `serializeMessageUpdate` del mensaje **releído después de escribir**, `meta = { lineId }`.

- [ ] **Paso 1: Tests que fallan** (llamando a `applyReaction` directo, con `openStream` para el SSE):
  - poner 👍 → `'applied'`, `reactions.them.emoji === '👍'`, `changeVersion` 1, un `message_updated` con `reactions.them.emoji`, la bandeja `Reaccionó 👍 a: «…»`, y `unreadCount`, `lastInboundAt` y el número de `Message` de la conversación sin cambiar;
  - el mismo `waMessageId` otra vez → `'unchanged'`, sin SSE;
  - una más vieja después de una nueva → `'unchanged'`; **A (👍) → B (quitar, mismo segundo) → A otra vez** → la última no hace nada y sigue sin reacción; quitar (más nueva, `emoji: null`) → `them: null` en el SSE y la bandeja sin tocar; una reacción vieja después de quitarla → `'unchanged'`;
  - reacciona a un mensaje **sin el campo** `reactions` (creado con `Message.collection.insertOne`) → `'applied'`;
  - el contacto reacciona a **su propio** mensaje (`inbound`) → `'applied'`;
  - la conversación tiene un mensaje más nuevo que la reacción → la reacción se aplica pero la bandeja no cambia;
  - original de otra cuenta, de la otra línea de la misma cuenta, o de otro contacto → `'not_found'` / `'rejected'` y nada cambia;
  - `side: 'me'` con `origin: 'businessApp'` → `reactions.me` con `origin` y la bandeja `Reaccionaste …`.
- [ ] **Paso 2:** `cd Backend && node --test tests/isolation/reactions.test.js` → FALLA.
- [ ] **Paso 3:** implementar. La escritura: `updateOne({ _id, 'reactions.seen': { $ne: waMessageId }, $or: [{ [`reactions.${side}`]: null }, { [`reactions.${side}.at`]: { $lte: at } }] }, { $set: { [`reactions.${side}`]: … }, $push: { 'reactions.seen': { $each: [waMessageId], $slice: -20 } }, $inc: { changeVersion: 1 } })`; `modifiedCount === 0` → `'unchanged'`. La bandeja, solo con emoji.
- [ ] **Paso 4:** el mismo comando → PASA; `npm run test:isolation` en verde (también `message-change.test.js`, que ahora recibe `reactions` y `canReact` de más).
- [ ] **Paso 5:** commit «Citas y reacciones: aplicar una reacción sobre su mensaje».

### Tarea 3: El webhook (entrantes, ecos y acuses)

**Archivos:**
- Modificar: `Backend/src/controllers/webhook.controller.js`, `Backend/src/utils/business.app.js`, `Backend/src/services/reaction.service.js`
- Crear: `Backend/src/services/message.reply.service.js`
- Test: `Backend/tests/isolation/webhook.test.js`, `Backend/tests/business.app.test.js`

**Interfaces:**
- Consume: `applyReaction`, `describeReaction`, `describeMessageContext`, `serializeMessageUpdate`.
- Produce (`message.reply.service.js`): `findQuotedMessage(conversationId, waMessageId)` → el `Message` lean de esa conversación o `null`; `loadQuotedMessages(msgs, conversationId)` → `Map<string, Message>` (id → citado) con **una** consulta `{ _id: { $in }, conversationId }`.
- Produce (`reaction.service.js`): `applyReactionStatus({ line, statusData })` → `Promise<boolean>` (`true` si era una reacción nuestra): busca `{ $and: [{ 'reactions.me.waMessageId': statusData.id }, { 'reactions.me.waMessageId': { $type: 'string' } }] }` (el predicado del índice parcial) con el control de cuenta de `procesarEstado`; con `failed` hace `updateOne({ _id, 'reactions.me.waMessageId': id, 'reactions.me.status': 'sent' }, { $set: { 'reactions.me.status': 'failed', 'reactions.me.errorCode': …, 'reactions.me.errorDetail': … }, $inc: { changeVersion: 1 } })` y emite `message_updated`.
- Produce (`serializeMessage`, en `chat.controller.js`): acepta `{ campaignNames, quoted }` (`quoted`: `Map` de la consulta de arriba) y añade `replyTo: serializeQuoted(msg.replyTo, quoted?.get(String(msg.replyTo?.messageId)))`, `forwarded: msg.forwarded ?? null`, `reactions: serializeReactions(msg)`, `canReact` y `canReply`.
- `business.app.js`: `describeEcho` devuelve `null` para `type: 'reaction'` (lo trata `procesarEco` antes) y su resultado incluye `context: describeMessageContext(echoData)`.

- [ ] **Paso 1: Tests que fallan** (`webhook.test.js`, por el webhook firmado como los demás):
  - una reacción del contacto a un saliente → el saliente con `reactions.them`, **ningún** `Message` nuevo, sin push (`pushCalls` vacío) y `unreadCount` igual;
  - una reacción a un `wamid` que no existe → un `Message` `type: 'reaction'` «Reaccionó con 👍» **sin** sumar `unreadCount`, sin push y con `lastInboundAt` igual; la misma entrega repetida no lo duplica; quitar una reacción a un `wamid` que no existe → nada;
  - un texto con `context.id` de un mensaje de esa conversación → `replyTo: { waMessageId, messageId }` y el `message_created` con `replyTo.id`; con el `wamid` de un mensaje de **otra** conversación de la cuenta → `messageId: null`;
  - un texto con `context.frequently_forwarded` → `forwarded: 'many'`;
  - un eco `type: 'reaction'` a un entrante → `reactions.me.origin === 'businessApp'`, sin `Message` nuevo y sin `markHumanReply` (el bot sigue activo); un eco de texto con `context.id` → su `replyTo`;
  - un acuse `failed` 131009 con el `id` de `reactions.me` → `reactions.me.status: 'failed'` y su error, con `status`, `errorCode` y `errorDetail` **del mensaje** sin cambiar; el mismo acuse cuando `reactions.me` ya tiene otro `waMessageId` → nada; con `recordQueries`, la búsqueda lleva el predicado `$type`;
  - una conversación **sin `lastInboundAt`** cuya única entrada es una reacción suelta: `POST /chats/:id/messages` y `POST /chats/:id/media` siguen dando 409 `window_closed`;
  - `GET /chats/:id/messages` devuelve `replyTo` con el resumen del citado, que cambia si el citado se borra después (`deleted: true`).
  - En `business.app.test.js`: `describeEcho` de una reacción → `null`; de un texto con `context` → con su `context`.
- [ ] **Paso 2:** `cd Backend && npm run test:isolation` → FALLA en esos.
- [ ] **Paso 3: implementar.**
  - `procesarEntrante`: después de `isMessageChange`, si `messageData.type === 'reaction'` → `procesarReaccion`: `describeReaction` (`null` → aviso y salir); `applyReaction({ side: 'them' })`; si es `'not_found'` o `'rejected'` y hay emoji, sigue el camino de siempre; si no, sale. En el camino de siempre, un `entrante.type === 'reaction'` (solo llega el suelto) no suma `unreadCount`, no mueve `lastInboundAt` y no llama a `notifyInbound`.
  - El camino de siempre lee `describeMessageContext` y, con cita, `findQuotedMessage`, y guarda `replyTo` y `forwarded`. El `message_created` pasa a ser `{ ...serializeMessage(messageCreated, { quoted }), unreadCount, windowExpiresAt }` (los mismos campos de hoy y los nuevos).
  - `procesarEco`: después de `isMessageChange`, si `type === 'reaction'` → `applyReaction({ side: 'me', identity: describeEchoRecipient(echoData), origin: 'businessApp' })`; `'not_found'` / `'rejected'` → aviso y salir. Un eco normal guarda `replyTo` y `forwarded` igual que un entrante.
  - `procesarEstado`: si no encuentra el `Message`, `return applyReactionStatus({ line: inbound, statusData })`.
  - `lastInboundOf` (`chat.controller.js`) y `scripts/backfill-last-inbound.js`: `type: { $ne: 'reaction' }` en la búsqueda del último entrante.
  - `processTemplateSending` (`template.controller.js`): su `message_created` añade `replyTo: null`, `forwarded: null`, `reactions: { them: null, me: null }`, `canReact: false` y `canReply: canReplyTo(msg)`. **La respuesta HTTP no cambia** (`/v1`).
  - `listMessages`: `loadQuotedMessages(msgs, conversation._id)` y lo pasa a `serializeMessage`.
- [ ] **Paso 4:** `npm test` y `npm run test:isolation` → PASAN, también los de plantillas y `/v1` sin cambios en sus respuestas; uno nuevo: el `message_created` de una plantilla enviada trae `canReply: true`.
- [ ] **Paso 5:** commit «Citas y reacciones: el webhook (entrantes, ecos y acuses)».

### Tarea 4: Simulador y documentación

**Archivos:**
- Modificar: `Backend/scripts/simulate-webhook.js`, `docs/arquitectura/webhook-adjuntos.md`, `docs/arquitectura/chat.md`, `docs/arquitectura/pruebas-y-scripts.md`, `Backend/AGENTS.md` (índice nuevo y `utils/message.actions.js` en la lista de tests), `docs/estado.md` («En curso»)

- [ ] **Paso 1:** el simulador: `reaction --original <wamid> [--emoji 👍]` (sin `--emoji`, la quita), y `--reply-to <wamid>` y `--forwarded [many]` para `text`; `--eco` en los dos.
- [ ] **Paso 2:** a mano, con el backend local: `npm run webhook:simulate -- text`, luego `reaction --original <su wamid>` y `text --reply-to <su wamid>`; comprobar en Mongo `reactions.them` y `replyTo`, y que el contador de no leídos no subió con la reacción.
- [ ] **Paso 3:** la documentación: en `webhook-adjuntos.md` una sección «Citas, reenvíos y reacciones (`applyReaction`)» con lo que hace y lo que NO hace; en `chat.md` los campos nuevos de `message_updated` y de la lista; en `pruebas-y-scripts.md` las opciones nuevas.
- [ ] **Paso 4:** commit «Citas y reacciones: simulador y documentación del webhook». PR «Citas y reacciones: backend de lo que entra», revisión de Codex.

---

## PR 3 · Backend: lo que sale (rama `citas-reacciones-envio`, desde `master` con el PR 2 unido)

### Tarea 5: Responder citando

**Archivos:**
- Modificar: `Backend/src/libs/whatsapp.js`, `Backend/src/controllers/chat.controller.js`, `Backend/src/schemas/chat.schema.js`, `Backend/src/services/message.reply.service.js`
- Test: `Backend/tests/isolation/chats.test.js`

**Interfaces:**
- Produce: `sendTextMessage` y `sendMediaMessage` aceptan `context` opcional (`{ message_id }`) y lo mandan solo si viene.
- Produce (`message.reply.service.js`): `findReplyTarget(conversation, messageId)` → `{ status: 'ok', message } | { status: 'not_found' } | { status: 'unavailable' }` (`not_found`: id inválido o de otra conversación; `unavailable`: `!canReplyTo(message)`).
- Produce: `processMessageSending({ …, replyTarget = null })`: con él, manda `context: { message_id: replyTarget.waMessageId }`, guarda `replyTo: { waMessageId, messageId: replyTarget._id }` (también si Meta lo rechaza) y devuelve además `serialized` = `serializeMessage(msg, { quoted: new Map([[String(replyTarget._id), replyTarget]]) })`, que es lo que emite por SSE **y** lo que responden `sendMessageController` y `sendMediaMessageController` (hoy responden `serializeMessage(msg)` sin la cita).
- `sendMessageSchema`: `replyToMessageId: z.string().max(64).optional()`. `sendMessageController` y `sendMediaMessageController` (cabecera `X-Reply-To`): sin `:id` y con cita → 400; `not_found` → 404; `unavailable` → 400 `reply_unavailable`. La comprobación va **después** de `findOwnConversation` y **antes** de la ventana y de `markHumanReply`.

- [ ] **Paso 1: Tests que fallan:** texto citando un mensaje de la conversación → 201, `metaCalls` con `context.message_id` y `replyTo.id` en la respuesta; archivo con `X-Reply-To` → igual; citando un mensaje de otra conversación de la cuenta → 404; de otra cuenta → 404; una conversación de una línea fuera del alcance (agente) → 404; citando un fallido (sin `waMessageId`) → 400 `reply_unavailable`; `POST /chats/messages` (sin `:id`) con `replyToMessageId` → 400; Meta rechaza el envío → el fallido se guarda con su `replyTo`; la respuesta HTTP, el `message_created` y un `GET` posterior dan el mismo `replyTo` (también en el fallido).
- [ ] **Paso 2:** `npm run test:isolation` → FALLA en esos.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** → PASA.
- [ ] **Paso 5:** commit «Citas y reacciones: responder citando».

### Tarea 6: Reaccionar

**Archivos:**
- Modificar: `Backend/src/libs/whatsapp.js`, `Backend/src/services/reaction.service.js`, `Backend/src/controllers/chat.controller.js`, `Backend/src/routes/chat.routes.js`, `Backend/src/schemas/chat.schema.js`
- Test: `Backend/tests/isolation/chats.test.js`

**Interfaces:**
- Produce: `sendReactionMessage({ token, phoneNumberId, recipient, targetWaMessageId, emoji })` → la respuesta de Meta (`type: 'reaction'`, `reaction: { message_id, emoji }`; `emoji: ''` para quitar).
- Produce (`reaction.service.js`): `sendReaction({ line, conversation, message, emoji, sender })` → el mensaje releído. Primero toma el mensaje: `updateOne({ _id, $or: [{ 'reactions.sendingUntil': null }, { 'reactions.sendingUntil': { $lt: ahora } }] }, { $set: { 'reactions.sendingUntil': ahora + 15 s } })`; si no lo toma, lanza un error con `statusCode: 409` y `code: 'reaction_in_progress'`. Llama a Meta (si lanza, suelta el mensaje, **no escribe nada más** y relanza con `waErrorCode`); guarda `reactions.me = { emoji: emoji || null, previousEmoji: el de antes ?? null, at: new Date(), waMessageId, status: 'sent', errorCode: null, errorDetail: null, sentBy, sentByName, origin: 'chat' }` y quita `reactions.sendingUntil` en la misma escritura, con `$inc: { changeVersion: 1 }`; emite `message_updated`; con emoji, `syncReactionPreview({ side: 'me' })`.
- Produce: `reactionSchema = z.object({ emoji: z.string().max(16).refine(v => v === '' || isSingleEmoji(v)) })`; `PUT /chats/:id/messages/:messageId/reaction` → `setReactionController`: `findOwnConversation` (404) → `Message.findOne({ _id, conversationId })` con id válido (404) → `canReactTo` (400 `reaction_unavailable`) → `findConversationLine` (409) → `sendReaction` → `markConversationRead` → 200 `serializeMessage(msg)`. Si Meta lo rechaza: 502 con `[{ message, code: waErrorCode }]`. Sin `markHumanReply`.

- [ ] **Paso 1: Tests que fallan:** poner 👍 → 200, `metaCalls` con `type: 'reaction'` y el `wamid` del original, `reactions.me.sentBy` de la sesión, la bandeja `Reaccionaste 👍 a: «…»`, la conversación leída y el bot **sin** pausar; `{ emoji: '' }` → Meta recibe `emoji: ''`, `reactions.me: null` en la respuesta y la bandeja igual; reaccionar a un saliente o a uno de hace 31 días → 400 `reaction_unavailable` sin llamar a Meta; `{ emoji: 'hola' }` y `{ emoji: '👍👍' }` → 400; mensaje de otra conversación de la cuenta, de otra cuenta o de una línea fuera del alcance → 404; Meta responde error → 502 con su código, `reactions.me` sin cambiar y el mensaje suelto (otra reacción enseguida sí sale); **dos peticiones a la vez** al mismo mensaje (la primera con Meta lento, `onMeta` que espera) → la segunda 409 `reaction_in_progress` sin llamar a Meta, y queda guardada la primera; `{ emoji: '' }` aceptado y después un acuse `failed` → `reactions.me` sale entero con `emoji: null`, `previousEmoji` y `status: 'failed'`.
- [ ] **Paso 2:** → FALLA. **Paso 3:** implementar. **Paso 4:** → PASA.
- [ ] **Paso 5:** documentación: `whatsapp-envio.md` (responder citando y reaccionar, con lo que no se comprobó con Meta: quitar con `""` y la ventana), `api.md` (la ruta nueva y `replyToMessageId` / `X-Reply-To`), `docs/estado.md`. Commit «Citas y reacciones: reaccionar desde Wasmish»; PR «Citas y reacciones: backend de lo que sale», revisión de Codex.

---

## PR 4 · UI (rama `citas-reacciones-ui`, desde `master` con el PR 3 unido y el diseño de Claude Design)

El aspecto sale del diseño (`Design/*.html`) y de la skill de marca, que se consulta antes de tocar un componente. Lo que fija este plan es el comportamiento y los datos.

### Tarea 7: Datos, servicios y hooks

**Archivos:**
- Modificar: `Frontend/src/models/message.mode.ts`, `Frontend/src/context/sse.context.ts`, `Frontend/src/services/api.service.ts`, `Frontend/src/hooks/useConversationMessages.ts`, `Frontend/src/hooks/useConversationSendMessages.ts` (o el hook que hoy pasa el texto y el archivo al servicio)
- Crear: `Frontend/src/hooks/useMessageReaction.ts`, `Frontend/src/hooks/useJumpToMessage.ts`

**Interfaces:**
- `Message` gana `replyTo?: QuotedMessage | null` (`{ id: string; sender: Sender; type: MessageType; text: string; hasMedia: boolean; deleted: boolean } | { id: null }`), `forwarded?: 'once' | 'many' | null`, `reactions?: { them: { emoji: string; at: string } | null; me: OwnReaction | null }` (`OwnReaction` con `previousEmoji` y `status`), `canReact?: boolean`, `canReply?: boolean`. `message_updated` en `sse.context.ts` pasa a incluir `reactions`, `canReact` y `canReply`.
- `sendMessageService(…, { replyToMessageId })` y `sendMediaMessageService` con la cabecera `X-Reply-To`; `setReactionService(conversationId, messageId, emoji)` → `Message`.
- `useMessageReaction(conversationId)` → `{ react(message, emoji) }`: aplica `reactions.me` en la caché al instante (pulsar el emoji que ya está manda `''`) y no deja enviar otra a ese mensaje mientras tanto; si falla deshace y llama al aviso de errores del chat (`whatsappErrors.ts` para el código de Meta; `reaction_in_progress`: «Alguien de tu equipo está reaccionando a este mensaje»).
- `useJumpToMessage(conversationId)` → `{ jumpTo(messageId), searching: boolean, highlightedId: string | null }`: si el mensaje está en la caché, lo hace visible (`[data-message-id]`, `scrollIntoView({ block: 'center' })`) y lo resalta 2 s; si no, `fetchNextPage` hasta encontrarlo o **10 páginas** (200 mensajes) y, si no, el aviso «Este mensaje es muy antiguo».
- El envío optimista lleva `replyTo` armado desde el mensaje citado de la caché, para que la cita se vea antes de que vuelva el servidor.

- [ ] **Paso 1:** implementar; `npm run lint` y `npm run build` en verde.
- [ ] **Paso 2:** commit «Citas y reacciones: datos y hooks de la UI».

### Tarea 8: Los componentes, según el diseño

**Archivos** (los nombres pueden ajustarse al diseño): `Frontend/src/components/Chat/MessageActions.tsx` (el menú: hover en la computadora, pulsación larga en el celular), `ReactionPicker.tsx` (los 6 rápidos y el «+» que carga `EmojiPicker` con `lazy` + `Suspense`), `MessageReactions.tsx`, `QuotedMessage.tsx` (en la burbuja y en la barra del composer), `Composer/ReplyBar.tsx`; y `ChatThread.tsx` (`data-message-id`, la marca «Reenviado» / «Reenviado muchas veces», el resaltado), `Composer/ChatComposer.tsx` (la barra; Escape y cambiar de conversación la descartan; con la ventana cerrada la cita no aplica).

- *(Cambiado al implementarlo: selector propio con `emojibase-data`, ver el PR #117.)* `emoji-picker-react` (5.x) con `emojiStyle="native"` y los textos en español; **solo** dentro del `lazy`. Comprobar en `npm run build` que va en su propio chunk y que el principal no crece por él.
- «Responder» solo con `canReply`; «Reaccionar» solo con `canReact`.

- [ ] **Paso 1:** implementar siguiendo el diseño; `npm run lint` y `npm run build`.
- [ ] **Paso 2: navegador** (Chromium contra el backend local, en la computadora y en el teléfono emulado), con `webhook:simulate`: una reacción entrante aparece en vivo y la quita desaparece; reaccionar, cambiar y quitar; una reacción que el servidor rechaza (por ejemplo, con el backend parado) se deshace con el aviso; responder con texto y con un archivo; un entrante con `--reply-to` muestra la cita; tocar una cita de hace más de 20 mensajes la encuentra; una cita «no disponible»; «Reenviado muchas veces»; dos pestañas a la vez; recargar da lo mismo que en vivo.
- [ ] **Paso 3:** documentación: `chat.md` (la UI de citas y reacciones, `useMessageReaction`, `useJumpToMessage`), `frontend.md` (los hooks nuevos), `docs/estado.md`. Commit; PR «Citas y reacciones: la UI», revisión de Codex.

---

## Después de unir

- La versión (`version-X.Y.Z`), con `docs/estado.md` al día, cuando Jonathan lo pida.
- Tras desplegar, la prueba con Meta de verdad del spec § 8 (quitar con `""`, la ventana, los ecos). Lo que salga distinto se corrige en el spec y en `docs/arquitectura/`.
