# Historial y contactos de la app de WhatsApp Business — plan de implementación

> En Wasmish los planes se ejecutan **nativos**: rama, PR y revisión cruzada (ver «Planes» en `AGENTS.md`). Los pasos usan casillas (`- [ ]`).

**Objetivo:** al conectar un número que sigue en la app de WhatsApp Business, traer sus chats de los últimos 6 meses y su agenda, sin efectos (no leídos, push, bot, ventana) y sin perder nada si el servidor se reinicia.

**Arquitectura:** lo que manda Meta se lee en funciones puras (`utils/history.sync.js`, `utils/agenda.js`). El webhook solo **guarda**: cada hilo en piezas (`HistoryThread`), cada archivo de 14 días (`HistoryMedia`) y cada contacto de la agenda (`AgendaEntry`). Un worker nuevo (`workers/history.worker.js`, con el patrón de `auto.reply.worker.js`) pide la sincronización a Meta y procesa las piezas. Un mensaje nunca se duplica entre caminos gracias a `Message.waMessageKey` y su índice único por conversación. El estado de cada línea vive en `Line.historySync` y la UI lo lee ya resumido (`historySyncView`).

**Stack:** Express 5 + Mongoose; `node:test` y los tests de aislamiento (Mongo en memoria, Meta falso con `onMeta`, webhooks firmados con `postWebhookBody`). React 19 + React Query para el PR de la UI.

**Spec:** [docs/superpowers/specs/2026-10-23-historial-coexistencia-design.md](../specs/2026-10-23-historial-coexistencia-design.md). Brief de UI: [2026-10-23-historial-coexistencia-brief-ui.md](../specs/2026-10-23-historial-coexistencia-brief-ui.md) (lo diseña Claude Design; el PR 6 sigue su diseño).

## Restricciones globales

- Lo traído del historial **nunca** suma `unreadCount`, mueve `lastInboundAt`, manda push (`notifyInbound`), crea trabajo del bot (`buildAutoReplyJob`), llama a `markHumanReply` ni asigna la conversación.
- Todo lo que entra se guarda con la **cuenta de la línea del webhook** (`findInboundLine`, solo líneas activas). El historial, solo si la línea tiene `historySync` y su `connectionAt` es su `connectedAt` actual; si no, un aviso en el log y nada más.
- Plazo: **24 h** desde `historySync.connectionAt` para pedir y reintentar. Reintentar un pedido `uncertain`: tras **30 minutos** sin ningún trozo. Terminar: **10 minutos** sin trozos nuevos.
- Piezas de como mucho **500** mensajes y **4 MB** de JSON. Cuerpo del webhook: hasta **20 MB**, solo en `POST /api/webhook`.
- Una pieza se intenta **3** veces; después queda `failed` y suma `historySync.failedThreads`.
- Etiqueta del placeholder: `Archivo: míralo en tu celular`. `source` de los contactos que nacen del historial: `'businessApp'`. `Message.fromHistory: true` en lo traído.
- Nombre que se enseña: `name` → `agendaName` → `profileName` → `@username` → teléfono. Nada del webhook ni del worker escribe `Contact.name`.
- Teléfonos (agenda e hilos): solo dígitos, de **8 a 15**; si no, se descarta con un aviso.
- Lo mal formado se salta con un aviso (sin contenido) y el lote sigue; un fallo de la BD al guardar responde **500** al final del lote para que Meta reentregue. Ningún mensaje se guarda con `text` vacío.
- Los logs, sin textos ni nombres: `lineId`, fase, `chunkOrder`, cuántos hilos y mensajes, `waMessageId` y motivo.
- A Meta, solo desde `libs/whatsapp.js`. Comentarios, commits, PRs y textos en español; identificadores nuevos en inglés.

## Lo que más puede fallar sin que un test lo vea

1. **Un trozo de historial con mensajes de una conversación que ya tiene mensajes en vivo** (alguien escribió justo al conectar): la vista previa y el orden de la bandeja tienen que quedar con lo más nuevo, y los no leídos, como estaban. → test en la Tarea 6.
2. **El `from` de un mensaje del negocio con otro formato** (con `+` o espacios): la dirección sale de comparar con el teléfono del hilo ya normalizado, no con el número visible de la línea. → test en la Tarea 2.
3. **El límite de 20 MB se cuela en otras rutas**: el resto de la API tiene que seguir en 100 KB. → test en la Tarea 4.
4. **Un reinicio con un pedido a medias**: tiene que quedar `uncertain`, no repetirse solo, y ofrecer reintentar a los 30 minutos. → test en la Tarea 8.
5. **El archivo de 14 días que llega bajo `field: "history"` con forma de entrante**: nunca puede tratarse como un mensaje en vivo (crearía un mensaje nuevo con no leído y push). → test en la Tarea 4.

---

## PR 1 · Spec y plan (rama `historial-plan`)

Este documento y «En curso» de `docs/estado.md`. Revisión de Codex antes de programar.

## PR 2 · Recibir sin pedir nada (rama `historial-recibir`, desde `master` con el plan unido)

Sin el PR 5, Meta no manda nada: es seguro desplegarlo solo.

### Tarea 1: La identidad de un mensaje (`waMessageKey`)

**Archivos:**
- Modificar: `Backend/src/models/message.model.js`
- Test: `Backend/tests/isolation/webhook.test.js`

**Interfaces:**
- Consume: `wamidMessageKey(waMessageId)` de `utils/wamid.js`.
- Produce: `Message.waMessageKey: String | null` (default `null`), escrito por un `pre('validate')` del esquema con `wamidMessageKey(this.waMessageId)` cuando cambia `waMessageId`. Como los cuatro sitios que crean mensajes (`webhook.controller.js` dos veces, `chat.controller.js`, `template.controller.js`) usan `Message.create` con el `waMessageId` ya puesto, ninguno cambia. El worker (Tarea 6) también usa `Message.create`.
- Produce: `Message.fromHistory: Boolean` (default `undefined`: solo lo traído del historial lo lleva, `true`).
- Produce: índice `message_conversation_waMessageKey_unique` `{ conversationId: 1, waMessageKey: 1 }`, único, parcial con `waMessageKey: { $type: 'string' }`; y `message_waMessageKey` `{ waMessageKey: 1 }`, normal, para buscar el mensaje de un archivo de 14 días sin saber su conversación (Tarea 6; el único no sirve, empieza por `conversationId`). Un E11000 por este índice lo tratan como «ya guardado» los mismos `catch` que hoy atrapan `waMessageId_unico` (`if (error.code === 11000) return;`).

- [ ] **Paso 1: Tests que fallan** (en `webhook.test.js`):
  - `un eco con otro wamid de la misma clave que un mensaje ya guardado no crea otro`: crear en la conversación un `Message` con el wamid del teléfono (el formato de `tests/wamid.test.js`), mandar un eco con el wamid del BSUID de la misma clave → sigue habiendo **un** mensaje.
  - `dos mensajes de claves distintas en la misma conversación conviven` y `la misma clave en otra conversación no choca`.
  - `un wamid sin la forma conocida guarda waMessageKey null` (y dos así conviven).
  - `fromHistory se guarda`: crear un `Message` con `fromHistory: true` y leerlo de Mongo (`Message.collection.findOne`).
- [ ] **Paso 2:** `cd Backend && node --test tests/isolation/webhook.test.js` → FALLA.
- [ ] **Paso 3:** el campo, el hook y el índice. Comentario en el modelo con el porqué (el #121 y el historial).
- [ ] **Paso 4:** el mismo comando → PASA; `npm test` y `npm run test:isolation` en verde.
- [ ] **Paso 5:** `Backend/AGENTS.md` (el índice nuevo) y `webhook-adjuntos.md` (la identidad). Commit «Historial: la identidad de un mensaje entre caminos (waMessageKey)».

### Tarea 2: Leer el historial (funciones puras)

**Archivos:**
- Crear: `Backend/src/utils/history.sync.js`
- Test: `Backend/tests/history.sync.test.js`

**Interfaces:**
- Produce: `HISTORY_PLACEHOLDER_TEXT = 'Archivo: míralo en tu celular'`, `PIECE_MAX_MESSAGES = 500`, `PIECE_MAX_BYTES = 4 * 1024 * 1024`, `HISTORY_DECLINED_CODE = 2593109`.
- Produce: `normalizeWaPhone(value)` → solo dígitos de 8 a 15, o `null`.
- Produce: `describeHistoryChunk(item)` (un elemento de `value.history[]`) → `{ declined: true }` si trae `errors` con `2593109`; si no, `{ declined: false, phase, chunkOrder, progress, threads: [{ contactPhone, messages }] }`, con `phase`, `chunkOrder` y `progress` como números (o `null`), y sin los hilos cuyo `id` no se normaliza. `null` si no hay nada que leer.
- Produce: `splitThreadMessages(messages, { maxMessages = PIECE_MAX_MESSAGES, maxBytes = PIECE_MAX_BYTES } = {})` → `messages[][]` (piezas en orden, ninguna vacía; un solo mensaje de más de `maxBytes` va solo en su pieza).
- Produce: `describeHistoryMessage(messageData, contactPhone)` → `null` si no tiene `id` o si es `edit`/`revoke` (`isMessageChange`); si no, `{ waMessageId, direction: 'inbound' | 'outbound', timestamp: Date, status, isPlaceholder, isReaction }`. `direction`: `inbound` si `normalizeWaPhone(from) === contactPhone`. `status` (solo salientes; los entrantes, `'delivered'`): `READ`/`PLAYED` → `read`, `DELIVERED` → `delivered`, `SENT`/`PENDING` → `sent`, `ERROR` → `failed`, otro → `sent`. `timestamp`: los segundos en texto de Meta.
- Produce: `historySyncView(sync, now = new Date())` → `null` sin `sync`; si no, `{ status, progress, failedThreads, canRetry, retryUntil }` con:
  - `status`: `declined` si `sync.declined`; `partial`/`done` si `sync.finishedAt` (según `failedThreads`); `receiving` si `sync.firstChunkAt`; `failed` si `sync.requests.history.state === 'rejected'`; `pending` si está `pending` o `requesting`; `none` si pasaron 24 h desde `connectionAt`; si no, `requested`.
  - `retryable`: los pedidos (`'contacts'`, `'history'`) que se pueden reintentar, **cada uno por su cuenta**, dentro de las 24 h: uno `rejected` siempre; uno `uncertain` si su `claimedAt` es de hace más de 30 minutos y, si es el del historial, sin `firstChunkAt` ni `declined` (si llegaron trozos, Meta lo aceptó). `canRetry` = `retryable.length > 0`. `retryUntil` = `connectionAt` + 24 h (ISO).

- [ ] **Paso 1: Tests que fallan** (con los ejemplos de la referencia de Meta: `from: '15550783881'`, hilo `16505551234`, `timestamp: '1739230970'`):
  - `describeHistoryChunk`: un trozo con dos hilos → los dos con su teléfono; con `errors: [{ code: 2593109 }]` → `{ declined: true }`; un hilo con `id: 'abc'` se descarta; `phase: '1'` → `1`.
  - `splitThreadMessages`: 1200 mensajes → piezas de 500, 500 y 200; 10 mensajes de 1 MB con `maxBytes` de 4 MB → piezas de como mucho 4 MB; `[]` → `[]`.
  - `describeHistoryMessage`: `from` del contacto → `inbound` con `status: 'delivered'`; del negocio con `PLAYED` → `outbound` y `read`; `from: '+1 650-555-1234'` del contacto → `inbound` (Review Focus 2); `type: 'media_placeholder'` → `isPlaceholder: true`; `type: 'reaction'` → `isReaction: true`; `type: 'revoke'` → `null`; sin `id` → `null`.
  - `historySyncView`: un caso por cada `status`; `canRetry` con `rejected` dentro del plazo → `true`, fuera → `false`; con `uncertain` a los 10 minutos → `false` y a los 31 → `true`; el historial `uncertain` con `firstChunkAt` → no se reintenta; **contactos `rejected` y historial recibiendo → `retryable: ['contacts']`**.
- [ ] **Paso 2:** `cd Backend && node --test tests/history.sync.test.js` → FALLA.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** el mismo comando → PASA; `npm test` en verde.
- [ ] **Paso 5:** commit «Historial: leer lo que manda Meta (funciones puras)».

### Tarea 3: Los modelos (`historySync`, `HistoryThread`, `HistoryMedia`)

**Archivos:**
- Modificar: `Backend/src/models/line.model.js`, `Backend/src/models/contact.model.js` (`source` admite `'businessApp'`: lo usa el worker del PR 3), `Frontend/src/models/contact.model.ts` y `Frontend/src/utils/contactDisplay.ts` (`SOURCE_LABEL.businessApp = 'De la app de WhatsApp Business'`), `Backend/tests/isolation/helpers.js` (exportar los modelos nuevos)
- Crear: `Backend/src/models/history.thread.model.js`, `Backend/src/models/history.media.model.js`

**Interfaces:**
- Produce: `Line.historySync` (default `undefined`): `{ connectionAt: Date, requests: { contacts: requestSchema, history: requestSchema }, declined: Boolean, progress: Number, firstChunkAt, lastChunkAt, historyComplete: Boolean, finishedAt, failedThreads: Number }`, con `requestSchema = { state: enum ['pending', 'requesting', 'accepted', 'uncertain', 'rejected'], requestId, claimedAt, error: { code, detail } }`.
- Produce: `HistoryThread`: `{ userId, lineId, connectionAt, contactPhone, phase, chunkOrder, part, messages: [Mixed], status: enum ['pending', 'processing', 'done', 'failed'], attempts, leaseUntil, claimToken, error }`, timestamps. Índices: `history_thread_piece_unique` `{ lineId, connectionAt, phase, chunkOrder, contactPhone, part }` único; `history_thread_queue` `{ status, createdAt }`.
- Produce: `HistoryMedia`: `{ userId, lineId, connectionAt, mediaKey, waMessageId, waMessageKey, messageData: Mixed, applied: Boolean }`, timestamps. `mediaKey` = `waMessageKey ?? 'id:' + waMessageId` (la identidad del spec, con el wamid literal de reserva). Índice `history_media_unique` `{ lineId, connectionAt, mediaKey }` único.

- [ ] **Paso 1:** los tres modelos, con un comentario que remite al spec.
- [ ] **Paso 2:** `npm run test:isolation` en verde (los índices se crean sin chocar).
- [ ] **Paso 3:** `Backend/AGENTS.md` (índices). Commit «Historial: los modelos».

### Tarea 4: El webhook guarda

**Archivos:**
- Modificar: `Backend/src/app.js`, `Backend/src/controllers/webhook.controller.js`
- Crear: `Backend/src/services/history.intake.service.js`
- Modificar: `Backend/tests/isolation/helpers.js` (`postHistory(phoneNumberId, history)` y `postWebhookRaw`)
- Test: `Backend/tests/isolation/history.test.js` (nuevo)

**Interfaces:**
- Consume: `describeHistoryChunk`, `splitThreadMessages` (Tarea 2); los modelos (Tarea 3); `findInboundLine`.
- Produce (`history.intake.service.js`): `storeHistoryChunks(inbound, value)` → `{ stored: number, declined: boolean, ignored: boolean }`. Sin `historySync` de la conexión actual → `ignored`. `declined` → `$set: { 'historySync.declined': true }`. Si no, `insertMany(..., { ordered: false })` de las piezas (un E11000 de una reentrega no es error) y `$max: { 'historySync.progress' }`, `$min: { firstChunkAt }`, `$set: { lastChunkAt, historyComplete: true si progress 100 }`, `$unset: { finishedAt }`.
- Produce: `storeHistoryMedia(inbound, value)` → guarda cada `value.messages[]` con `id` en `HistoryMedia` por `mediaKey` (`upsert`, sin pisar `applied`). Lo aplica la Tarea 6.
- Modifica `handleWebhook`: `change.field === 'history'` va **antes** de procesar `value.messages`: llama a `storeHistoryChunks` y a `storeHistoryMedia` y hace `continue` (los `messages[]` de un `history` nunca pasan por `procesarEntrante`). Un error → `retryBatch = true`. Un cuerpo **sin `entry`** pero con `history` y `metadata.phone_number_id` (la forma del error 2593109 en la referencia) se trata como un solo cambio `history`.
- Modifica `app.js`: `app.use('/api/webhook', express.json({ limit: '20mb', verify }))` antes del parser general, con la **misma** función `verify` (sacarla a una constante para no duplicarla).

- [ ] **Paso 1: Tests que fallan** (`history.test.js`, con una línea sembrada con `historySync: { connectionAt: line.connectedAt, requests: {…accepted} }`):
  - `un trozo guarda una pieza por hilo y no crea mensajes`; `un hilo de 1200 mensajes queda en 3 piezas`; `el mismo trozo dos veces no duplica piezas`.
  - `un hilo de más de 16 MB se guarda en piezas` (mensajes de texto de 4000 caracteres hasta pasar los 16 MB, en un cuerpo de menos de 20 MB).
  - `el error 2593109 marca la línea declined`, también `sin entry`.
  - `una línea sin historySync, o con otro connectionAt, no guarda nada`; `el trozo de un número de otra cuenta no toca la línea de esta`.
  - `progress 100 marca historyComplete`; `un trozo nuevo borra finishedAt`.
  - **Review Focus 5:** `un messages[] bajo field history no crea un mensaje en vivo`: se guarda en `HistoryMedia`, no hay `Message`, ni no leídos, ni push ni trabajo del bot. Con la misma preparación y el mismo control positivo que el test de la Tarea 6 (sin ellos, `pushCalls` vacío no prueba nada).
  - **Review Focus 3:** `un cuerpo de 1 MB a otra ruta de la API sigue dando 413`, y `uno de 5 MB al webhook con mala firma da 401`.
- [ ] **Paso 2:** `cd Backend && node --test tests/isolation/history.test.js` → FALLA.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** el mismo comando → PASA; `npm test` y `npm run test:isolation` en verde.
- [ ] **Paso 5:** `webhook:simulate`: `history` (`--threads <n> --messages <n> --phase <n> --progress <n>`), `history --declined` y `history-media --original <wamid>`, con su ayuda arriba del script. Probarlo contra el backend local.
- [ ] **Paso 6:** `webhook-adjuntos.md` (sección nueva «Historial de la app de WhatsApp Business»), `pruebas-y-scripts.md` (el simulador). Commit «Historial: el webhook guarda los trozos y los archivos».

## PR 3 · Procesar (rama `historial-procesar`, desde `master` con el PR 2 unido)

### Tarea 5: El worker y su ciclo de vida

**Archivos:**
- Crear: `Backend/src/workers/history.worker.js`
- Modificar: `Backend/src/index.js` (arrancar y parar con los otros dos)
- Test: `Backend/tests/isolation/history.test.js`

**Interfaces:**
- Produce: `startHistoryWorker()`, `stopHistoryWorker()`, `wakeHistoryWorker()` (el empujón), con el patrón de `auto.reply.worker.js` (`loop`, `sleep` despertable, `LEASE_MS = 120_000`, `IDLE_MS = 3_000`, `SWEEP_MS = 30_000`, `FINISH_QUIET_MS = 10 * 60 * 1000`).
- Produce: `claimNextHistoryThread(now)` → la pieza `pending` más vieja pasada a `processing` con `leaseUntil`, `claimToken` y `attempts + 1`, o `null`.
- Produce: `recoverHistoryThreads({ startup })` → al arrancar, **todas** las `processing` a `pending`; en cada barrido, las de `leaseUntil` vencido. Una con `attempts >= 3` pasa a `failed` y suma `historySync.failedThreads` de su línea.
- Produce: `finishHistorySyncs(now)` → pone `historySync.finishedAt = now` en las líneas con `historyComplete`, sin `finishedAt`, con `lastChunkAt` de hace más de `FINISH_QUIET_MS` y sin piezas `pending` ni `processing` de su `connectionAt`.
- Produce: `processNextHistoryThread()` → reclama una pieza y llama a `importHistoryPiece` (Tarea 6); si lanza, la devuelve a `pending` (o `failed` al tercer intento) con el error en el log.
- Produce: SSE `history_sync` con `{ lineId }`, con `permission: 'lines.manage'`, como mucho cada 5 s por línea.

- [ ] **Paso 1: Tests que fallan:** `dos procesos no reclaman la misma pieza`; `al arrancar, una pieza en processing vuelve a pending` (aunque su `leaseUntil` no haya vencido); `una pieza que falla tres veces queda failed y suma failedThreads`; `progress 100 antes que otros trozos no termina` (queda una pieza `pending`); `con 10 minutos sin trozos y nada pendiente, finishedAt`; `con una pieza failed, la vista dice partial`.
- [ ] **Paso 2:** → FALLA. **Paso 3:** implementar, con un `importHistoryPiece` vacío que la Tarea 6 llena. **Paso 4:** → PASA, todo en verde.
- [ ] **Paso 5:** commit «Historial: el worker (reclamar, recuperar, terminar)».

### Tarea 6: Importar una pieza

**Archivos:**
- Crear: `Backend/src/services/history.import.service.js`
- Modificar: `Backend/src/controllers/webhook.controller.js` (exportar `descargarAdjunto` y la condición de la vista previa del eco como `advanceConversationPreview(conversationId, { text, timestamp })`, que pasan a usar el eco y el historial)
- Test: `Backend/tests/isolation/history.test.js`

**Interfaces:**
- Consume: `describeHistoryMessage`, `HISTORY_PLACEHOLDER_TEXT` (Tarea 2); `resolveContact`, `findOrCreateConversation` (`contact.controller.js`); `describeInboundMessage`, `describeMessageContext`, `describeReaction` (`utils/inbound.message.js`); `applyReaction({ line, reaction, side, identity, origin })` (`services/reaction.service.js`; `side` = `'them'` si `inbound`, `'me'` con `origin: 'businessApp'` si no); `findQuotedMessage(conversationId, waMessageId)` (`services/message.reply.service.js`); `descargarAdjunto(inbound, entrante)`.
- Produce: `importHistoryPiece(piece)` → `{ created, skipped }`:
  1. La línea (con su token de WABA, como `findInboundLine` pero por `lineId`, también si ya no está activa: lo ya recibido se termina de importar).
  2. `resolveContact(piece.userId, { phone: piece.contactPhone }, { source: 'businessApp' })` y `findOrCreateConversation`.
  3. Por cada mensaje en orden de `timestamp`: placeholder → `type: 'unsupported'` (el tipo que ya usan los «no compatible»), `text: HISTORY_PLACEHOLDER_TEXT`; reacción → `applyReaction` con el lado según `direction`, y si no encuentra el original, nada; si no, `describeInboundMessage` + `describeMessageContext`. Un saliente lleva `origin: 'businessApp'`, `sender: 'me'` y el `status` de `describeHistoryMessage`; un entrante, `sender: 'them'`, `status: 'delivered'`. Los dos, `fromHistory: true`. **Nunca** `bot`, ni tocar la conversación salvo la vista previa.
  4. Duplicado: antes de crear, se busca el que ya está (por `{ conversationId, waMessageKey }` o, en un mensaje viejo sin `waMessageKey`, un `waMessageId` de esa clave en la conversación, sin límite de días); `Message.create` con E11000 también lo busca. Un duplicado → `skipped`, pero **se sigue con el que ya está** (pasos 5 y 6): una pieza que se cortó a medias y se reintenta tiene que terminar lo que quedó pendiente.
  5. Por cada mensaje de la pieza, creado o ya existente: `applyHistoryMedia(line, message)` (abajo).
  6. Al final, `advanceConversationPreview` con el más nuevo **de los mensajes de la pieza que están en Mongo** (creados o ya existentes), no solo con el último creado; si la vista previa cambió, el mismo `conversation_updated` que emite `procesarEco`.
- Produce: `applyHistoryMedia(line, message)` → busca `HistoryMedia` `{ lineId, connectionAt, mediaKey: message.waMessageKey ?? 'id:' + message.waMessageId, applied: false }`; si está, `describeInboundMessage(media.messageData)` da tipo, `caption` y `mediaId`; `descargarAdjunto`; `$set` en el mensaje y `applied: true` (condicionado a `applied: false`, para no aplicarlo dos veces); `message_updated` por SSE. Idempotente.
- Modifica `storeHistoryMedia` (Tarea 4): **después** de guardar, busca el mensaje por `waMessageKey` (índice `message_waMessageKey`) o, sin clave, por `waMessageId`, y se queda con el que esté en una conversación **de esa línea**; si existe, `applyHistoryMedia`. Los dos lados escriben antes de buscar.

- [ ] **Paso 1: Tests que fallan:**
  - `un hilo crea el contacto, la conversación y sus mensajes en los dos sentidos`, con `fromHistory`, `origin: 'businessApp'` en los salientes y el estado de Meta.
  - `nada de lo traído suma no leídos, mueve lastInboundAt, manda push ni crea trabajo del bot`, con la preparación de `webhook.test.js` (respuestas automáticas encendidas y una suscripción push en la cuenta), **un entrante de control** que sí avisa y crea trabajo, y después esperar (`eventually`) antes de comprobar que el historial no sumó push, trabajos ni la pausa del bot (`markHumanReply`).
  - `una conversación nueva queda con la vista previa y la fecha de su último mensaje`; **Review Focus 1:** `en una conversación con un entrante en vivo más nuevo, la vista previa y los no leídos no cambian`.
  - `una pieza importada dos veces no duplica`; `un mensaje que ya estaba con otro wamid de la misma clave no se duplica`, también si es de hace 40 días y no tiene `waMessageKey`.
  - `el placeholder se guarda con su etiqueta y nunca con text vacío`.
  - `el archivo llega antes que el hilo`, `durante` (después de reclamar la pieza y antes de crear el mensaje: con un gancho del test) y `después`: en los tres el mensaje termina con su tipo, `caption` y archivo, y `applied: true`. Los dos órdenes también **con wamids distintos de la misma clave** en el placeholder y en el archivo.
  - `una pieza que se cortó después de crear sus mensajes, al reintentarse, aplica el archivo y la vista previa`: con un gancho que lanza después del último `Message.create`, y otro antes de `advanceConversationPreview`; tras recuperar la pieza, el archivo está aplicado y la conversación tiene la vista previa de su último mensaje.
  - `una reacción del historial se pega a su original; sin original, no crea nada`.
  - `el historial de la línea de una cuenta no crea nada en otra`.
- [ ] **Paso 2:** → FALLA. **Paso 3:** implementar. **Paso 4:** → PASA, todo en verde.
- [ ] **Paso 5:** `webhook-adjuntos.md` (cómo se importa), `chat.md` (`history_sync`). Probar con `webhook:simulate -- history` contra el backend local y mirar la bandeja. Commit «Historial: importar las piezas».

## PR 4 · La agenda (rama `historial-agenda`, desde `master` con el PR 3 unido)

### Tarea 7: `AgendaEntry`, `agendaName` y el nombre que se enseña

**Archivos:**
- Crear: `Backend/src/utils/agenda.js`, `Backend/src/models/agenda.entry.model.js`, `Backend/src/services/agenda.service.js`
- Modificar: `Backend/src/models/contact.model.js` (`agendaName`, `agendaSyncedAt`, `source` con `'businessApp'`), `Backend/src/utils/contact.identity.js` (`contactDisplayName`), `Backend/src/utils/contact.query.js` (`SEARCH_FIELDS` con `agendaName`), `Backend/src/controllers/contact.controller.js` (`resolveContact`, `createContact`, `serializeContact`), `Backend/src/controllers/contact.import.controller.js`, `Backend/src/controllers/webhook.controller.js`, `Frontend/src/models/contact.model.ts` (`agendaName`), `Frontend/src/utils/contactDisplay.ts` (`onlyPhone` y `avatarName` cuentan `agendaName`: hoy un contacto con solo teléfono y nombre de la agenda saldría con su teléfono de título)
- Test: `Backend/tests/agenda.test.js`, `Backend/tests/contact.identity.test.js`, `Backend/tests/isolation/agenda.test.js` (nuevo)

**Interfaces:**
- Produce (`utils/agenda.js`): `describeAgendaChange(item)` → `{ phone, fullName, firstName, removed: boolean, syncedAt: Date } | null` (`null` si `type !== 'contact'`, sin teléfono válido o sin `metadata.timestamp`; `timestamp` en segundos, número o texto); `agendaDisplayName({ fullName, firstName })` → el primero con texto, o `null`.
- Produce: `AgendaEntry` `{ userId, phone, fullName, firstName, removed, syncedAt }`, índice `agenda_entry_unique` `{ userId, phone }` único.
- Produce (`agenda.service.js`): `storeAgendaChange(accountId, change)` → upsert condicionado a `syncedAt` más nuevo; `applyAgendaName(accountId, phone)` → copia la entrada al contacto con `Contact.updateOne({ userId, phone, $or: [{ agendaSyncedAt: null }, { agendaSyncedAt: { $lt: syncedAt } }] }, { $set: { agendaName: removed ? null : agendaDisplayName(entry), agendaSyncedAt: syncedAt } })`; `applyAgendaNames(accountId, phones)` → lo mismo para una tanda (la importación).
- Modifica `handleWebhook`: `change.field === 'smb_app_state_sync'`, antes de `value.messages`, con `continue`: por cada `state_sync[]`, `describeAgendaChange` (lo mal formado, aviso y sigue), `storeAgendaChange` y **después** `applyAgendaName`. Un error de la BD → `retryBatch`.
- Modifica los tres caminos que crean contactos: después de crear, `applyAgendaName` (en `resolveContact` solo en la rama que crea; en `createContact`; en la importación, `applyAgendaNames` con los teléfonos de la tanda). Si falla, aviso en el log y el contacto se crea igual.
- Modifica `contactDisplayName` y todo sitio que proyecta los campos del contacto para el nombre (`grep -rn "profileName" Backend/src/controllers`): también `agendaName`.

- [ ] **Paso 1: Tests que fallan:**
  - Unitarios: `describeAgendaChange` con el ejemplo de Meta (`phone_number: '16505551234'`, `timestamp: '1739321024'`), con `remove` sin nombres, con `+1 650…`, sin teléfono → `null`, con `timestamp` número; `contactDisplayName` con `agendaName` y sin `name` → el de la agenda, con `name` → `name`.
  - Aislamiento: `la agenda nombra a un contacto que ya existe`; `un contacto que escribe después nace con agendaName`; `uno creado a mano, por la API o al importar toma agendaName`; `la agenda que llega mientras se crea el contacto queda aplicada` (con un gancho entre crear y aplicar, en los dos órdenes); `un remove vacía agendaName`; `una entrada vieja no pisa una nueva`; `name nunca cambia`; `la agenda de una cuenta no nombra al contacto de otra con el mismo teléfono`; `los de la agenda sin chat no salen en GET /api/contacts`; `buscar por el nombre de la agenda lo encuentra`; `GET /api/contacts devuelve agendaName y displayName con el de la agenda`; `un fallo de la BD al guardar responde 500`.
- [ ] **Paso 2:** → FALLA. **Paso 3:** implementar. **Paso 4:** → PASA; `npm test`, `npm run test:isolation`, y en `Frontend/` `npm run lint` y `npm run build`. En Chromium, un contacto con solo teléfono y nombre de la agenda: título, subtítulo y avatar en Contactos, la bandeja y la ficha.
- [ ] **Paso 5:** `webhook:simulate -- agenda --phone <n> --name <nombre>` (`--remove`). `contactos.md` (sección «Agenda del celular»), `pruebas-y-scripts.md`, `Backend/AGENTS.md`. Commit «Historial: la agenda del celular y agendaName».

## PR 5 · Encender el pedido (rama `historial-pedido`, desde `master` con el PR 4 unido)

### Tarea 8: Pedir a Meta, reintentar y enseñar el estado

**Archivos:**
- Modificar: `Backend/src/libs/whatsapp.js`, `Backend/src/services/line.service.js` (`applyConnection`), `Backend/src/workers/history.worker.js`, `Backend/src/controllers/line.controller.js` (`serializeLine`, la ruta), `Backend/src/routes/line.routes.js`
- Crear: `Backend/src/services/history.request.service.js`
- Test: `Backend/tests/isolation/history.test.js`, `Backend/tests/isolation/lines.test.js`

**Interfaces:**
- Produce (`libs/whatsapp.js`): `requestSmbAppData({ token, phoneNumberId, syncType })` → `POST /{phoneNumberId}/smb_app_data` con `{ messaging_product: 'whatsapp', sync_type: syncType }`; devuelve `data.request_id`.
- Modifica `applyConnection`: en la misma escritura de la línea, si `plan.action !== 'renew'` **y** `businessApp`, `$set: { historySync: { connectionAt: <el mismo connectedAt>, requests: { contacts: { state: 'pending' }, history: { state: 'pending' } } } }`; si `businessApp` es falso en una conexión nueva, `$unset: { historySync }`. `renew` no toca `historySync`. Después del candado, `wakeHistoryWorker()`.
- Produce (`history.request.service.js`): `processPendingHistoryRequests(now)`: por cada línea activa con un pedido `pending` dentro de las 24 h, en orden (`contacts` y después `history`), `claimHistoryRequest(lineId, connectionAt, kind)` (`findOneAndUpdate` condicionado a `state: 'pending'` → `requesting`, `claimedAt: now`) y `requestSmbAppData`: con `request_id` → `accepted`; con `err.waErrorCode` → `rejected` y el error; sin respuesta (timeout o red) → `uncertain`. `recoverHistoryRequests()` al arrancar: `requesting` → `uncertain`. El worker los llama en cada vuelta, antes de las piezas.
- Produce: `retryHistorySync(accountId, lineId, now)` → 404 si no es de la cuenta (`findAccountLine`); 409 `history_sync_unavailable` si `historySyncView(...).canRetry` es falso; si no, pasa a `pending` **solo** los pedidos de `retryable` (con escrituras condicionadas a su estado de ese momento), y `wakeHistoryWorker()`.
- Produce: `POST /api/lines/:id/history-sync` con `authRequired`, `requirePermission('lines.manage')` → 204.
- Modifica `serializeLine`: `historySync: historySyncView(line.historySync)`.

- [ ] **Paso 1: Tests que fallan:**
  - `conectar un número de la app deja los dos pedidos pending`; `renovar el token no toca historySync`; `reconectar una línea desconectada lo reinicia`; `un número que no es de la app no tiene historySync`.
  - `el worker pide primero los contactos y después el historial` (`metaCalls`); `dos procesos a la vez piden una sola vez`; `un error de Meta deja rejected` y la vista `failed` con `canRetry`; `un timeout deja uncertain y no se repite`.
  - **Review Focus 4:** `un requesting al arrancar pasa a uncertain`, `canRetry` falso a los 10 minutos y verdadero a los 31.
  - Ruta: `reintentar la línea de otra cuenta da 404`; `un agente sin lines.manage, 403`; `fuera de las 24 h, o sin nada que reintentar, 409`; `reintentar un rejected lo vuelve a pedir`; `con los contactos rejected y el historial ya recibiendo, reintentar pide solo los contactos`.
- [ ] **Paso 2:** → FALLA. **Paso 3:** implementar. **Paso 4:** → PASA, todo en verde.
- [ ] **Paso 5:** `whatsapp-envio.md` (el pedido), `api.md` (la ruta), `docs/estado.md`. Commit «Historial: pedirlo al conectar y reintentar».

## PR 6 · UI (rama `historial-ui`, desde `master` con el PR 5 unido y el diseño de Claude Design)

### Tarea 9: El estado en Ajustes → Líneas, la explicación y la ficha

**Archivos** (según el diseño): `Frontend/src/models/line.model.ts` (`historySync`), `Frontend/src/services/api.service.ts` (`history_sync` en el SSE y `retryHistorySync`), `Frontend/src/pages/private/Settings/Lines/` (`LineRow.tsx` o `LineDetails.tsx`, `ConnectQuestion.tsx`), la ficha del contacto y el panel de Contactos (`ContactDataCard.tsx`, `ContactPanel.tsx`).

- [ ] **Paso 1:** la skill de marca y el diseño de `Design/`. **Paso 2:** el estado de cada línea con los textos del brief (§ 3), «Reintentar» cuando `canRetry`, y el SSE `history_sync` que invalida las líneas y la bandeja. **Paso 3:** la explicación previa a conectar (brief § 2). **Paso 4:** «Nombre en tu celular» y el origen nuevo (brief § 4).
- [ ] **Paso 5:** `npm run lint` y `npm run build`; en Chromium contra el backend local con `webhook:simulate` (cada estado, en la computadora y en el teléfono emulado). `chat.md` y `frontend.md` si cambian. Commit por pieza.

## Después de unir

- **Versión** con los PRs 2 a 5 (el 6 puede ir después). Desplegarla **antes de conectar el chip del botón de la página**.
- Con el chip: conectarlo, aceptar compartir en la app, y comprobar lo que el spec § 3 deja abierto (la forma del archivo de 14 días, citas o reacciones en el historial, el formato del teléfono de la agenda). Lo distinto se corrige en el spec y en `docs/arquitectura/`.
- `/graphify --update`.
