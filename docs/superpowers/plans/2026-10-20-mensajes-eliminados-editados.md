# Mensajes eliminados y editados — plan de implementación

> En Wasmish los planes se ejecutan **nativos**: rama, PR y revisión cruzada (ver «Planes» en `AGENTS.md`). Los pasos usan casillas (`- [ ]`).

**Objetivo:** que un borrado o una edición de la coexistencia (del contacto o del negocio desde la app) marque el mensaje original en su sitio, con un ojito para ver lo que decía, en lugar de crear una burbuja «Mensaje no compatible».

**Arquitectura:** `utils/message.change.js` (puro) decide si un mensaje de Meta es un cambio y lo lee; `services/message.change.service.js` busca el original con todas las comprobaciones de propiedad, lo actualiza (borrado idempotente, edición que solo avanza con escritura condicionada) y avisa por SSE con `message_updated` y, si era el último, `conversation_updated`. `procesarEntrante` y `procesarEco` lo llaman **antes** de todo lo demás. En el navegador, la cadena SSE gana el evento, los dos hooks lo aplican y la burbuja de `ChatThread` pinta «Mensaje eliminado» / «Editado» con el ojo.

**Stack:** Express 5 + Mongoose; `node:test` y los tests de aislamiento (Mongo en memoria). React 19 + React Query + Tailwind v4.

**Spec:** [docs/superpowers/specs/2026-10-19-mensajes-eliminados-editados-design.md](../specs/2026-10-19-mensajes-eliminados-editados-design.md). Sin Claude Design: la burbuja la hace el agente con la skill de marca (spec § 9).

## Restricciones globales

- Un cambio es `type: 'revoke'` o `type: 'edit'`, **con cualquier contenido**: nunca llega a `describeInboundMessage` ni crea un `Message`, aunque venga mal formado.
- Un cambio nunca suma `unreadCount`, mueve `lastInboundAt` ni `lastMessageAt`, manda push, crea trabajo del bot ni llama a `markHumanReply`.
- El original se toca solo si es **de la cuenta y la línea** del webhook (`conversationLineFilter(line)`), de **la misma dirección** (entrante → `inbound`; eco → `outbound`) y de **la conversación del contacto del webhook** (remitente en un entrante; destinatario `to` / `to_user_id` en un eco), buscado **sin crearlo** con `findContactByIdentity`.
- Ediciones válidas: `text` con `body` no vacío, o `image` / `video` / `document` (los tipos con pie). Y del **mismo tipo que el original**. Cualquier otra cosa se descarta.
- Una edición solo avanza: `timestamp <= editedAt` actual no hace nada. Escritura condicionada a `editedAt` leído, **3 intentos** como mucho.
- Borrado: `deletedAt = timestamp` solo si era `null`. `text`, `caption` y el archivo **se conservan**.
- La vista previa: «Mensaje eliminado» si el último mensaje tiene `deletedAt` (aunque llegue una edición después); si no, su `text`.
- `edit.message.context` (el `"M0"` del ejemplo de Meta) se ignora: no es una respuesta citada.
- Los avisos del log llevan `waMessageId`, `kind` y el motivo; **nunca** texto ni teléfonos.
- Textos de la UI: «Mensaje eliminado», «Eliminado», «Editado»; `aria-label` «Ver el mensaje original» / «Ocultar el mensaje original» (eliminado) y «Ver las versiones anteriores» / «Ocultar las versiones anteriores» (editado).
- Comentarios, commits, PRs y textos en español; identificadores nuevos en inglés.

## Lo que más puede fallar sin que un test lo vea

1. **Un documento al que se le quita el pie:** `text` no puede quedar en «Documento» si el original tenía nombre de archivo → test en la tarea 2 («editar un documento sin pie deja el nombre del archivo»).
2. **Una edición de un mensaje anterior a los campos** (sin `editedAt` ni `previousVersions` en la BD): la escritura condicionada a `editedAt: null` tiene que encontrarlo → test en la tarea 2 («edita un mensaje guardado sin los campos nuevos»).
3. **`conversation_updated` sin `unreadCount`** en una bandeja con no leídos: el contador no puede quedar en `undefined` → paso de navegador en la tarea 5 y el handler con `'unreadCount' in payload` en la tarea 4.
4. **La edición de un mensaje que no es el último:** la vista previa no cambia y no se emite `conversation_updated` → test en la tarea 2.
5. **Recargar tras verlo en vivo:** `GET /api/chats/:id/messages` y `message_updated` dan la misma forma (la misma función serializa los dos) → test en la tarea 3 y paso de navegador en la tarea 5.

---

## PR 1 · Backend (rama `mensajes-eliminados-editados-backend`, desde `master` con el plan unido)

### Tarea 1: Leer el cambio (funciones puras)

**Archivos:**
- Crear: `Backend/src/utils/message.change.js`
- Modificar: `Backend/src/utils/business.app.js` (fuera `ECHO_IGNORED_TYPES`; se extrae `describeEchoRecipient`)
- Test: `Backend/tests/message.change.test.js`, `Backend/tests/business.app.test.js`

**Interfaces:**
- Produce: `isMessageChange(messageData)` → `boolean`: `type` es `'revoke'` o `'edit'`.
- Produce: `describeMessageChange(messageData)` → `null` si está mal formado, o `{ kind: 'revoke' | 'edit', waMessageId, originalWaMessageId, timestamp: Date, content }`. `content` es `null` en `revoke` y `{ type, text, caption }` en `edit`. `timestamp` como en `describeEcho` (segundos de Meta, o ahora si falta). Mal formado: sin `id`, sin `original_message_id` (en `revoke.` o `edit.`), o un `edit` sin contenido válido (ver «Restricciones»). El contenido se describe con `describeInboundMessage(edit.message)` **después** de validar el tipo y, en `text`, que `text.body` no esté vacío.
- Produce: `serializeMessageChange(msg)` → `{ deletedAt, editedAt, previousVersions }`, con las fechas en ISO o `null` y `previousVersions` como `[{ text, caption, editedAt }]` (`[]` si no hay).
- Produce: `DELETED_PREVIEW = 'Mensaje eliminado'`.
- Produce (en `business.app.js`): `describeEchoRecipient(echoData)` → `{ phone, waUserId }` con las reglas de hoy de `describeEcho` (un `to` con letras no es teléfono). `describeEcho` la usa y devuelve `null` si `isMessageChange(echoData)`.

- [ ] **Paso 1: Tests que fallan** (`message.change.test.js`):
  - `isMessageChange`: `{ type: 'revoke' }`, `{ type: 'edit' }`, `{ type: 'edit', edit: {} }` → `true`; `{ type: 'text' }`, `{}`, `null` → `false`.
  - `describeMessageChange` de `revoke` entrante (forma de la doc de Meta: `from`, `id`, `timestamp: '1750090702'`, `revoke.original_message_id`) → `{ kind: 'revoke', waMessageId, originalWaMessageId, timestamp: new Date(1750090702000), content: null }`; la misma forma de eco (con `to` en vez de `from`) → igual.
  - `edit` de texto (`edit.message = { type: 'text', text: { body: '  hola  ' } }`) → `content` `{ type: 'text', text: 'hola', caption: null }`.
  - `edit` de foto con pie (el ejemplo de eco de Meta, con `context: { id: 'M0' }`) → `{ type: 'image', text: 'Updated image caption', caption: 'Updated image caption' }`; sin pie → `{ type: 'image', text: 'Imagen', caption: null }`.
  - `edit` de documento con `filename` y sin pie → `text` es el `filename`.
  - `null` para: sin `original_message_id` (los dos tipos); `edit` sin `message`; `text` con `body` vacío o solo espacios; `edit.message.type` `'sticker'`, `'audio'`, `'location'` y `'foo'`.
  - `serializeMessageChange`: un mensaje sin los campos → `{ deletedAt: null, editedAt: null, previousVersions: [] }`; uno con dos versiones → fechas en ISO y el orden de llegada.
  - En `business.app.test.js`: el test de `ECHO_IGNORED_TYPES` pasa a «`describeEcho` devuelve `null` para `edit` y `revoke`, bien y mal formados»; `describeEchoRecipient` con `to` numérico, con `to` con letras (→ `phone: null`) y solo con `to_user_id`.
- [ ] **Paso 2:** `cd Backend && node --test tests/message.change.test.js tests/business.app.test.js` → FALLA.
- [ ] **Paso 3:** implementar. `ECHO_IGNORED_TYPES` desaparece (de `business.app.js` y del `import` y el aviso de `procesarEco`, que pasa a mirar `isMessageChange`).
- [ ] **Paso 4:** el mismo comando → PASA; `npm test` en verde.
- [ ] **Paso 5:** commit «Mensajes eliminados y editados: leer el cambio (funciones puras)».

### Tarea 2: Aplicar el cambio (servicio y modelo)

**Archivos:**
- Modificar: `Backend/src/models/message.model.js` (tres campos)
- Crear: `Backend/src/services/message.change.service.js`
- Test: `Backend/tests/isolation/message-change.test.js`

**Interfaces:**
- Consume: `describeMessageChange`, `serializeMessageChange`, `DELETED_PREVIEW` (tarea 1); `findContactByIdentity`, `conversationLineFilter` (`contact.controller.js`); `sendToAccount`.
- Produce: `Message` con `deletedAt: { type: Date, default: null }`, `editedAt: { type: Date, default: null }` y `previousVersions: { type: [{ text, caption, editedAt }] (sin _id), default: undefined }`.
- Produce: `applyMessageChange({ line, change, direction, identity })` → `Promise<'applied' | 'unchanged' | 'not_found' | 'rejected'>`. `line` = `{ accountId, lineId, phoneNumberId }` (el `inbound` del webhook); `direction` = `'inbound' | 'outbound'`; `identity` = `{ phone, waUserId }`. `not_found`: no existe el original o no es de esa cuenta y línea; `rejected`: otra dirección, otro contacto, sin identidad, otro tipo de contenido o intentos agotados; `unchanged`: reintento o edición vieja. Solo `'applied'` emite SSE.
- SSE: `message_updated` con `{ id, conversationId, text, caption, ...serializeMessageChange(msg) }` y `meta = { lineId }`; y, si el mensaje es el último de la conversación (`Message.findOne({ conversationId }).sort({ timestamp: -1, _id: -1 })`), `Conversation.lastMessage` = `DELETED_PREVIEW` si tiene `deletedAt` o su `text`, y `conversation_updated` con `{ id, lastMessage }`. Las dos cosas desde el mensaje **releído después de escribir**.
- Edición, con el original leído (`actual`): si `actual.editedAt && timestamp <= actual.editedAt` → `'unchanged'`. Si no, `updateOne({ _id, editedAt: actual.editedAt ?? null }, { $push: { previousVersions: { text: actual.text, caption: actual.caption, editedAt: actual.editedAt ?? actual.timestamp } }, $set: { text, caption, editedAt: timestamp } })`; con `modifiedCount === 0`, releer y repetir, como mucho 3 veces. El `text` de un documento sin pie: `content.caption ?? actual.mediaFilename ?? content.text`. `mediaFile` no se toca.

- [ ] **Paso 1: Tests que fallan** (Mongo en memoria, con `seedAccount` y `connectWhatsapp`; el servicio se llama directo, sin webhook):
  - borra: `deletedAt` = la hora del cambio, `text` y `caption` intactos, `'applied'`; el mismo borrado otra vez → `'unchanged'`.
  - edita dos veces: `text` final y dos `previousVersions` (la primera con `editedAt` = `timestamp` del mensaje); la misma edición otra vez → `'unchanged'`; una edición con hora anterior a la aplicada → `'unchanged'` y no pisa.
  - dos ediciones a la vez con horas distintas (`Promise.all`), en los dos órdenes de llamada → `text` y `editedAt` son los de la más nueva (la vieja puede quedar en `previousVersions` o descartarse, según quién escribió primero).
  - edita un mensaje guardado sin los campos nuevos (insertado con `Message.collection.insertOne`, sin `editedAt`).
  - edita un documento sin pie → `text` es su `mediaFilename`.
  - edición de texto sobre una foto → `'rejected'`, nada cambia.
  - original de **otra cuenta**, de **otra línea** de la misma cuenta, de **otra dirección**, de **otro contacto** (entrante) y de **otro destinatario** (eco, también con un destinatario solo con BSUID), e identidad vacía → nada cambia; inexistente → `'not_found'`.
  - `lastMessage`: no cambia si el mensaje no es el último; pasa a «Mensaje eliminado» si lo es, y se queda así en los dos órdenes (borrado → edición y edición → borrado); una edición del último sin borrar → su texto nuevo.
  - SSE con `openStream`: `message_updated` llega a la cuenta y no a otra; `conversation_updated` sin `unreadCount` solo cuando era el último.
- [ ] **Paso 2:** `cd Backend && node --test tests/isolation/message-change.test.js` → FALLA.
- [ ] **Paso 3:** implementar el modelo y el servicio. Aviso en el log (sin contenido) en `not_found`, `rejected` y al agotar los intentos.
- [ ] **Paso 4:** el mismo comando → PASA; `npm run test:isolation` en verde.
- [ ] **Paso 5:** commit «Mensajes eliminados y editados: aplicar el cambio al original».

### Tarea 3: Los dos caminos del webhook y lo que llega al navegador

**Archivos:**
- Modificar: `Backend/src/controllers/webhook.controller.js` (`procesarEntrante`, `procesarEco`)
- Modificar: `Backend/src/controllers/chat.controller.js` (`serializeMessage`)
- Modificar: `Backend/scripts/simulate-webhook.js`
- Test: `Backend/tests/isolation/webhook.test.js`, `Backend/tests/isolation/chats.test.js`
- Docs: `docs/arquitectura/webhook-adjuntos.md` (sección nueva «Mensajes eliminados y editados (`applyMessageChange`)» y el cambio en `procesarEco`), `docs/arquitectura/chat.md` § Eventos SSE (`message_updated` y `conversation_updated` con campos opcionales), `docs/arquitectura/pruebas-y-scripts.md` (las opciones nuevas de `webhook:simulate`)

**Interfaces:**
- Consume: `isMessageChange`, `describeMessageChange`, `serializeMessageChange` (tarea 1); `applyMessageChange` (tarea 2); `describeInboundContact`, `describeEchoRecipient`.
- `procesarEntrante`: **lo primero**, si `isMessageChange(messageData)`: `describeMessageChange`; `null` → aviso y salir; si no, `applyMessageChange({ line: inbound, change, direction: 'inbound', identity: describeInboundContact(contacts, messageData) })` y salir. Igual en `procesarEco` con `direction: 'outbound'` e `identity: describeEchoRecipient(echoData)`.
- `serializeMessage` añade `...serializeMessageChange(msg)`.
- `webhook:simulate`: `revoke --original <wamid>` y `edit --original <wamid> --text "texto"`, entrantes por defecto y como eco con `--eco`. El `wamid` sale de la lista «Guardado» que ya imprime (se añade `waMessageId` a esa línea).

- [ ] **Paso 1: Tests que fallan:**
  - `webhook.test.js`: un `revoke` y un `edit` entrantes, bien y mal formados, sobre un entrante de A → no crean `Message`, `unreadCount` y `lastInboundAt` no cambian, no hay llamada de push (`pushCalls`), ningún `Message` con `bot` nuevo; el bueno marca el original. Lo mismo como eco sobre un saliente → sin escritura de `bot.humanRepliedAt` (`pauseWrites`). El test «ediciones y eliminaciones desde la app: nada guardado» se queda (cambios mal formados: ni contacto ni mensaje).
  - `chats.test.js`: `GET /api/chats/:id/messages` devuelve `deletedAt`, `editedAt` y `previousVersions` de un mensaje cambiado, y `null`/`null`/`[]` en uno normal.
- [ ] **Paso 2:** `cd Backend && node --test tests/isolation/webhook.test.js tests/isolation/chats.test.js` → FALLA.
- [ ] **Paso 3:** implementar los dos caminos, `serializeMessage` y `webhook:simulate`.
- [ ] **Paso 4:** `npm test && npm run test:isolation` en verde. En local: `npm run webhook:simulate -- texto`, después `revoke --original <wamid>` y `edit --original <wamid> --text "otro"` → el script enseña el original marcado y ningún mensaje nuevo.
- [ ] **Paso 5:** documentación en el mismo commit o el siguiente; commit «Mensajes eliminados y editados: el webhook y la lista de mensajes».
- [ ] **Paso 6:** PR «Mensajes eliminados y editados: backend», CI en verde, revisión de Codex (`codex exec … < /dev/null`), respuesta punto por punto.

## PR 2 · UI (rama `mensajes-eliminados-editados-ui`, desde `master` con el backend unido)

Antes de tocar nada visual: la skill `brand-guidelines`.

### Tarea 4: El evento en la cadena SSE y en los dos hooks

**Archivos:**
- Modificar: `Frontend/src/models/message.mode.ts`, `Frontend/src/context/sse.context.ts`, `Frontend/src/context/sse.provider.tsx`, `Frontend/src/services/api.service.ts` (`SSEHandlers` y `createSSEConnection`), `Frontend/src/hooks/useConversationMessages.ts`, `Frontend/src/hooks/useConversations.ts`

**Interfaces:**
- `Message` gana `deletedAt?: string | null`, `editedAt?: string | null` y `previousVersions?: MessageVersion[]`, con `MessageVersion = { text: string; caption: string | null; editedAt: string }`.
- `SSEEventMap.message_updated: Pick<Message, 'id' | 'conversationId' | 'text'> & Pick<Message, 'caption' | 'deletedAt' | 'editedAt' | 'previousVersions'>`; `conversation_updated: { id: string; unreadCount?: number; lastMessage?: string }`.
- `onMessageUpdated` en `SSEHandlers`, su `addEventListener` y su `Set` y `dispatch` en el provider.
- `useConversationMessages`: `message_updated` se mezcla en su sitio en todas las páginas, como `message_status` (copias, nunca mutar la caché).
- `useConversations`: el handler de `conversation_updated` copia solo los campos presentes (`'unreadCount' in payload`, `'lastMessage' in payload`).

- [ ] **Paso 1:** implementar.
- [ ] **Paso 2:** `cd Frontend && npm run lint && npm run build` en verde.
- [ ] **Paso 3:** commit «Mensajes eliminados y editados: el evento message_updated en la UI».

### Tarea 5: La burbuja

**Archivos:**
- Crear: `Frontend/src/components/Chat/MessageChangeToggle.tsx` (el botón del ojo y lo que despliega)
- Modificar: `Frontend/src/components/Chat/ChatThread.tsx`
- Docs: `docs/arquitectura/chat.md` (sección nueva «Mensajes eliminados y editados en la UI» y `useConversations`: `conversation_updated` parcial)

**Interfaces:**
- Consume: los campos de `Message` (tarea 4).
- `ChatThread`: con `deletedAt`, el cuerpo de la burbuja es «Mensaje eliminado» (gris, cursiva, tokens de la marca) en lugar del contenido; con `editedAt`, «Editado» en la fila de la hora, antes de la hora.
- `MessageChangeToggle({ msg, mine })`: botón con `Eye` / `EyeOff` de lucide y el `aria-label` de las restricciones; abierto, enseña en un eliminado el contenido como hoy (el mismo render del cuerpo, con `MessageMedia` si hay archivo) con la marca «Eliminado», y en un editado las `previousVersions` de la más reciente a la más antigua, cada una con su hora (`formatTime`). Eliminado y editado: el último contenido y debajo sus versiones. Estado local (`useState`), no se guarda.
- El cuerpo de la burbuja (archivo, adjunto con icono o texto) se extrae a una función dentro de `ChatThread` para pintarlo igual dentro y fuera del ojo.

- [ ] **Paso 1:** implementar siguiendo la skill de marca (sin colores sueltos de Tailwind; área de toque del botón de 44 px en el teléfono).
- [ ] **Paso 2:** `npm run lint && npm run build` en verde.
- [ ] **Paso 3: Navegador** (Playwright, con el backend local y `webhook:simulate`): burbuja eliminada, editada y las dos cosas, en un entrante y en un eco, con el ojo abierto y cerrado; llegan en vivo, también la vista previa de la bandeja con no leídos > 0 (el contador no se pierde); al recargar se ve lo mismo; en el ancho del teléfono. Capturas para el PR.
- [ ] **Paso 4:** commit «Mensajes eliminados y editados: la burbuja»; PR con las capturas, CI en verde, revisión de Codex y respuesta punto por punto.

## Después de los dos PRs (con Jonathan)

- Se despliegan juntos (spec § 8): versión en su PR, `estado.md` al día.
- En producción, con la línea de coexistencia: borrar y editar un mensaje desde el celular del contacto y desde la app del negocio, y comprobar que no nace ningún «Mensaje no compatible».
