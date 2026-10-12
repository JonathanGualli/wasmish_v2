# Multi-línea · Fase 2b: enrutar por línea — Implementation Plan

> **Para quien lo ejecute:** en Wasmish los planes se ejecutan **nativo** (rama, PR, revisión cruzada; ver «Planes» en `AGENTS.md`). Las referencias de `writing-plans` a `subagent-driven-development` o `executing-plans` no aplican. Los pasos usan casillas (`- [ ]`).

**Goal:** Que todo lo que entra y sale de WhatsApp vaya por su **línea**: el webhook encuentra la cuenta y la conversación por la `Line` del número, los envíos salen con el número de la línea de la conversación y el token de su `Waba`, las plantillas se buscan en el WABA de la línea, el worker reparte por línea, la API pública elige la línea con `lineId` o `from`, y un contacto puede tener una conversación por línea. Con `maxLines: 1` el cliente no ve ningún cambio.

**Architecture:** Paso «cambiar» del spec (§ 4, Fase 2, 2b). **Cambian los que leen, no los que escriben:** conectar sigue guardando la conexión en el `User` del owner y `syncLinesFromOwner` sigue reflejándola en `Waba` y `Line`, como en la 2a. Lo que cambia es que el webhook, los envíos, las plantillas y el worker dejan de leer el `User` del owner y leen `Line` y `Waba`, por dos funciones de `services/line.service.js`: `findInboundLine(phoneNumberId)` para lo que entra y `findSendingLine(accountId, lineId)` para lo que sale. Las dos tienen la **reserva** del spec: si falta la línea pero `User` tiene la conexión, se usa `User` y se deja un `console.error`; nada se descarta. Dar la vuelta a la escritura (`Line` como fuente y `User` como copia, `legacyUserFields`) solo hace falta cuando una cuenta pueda tener dos líneas, así que va con la 2c.

**Tech Stack:** Express 5, Mongoose 8, `node:test`, `mongodb-memory-server`.

**Spec:** `docs/superpowers/specs/2026-10-11-multi-linea-multi-agente-design.md` (§ 2.2 «Tokens por WABA», «El hueco entre desplegar y migrar» y «Datos existentes»; § 4 «Fase 2»; § 5; § 6). Decisión del 2026-10-12 (`docs/decisiones.md`): el token vive solo en el `Waba`, cada conexión lo reemplaza y todas las líneas del WABA lo leen de ahí.

## Global Constraints

- **`maxLines` sigue en 1 y no hay cambio visible.** En el frontend solo cambia un tipo (Tarea 1): los campos nuevos de las respuestas se añaden y los de hoy se quedan.
- **La conexión se sigue escribiendo como en la 2a** (`User` → `syncLinesFromOwner`). Lo que lee la conexión para enviar o enrutar pasa a leer `Line` y `Waba`; **nadie más** lee `tokenWhatsapp`, `phoneNumberId` ni `waBusinessId` del `User`, salvo la reserva y la propia conexión.
- **El token, solo del `Waba`.** Ninguna línea, conversación ni proceso guarda su propia copia.
- **La reserva nunca descarta:** un `phone_number_id` sin `Line` activa pero con `User` se procesa por el camino viejo, en la línea por defecto de esa cuenta; un envío sin línea por defecto, con la conexión del owner. Los dos dejan un `console.error` con la cuenta y el número.
- **El cliente de la API no cambia nada:** sin `lineId` ni `from`, la línea por defecto, y la respuesta es idéntica a la de hoy.
- **Línea desconectada → 409** (sin llamar a Meta y sin dejar un `Message` fallido), con `LINE_DISCONNECTED_MESSAGE` = `'Esta conversación es de un número de WhatsApp que ya no está conectado. Para escribirle, inicia una conversación nueva desde tu número actual.'`. Sin ninguna línea, el 409 de hoy (`WHATSAPP_NOT_CONNECTED_MESSAGE`).
- Una línea de otra cuenta → **404**, nunca 403, con su test en `tests/isolation/`.
- Commits sin coautor ni atribución. Cuatro PRs, cada uno con su rama; un solo despliegue (1.0.14) cuando estén los cuatro. Textos al usuario en español; errores como `[{ message }]`.
- Comprobar con `cd Backend && npm test && npm run test:isolation`; el PR 1 también con `cd Frontend && npm run build` (no debería tocarlo, pero cambia una respuesta que el front lee).

## Review Focus

- **Un contacto con conversación en un número anterior escribe al número actual.** Nace una conversación nueva en la línea actual y el mensaje no se pierde (el índice viejo `{ userId, contactId }` ya no está) → test en la Tarea 2.
- **El hueco entre desplegar y correr `migrate:lines`**, con el índice viejo todavía puesto: crear la segunda conversación del contacto da E11000. El mensaje **no se pierde**: se guarda en la conversación que ya tenía el contacto, con un `console.error` → test en la Tarea 2.
- **Responder en una conversación de una línea desconectada** → 409 `LINE_DISCONNECTED_MESSAGE`, 0 llamadas a Meta, 0 `Message` nuevos → test en la Tarea 3.
- **Una plantilla sincronizada antes de la 2a** (`waBusinessId: null`) que el cliente de la API envía por nombre: no aparece en la búsqueda por WABA, la sincronización JIT le pone el WABA y el envío sale → test en la Tarea 3.
- **Una campaña en cola desde antes de desplegar** (`lineId: null`): el worker la envía por la línea por defecto → test en la Tarea 3.

---

### Task 1: Un contacto, varias conversaciones (PR 1, rama `fase2b-contactos`)

Sin cambio de comportamiento con una conversación por contacto; prepara la lista y la ficha para cuando haya más.

**Files:**
- Modify: `Backend/src/utils/contact.query.js`, `Backend/tests/contact.query.test.js`
- Modify: `Backend/src/controllers/contact.controller.js` (`contactSelectionStages`, `serializeContact`, `listContacts`, `getContact`, `updateContact`, `findContactConversation`)
- Modify: `Backend/tests/isolation/contacts.test.js`
- Modify: `Frontend/src/models/contact.model.ts` (el tipo del campo nuevo, sin usarlo todavía)
- Modify: `docs/arquitectura/contactos.md`

**Interfaces:**
- Produces:
  - `summarizeConversations(conversations) → { latest, items }` (pura, en `utils/contact.query.js`). `items`: `[{ conversationId, lineId, lastInteractionAt, windowExpiresAt }]` (ISO o `null`), de la más reciente (`lastMessageAt`) a la más antigua; `latest`, la conversación más reciente o `null`.
  - Un contacto serializado lleva `conversations` (los `items`) y conserva `conversationId`, `lastInteractionAt` y `windowExpiresAt`, que pasan a ser **los de la más reciente** (compatibilidad con el front hasta la 2c).
  - `contactSelectionStages` deja en cada contacto `conversations` (solo `_id`, `lineId`, `lastMessageAt`, `lastInboundAt`) y `conversation` = la más reciente. Los filtros «con» y «sin conversación» y el orden por actividad (`conversation.lastMessageAt`) no cambian de significado.
  - `getContact`: `activity` suma los mensajes de **todas** sus conversaciones.

- [ ] **Step 1: Tests puros que fallan** en `tests/contact.query.test.js`

```js
test('summarizeConversations: sin conversaciones → latest null e items []', ...);
test('summarizeConversations: la más reciente primero y como latest', ...);
// dos conversaciones (lastMessageAt ayer y hoy) → items[0] es la de hoy, con su lineId y su windowExpiresAt
```

- [ ] **Step 2: Tests de aislamiento que fallan** en `tests/isolation/contacts.test.js`

```js
test('un contacto con dos conversaciones: la ficha las lista y la actividad suma las dos', ...);
// segunda Conversation del contacto sembrado con otro lineId; GET /contacts/:id → conversations.length === 2,
// conversationId === la más reciente, activity.received cuenta los mensajes de las dos
test('la lista no repite al contacto con dos conversaciones', ...);   // GET /contacts → aparece una vez
test('las conversaciones de un contacto nunca traen las de otra cuenta', ...);
```

- [ ] **Step 3: Ejecutarlos y ver que fallan.** Run: `cd Backend && npm test && npm run test:isolation` · Expected: FAIL.

- [ ] **Step 4: Implementar.** En `contactSelectionStages`, la `$lookup` con un `pipeline` que ordena por `lastMessageAt: -1` y proyecta los cuatro campos; `conversation` = el primero. `findContactConversation` pasa a `findContactConversations` (todas, para la ficha); el bloqueo del teléfono en `updateContact` y el de `deleteContact` siguen mirando **cualquier** conversación.

- [ ] **Step 5: Ejecutar todo y ver que pasa.** Run: `cd Backend && npm test && npm run test:isolation && cd ../Frontend && npm run build` · Expected: PASS.

- [ ] **Step 6: Documentar** en `contactos.md`: `conversations` en la lista y la ficha, y que los campos sueltos son los de la más reciente hasta la 2c.

- [ ] **Step 7: Commit**

```bash
git add Backend/src Backend/tests Frontend/src/models/contact.model.ts docs/arquitectura/contactos.md
git commit -m "contactos: un contacto puede tener varias conversaciones"
```

---

### Task 2: Recibir por línea (PR 2, rama `fase2b-recibir`)

**Files:**
- Modify: `Backend/src/services/line.service.js`, `Backend/tests/isolation/lines.test.js`
- Modify: `Backend/src/controllers/webhook.controller.js`, `Backend/src/controllers/contact.controller.js` (`findOrCreateConversation`, `getSendingConversation`)
- Modify: `Backend/src/models/conversation.model.js` (índice)
- Modify: `Backend/src/services/line.migration.service.js`, `Backend/scripts/migrate-lines.js`, `Backend/tests/isolation/migrate-lines.test.js`
- Modify: `Backend/tests/isolation/webhook.test.js`
- Modify: `Backend/AGENTS.md` (índices), `docs/arquitectura/webhook-adjuntos.md`, `docs/arquitectura/pruebas-y-scripts.md` (`migrate:lines`)

**Interfaces:**
- Produces:
  - `findInboundLine(phoneNumberId) → Promise<InboundLine | null>` en `line.service.js`. `InboundLine = { accountId, lineId, phoneNumberId, tokenWhatsapp }` (token **cifrado**, del `Waba` de la línea; `null` si no tiene). Busca la `Line` **activa** de ese número. Reserva: sin ella, `User.findOne({ phoneNumberId })`; si existe, `{ accountId: user.accountId, lineId: account.defaultLineId, phoneNumberId, tokenWhatsapp: user.tokenWhatsapp }` y `console.error('Webhook por la reserva de User', { accountId, phoneNumberId })`. Ni línea ni `User` → `null` (se ignora, como hoy).
  - `findOrCreateConversation({ userId, contact, line })`, con `line = { lineId, phoneNumberId }` en lugar de `phoneNumberId`. Busca y crea por `{ userId, lineId, contactId }`; la de antes de los contactos (`contactPhone`, `contactId: null`), también dentro de esa línea. Si crear da E11000 y no hay conversación del contacto **en esa línea**, devuelve la que el contacto tenga en cualquier línea y deja `console.error('Conversación en otra línea: falta migrate:lines', …)` (el índice viejo sigue puesto).
  - `getSendingConversation({ …, line })`: lo mismo, reenviado.
  - Índice nuevo `conversation_line_contact_unique` = `{ userId: 1, lineId: 1, contactId: 1 }` único **parcial** `{ contactId: { $type: 'objectId' }, lineId: { $type: 'objectId' } }`; el viejo `conversation_contact_unique` sale del esquema.
  - `runLineMigration` añade `pending.oldConversationIndex` (`true` si `conversation_contact_unique` existe; `--check` sale con 1) y, al aplicar, lo borra con `Conversation.collection.dropIndex`. Idempotente: si no existe, no hace nada.

`procesarEntrante`, `procesarEstado`, `procesarPreferencia`, `procesarCambioDeNumero` y `descargarAdjunto` reciben el `InboundLine` en lugar del `user`: la cuenta sale de `inbound.accountId` y el token de `inbound.tokenWhatsapp`.

- [ ] **Step 1: Tests que fallan**

```js
// lines.test.js
test('findInboundLine: la línea activa del número, con el token de su WABA', ...);
test('findInboundLine: una línea desconectada no recibe', ...);              // solo Line disconnected y sin User → null
test('findInboundLine: sin Line pero con User, la reserva y su console.error', ...);
// webhook.test.js
test('un entrante cae en la conversación de SU línea', ...);
// Regresión que vigila (Review Focus 1): el contacto ya tenía conversación en una línea anterior.
test('el contacto con conversación en otro número estrena una conversación en la línea actual', ...);
// Regresión que vigila (Review Focus 2): el hueco entre desplegar y migrar.
test('con el índice viejo puesto, el mensaje se guarda en la conversación que ya tenía', ...);
// crear a mano el índice { userId, contactId } único parcial antes del postWebhook; el mensaje está en la conversación vieja
// migrate-lines.test.js
test('migrar borra el índice viejo de conversaciones, y --check lo detecta antes', ...);
```

- [ ] **Step 2: Ejecutarlos y ver que fallan.** Run: `cd Backend && npm run test:isolation` · Expected: FAIL.

- [ ] **Step 3: Implementar** `findInboundLine`, el cambio de `findOrCreateConversation`, el índice y el paso de la migración. Los envíos (`processMessageSending`, `processTemplateSending`) todavía pasan `line` construido con el owner (`{ lineId: await findLineId(accountId, phoneNumberId), phoneNumberId }`): la Tarea 3 lo sustituye.

- [ ] **Step 4: Ejecutar todo y ver que pasa**, y probarlo en local: `npm run dev`, `npm run migrate:lines` (borra el índice) y `npm run webhook:simulate -- texto` → el mensaje cae en su conversación; `npm run migrate:lines -- --check` sale con 0.

- [ ] **Step 5: Documentar** en `webhook-adjuntos.md` (el webhook enruta por `Line`, con la reserva), `pruebas-y-scripts.md` (`migrate:lines` borra el índice viejo) y `Backend/AGENTS.md` (el índice nuevo de `Conversation`).

- [ ] **Step 6: Commit**

```bash
git add Backend/src Backend/tests Backend/scripts Backend/AGENTS.md docs/arquitectura
git commit -m "líneas: el webhook enruta por Line y cada línea tiene su conversación"
```

---

### Task 3: Enviar por línea (PR 3, rama `fase2b-enviar`)

**Files:**
- Modify: `Backend/src/utils/line.js`, `Backend/tests/line.test.js`
- Modify: `Backend/src/services/line.service.js`, `Backend/src/services/whatsapp.connection.service.js` (`syncLinesAfterConnecting`)
- Modify: `Backend/src/controllers/chat.controller.js`, `template.controller.js`, `campaign.controller.js`
- Modify: `Backend/src/workers/campaign.worker.js`, `Backend/src/utils/campaign.status.js`, `Backend/tests/campaign.status.test.js`
- Modify: `Backend/tests/isolation/chats.test.js`, `templates.test.js`, `campaigns.test.js`, `whatsapp.test.js`, `helpers.js`
- Modify: `Backend/AGENTS.md` (la regla de `findAccountOwner`), `docs/arquitectura/whatsapp-envio.md`, `chat.md`, `campanas.md`

**Interfaces:**
- Consumes: `findOrCreateConversation({ …, line })` (Tarea 2).
- Produces:
  - `SendingLine = { accountId, lineId, phoneNumberId, waBusinessId, tokenWhatsapp }` (token cifrado).
  - `sendingLineIssue({ line, waba }) → null | 'not_connected' | 'disconnected'` (pura, `utils/line.js`): sin línea, o su `Waba` sin token → `'not_connected'`; línea `disconnected` → `'disconnected'`.
  - `findSendingLine(accountId, lineId = null) → Promise<SendingLine>` en `line.service.js`. Con `lineId`: esa línea **de esa cuenta** (`{ _id: lineId, accountId }`), o 404 `'La línea no existe en tu cuenta.'`. Sin él: `Account.defaultLineId`. `sendingLineIssue` → 409 con `WHATSAPP_NOT_CONNECTED_MESSAGE` o `LINE_DISCONNECTED_MESSAGE` (exportada desde `utils/whatsapp.line.js`). Reserva: sin `defaultLineId` y con `ownerConnection(owner)` → la conexión del owner con `lineId: await findLineId(...)` y `console.error('Envío por la reserva de User', …)`.
  - `processMessageSending({ line, conversation, … })` y `processTemplateSending({ line, … })`: `line` (un `SendingLine`) reemplaza a `user`. El número sale **siempre** de `line.phoneNumberId` (desaparece `conversation?.phoneNumberId || user.phoneNumberId`).
  - `syncTemplatesForWaba({ accountId, waBusinessId, tokenWhatsapp })` reemplaza a `syncTemplatesForUser(user)`. Las búsquedas de plantillas por nombre llevan `waBusinessId: line.waBusinessId`; una con `waBusinessId: null` no se encuentra (la sincronización JIT se lo pone).
  - `pickCampaignPerLine(candidates) → campaign[]` (pura, `utils/campaign.status.js`): la lógica de hoy de `pickActiveCampaigns`, con la clave `String(campaign.lineId ?? campaign.userId)`.

Quién pide qué línea:

| Dónde | Línea |
|---|---|
| `POST /chats/:id/messages`, `/chats/:id/media`, `/chats/:id/template` | `conversation.lineId` (sin ella, la por defecto) |
| `POST /chats/messages`, `/chats/template` (conversación nueva) | la por defecto (el `lineId` del cuerpo llega en la Tarea 4) |
| worker | `campaign.lineId` (sin ella, la por defecto) |
| `POST /campaigns` | la por defecto: 409 si no hay; `campaign.lineId` = la suya |
| `GET /templates/sync` | todos los `Waba` de la cuenta con token |
| `GET /templates` | las del WABA de la línea por defecto (sin línea, todas las de la cuenta, como hoy); si alguna de la cuenta tiene `waBusinessId: null`, se sincroniza una vez antes, como hoy con `header` |

El control de la ventana (`findConversationByNumber`) busca dentro de la línea del envío. En los envíos con `:id`, el orden es: conversación (404) → ventana (409) → línea (409).

`syncLinesAfterConnecting` deja de tragarse el error: si la proyección falla, la conexión responde **500** con `'WhatsApp quedó conectado, pero no se pudo terminar de configurar. Vuelve a conectarlo.'` (los envíos ya leen `Waba`: un token sin reflejar dejaría de enviar).

- [ ] **Step 1: Tests puros que fallan**

```js
// line.test.js
test('sendingLineIssue: línea activa con token → null', ...);
test('sendingLineIssue: sin línea, o WABA sin token → not_connected', ...);
test('sendingLineIssue: línea desconectada → disconnected', ...);
// campaign.status.test.js
test('pickCampaignPerLine: una por línea, la que envía antes que la que está en cola', ...);
test('pickCampaignPerLine: dos líneas de la misma cuenta envían a la vez', ...);
test('pickCampaignPerLine: sin lineId, cuenta como la línea de su cuenta', ...);
```

- [ ] **Step 2: Tests de aislamiento que fallan**

```js
// chats.test.js
// Regresión que vigila (Review Focus 3)
test('responder en una conversación de una línea desconectada → 409 sin llamar a Meta', ...);   // 0 metaCalls, 0 Message nuevos
test('el envío sale con el número de la línea y el token de su WABA', ...);
// metaCalls[0]: url con el phoneNumberId de la línea, Authorization con el token del Waba (distinto del de User a propósito)
test('ventana por línea: abierta en A1 y cerrada en A2 → 409 en A2', ...);
// maxLines 2 y dos Line activas puestas a mano; conversación del contacto en A1 con lastInboundAt reciente
// templates.test.js
// Regresión que vigila (Review Focus 4)
test('una plantilla sin WABA se sincroniza y sale', ...);
test('GET /templates solo lista las del WABA de la línea', ...);
// campaigns.test.js
// Regresión que vigila (Review Focus 5)
test('una campaña sin lineId sale por la línea por defecto', ...);
test('una campaña de una línea desconectada se pausa con whatsapp_disconnected', ...);
// whatsapp.test.js
test('si la proyección falla tras conectar, 500 y el mensaje para reintentar', ...);
```

`connectWhatsapp` (helpers) guarda en `User` un token distinto del que el test pone en el `Waba` cuando necesite distinguirlos: el envío tiene que usar el del `Waba`.

- [ ] **Step 3: Ejecutarlos y ver que fallan.** Run: `cd Backend && npm test && npm run test:isolation` · Expected: FAIL.

- [ ] **Step 4: Implementar** `sendingLineIssue`, `findSendingLine`, `pickCampaignPerLine`, `syncTemplatesForWaba` y los cambios de los controladores y el worker según la tabla. `findAccountOwner` deja de usarse para enviar (queda en la conexión y en la reserva).

- [ ] **Step 5: Ejecutar todo y ver que pasa**, y probar en local con el número de WasmishTest: responder en un chat, enviar una plantilla y una campaña en modo de prueba.

- [ ] **Step 6: Documentar** en `whatsapp-envio.md` (los envíos salen de la línea y del token de su `Waba`; plantillas por WABA; la reserva; el 409 de línea desconectada; el 500 al conectar), `chat.md` (la ventana es de la conversación, y la conversación de una línea), `campanas.md` (el worker reparte por línea) y la regla de `Backend/AGENTS.md` (`findSendingLine` en lugar de `findAccountOwner` para enviar).

- [ ] **Step 7: Commit**

```bash
git add Backend/src Backend/tests Backend/AGENTS.md docs/arquitectura
git commit -m "líneas: los envíos, las plantillas y el worker salen por la línea"
```

---

### Task 4: Elegir la línea: API pública y conversación nueva (PR 4, rama `fase2b-api`)

**Files:**
- Modify: `Backend/src/utils/line.js`, `Backend/tests/line.test.js`
- Modify: `Backend/src/schemas/template.schema.js`, `Backend/src/schemas/chat.schema.js`
- Modify: `Backend/src/controllers/template.controller.js` (`sendTemplateController`), `chat.controller.js` (`sendMessageController` sin `:id`, `startConversationTemplateController`)
- Modify: `Backend/tests/isolation/templates.test.js`, `chats.test.js`
- Modify: `docs/arquitectura/api.md`, `docs/arquitectura/whatsapp-envio.md` (API pública)

**Interfaces:**
- Consumes: `findSendingLine` (Tarea 3).
- Produces:
  - `resolveApiLine(lines, { lineId, from }) → { lineId: string | null } | { statusCode, message }` (pura). `lines`: las de la cuenta (`_id`, `displayPhoneNumber`). `from` se compara con `displayPhoneNumber` dejando solo los dígitos de los dos. Sin ninguno → `{ lineId: null }` (la por defecto). `lineId` que no está → 404 `'La línea no existe en tu cuenta.'`; `from` que no está → 404 `'Ningún número de tu cuenta es ese.'`; los dos y no coinciden → 400 `'lineId y from no son la misma línea.'`.
  - `sendTemplateSchema`: `lineId` (`objectIdSchema`) y `from` (`z.string().trim().min(6)`), los dos opcionales. `startConversationTemplateSchema` y `sendMessageSchema`: `lineId` opcional (para la 2c; el front no lo manda todavía).
  - La respuesta de `POST /api/v1/templates/send` **no cambia**.

- [ ] **Step 1: Tests puros que fallan** en `tests/line.test.js`

```js
test('resolveApiLine: sin lineId ni from, la línea por defecto', ...);       // { lineId: null }
test('resolveApiLine: from con +, espacios y guiones encuentra su línea', ...); // '+593 99-123' ↔ '593 99 123'
test('resolveApiLine: lineId de otra cuenta → 404', ...);
test('resolveApiLine: lineId y from de líneas distintas → 400', ...);
```

- [ ] **Step 2: Tests de aislamiento que fallan**

```js
// templates.test.js
test('API: con un lineId de otra cuenta → 404 y sin llamar a Meta', ...);
test('API: con from elige esa línea', ...);              // metaCalls[0] con el phoneNumberId de esa línea
test('API: sin lineId ni from responde exactamente lo de antes', ...);   // { success, waMessageId, conversationId }
// chats.test.js
test('conversación nueva con el lineId de otra cuenta → 404', ...);
```

- [ ] **Step 3: Ejecutarlos y ver que fallan.** Run: `cd Backend && npm test && npm run test:isolation` · Expected: FAIL.

- [ ] **Step 4: Implementar** `resolveApiLine`, los esquemas y los controladores (`Line.find({ accountId })` → `resolveApiLine` → `findSendingLine`). En los dos endpoints de conversación nueva, la línea se resuelve **antes** de buscar la conversación y de mirar la ventana.

- [ ] **Step 5: Ejecutar todo y ver que pasa.** Run: `cd Backend && npm test && npm run test:isolation` · Expected: PASS.

- [ ] **Step 6: Documentar** en `api.md` y en la sección de la API pública de `whatsapp-envio.md`: `lineId` y `from`, sus errores, y que sin ellos todo sigue igual.

- [ ] **Step 7: Commit**

```bash
git add Backend/src Backend/tests docs/arquitectura
git commit -m "líneas: la API pública y la conversación nueva eligen la línea"
```

---

## Al terminar

- `docs/estado.md` en cada PR: «En curso» con lo que falta; al cerrar el cuarto, «Lo siguiente» pasa a la 2c (la UI de líneas, `maxLines > 1`, la escritura con `Line` como fuente y `legacyUserFields`, y antes la prueba del token en WasmishTest).
- Resumen para Jonathan y revisión cruzada de Codex en una ronda por PR.

## Decisiones del plan (para revisar)

- **La escritura no se da la vuelta en la 2b.** El spec y el plan de la 2a decían que la 2b pasaría a `Line` como fuente con `User` de copia (`legacyUserFields`). Con `maxLines: 1`, `User` describe la conexión entera en un solo documento con su índice único, y `syncLinesFromOwner` ya demostró que la proyección converge. Darle la vuelta solo hace falta cuando una cuenta tenga dos líneas: va con la 2c. Mientras tanto, la vuelta atrás a la 1.0.13 no necesita doble escritura (`User` sigue al día).
- **Cuatro PRs y un solo despliegue (1.0.14).** Por el tamaño (unas 400–500 líneas cada uno) y porque cada uno se revisa solo: contactos (sin cambio de comportamiento), recibir, enviar y elegir la línea.
- **Los campos sueltos del contacto se quedan** (`conversationId`, `lastInteractionAt`, `windowExpiresAt`, los de la conversación más reciente) junto al `conversations` nuevo. El spec decía «en lugar de una sola»; quitarlos rompería el front, que se cambia en la 2c.
- **Responder desde un número desconectado da 409.** Hoy esa respuesta saldría con el número viejo y el token nuevo, y Meta la rechazaría con un `Message` fallido.
- **Conectar responde 500 si la proyección falla** (en la 2a era 200 con `console.error`): desde la 2b los envíos leen el token del `Waba`.
- **Si el índice viejo sigue puesto, el entrante va a la conversación que ya tenía el contacto** (con `console.error`), en vez de perderse.
- **`GET /templates` sin línea lista todas las de la cuenta**, como hoy; con línea, solo las de su WABA.
- **El panel de superadmin no cuenta líneas todavía:** va con la 2c, junto a la UI.

## Antes de desplegar (Jonathan)

Con `/deploy`, cuando estén unidos los cuatro PRs y la 1.0.14 subida:

1. `mongodump` de producción. Ensayo con una copia en el Mongo local (con el `.env` local): restaurar, arrancar la 1.0.14, correr `migrate:lines -- --check` (dice que el índice viejo existe), `migrate:lines` y otra vez `--check` → 0.
2. Desplegar la imagen nueva y, **justo después**, `migrate:lines` (borra el índice viejo). Hasta entonces, un contacto que escriba a otra línea de su cuenta cae en su conversación de siempre (no se pierde nada). En producción no hay líneas anteriores, así que no debería pasar.
3. `migrate:lines -- --check` tiene que salir con 0.
4. Comprobar: un entrante en vivo, una respuesta desde el chat y `POST /api/v1/templates/send` con 200 en los logs; ningún `por la reserva de User` en los logs.

**Volver atrás:** las imágenes `:1.0.13` ignoran lo nuevo y siguen leyendo `User`, que está al día. Si con la 1.0.14 nació una segunda conversación de un contacto, la 1.0.13 encuentra una de las dos (`findOne`) y su `autoIndex` no podrá recrear el índice viejo (solo lo registra en el log).

## Lo que este plan no cubre

- Fase 2c: la UI de líneas (lista, nombre, añadir, desconectar), `maxLines > 1`, la escritura con `Line` como fuente y `legacyUserFields`, el panel de superadmin con líneas, y elegir la línea en la UI de conversación nueva y de campañas.
- La prueba del token en WasmishTest (spec § 2.2): antes de la 2c.
