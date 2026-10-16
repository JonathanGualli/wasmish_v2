# Coexistencia con la app de WhatsApp Business — plan de implementación

> En Wasmish los planes se ejecutan **nativos**: rama, PR y revisión cruzada (ver «Planes» en `AGENTS.md`). Los pasos usan casillas (`- [ ]`).

**Objetivo:** conectar un número que sigue en la app de WhatsApp Business, ver en Wasmish lo que se responde desde la app (pausando al bot) y desconectar las líneas cuando Meta retira el acceso.

**Arquitectura:** sin endpoints nuevos. Conectar reutiliza `POST /api/whatsapp/connect` (el número se deduce del WABA en este camino) con una consulta nueva a Meta (`is_on_biz_app`). El webhook gana dos bloques: `message_echoes` (una hermana de `procesarEntrante`) y `account_update` (`PARTNER_REMOVED`, antes del `continue` por falta de `phone_number_id`). La lógica que decide va en funciones puras de `utils/` con su test.

**Stack:** Express 5 + Mongoose + Zod; `node:test` y los tests de aislamiento con Mongo en memoria y Meta falso (`onMeta`). React 19 + React Query.

**Spec:** [docs/superpowers/specs/2026-10-16-coexistencia-design.md](../specs/2026-10-16-coexistencia-design.md). **Diseño:** `Design/Wasmish Líneas - Junto con la app.html` (pantallas 1a–1e, 2a–2d, m1–m4, 3a–3b), **tal cual, con los textos corregidos del spec** (decisión de Jonathan, 2026-10-16).

## Restricciones globales

- **Fuentes de Meta reabiertas el 2026-10-16** al empezar el plan: el evento `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` trae `data: { waba_id }` **sin** `phone_number_id`; `GET /{phone-number-id}?fields=is_on_biz_app,platform_type` responde `{ "is_on_biz_app": true, "platform_type": "CLOUD_API", "id": "…" }`.
- Ecos: `type` ∈ `text | image | video | document | edit | revoke`; `edit` y `revoke` se ignoran; `timestamp` en segundos; el destinatario es `to` (teléfono, sin BSUID).
- `PARTNER_REMOVED`: el WABA es `value.waba_info.waba_id` (**nunca** `entry.id`); `at` = `entry.time` (segundos); `disconnection_info: { reason, initiated_by }` puede faltar.
- Motivos de Meta tal cual en `Line.disconnectionReason`: `PRIMARY_INACTIVITY`, `COMPANION_INACTIVITY`, `ACCOUNT_DISCONNECTED`, `CHANGE_NUMBER`, `USER_RE_REGISTERED`, `BUSINESS_DOWNGRADE`, o `null`.
- `Message.origin` nuevo: `'businessApp'`. En la UI: **«Desde la app de WhatsApp»** (no «Desde el celular», que es lo que dibuja el diseño).
- Regla 7: ningún eco ni evento roto tumba el lote; ningún mensaje con `text` vacío. Logs **sin** el texto de los mensajes.
- Comentarios, commits, PRs y textos de la UI en español; identificadores nuevos en inglés.
- Ningún dato privado en el repo (el número de prueba está en la memoria de Jonathan).

## Lo que más puede fallar sin que un test lo vea

1. **Meta manda el eco de un mensaje que Wasmish envió por la API** (si Meta lo hiciera además de los de la app): no debe duplicar el mensaje. El índice único de `waMessageId` lo para → test en la tarea 4 («un eco con el `waMessageId` de un mensaje ya enviado desde Wasmish no crea otro ni pausa»).
2. **Un WABA de coexistencia con más de un número**, o con ninguno marcado `is_on_biz_app`: 409 en palabras y nada guardado → test en la tarea 2.
3. **Un `PARTNER_REMOVED` de un cliente normal de hoy (sin `disconnection_info`) con dos líneas en el WABA:** desconecta las dos con motivo `null` y la línea por defecto pasa a otra activa → test en la tarea 5.
4. **Un eco de una conversación que nunca existió** (el negocio escribe primero desde la app a un número nuevo): crea el contacto y la conversación, sin abrir la ventana de 24 h → test en la tarea 4.
5. **La pestaña abierta en Chats cuando llega el eco con foto:** el hilo lo pinta con la foto y en su sitio por hora, y la bandeja no retrocede → comprobación en el navegador en la tarea 9.

---

## PR 1 · Backend (rama `coexistencia`, después del commit del plan)

### Tarea 1: Saber si el número está en la app y decidir el registro

**Archivos:**
- Modificar: `Backend/src/libs/whatsapp.js` (nueva `getPhoneNumberPlatform`)
- Modificar: `Backend/src/utils/whatsapp.line.js` (`describePhoneNumberPlatform`, `needsRegistration`)
- Test: `Backend/tests/whatsapp.line.test.js`

**Interfaces:**
- Produce: `getPhoneNumberPlatform({ token, phoneNumberId })` → respuesta de axios de `GET /{phoneNumberId}?fields=is_on_biz_app,platform_type`.
- Produce: `describePhoneNumberPlatform(body)` → `{ onBusinessApp: true | false | null, platformType: string | null }` (`null` si el campo falta o no es booleano).
- Produce: `needsRegistration(details, { onBusinessApp = null, claimedBusinessApp = false } = {})` → boolean. Los llamadores de hoy, sin el segundo argumento, se comportan igual que ahora.

- [ ] **Paso 1: Tests que fallan** en `whatsapp.line.test.js`:
  - `describePhoneNumberPlatform({ is_on_biz_app: true, platform_type: 'CLOUD_API' })` → `{ onBusinessApp: true, platformType: 'CLOUD_API' }`; con `false` → `false`; sin el campo, con `'true'` (texto) o con `null` como cuerpo → `onBusinessApp: null`.
  - `needsRegistration({ platformType: 'NOT_APPLICABLE' }, { onBusinessApp: true })` → `false` (comentario: «Regresión que vigila: un número de la app con `NOT_APPLICABLE` se registraría con un PIN ajeno y se rompería»).
  - `onBusinessApp: false` + `NOT_APPLICABLE` → `true`; `onBusinessApp: null` + `NOT_APPLICABLE` + `claimedBusinessApp: false` → `true`; `onBusinessApp: null` + `NOT_APPLICABLE` + `claimedBusinessApp: true` → `false`; `CLOUD_API` con cualquier combinación → `false`; sin segundo argumento, igual que hoy.
- [ ] **Paso 2:** `cd Backend && node --test tests/whatsapp.line.test.js` → FALLA (no existe `describePhoneNumberPlatform`).
- [ ] **Paso 3:** implementar las tres funciones. `getPhoneNumberPlatform` usa `whatsappApi.get` como `getWabaPhoneNumbers`.
- [ ] **Paso 4:** el mismo comando → PASA, y `npm test` entero en verde.
- [ ] **Paso 5:** commit «Coexistencia: saber si el número está en la app y no registrarlo».

### Tarea 2: Conectar un número de la app (los dos caminos)

**Archivos:**
- Modificar: `Backend/src/schemas/whatsapp.schema.js` (`phoneNumberId` opcional **solo** con `businessApp: true`; `businessApp` booleano opcional)
- Modificar: `Backend/src/utils/whatsapp.line.js` (`pickBusinessAppPhoneNumber`, mensaje y código de error nuevos)
- Modificar: `Backend/src/services/whatsapp.connection.service.js` (`readPhoneNumberPlatform`, `resolveBusinessAppPhoneNumber`, `registerIfNeeded` con `onBusinessApp` y `claimedBusinessApp`)
- Modificar: `Backend/src/controllers/whatsapp.controller.js` y `Backend/src/controllers/user.controller.js`
- Modificar: `Backend/src/services/line.service.js` (`applyConnection`) y `Backend/src/controllers/line.controller.js` (`serializeLine`)
- Modificar: `Backend/src/models/line.model.js` (`businessApp`, `disconnectionReason`) y `Backend/src/models/waba.model.js` (`authorizedAt`)
- Test: `Backend/tests/whatsapp.line.test.js` y `Backend/tests/isolation/whatsapp.test.js`

**Interfaces:**
- Consume: lo de la tarea 1.
- Produce: `pickBusinessAppPhoneNumber(numbers)`, donde `numbers` es `[{ phoneNumberId, onBusinessApp }]` → el `phoneNumberId` elegido o `null` (uno solo → ese; varios → el único con `onBusinessApp === true`; si no, `null`).
- Produce: `LINE_ERROR_CODES.businessAppNumberUnknown = 'business_app_number_unknown'` y `BUSINESS_APP_NUMBER_UNKNOWN_MESSAGE` = «No pudimos saber qué número de la app de WhatsApp Business conectar. Vuelve a intentarlo; si se repite, escríbenos.»
- Produce: `readPhoneNumberPlatform({ token, phoneNumberId })` → `{ onBusinessApp, platformType }`; **nunca lanza** (un error de Meta da `onBusinessApp: null` y un `console.warn`).
- Produce: `applyConnection({ …, businessApp = false })`, que escribe `Line.businessApp`, `$unset: { disconnectionReason }` en la línea y `Waba.authorizedAt = new Date()` en cada conexión, **también al renovar**.
- Produce: `serializeLine` devuelve además `businessApp` (boolean) y `disconnectionReason` (string o null).

- [ ] **Paso 1: Tests puros que fallan:** `pickBusinessAppPhoneNumber` con un número; con dos números y uno marcado; con dos marcados (`null`); con dos sin marcar (`null`); con la lista vacía (`null`).
- [ ] **Paso 2: Tests de aislamiento que fallan** en `isolation/whatsapp.test.js`, con un `fakeMeta` que también responda a `/{id}` (`fields=is_on_biz_app,platform_type`) con el valor de cada caso:
  - `POST /whatsapp/connect` con `{ code, waBusinessId, businessApp: true }` sin `phoneNumberId` y un WABA con un número `is_on_biz_app: true`: 200, la línea queda `businessApp: true`, **ninguna llamada a `/register`** y `Waba.authorizedAt` escrita.
  - El mismo WABA con dos números sin marcar: 409 con `code: 'business_app_number_unknown'`, sin `Line` ni `Waba` nuevos.
  - Sin `phoneNumberId` y sin `businessApp`: 400 (como hoy).
  - Un número normal (`is_on_biz_app: false`, `NOT_APPLICABLE`): registra como hoy y `businessApp: false`.
  - `is_on_biz_app` responde un error de Meta: la conexión sigue (200), registra solo si `NOT_APPLICABLE` y el cuerpo no dijo `businessApp`.
  - Renovar (conectar otra vez el mismo número): `connectedAt` no cambia y `Waba.authorizedAt` sí avanza; una línea con `disconnectionReason` lo pierde al reconectar.
  - El formulario manual (`PUT /users/update-user-token-whatsapp`) con un número `is_on_biz_app: true`: no llama a `/register` y la línea queda `businessApp: true`.
  - El número deducido ya es de la cuenta B: 409 `phone_number_taken` (la comprobación va después de deducirlo) y nada guardado en A.
- [ ] **Paso 3:** `cd Backend && node --test tests/whatsapp.line.test.js && node --test --test-concurrency=2 tests/isolation/whatsapp.test.js` → FALLA.
- [ ] **Paso 4: Implementar.** En `connectWhatsappEmbedded`, si llega `businessApp` sin `phoneNumberId`: comprobar el WABA en otra cuenta → canjear el código → `resolveBusinessAppPhoneNumber({ token, waBusinessId })` (lista con `getWabaPhoneNumbers`, `readPhoneNumberPlatform` de cada uno si hay más de uno, `pickBusinessAppPhoneNumber`) → `isPhoneNumberTaken` y `checkLineLimit` con el número deducido → el resto como hoy. En los dos caminos, `readPhoneNumberPlatform` después de `verifyWabaPhoneNumber`, y su `onBusinessApp` (más `claimedBusinessApp` = lo que dijo el cuerpo, solo en el Embedded Signup) va a `registerIfNeeded` y a `applyConnection` (`businessApp: onBusinessApp === true`). Si el cuerpo dijo `businessApp` y Meta dice `false`, `console.warn` sin el número completo.
- [ ] **Paso 5:** el comando del paso 3 → PASA; `npm test` y `npm run test:isolation` en verde (en la oficina: `node --test --test-concurrency=2 "tests/isolation/*.test.js"`).
- [ ] **Paso 6:** actualizar `docs/arquitectura/whatsapp-envio.md` (Embedded Signup y registro: el camino de la app, `is_on_biz_app`, `authorizedAt`) y `docs/arquitectura/api.md` (el cuerpo de `POST /whatsapp/connect`).
- [ ] **Paso 7:** commit «Coexistencia: conectar un número de la app, por los dos caminos».

### Tarea 3: Leer un eco (funciones puras)

**Archivos:**
- Crear: `Backend/src/utils/business.app.js`
- Test: `Backend/tests/business.app.test.js`

**Interfaces:**
- Consume: `describeInboundMessage` de `utils/inbound.message.js`.
- Produce: `describeEcho(echoData, { connectedAt })` → `null` (descartar) o `{ waMessageId, toPhone, timestamp: Date, entrante }`, donde `entrante` es lo que devuelve `describeInboundMessage(echoData)`. Descarta: sin `id`; sin `to`; `type` `edit` o `revoke`; `timestamp` anterior a `connectedAt` (si hay `connectedAt`). Normaliza `to` a dígitos (Meta lo muestra con y sin `+`).
- Produce: `ECHO_IGNORED_TYPES = ['edit', 'revoke']`.

- [ ] **Paso 1: Tests que fallan:** texto; imagen con `caption` (el `text` es el pie, el tipo `image`); video; documento con `filename`; `edit` y `revoke` → `null`; sin `id` → `null`; sin `to` → `null`; `to: '+593990001111'` → `toPhone: '593990001111'`; `timestamp` anterior a `connectedAt` → `null` (comentario: «Regresión que vigila: un número que pasó a otra cuenta recibía ahí un eco viejo de la anterior»); un tipo desconocido → no es `null` y su `text` no está vacío.
- [ ] **Paso 2:** `node --test tests/business.app.test.js` → FALLA.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** → PASA.
- [ ] **Paso 5:** commit «Coexistencia: leer los mensajes enviados desde la app».

### Tarea 4: Guardar el eco (`procesarEco`)

**Archivos:**
- Modificar: `Backend/src/controllers/webhook.controller.js` (`procesarEco` junto a `procesarEntrante`, y el bloque `value.message_echoes` después de `messages`)
- Modificar: `Backend/src/services/line.service.js` (`findInboundLine` devuelve también `connectedAt`: la de la línea, o `null` en la reserva de `User`, que no filtra)
- Modificar: `Backend/src/models/message.model.js` (`origin` admite `'businessApp'`)
- Modificar: `Backend/src/utils/message.origin.js` y su test (`'businessApp'` es un origen válido)
- Modificar: `Backend/tests/isolation/helpers.js`: `postEcho(phoneNumberId, echoes)`; `openStream` gana `count(text)` (cuántas veces llegó); `recordQueries(fn)` registra con `mongoose.set('debug', …)` las escrituras hechas mientras corre `fn` (para contar las que ponen `bot.humanRepliedAt`)
- Test: `Backend/tests/message.origin.test.js` y `Backend/tests/isolation/webhook.test.js`

**Interfaces:**
- Consume: `describeEcho` (tarea 3); `resolveContact(accountId, { phone })`; `findOrCreateConversation`; `markHumanReply(conversationId)`; `descargarAdjunto(inbound, entrante)`; `sendToAccount(accountId, evento, datos, { lineId })`.
- Produce: el evento SSE `message_created` con el mismo contrato que un saliente (`sender: 'me'`, `origin: { kind: 'businessApp' }`) y `conversation_updated` con `{ id, unreadCount }`.

**El orden de `procesarEco`** (spec § 4; no se cambia): `findInboundLine` ya dio la línea → `describeEcho` con `connectedAt` de esa línea → contacto → conversación → **`Message.create` sin archivo** (E11000 → `return` sin efectos) → `markHumanReply` → `descargarAdjunto` y `Message.updateOne` con el archivo → conversación con dos `updateOne` condicionales (la vista previa y `lastMessageAt` si `lastMessage` está vacío —la conversación recién creada, que nace con `lastMessageAt` = ahora— **o** `lastMessageAt < t`; `unreadCount: 0` si `lastInboundAt` es nulo o `<= t`) → leer el `unreadCount` resultante → SSE `message_created` y `conversation_updated` → log sin texto. **Sin `notifyInbound`.**

- [ ] **Paso 1: Tests de aislamiento que fallan** en `isolation/webhook.test.js` (cuentas A y B, y la cuenta EQ con el agente de una línea que ya existen):
  - un eco de texto al número de A con `to` de un contacto nuevo: crea el contacto y la conversación en A, un `Message` saliente `origin: 'businessApp'`, sin `sentBy`; la conversación queda con `lastMessage` = el texto del eco y `lastMessageAt` = su hora; `lastInboundAt` sigue nulo (la ventana no se abre);
  - un eco con foto: el mensaje queda con `mediaFile` (Meta falso devuelve el PNG de `helpers.js`);
  - **dos entregas simultáneas del mismo eco** (`Promise.all`, dentro de `recordQueries`): un solo `Message`, **una sola** escritura de `bot.humanRepliedAt`, y en el SSE de A `count` da exactamente un `message_created` y un `conversation_updated` con ese id;
  - un eco con el `waMessageId` de un mensaje ya enviado desde Wasmish: no crea otro ni cambia la pausa;
  - no leídos: con `unreadCount: 2` y el último entrante **anterior** al eco → 0; con un entrante **posterior** → se conserva 2; la vista previa no retrocede con un eco más viejo que `lastMessageAt`;
  - `edit` y `revoke`: nada guardado, 200;
  - el eco de A no llega por SSE a B, y en la cuenta EQ no llega al agente sin acceso a esa línea;
  - el SSE de A trae `message_created` y `conversation_updated`;
  - un eco anterior a `connectedAt` de la línea: nada guardado;
  - **un número que pasó de una cuenta a otra**, con el webhook completo: el número 7xx conectado en C, desconectado, y conectado después en D; un eco con `timestamp` anterior a la conexión en D no crea nada en D ni en C;
  - un eco roto en medio de un lote con un entrante válido: el entrante se guarda y la respuesta es 200.
- [ ] **Paso 2:** `node --test --test-concurrency=2 tests/isolation/webhook.test.js` → FALLA.
- [ ] **Paso 3:** implementar `procesarEco`, el bloque del webhook con su `try/catch` por eco, el `enum` de `origin` y `messageOrigin`.
- [ ] **Paso 4:** → PASA; `npm test` y la suite de aislamiento en verde.
- [ ] **Paso 5:** actualizar `docs/arquitectura/webhook-adjuntos.md` (los ecos: orden, idempotencia, no leídos monótonos, sin push), `docs/arquitectura/respuestas-automaticas.md` (un eco pausa al bot como una respuesta manual) y `docs/arquitectura/chat.md` (`origin: 'businessApp'` y `conversation_updated` del eco).
- [ ] **Paso 6:** commit «Coexistencia: guardar lo que se responde desde la app».

### Tarea 5: `PARTNER_REMOVED`

**Archivos:**
- Modificar: `Backend/src/utils/business.app.js` (`parsePartnerRemoved`, `isStalePartnerRemoval`)
- Modificar: `Backend/src/services/line.service.js` (`disconnectRemovedWaba`)
- Modificar: `Backend/src/controllers/webhook.controller.js` (bloque `account_update` antes del `continue`; respuesta 500 al final si alguno quedó pendiente)
- Modificar: `Backend/tests/isolation/helpers.js`: `postWebhookBody(body)` firma y manda un cuerpo entero (varias `entry` y `changes` en una sola petición) y devuelve `{ status }`; `postWebhook` pasa a usarlo
- Test: `Backend/tests/business.app.test.js` y `Backend/tests/isolation/lines.test.js`

**Interfaces:**
- Produce: `parsePartnerRemoved(entry, change)` → `{ waBusinessId, reason, initiatedBy, at: Date }` o `null` (no es `account_update`, no es `PARTNER_REMOVED`, falta `waba_info.waba_id`). `reason` e `initiatedBy` son `null` sin `disconnection_info`.
- Produce: `isStalePartnerRemoval(at, authorizedAt)` → `true` si `authorizedAt` existe y `at <= authorizedAt` (comparando en segundos enteros).
- Produce: `disconnectRemovedWaba({ waBusinessId, reason, at })` → `{ status: 'done' | 'stale' | 'unknown_waba' | 'busy', lineIds }`. Busca el `Waba` por `waBusinessId` en cualquier cuenta; con `withLineLock(waba.accountId, …)` vuelve a leer el `Waba` y sus líneas activas, aplica `isStalePartnerRemoval`, desconecta cada línea con la lógica de `disconnectLine` (la línea por defecto, `writeLegacyUser`) y guarda `disconnectionReason` (`null` sin motivo). Si el candado está ocupado, reintenta 3 veces con 1 s de espera; después, `busy`.
- En `handleWebhook`: un `busy` marca el lote como pendiente; **se procesa el resto** y la respuesta final es `500` en vez de `200`.
- `disconnectLine` (manual) deja `disconnectionReason: null`.

- [ ] **Paso 1: Tests puros que fallan:** `parsePartnerRemoved` con el ejemplo de Meta (`entry.id` distinto de `waba_info.waba_id`: gana `waba_info.waba_id`; `at` = `entry.time` en segundos); sin `disconnection_info`; sin `waba_info`; con `ACCOUNT_OFFBOARDED`. `isStalePartnerRemoval` anterior, igual, posterior y sin `authorizedAt`.
- [ ] **Paso 2: Tests de aislamiento que fallan** en `isolation/lines.test.js`:
  - `PARTNER_REMOVED` del WABA de A con `PRIMARY_INACTIVITY`: la línea de A queda desconectada con ese motivo; B intacta;
  - un cliente normal con dos líneas en el WABA, sin `disconnection_info`: las dos desconectadas, motivo `null`, y `Account.defaultLineId` en `null` (o en otra línea activa de otro WABA si la hay);
  - repetido: la segunda vez, nada cambia;
  - atrasado tras una **renovación** (`at` anterior a `Waba.authorizedAt`): no desconecta;
  - un `Waba` sin `authorizedAt`: desconecta;
  - WABA desconocido: 200 y nada cambia;
  - con el candado ocupado (tomarlo con `withLineLock` en el test mientras llega el webhook): **un solo cuerpo** con un entrante al número de A y el `account_update` de su WABA, enviado con `postWebhookBody`. El entrante se guarda y la respuesta es 500. Se reenvía **el mismo cuerpo** con el candado libre: 200, la línea desconectada, un solo `Message` del entrante, `pushCalls` sin un segundo aviso y un solo trabajo del bot;
  - **la API pública después del evento** (con `twoLines` y `sendOtp` de este archivo): enviar por la línea retirada da 409 sin llamar a Meta; sin ninguna línea activa, el envío sin selector también se bloquea; con otra línea activa de otro WABA, el envío sin selector sale por ese número y busca sus plantillas.
- [ ] **Paso 3:** `node --test tests/business.app.test.js && node --test --test-concurrency=2 tests/isolation/lines.test.js` → FALLA.
- [ ] **Paso 4:** implementar.
- [ ] **Paso 5:** → PASA; suites completas en verde.
- [ ] **Paso 6:** actualizar `docs/arquitectura/webhook-adjuntos.md` (`account_update`, el 500 y por qué es seguro) y `docs/arquitectura/whatsapp-envio.md` (desconexión por Meta, `authorizedAt`).
- [ ] **Paso 7:** commit «Coexistencia: desconectar las líneas cuando Meta retira el acceso».

### Tarea 6: Simular sin Meta, y cerrar el PR del backend

**Archivos:**
- Modificar: `Backend/scripts/simulate-webhook.js` (los avisos `eco` y `retiro-acceso [--reason R]`, con los nombres de los que ya tiene)
- Modificar: `docs/arquitectura/pruebas-y-scripts.md`, `docs/estado.md` («En curso»)

- [ ] **Paso 1:** `eco` manda un eco de texto al contacto de prueba (`--from`), firmado como hoy; `retiro-acceso --reason PRIMARY_INACTIVITY` manda el `account_update` del WABA de la línea activa con la forma del ejemplo de Meta (`entry.id` distinto del WABA).
- [ ] **Paso 2:** probarlo contra un backend local en otro puerto (3999, como en `pruebas-navegador-local` de la memoria), con una BD desechable: el eco aparece en la conversación y `retiro-acceso` desconecta la línea. Limpiar con `--clean`.
- [ ] **Paso 3:** `npm test`, `npm run test:isolation` y `node .github/scripts/check-docs.mjs` en verde.
- [ ] **Paso 4:** commit, abrir el **PR del backend** contra `master` y revisión cruzada de Codex (`codex exec … < /dev/null`), responder punto por punto. Jonathan lo une; **se puede desplegar solo**.

---

## PR 2 · Frontend (rama nueva desde `master` con el backend unido)

Antes de cada tarea visual, la skill `brand-guidelines`. Se sigue el diseño pantalla por pantalla; los únicos cambios son los textos del spec (abajo).

**Textos que cambian respecto del diseño** (decisión de Jonathan, 2026-10-16):
- La marca del chat: **«Desde la app de WhatsApp»** (3a y 3b).
- En la explicación del «Sí» (1c y m2), «SIGUE IGUAL»: «Sigues respondiendo desde la app, con el mismo número. Tu equipo atiende además desde Wasmish. Desde ahora, lo que escriben tus clientes llega a los dos lados, y lo que respondas desde la app (textos, fotos, videos y documentos) se ve también en Wasmish. Los grupos no pasan a Wasmish.»
- En «CAMBIA», el punto de dispositivos: «WhatsApp para Windows y para relojes (WearOS) dejan de funcionar con este número. WhatsApp Web y los demás dispositivos sí: al conectar se desvinculan todos y los vuelves a vincular.»
- En «CAMBIA», un punto más: «Desde Wasmish, las reglas de WhatsApp siguen igual: pasadas 24 horas desde el último mensaje del cliente, para escribirle hace falta una plantilla, aunque desde la app se le haya respondido.»

### Tarea 7: Conectar por el camino de la app (hook y servicio)

**Archivos:**
- Crear: `Frontend/src/utils/embeddedSignup.ts`
- Modificar: `Frontend/src/hooks/useConnectWhatsapp.ts`, `Frontend/src/services/api.service.ts`, `Frontend/src/models/line.model.ts`

**Interfaces:**
- Produce: `embeddedSignupFinish(data: unknown): { waBusinessId: string; phoneNumberId: string | null; businessApp: boolean } | null`. `FINISH` exige `waba_id` y `phone_number_id`; `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` exige `waba_id` y devuelve `phoneNumberId: null`, `businessApp: true`; cualquier otra cosa → `null`.
- Produce: `connect({ businessApp }: { businessApp: boolean })`: `featureType` = `'whatsapp_business_app_onboarding'` o `''`; el resto de `extras` igual.
- Produce: `connectWhatsappService({ code, waBusinessId, phoneNumberId, businessApp })` (objeto, no posicional).
- Produce: `Line.businessApp: boolean` y `Line.disconnectionReason: DisconnectionReason | null`.

- [ ] **Paso 1:** implementar; `cd Frontend && npm run lint && npm run build` en verde.
- [ ] **Paso 2:** commit «Coexistencia: conectar por el camino de la app».

### Tarea 8: La pregunta antes de Facebook y las líneas (Ajustes → Líneas)

**Archivos:**
- Crear: `Frontend/src/pages/private/Settings/Lines/ConnectQuestion.tsx` (1a–1c y 1e en computadora; m1–m2 a pantalla completa en el celular)
- Crear: `Frontend/src/utils/disconnectionReason.ts` (la tabla 2d: motivo → `{ why, whatToDo }`, con `null` = «Meta no dijo por qué.»)
- Modificar: `LinesCard.tsx` («Conectar WhatsApp», «Reintentar» y «Conectar otro número» abren la pregunta; el «Conectando…» de 1d/m3 con su texto en este camino), `LineRow.tsx` («Junto con la app de WhatsApp Business» de 2a; el aviso ámbar de 2b/2c con «Volver a conectar», que abre la pregunta **ya en «Sí»**)

- [ ] **Paso 1:** implementar siguiendo el diseño, con los textos de arriba.
- [ ] **Paso 2:** `npm run lint && npm run build` en verde.
- [ ] **Paso 3:** en Chrome, con el backend local en 3999 y datos sembrados (memoria `pruebas-navegador-local`): computadora y teléfono emulado; «No» abre Facebook como hoy (se puede comprobar hasta el `FB.login` con un SDK falso o mirando los `extras`); «Sí» → 1c → «Seguir con Facebook»; una línea `businessApp` (2a) y una desconectada con cada motivo de 2d (sembrados en la BD).
- [ ] **Paso 4:** commit «Coexistencia: la pregunta antes de conectar y el estado de las líneas».

### Tarea 9: El chat (marca, orden y bandeja)

**Archivos:**
- Modificar: `Frontend/src/models/message.mode.ts:56` (`'businessApp'` en la unión de `origin.kind`, junto a `chat`, `api` y `bot`)
- Modificar: `Frontend/src/components/Chat/ChatThread.tsx` (`origin.kind === 'businessApp'` → «Desde la app de WhatsApp», donde va «Bot», como en 3a)
- Modificar: `Frontend/src/hooks/useConversationMessages.ts` (un `message_created` se inserta según su `timestamp`)
- Modificar: `Frontend/src/hooks/useConversations.ts` (`lastMessage` y `updatedAt` solo con un mensaje más nuevo)
- Modificar: `docs/arquitectura/chat.md`, `docs/arquitectura/frontend.md`

- [ ] **Paso 1:** implementar.
- [ ] **Paso 2:** `npm run lint && npm run build` en verde.
- [ ] **Paso 3:** en Chrome con el backend local: `webhook:simulate --echo` con texto y con foto en una conversación abierta → se pinta con la marca y la foto, en su sitio; la bandeja baja el contador (3b) y un eco más viejo que el último mensaje no cambia la vista previa.
- [ ] **Paso 4:** commit, **PR del frontend**, revisión de Codex y respuesta. Jonathan lo une.

---

## Después de los dos PRs (con Jonathan)

- [ ] **En el panel de Meta** (Jonathan): suscribir `smb_message_echoes`, `history` y `smb_app_state_sync`; comprobar `account_update`; añadir la conexión de cuentas de la app a la configuración del Embedded Signup si el panel lo pide.
- [ ] **Versión** en un PR (`npm run version:bump patch`, `estado.md`) y **despliegue con `/deploy`**: sin migración ni variables nuevas.
- [ ] **La prueba real** del spec, § 7, con el número de la memoria de Jonathan. Anotar qué pasa con una nota de voz enviada desde la app. Si algo no cuadra con lo que dice Meta, se corrige el spec y el código antes de vender.
- [ ] **Recién entonces**, la página y el guion de ventas (en la carpeta comercial privada).
