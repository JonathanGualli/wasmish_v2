# Respuestas automáticas (chatbot v1) — Implementation Plan

> **Para quien lo ejecute:** en Wasmish los planes se ejecutan **nativo** (rama, PR, revisión cruzada; ver «Planes» en `AGENTS.md`). Las referencias de `writing-plans` a `subagent-driven-development` o `executing-plans` no aplican. Los pasos usan casillas (`- [ ]`).

**Goal:** Que cada cuenta pueda encender respuestas automáticas de texto (bienvenida, fuera de horario y palabras clave) que salen combinadas en un solo mensaje, se callan cuando una persona atiende y no se pierden ni se duplican con reinicios o ráfagas.

**Architecture:** Una función pura (`decideAutoReply`) decide qué responder. El trabajo vive en el propio `Message` entrante (`Message.bot`), que el webhook marca al guardarlo; un worker dentro de la API (como el de campañas) lo toma de forma atómica, con candado por conversación, y envía por `processMessageSending` con `origin: 'bot'`. Un barrido recupera lo que quedó a medias; lo que pudo haberse enviado (`uncertain`) no se reintenta.

**Tech Stack:** Express 5, Mongoose 8, Zod, `node:test`, `mongodb-memory-server`, `Intl` (zonas horarias, sin librerías nuevas); React 19, TypeScript, React Query, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-15-respuestas-automaticas-design.md`. Brief de la UI: `docs/superpowers/specs/2026-10-15-respuestas-automaticas-brief-ui.md` (el diseño de Claude Design entra al repo con el PR de la UI).

## Global Constraints

- **Apagado por defecto:** sin documento `AutoReplySettings` o con `enabled: false`, el webhook no crea trabajos y nada cambia para la cuenta.
- **El webhook no se cae ni espera al bot** (regla 7): preparar el trabajo y marcarlo listo van en `try/catch` propios; si fallan, el entrante se guarda igual y el barrido lo recupera o se pierde solo la respuesta automática.
- **Un solo camino por envío:** el bot envía con `processMessageSending` (`origin: 'bot'`, `sender: null`). No llama a Meta por su cuenta.
- **El bot no marca leída la conversación** (no llama a `markConversationRead`).
- **Valores:** textos 1–800 caracteres (`AUTO_REPLY_TEXT_MAX = 800`); hasta 30 reglas (`KEYWORD_RULES_MAX`), 1–20 frases por regla (`KEYWORDS_PER_RULE_MAX`), cada frase 1–60 (`KEYWORD_MAX`); hasta 3 palabras clave por respuesta (`KEYWORD_REPLIES_MAX`); la misma regla no se repite en 24 h en una conversación (`KEYWORD_COOLDOWN_MS`); freno: 3 respuestas del bot en 10 minutos por conversación (`BURST_MAX`, `BURST_WINDOW_MS`); `handoffHours` ∈ {1, 4, 12, 24} (12); `returnAfterDays` ∈ {7, 30, 90, null} (30); zona por defecto `'America/Guayaquil'`; partes unidas con `'\n\n'`; un trabajo caduca a los 10 minutos del entrante (`AUTO_REPLY_EXPIRY_MS`).
- **Worker:** hasta 5 trabajos a la vez; `leaseUntil` y candado **del contacto** de 60 s; candado ocupado → `pending` con `runAfter` +2 s; barrido cada 30 s y al arrancar; un `waiting` de más de 30 s vuelve a `pending`; al parar, espera los envíos en curso hasta 8 s.
- **Ni el texto del mensaje ni el de la respuesta van a los logs**: ids, estado, motivo y antigüedad.
- **Permiso nuevo `autoReplies.manage`: owner y admin.** La API key no lo tiene.
- Identificadores nuevos en inglés; textos al usuario, comentarios, commits y documentación, en español. Errores como `[{ message, code }]`. Commits sin coautor ni atribución.
- **Tres PRs**, cada uno con su rama: el motor y la configuración (Tareas 1 a 4, `respuestas-automaticas-motor`, que lleva este plan como primer commit), el envío (Tareas 5 a 8, `respuestas-automaticas-envio`) y la página (Tarea 9, `respuestas-automaticas-ui`, cuando esté el diseño). El PR 1 no cambia nada de lo que ya funciona.
- Comprobar con `cd Backend && npm test && npm run test:isolation` y `cd Frontend && npm run lint && npm run build`.

## Review Focus

- **Ráfaga del mismo contacto** («hola» y «cuánto está?» con un segundo de diferencia, en dos webhooks): sale la bienvenida y después el precio; nunca dos bienvenidas → test en la Tarea 7.
- **Una persona responde mientras el trabajo espera o mientras el bot decide** (entre el webhook y la llamada a Meta): el bot se calla (`human`) → tests en la Tarea 7.
- **Apagan las respuestas o borran la regla entre recibir y responder:** el worker relee la configuración y no envía (`disabled` o `no_match`) → test en la Tarea 7.
- **Meta reintenta el webhook** con el mismo `waMessageId`: un solo trabajo y una sola respuesta → test en la Tarea 6.
- **Un tramo cerrado que cruza la medianoche y el fin de semana**, en otra zona horaria: sábado 15:00 y lunes 7:59 dan la misma clave; lunes 8:00 está abierto → test en la Tarea 2.

---

### Task 1: Normalizar el texto y encontrar palabras clave (PR 1, rama `respuestas-automaticas-motor`)

**Files:**
- Create: `Backend/src/utils/auto.reply.js`
- Test: `Backend/tests/auto.reply.test.js`

**Interfaces:**
- Produces (en `utils/auto.reply.js`):
  - Las constantes de «Global Constraints» (`AUTO_REPLY_TEXT_MAX`, `KEYWORD_RULES_MAX`, `KEYWORDS_PER_RULE_MAX`, `KEYWORD_MAX`, `KEYWORD_REPLIES_MAX`, `KEYWORD_COOLDOWN_MS`, `BURST_MAX`, `BURST_WINDOW_MS`, `AUTO_REPLY_EXPIRY_MS`, `HANDOFF_HOURS = [1, 4, 12, 24]`, `RETURN_AFTER_DAYS = [7, 30, 90, null]`, `DEFAULT_TIMEZONE`).
  - `normalizeForMatch(text: string) → string`: NFD sin marcas diacríticas (`\p{M}`), minúsculas, todo lo que no sea letra o número (`[^\p{L}\p{N}]`) como espacio, espacios repetidos como uno, sin bordes.
  - `matchesKeyword(normalizedText: string, keyword: string) → boolean`: `normalizeForMatch(keyword)` no vacío y contenido en `normalizedText` como palabras completas (`` ` ${normalizedText} ` `` incluye `` ` ${kw} ` ``).
  - `inboundMatchText({ type, text, caption }) → string | null`: el `text` si `type === 'text'`; si no, el `caption` (o `null`).

- [ ] **Step 1: Escribir los tests que fallan** en `Backend/tests/auto.reply.test.js`:
  - `normalizeForMatch quita tildes, mayúsculas y puntuación`: `'¿Cuánto   CUESTA, el Envío?'` → `'cuanto cuesta el envio'`; `'Ñandú!!'` → `'nandu'`.
  - `matchesKeyword por palabras completas`: con `normalizeForMatch('hola, cuál es el precio?')`: `'precio'` → `true`; `'Precio'` → `true`; `'el precio'` → `true`; `'cual es'` → `true`. Con `normalizeForMatch('qué preciosa la muñeca')`: `'precio'` → `false` (comentario: «preciosa» respondía con los precios). `'¿?'` (vacío al normalizar) → `false`.
  - `inboundMatchText`: `{ type: 'text', text: 'precio' }` → `'precio'`; `{ type: 'image', text: 'Imagen', caption: null }` → `null` (comentario: la etiqueta automática nunca dispara una regla); `{ type: 'image', text: 'cuánto este?', caption: 'cuánto este?' }` → `'cuánto este?'`.

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `cd Backend && node --test tests/auto.reply.test.js`
Expected: FAIL, `Cannot find module '../src/utils/auto.reply.js'`.

- [ ] **Step 3: Implementar** las constantes y las tres funciones.

- [ ] **Step 4: Correr los tests**

Run: `cd Backend && npm test`
Expected: PASS, también los que ya había.

- [ ] **Step 5: Commit** — `git commit -m "respuestas automáticas: normalizar el texto y encontrar palabras clave"`

---

### Task 2: El horario de atención y la clave del tramo cerrado (PR 1)

**Files:**
- Create: `Backend/src/utils/business.hours.js`
- Test: `Backend/tests/business.hours.test.js`

**Interfaces:**
- Produces (en `utils/business.hours.js`):
  - `WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']`.
  - `isValidTimeZone(timeZone: string) → boolean` (`new Intl.DateTimeFormat('en', { timeZone })` en un `try`).
  - `scheduleIssue(schedule) → string | null`: el mensaje del primer problema o `null`. Exige las 7 claves; cada día `{ closed: boolean, ranges }`; hasta 2 tramos; `HH:mm` de `00:00` a `23:59`, y `end` admite además `'24:00'`; `start < end`; los dos tramos de un día sin solaparse; un día abierto con al menos un tramo.
  - `localClock(now: Date, timeZone: string) → { dateKey: 'YYYY-MM-DD', day: WeekDay, minutes: number }` (`Intl.DateTimeFormat` con `hourCycle: 'h23'`).
  - `closedPeriodKey(schedule, timeZone, now = new Date()) → string | null`: `null` si ahora cae en un tramo abierto (`start <= minutos < end`); si no, `` `${dateKey}T${end}` `` del **último cierre** antes de ahora, buscando hoy y hasta 7 días atrás (fechas de calendario locales, sin convertir a instantes); `'closed'` si no hay ninguno.

- [ ] **Step 1: Escribir los tests que fallan** en `Backend/tests/business.hours.test.js`, con un horario de lunes a viernes `08:00–13:00` y `14:30–18:00`, sábado `09:00–13:00` y domingo cerrado, en `America/Guayaquil` (UTC−5, sin horario de verano):
  - `abierto dentro de un tramo`: miércoles 10:00 local → `null`.
  - `cerrado al mediodía`: miércoles 13:30 → `'<miércoles>T13:00'`.
  - `de la noche a la mañana siguiente es un solo tramo`: viernes 2026-10-16 19:00 → `'2026-10-16T18:00'`; sábado 08:59 → la misma clave; sábado 09:00 → `null`.
  - `del sábado al lunes es un solo tramo`: sábado 15:00, domingo 12:00 y lunes 2026-10-19 07:59 → `'2026-10-17T13:00'`; lunes 08:00 → `null`.
  - `un día abierto 00:00–24:00 está abierto a las 23:59`.
  - `otra zona horaria`: el instante `2026-10-16T00:30:00Z` en `America/Guayaquil` es jueves 19:30 → `'2026-10-15T18:00'`, y en `Europe/Madrid` viernes 02:30 → también `'2026-10-15T18:00'`, pero el de Madrid.
  - `scheduleIssue`: tres tramos → mensaje; `'08:00'–'08:00'` → mensaje; tramos `08:00–13:00` y `12:00–18:00` → mensaje; `'25:00'` → mensaje; `end: '24:00'` → `null`; falta `sun` → mensaje.
  - `isValidTimeZone`: `'America/Guayaquil'` → `true`; `'Marte/Base'` → `false`.

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `cd Backend && node --test tests/business.hours.test.js`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementar** `utils/business.hours.js`. Para retroceder días, sumar y restar sobre `Date.UTC(año, mes, día)` del `dateKey` (calendario, no instantes); el día de la semana sale de esa misma fecha UTC.

- [ ] **Step 4: Correr los tests**

Run: `cd Backend && npm test`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "respuestas automáticas: horario de atención y tramo cerrado"`

---

### Task 3: Decidir la respuesta (PR 1)

**Files:**
- Modify: `Backend/src/utils/auto.reply.js`
- Test: `Backend/tests/auto.reply.test.js`

**Interfaces:**
- Consumes: Tarea 1; `closedPeriodKey` (Tarea 2).
- Produces (en `utils/auto.reply.js`):
  - `defaultAutoReplySettings() → Settings`: `{ enabled: false, timezone: DEFAULT_TIMEZONE, handoffHours: 12, welcome: { enabled: false, text: '', returnAfterDays: 30 }, outOfHours: { enabled: false, text: '', schedule: <lunes a viernes 08:00–18:00, sábado y domingo cerrados> }, keywordRules: [] }`.
  - `decideAutoReply({ settings, state, welcomedAt, message, previousInboundAt, lineId, now }) → { parts: string[], text: string, claims: { welcomed: boolean, outOfHoursKey: string | null, keywordRuleIds: string[] } } | { skip: 'disabled' | 'human' | 'burst' | 'ignored_type' | 'no_match' }`. `state` = `Conversation.bot` (o `{}`); `welcomedAt` = `Contact.autoReply.welcomedAt` (o `null`); `message` = `{ type, text, caption }`; `lineId` string o `null`. Orden de los `skip` y de las partes: el del spec, § 4.1.
  - `botStateUpdate(state, claims, now) → Record<string, unknown>`: el `$set` de `Conversation` tras un envío aceptado: `bot.outOfHoursNotified` (si hay clave), `bot.keywordRepliedAt.<id>` por regla y `bot.recentReplies` = las fechas de `state.recentReplies` dentro de `BURST_WINDOW_MS` más `now`, las últimas `BURST_MAX`.

- [ ] **Step 1: Escribir los tests que fallan** (añadir a `tests/auto.reply.test.js`), con una configuración encendida de bienvenida «¡Hola!», fuera de horario «Estamos cerrados» (el horario de la Tarea 2) y reglas `precio` → «Cuesta $10» y `ubicacion`/`donde quedan` → «Estamos en el centro»:
  - `apagado no responde`: `enabled: false` → `{ skip: 'disabled' }`.
  - `contacto nuevo fuera de horario preguntando dos cosas`: `previousInboundAt: null`, sábado 22:00, `'hola, precio y dónde quedan?'` → `parts` = `['¡Hola!', 'Cuesta $10', 'Estamos en el centro', 'Estamos cerrados']` y `text` las une con `'\n\n'`; `claims.welcomed`, la clave del sábado 13:00 y los dos ids.
  - `la bienvenida vuelve a los 31 días y no a los 29` (`returnAfterDays: 30`); con `returnAfterDays: null`, solo si `previousInboundAt` es null; con `welcomedAt` de hace 1 hora y `previousInboundAt: null` → sin bienvenida (comentario: la ráfaga del primer contacto daba dos bienvenidas).
  - `una persona atendiendo calla al bot`: `state.humanRepliedAt` hace 11 h con `handoffHours: 12` → `{ skip: 'human' }`; hace 13 h → responde.
  - `el freno`: `state.recentReplies` con 3 fechas en los últimos 10 minutos → `{ skip: 'burst' }`; con 2 → responde.
  - `una reacción no dispara nada`: `type: 'reaction'` → `{ skip: 'ignored_type' }`.
  - `fuera de horario, una vez por tramo`: `state.outOfHoursNotified` igual a la clave actual → sin esa parte.
  - `palabras clave`: como mucho 3 (con 4 reglas que coinciden, salen las 3 primeras de la lista); una regla apagada no sale; una con `keywordRepliedAt` de hace 2 h no sale y de hace 25 h sí; dos reglas con el mismo texto salen una vez; una regla con `lineIds: ['l2']` no responde en `lineId: 'l1'` y con `lineIds: []` sí.
  - `un sticker de un contacto nuevo recibe la bienvenida` y `una imagen sin caption no dispara palabras clave`.
  - `nada que responder`: dentro de horario, contacto conocido, texto sin coincidencias → `{ skip: 'no_match' }`.
  - `botStateUpdate` guarda la clave del tramo y las reglas, y deja como mucho 3 fechas en `recentReplies`, descartando las de hace más de 10 minutos (la bienvenida no va aquí: se marca en el contacto).

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `cd Backend && node --test tests/auto.reply.test.js`
Expected: FAIL en los tests nuevos.

- [ ] **Step 3: Implementar** `defaultAutoReplySettings`, `decideAutoReply` y `botStateUpdate`.

- [ ] **Step 4: Correr los tests**

Run: `cd Backend && npm test`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "respuestas automáticas: decidir la respuesta (función pura)"`

---

### Task 4: Guardar la configuración y probarla (PR 1)

**Files:**
- Create: `Backend/src/models/auto.reply.settings.model.js`, `Backend/src/schemas/auto.reply.schema.js`, `Backend/src/controllers/auto.reply.controller.js`, `Backend/src/routes/auto.reply.routes.js`
- Modify: `Backend/src/utils/permissions.js`, `Backend/src/app.js`, `Backend/tests/permissions.test.js`, `Backend/tests/isolation/helpers.js` (exportar el modelo)
- Test: `Backend/tests/isolation/auto-replies.test.js`

**Interfaces:**
- Consumes: Tareas 1 a 3.
- Produces:
  - `PERMISSIONS['autoReplies.manage'] = ['owner', 'admin']`.
  - Modelo `AutoReplySettings` (spec § 5), con `userId` (ObjectId, ref `User`, required) e índice único `auto_reply_settings_account_unique` `{ userId: 1 }`; las reglas, subdocumentos con `_id`.
  - `autoReplySettingsSchema` (Zod): los límites de «Global Constraints»; `timezone` con `isValidTimeZone`; `schedule` con `scheduleIssue`; un texto vacío solo si su regla está apagada; `outOfHours.enabled` exige algún día abierto; `keywordRules[].id` opcional (string). `previewSchema` = `{ settings: autoReplySettingsSchema, text: string 1–1000 }`.
  - Rutas (con `authRequired` y `requirePermission('autoReplies.manage')`):
    - `GET /api/auto-replies` → `200` la configuración con cada regla como `{ id, enabled, keywords, text, lineIds }` (sin documento, `defaultAutoReplySettings()` con `keywordRules: []`).
    - `PUT /api/auto-replies` → `autoReplySettingsSchema.parse(req.body)` (el validador no reemplaza el body) y `findOneAndUpdate({ userId: accountId }, …, { upsert: true, new: true })`; conserva el `_id` de las reglas que traen `id` y estrena los demás → `200` con la misma forma que el GET. `lineIds` que no son líneas de la cuenta → `400`.
    - `POST /api/auto-replies/preview` → `decideAutoReply` con `{ ...settings, enabled: true }`, `state: {}`, `previousInboundAt: null`, `message: { type: 'text', text }`, `lineId: null`, ahora → `200 { reply: string | null, parts: string[], matchedRuleIndexes: number[], outOfHours: boolean }` (posiciones en la lista enviada: una regla nueva no tiene id; cambiado al implementar).

- [ ] **Step 1: Escribir los tests que fallan** en `Backend/tests/isolation/auto-replies.test.js` (con `seedAccount`, `seedMember`, `request`):
  - `A guarda su configuración y B no la ve`: A hace `PUT` con una regla; el `GET` de A la devuelve con su `id`; el `GET` de B da la de por defecto (apagada, sin reglas).
  - `guardar otra vez conserva el id de las reglas`.
  - `un agente y un supervisor reciben 403; sin sesión, 401`.
  - `una regla con lineIds de una línea de B da 400`.
  - `un horario con tres tramos o una zona inválida da 400`.
  - `preview responde con la configuración sin guardar`: con bienvenida encendida y una regla `precio`, `text: 'precio?'` → `reply` con las dos partes; nada se guardó (el `GET` sigue igual).
  - En `tests/permissions.test.js`: `autoReplies.manage` solo owner y admin.

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `cd Backend && node --test tests/isolation/auto-replies.test.js`
Expected: FAIL con 404 en las rutas.

- [ ] **Step 3: Implementar** el modelo, el esquema, el controlador (`getAutoReplies`, `saveAutoReplies`, `previewAutoReply`), las rutas, el permiso y montar las rutas en `app.js`.

- [ ] **Step 4: Correr todo**

Run: `cd Backend && npm test && npm run test:isolation`
Expected: PASS.

- [ ] **Step 5: Documentar** en un archivo nuevo, `docs/arquitectura/respuestas-automaticas.md` (índice al principio, como los demás): la configuración, las reglas y la decisión; la ruta en la tabla de `api.md` y el permiso en «Roles y permisos»; el archivo en el mapa de `AGENTS.md` y en la tabla de `Backend/AGENTS.md`, y las tres utilidades en su lista de tests puros. El CI falla si el archivo no está en el mapa.

- [ ] **Step 6: Commit** — `git commit -m "respuestas automáticas: guardar la configuración y probarla"`

Antes de abrir el PR 1: `docs/estado.md` «En curso» con el PR 1 y el resto del plan.

---

### Task 5: El origen «bot» y la pausa por respuesta manual (PR 2, rama `respuestas-automaticas-envio`)

**Files:**
- Create: `Backend/src/services/auto.reply.service.js`
- Modify: `Backend/src/models/message.model.js`, `Backend/src/models/conversation.model.js`, `Backend/src/models/contact.model.js`, `Backend/src/controllers/chat.controller.js`, `Backend/tests/message.origin.test.js`
- Test: `Backend/tests/isolation/auto-replies.test.js`

**Interfaces:**
- Produces:
  - `Message.origin` admite `'bot'`; `Message.bot` (spec § 5; todo con `default` nulo salvo `attempts: 0`, sin `default` en el subdocumento: los mensajes sin bot no lo llevan); índice `auto_reply_queue` `{ 'bot.status': 1, 'bot.runAfter': 1 }` parcial con `{ 'bot.active': true }`.
  - `Conversation.bot` (spec § 5), con `keywordRepliedAt` como `Map` de fechas y `recentReplies: [Date]`.
  - `Contact.autoReply`: `{ welcomedAt: Date | null, lockUntil: Date | null, lockToken: String | null }`.
  - `processMessageSending({ …, origin = 'chat' })`: guarda ese `origin`.
  - `markHumanReply(conversationId) → Promise<void>` en `services/auto.reply.service.js`: `updateOne({ _id }, { $set: { 'bot.humanRepliedAt': new Date() } })`; nunca lanza (log del error con el id).
  - En `chat.controller.js`, siempre **después** de comprobar la propiedad y la línea (lo ajeno sigue dando 404 sin tocar nada) y **antes** de enviar:
    - `sendMessageController` con id, `sendMediaMessageController` y `sendConversationTemplateController`: sobre la conversación;
    - `sendMessageController` sin id y `startConversationTemplateController`: sobre la que ya exista de ese número en esa línea (`findConversationByNumber`, que ya está en el archivo), y otra vez **después** sobre `msg.conversationId` / `resultado.conversation._id`, por si el envío la creó.

- [ ] **Step 1: Escribir los tests que fallan:**
  - `tests/message.origin.test.js`: `messageOrigin({ origin: 'bot' })` → `{ kind: 'bot' }`.
  - En `tests/isolation/auto-replies.test.js`:
    - `responder a mano pausa el bot`, por las cinco rutas: texto con id, archivo, plantilla en la conversación, texto **sin id** a un número que ya tiene conversación y conversación nueva con plantilla a ese número → `bot.humanRepliedAt` puesto en la conversación existente;
    - `una campaña y la API pública no lo pausan` (`processNext` de una campaña y `POST /api/v1/templates/send` a ese contacto → `humanRepliedAt` sigue `null`);
    - `un agente sin acceso a la línea recibe 404 y no pausa nada`.

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `cd Backend && npm test && node --test tests/isolation/auto-replies.test.js`
Expected: FAIL en los nuevos.

- [ ] **Step 3: Implementar** los campos, el parámetro `origin`, `markHumanReply` y sus llamadas.

- [ ] **Step 4: Correr todo**

Run: `cd Backend && npm test && npm run test:isolation`
Expected: PASS, incluidos los de chats, campañas y la API pública (no cambian).

- [ ] **Step 5: Commit** — `git commit -m "respuestas automáticas: origen bot y pausa al responder a mano"`

---

### Task 6: El webhook deja el trabajo en el entrante (PR 2)

**Files:**
- Modify: `Backend/src/services/auto.reply.service.js`, `Backend/src/controllers/webhook.controller.js`
- Test: `Backend/tests/isolation/auto-replies.test.js`

**Interfaces:**
- Consumes: Tarea 5; `AutoReplySettings` (Tarea 4).
- Produces (en `services/auto.reply.service.js`):
  - `buildAutoReplyJob({ accountId, contactId, type, now }) → Promise<object | null>`: `null` si la cuenta no tiene las respuestas encendidas o `type === 'reaction'`; si no, `{ status: 'waiting', active: true, previousInboundAt, runAfter: now, attempts: 0 }`, con `previousInboundAt` = el `lastInboundAt` más reciente de las conversaciones de ese contacto **en la cuenta**, leído de la BD antes de guardar la conversación. Nunca lanza: si falla, log y `null`.
  - `wakeAutoReplyWorker()` lo exporta la Tarea 7; aquí se importa y se llama (sin worker en marcha no hace nada).
  - En `procesarEntrante`: `bot` en el `Message.create`; después del `sendToAccount`, `Message.updateOne({ _id, 'bot.status': 'waiting' }, { $set: { 'bot.status': 'pending' } })` y `wakeAutoReplyWorker()`, en un `try/catch` propio.

- [ ] **Step 1: Escribir los tests que fallan:**
  - `con las respuestas encendidas, el entrante queda pendiente de bot`: `postWebhook` de A → el `Message` tiene `bot.status: 'pending'`, `previousInboundAt: null`; un segundo entrante → `previousInboundAt` = la hora del primero.
  - `apagadas o sin configuración, el entrante no lleva bot` (B).
  - `una reacción no deja trabajo`.
  - `Meta reintenta el webhook: un solo mensaje y un solo trabajo` (el mismo `waMessageId` dos veces).
  - `el contacto que ya escribió a otra línea de la cuenta no es nuevo` (dos líneas, `maxLines: 2`).
  - `si preparar el trabajo falla, el entrante se guarda igual y el siguiente del lote también` (con `AutoReplySettings.findOne` cambiado en el test para que lance, y restaurado después): dos mensajes en un `postWebhook`, los dos guardados sin `bot`, respuesta 200.

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `cd Backend && node --test tests/isolation/auto-replies.test.js`
Expected: FAIL en los nuevos.

- [ ] **Step 3: Implementar** `buildAutoReplyJob` y los cambios en `procesarEntrante`. Una función vacía `wakeAutoReplyWorker` en el archivo del worker basta hasta la Tarea 7.

- [ ] **Step 4: Correr todo**

Run: `cd Backend && npm test && npm run test:isolation`
Expected: PASS, también `webhook.test.js` y `push.test.js` sin cambios.

- [ ] **Step 5: Commit** — `git commit -m "respuestas automáticas: el webhook deja el trabajo en el entrante"`

---

### Task 7: El worker que responde (PR 2)

**Files:**
- Create: `Backend/src/workers/auto.reply.worker.js`
- Modify: `Backend/src/index.js`, `Backend/src/utils/auto.reply.js` (`autoReplyOutcome`)
- Test: `Backend/tests/isolation/auto-replies.test.js`, `Backend/tests/auto.reply.test.js`

**Interfaces:**
- Consumes: Tareas 3, 5 y 6; `processMessageSending`, `findConversationLine`, `freeTextBlockReason`.
- Produces (en `workers/auto.reply.worker.js`):
  - `startAutoReplyWorker()`, `stopAutoReplyWorker() → Promise<void>` (deja de tomar trabajos y espera los activos, como mucho 8 s), `wakeAutoReplyWorker()`.
  - `processNextAutoReply() → Promise<'idle' | 'busy' | 'done' | 'skipped' | 'failed' | 'uncertain' | 'expired'>`: toma **un** trabajo (`pending` con `runAfter <= now` → `processing`, `leaseUntil` +60 s, `$inc attempts`, el más antiguo por `runAfter`) y lo resuelve como en el spec, § 4.2, paso 3. Exportada para los tests.
  - `authorizeBotSend({ conversationId, handoffHours, now }) → Promise<boolean>`: `updateOne({ _id, $or: [{ 'bot.humanRepliedAt': null }, { 'bot.humanRepliedAt': { $lte: now − handoffHours } }] }, { $set: { 'bot.authorizedAt': now } })`; `true` si modificó. Exportada para los tests.
  - En `utils/auto.reply.js`: `autoReplyOutcome({ result, error, sendStarted }) → { status: 'done' | 'failed' | 'uncertain', applyClaims: boolean }`, la tabla del spec, § 4.2.
  - `recoverAutoReplyJobs({ startup = false }) → Promise<{ requeued: number, uncertain: number }>`: el paso 4 del spec, con el `$max` de `lastInboundAt` antes de devolver un `waiting` a `pending`. Con `startup`, todo `processing` cuenta como vencido.
  - La ventana se comprueba con `freeTextBlockReason(max(conversation.lastInboundAt, message.timestamp))`.
  - `index.js`: `startAutoReplyWorker()` junto al de campañas, y el apagado espera los dos con `Promise.all`.
  - Log por trabajo terminado: `{ messageId, conversationId, status, skipReason, ageMs }`. Sin textos.

- [ ] **Step 1: Escribir los tests que fallan** (Meta falso con `onMeta`, que responde a `POST …/messages` con `{ data: { messages: [{ id: 'wamid.bot-N' }] } }`, la forma que espera el adaptador de `helpers.js`; tras cada `postWebhook`, `processNextAutoReply()` hasta `'idle'`):
  - En `tests/auto.reply.test.js`, `autoReplyOutcome` con las cuatro filas de la tabla del spec (comentario en la última: Meta aceptó y falló guardar; reintentar lo mandaría dos veces).
  - `un contacto nuevo recibe la bienvenida`: un envío a Meta; un `Message` saliente con `origin: 'bot'`, el texto y `waMessageId: 'wamid.bot-1'`; el trabajo `done` con `replyMessageId` = ese mensaje; `Contact.autoReply.welcomedAt` puesto; `unreadCount` sigue en 1 (el bot no marca leído).
  - `cada cuenta responde con sus reglas`: A y B encendidas con textos distintos; el entrante a B recibe el texto de B y nunca el de A.
  - `ráfaga: dos entrantes seguidos dan una bienvenida y después el precio` (Review Focus).
  - `dos trabajos del mismo contacto a la vez no salen juntos`: con el candado del contacto puesto, `processNextAutoReply()` → `'busy'` y el trabajo vuelve a `pending` con `runAfter` en el futuro.
  - `dos workers a la vez`: dos entrantes de un contacto nuevo y `Promise.all([processNextAutoReply(), processNextAutoReply()])` (repetido hasta `'idle'`) → una sola bienvenida.
  - `un contacto nuevo que escribe a la vez a dos líneas de la cuenta recibe una sola bienvenida` (`maxLines: 2`).
  - `una persona responde mientras el bot decide`: `markHumanReply` sobre la conversación y después `authorizeBotSend(...)` → `false`; sin ella → `true`.
  - `una persona responde antes de que el worker lo tome`: entrante, mensaje manual por el chat y después `processNextAutoReply()` → `skipped` con `human`, sin envío del bot (Review Focus).
  - `apagan las respuestas antes de que el worker lo tome` → `skipped` con `disabled`; `borran la regla que coincidía` → `skipped` con `no_match` (Review Focus).
  - `un entrante de hace 11 minutos caduca`: `expired`, sin llamada a Meta.
  - `Meta rechaza el envío`: el trabajo `failed`, el mensaje del bot `failed` en el chat, `welcomedAt` sigue `null`.
  - `la línea ya no está conectada` → `failed`, sin llamada a Meta.
  - `al arrancar`: un `processing` con `sendStartedAt` → `uncertain`; uno sin él → `pending`; un `waiting` de hace 40 s → `pending`; uno de hace 5 s sigue `waiting`.
  - `un waiting de un corte antes de guardar la conversación se responde igual`: entrante creado a mano con `bot.status: 'waiting'` y la conversación con `lastInboundAt: null`; `recoverAutoReplyJobs()` y `processNextAutoReply()` → `lastInboundAt` = la hora del entrante y la bienvenida sale.

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `cd Backend && node --test tests/isolation/auto-replies.test.js`
Expected: FAIL en los nuevos.

- [ ] **Step 3: Implementar** el worker y `autoReplyOutcome`. El bucle toma trabajos mientras haya menos de 5 en curso; sin trabajo, espera 3 s o hasta `wakeAutoReplyWorker()`; cada 30 s, `recoverAutoReplyJobs()`. Candado del contacto: `findOneAndUpdate({ _id, userId, $or: [{ 'autoReply.lockUntil': null }, { 'autoReply.lockUntil': { $lt: now } }] }, { $set: { 'autoReply.lockUntil': now + 60 s, 'autoReply.lockToken': <uuid> } }, { new: true })`; se suelta en un `finally` solo si el token sigue siendo el suyo. Orden: candado → releer configuración, contacto y conversación → ventana y línea → `decideAutoReply` → `authorizeBotSend` → `sendStartedAt` → `processMessageSending` → `autoReplyOutcome`. Con `applyClaims`: `$set` de `botStateUpdate` en la conversación y, si `claims.welcomed`, `autoReply.welcomedAt` en el contacto.

- [ ] **Step 4: Correr todo**

Run: `cd Backend && npm test && npm run test:isolation`
Expected: PASS.

- [ ] **Step 5: Probar en local** con `npm run dev`, `webhook:simulate` y la configuración guardada por `curl` (bienvenida y una palabra clave), con el número de prueba de Meta: la respuesta llega al teléfono, se ve en Chats y la conversación sigue sin leer. Parar la API con un trabajo en curso y comprobar el log del apagado.

- [ ] **Step 6: Commit** — `git commit -m "respuestas automáticas: el worker que responde"`

---

### Task 8: La marca «Bot» en el chat y la documentación (PR 2)

**Files:**
- Modify: `Frontend/src/models/message.mode.ts`, `Frontend/src/components/Chat/ChatThread.tsx` (`MessageAuthor`), `docs/arquitectura/respuestas-automaticas.md`, `docs/arquitectura/chat.md`, `docs/arquitectura/webhook-adjuntos.md`, `docs/arquitectura/whatsapp-envio.md`, `Backend/AGENTS.md`, `docs/estado.md`

**Interfaces:**
- Consumes: `origin: { kind: 'bot' }` (Tarea 5).

- [ ] **Step 1: El chat:** `origin` admite `{ kind: 'bot' }`; `MessageAuthor` lo pinta como los de campaña y API, gris con el icono `Bot` de `lucide-react` y el texto «Bot». Hoy todo `MessageAuthor` depende de `hasTeam(user)` (`ChatThread.tsx:141`): la marca «Bot» se muestra **también sin equipo**; el resto sigue igual. Consultar antes la skill de marca.

- [ ] **Step 2: Comprobar**

Run: `cd Frontend && npm run lint && npm run build`
Expected: sin errores. En el navegador, con el backend local de la Tarea 7 y **una cuenta sin equipo**: la respuesta del bot aparece al momento por SSE con «Bot · hora».

- [ ] **Step 3: Documentar:**
  - `respuestas-automaticas.md`: la cola en el entrante, los estados, el worker, el barrido, el apagado y la pausa.
  - `chat.md`: el origen `bot`.
  - `webhook-adjuntos.md`: el paso nuevo de `procesarEntrante`.
  - `whatsapp-envio.md`: el parámetro `origin` de `processMessageSending`.
  - `Backend/AGENTS.md`: los índices nuevos.
  - `docs/estado.md`: los tres cabos sueltos que encontró Codex (spec § 8).

- [ ] **Step 4: Commit** — `git commit -m "respuestas automáticas: marca Bot en el chat y documentación"`

---

### Task 9: La página «Respuestas automáticas» (PR 3, rama `respuestas-automaticas-ui`; cuando esté el diseño)

**Files:**
- Create: `Frontend/src/hooks/useAutoReplies.ts`, `Frontend/src/pages/private/AutoReplies/` (lo que pida el diseño), `Frontend/src/models/autoReply.model.ts`
- Modify: `Frontend/src/models/routes.models.ts` (`autoReplies: 'auto-replies'`), `Frontend/src/pages/private/PrivateRouter.tsx` (con `RequirePermission action="autoReplies.manage"`), `Frontend/src/components/Sidebar/Sidebar.tsx`, `docs/arquitectura/frontend.md` (la lista de hooks), `docs/arquitectura/respuestas-automaticas.md`

**Interfaces:**
- Consumes: `GET`/`PUT /api/auto-replies` y `POST /api/auto-replies/preview` (Tarea 4).
- Produces: `useAutoReplies()` (query `['auto-replies']`), `useSaveAutoReplies()` (mutation que reemplaza la caché con la respuesta) y `usePreviewAutoReply()`.

- [ ] **Step 1: Leer el diseño** (`Design/…`) y la skill de marca; anotar abajo, en «Lo que cambió con el diseño», lo que pida más allá del brief.
- [ ] **Step 2: Implementar** los hooks, la página siguiendo el diseño, la ruta y la entrada del menú (solo con el permiso). Los errores de validación del `PUT` (`[{ message }]`) se ven junto al campo o en el aviso global, según el diseño.
- [ ] **Step 3: Comprobar** con `cd Frontend && npm run lint && npm run build` y en el navegador, con el backend local: encender, escribir, probar un mensaje, guardar, recargar y ver lo guardado; un agente no ve la entrada del menú y la ruta lo saca. En Chrome emulando un teléfono.
- [ ] **Step 4: Commit** — `git commit -m "respuestas automáticas: la página de configuración"`

## Al terminar

- **PR de versión** (`version-1.0.23`, último commit `version:bump`) con `docs/estado.md` al día.
- **Al desplegar:** reconstruir `wasmish-api` (PR 1 y 2) y `wasmish-web` (PR 2 y 3). Sin migración ni variables nuevas: la colección y los índices se crean al arrancar. El índice parcial de la cola sobre `messages` se construye al arrancar sobre toda la colección (pocos miles en producción: segundos). En los logs, además de lo de siempre, que el worker arrancó y ningún `uncertain`.
- **En producción**, primero en la cuenta de prueba de Jonathan: bienvenida y una palabra clave, desde un teléfono. Después, se le ofrece al cliente real y a los prospectos.

## Decisiones del plan (para revisar)

- **El freno pasa de «una respuesta cada 2 minutos» (lo que se habló) a «3 en 10 minutos».** Con 2 minutos, en la ráfaga típica («hola» y a los 20 s «cuánto está?») la segunda pregunta se quedaba sin respuesta. Contra otro bot sigue cortando a la tercera.
- **Sin reintentos en la v1**, aunque el compendio los proponía para `130429` y `131056`. Con el freno del bot es casi imposible llegar a esos límites, y cada intento fallido quedaría en el chat como otro mensaje fallido.
- **Lo configuran owner y admin**, no supervisor: afecta a todas las líneas de la cuenta.
- **Las palabras clave miran el texto y el `caption`**, no las respuestas a botones de plantilla ni las listas: esas ya son una respuesta a algo que mandó el negocio.
- **El «probar» responde como a un contacto nuevo, ahora y sin estado:** enseña todo lo que podría salir, también la bienvenida y el fuera de horario.
- **Quien responde a una campaña sin haber escrito nunca recibe la bienvenida** (para Wasmish es su primer mensaje). Si molesta, se puede saltar la bienvenida cuando la conversación ya tiene salientes.
- **El mensaje del bot pasa a ser el último de la bandeja** (`lastMessage`), como cualquier saliente.
- **Revisión de Codex del plan (2026-10-15):** el candado y la bienvenida pasan al **contacto** (una bienvenida por cuenta también si escribe a dos líneas a la vez); el envío se **autoriza de forma atómica** contra la pausa; en las rutas sin id se pausa la conversación que ya exista; la ventana se mira con la hora del propio entrante; la tabla de resultados (`autoReplyOutcome`); «Bot» también sin equipo; y los tests que faltaban.
