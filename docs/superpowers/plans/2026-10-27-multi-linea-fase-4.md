# Multi-línea · Fase 4: asignación manual de conversaciones — Implementation Plan

> **Para quien lo ejecute:** en Wasmish los planes se ejecutan **nativo** (rama, PR, revisión cruzada; ver «Planes» en `AGENTS.md`). Las referencias de `writing-plans` a `subagent-driven-development` o `executing-plans` no aplican. Los pasos usan casillas (`- [ ]`).

**Goal:** Que cada conversación pueda tener **una persona que la atiende** (`assignedTo`). El agente ve solo las sin asignar y las suyas. Responder una sin asignar la toma. Owner, admin y supervisor asignan y transfieren cualquiera de sus líneas; el agente transfiere las suyas y **pide** que le pasen una ajena. Con esto se completa el MVP multi-agente (spec § 4).

**Architecture:**
- **Reglas puras:** la asignación entra en las funciones puras de la Fase 3 (`utils/permissions.js`: `conversationScope`, `canReceive`) y en un archivo nuevo, `utils/assignment.js`.
- **Escrituras:** las hace un servicio, `services/assignment.service.js`, siempre **condicionales** (`findOneAndUpdate` con el `assignedTo` esperado en el filtro): dos personas a la vez nunca se pisan.
- **Envíos:** antes de llamar a Meta, adquieren la conversación con ese servicio.
- **Tiempo real:** todo evento de una conversación lleva `{ lineId, assignedTo }` en su `meta` (`conversationMeta`). Un cambio de manos manda `conversation_assigned` a quien la sigue viendo y `conversation_revoked` a quien la pierde.
- **La UI** va al final y sigue el diseño de Claude Design.

**Tech Stack:** Express 5, Mongoose 8, Zod, `node:test`, `mongodb-memory-server`; React 19, TypeScript, React Query, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-11-multi-linea-multi-agente-design.md`: § 2.2 («Carreras al asignar»), § 3.3 (la matriz), § 3.4 (asignación y tiempo real), § 4 «Fase 4», § 6, § 7.2 y § 8.1–8.2 (respuestas de Jonathan). Brief de la UI: `docs/superpowers/specs/2026-10-27-asignacion-brief-ui.md`. Las tres decisiones del 2026-10-27 están en `docs/decisiones.md`.

## Global Constraints

- **Quién ve qué (spec § 3.3, § 7.2 y § 8.2):** owner y admin, todas las conversaciones; el supervisor, todas las de sus líneas, también las asignadas a otros; el agente, las de sus líneas **sin asignar o suyas**, nunca las de sus compañeros. Lo que no ve responde **404**, como lo de otra cuenta.
- **Responder una sin asignar la toma**, sea quien sea el que responde: texto, archivo o plantilla desde el chat, y empezar una conversación con un contacto que ya tiene una en esa línea.
- **El supervisor, el admin o el owner que responde una conversación asignada a otro no se la queda**: sale firmado con su nombre y sigue siendo de quien la tenía (decisión del 2026-10-27).
- **Se adquiere antes de llamar a Meta** (spec § 2.2): el que pierde recibe `409 assigned_to_other` **sin haber enviado nada**. Si Meta rechaza el envío, la conversación se queda asignada a quien lo intentó.
- **Nada automático asigna:** ni el bot de respuestas automáticas, ni las campañas, ni la API pública, ni los ecos de la app de WhatsApp Business, ni el historial importado, ni reaccionar.
- **Un entrante no cambia la asignación** (spec § 3.4). **Avisos push:** un entrante en una conversación asignada avisa **solo a quien la atiende**; una sin asignar avisa a todos los que ven su línea, como hoy (decisión del 2026-10-27).
- **Desactivar a alguien o quitarle una línea** devuelve sus conversaciones de esa línea a «sin asignar» en la misma operación (spec § 3.4).
- **En una cuenta de una sola persona no se ve nada nuevo:** sin pestañas ni menú de asignar (decisión del 2026-10-27). El backend asigna igual.
- **Sin migración:** las conversaciones que existen no tienen `assignedTo`, y `$in: [null, …]` también encuentra el campo ausente. Todas empiezan sin asignar.
- La API key (`role: 'api'`) no cambia: ve todo y su envío no asigna.
- Identificadores nuevos en inglés; textos al usuario, comentarios, commits y documentación, en español. Errores como `[{ message, code }]`. Commits sin coautor ni atribución.
- **Tres PRs**, cada uno con su rama:
  1. `fase4-asignacion`: alcance, tiempo real y tomar al responder (Tareas 1 a 3);
  2. `fase4-transferir`: asignar, solicitudes y liberar (Tareas 4 a 6);
  3. `fase4-ui`: la UI (Tareas 7 y 8), cuando esté el diseño.

  Los dos primeros no cambian nada visible en una cuenta de una sola persona.
- Comprobar con `cd Backend && npm test && npm run test:isolation`; en las de UI, también `cd Frontend && npm run lint && npm run build` y el navegador con una sesión de owner y dos de agente (spec § 6).

## Review Focus

- **Dos agentes responden a la vez la misma conversación sin asignar:** solo uno llega a Meta y se la queda; el otro recibe `409 assigned_to_other` con el nombre del primero, y Meta se llama una sola vez → test en la Tarea 3.
- **Un agente empieza una conversación nueva con un contacto cuya conversación en esa línea atiende otro agente:** 409 con `assignedToName` y `conversationId`, sin llamar a Meta, y sin ver el historial → test en la Tarea 3.
- **A un agente le quitan la conversación con el chat abierto:** recibe `conversation_revoked` antes que cualquier evento nuevo de ella, y no le llega ninguno más (ni `message_created`, ni push) → tests en las Tareas 1 y 3.
- **Se acepta una solicitud de transferencia cuando la conversación ya cambió de manos, o el solicitante fue desactivado:** 409 y nada cambia; la solicitud vieja no se aplica sobre el dueño nuevo → test en la Tarea 5.
- **Un agente intenta asignar a un compañero una conversación que no es suya, o asignarla a alguien sin esa línea o desactivado:** 403 o 400, y la asignación no cambia → test en la Tarea 4.

---

### Task 1: Las reglas de la asignación, como funciones puras (PR 1, rama `fase4-asignacion`)

**Files:**
- Modify: `Backend/src/utils/permissions.js`, `Backend/src/utils/push.js`
- Create: `Backend/src/utils/assignment.js`
- Test: `Backend/tests/permissions.test.js`, `Backend/tests/push.test.js`, `Backend/tests/assignment.test.js` (nuevo)

**Interfaces:**
- Produces, en `utils/permissions.js`:
  - `PERMISSIONS['conversations.assign'] = ['owner', 'admin', 'supervisor']`: asignar o transferir **cualquier** conversación de sus líneas y resolver cualquier solicitud. Va a la sesión del frontend, como las otras.
  - `conversationLineScope(auth) → object`: lo que hoy es `conversationScope` (solo la línea). Lo usa la solicitud de transferencia, que no exige ver la conversación.
  - `conversationScope(auth) → object`: `conversationLineScope(auth)` y, **solo para `role: 'agent'`**, `assignedTo: { $in: [ObjectId(auth.userId), null] }`.
  - `canSeeConversation(auth, { lineId, assignedTo }) → boolean`: lo mismo que `conversationScope`, pero sobre un documento.
  - `conversationMeta(conversation) → { lineId, assignedTo }`: los dos como string o `null`.
  - `canReceive(auth, meta)`: además de lo de hoy, si `'assignedTo' in meta`, un agente solo recibe con `meta.assignedTo` `null` o su `userId`.
  - `assignmentEventFor(auth, before, after) → 'conversation_assigned' | 'conversation_revoked' | null`, con `before` y `after` los `conversationMeta` de antes y después:
    - `canReceive(auth, after)` → `'conversation_assigned'`;
    - si no, `canReceive(auth, before)` → `'conversation_revoked'`;
    - si no, `null`.
- Produces, en `utils/assignment.js`:
  - `replyAcquisition(auth, assignedTo) → 'take' | 'keep' | 'conflict'`:
    - `null` → `'take'`;
    - suya → `'keep'`;
    - de otro: `'conflict'` para el agente, `'keep'` para los demás.
  - `canReassign(auth, assignedTo) → boolean`: `can(auth, 'conversations.assign')` o `assignedTo` es suya.
  - `isValidAssignee(member, lineId) → boolean`: `member` es un `User` leído de la BD; activo (`sessionAuthFor` no nulo) y con la línea a su alcance (`inLineScope`).
  - `releaseFilter(member) → object | null`, con el `User` **ya cambiado**:
    - desactivado → `{}` (todas las suyas);
    - `lineScope` `null` → `null` (nada que liberar);
    - si no → `{ lineId: { $nin: [ObjectId…] } }`.
- Produces, en `utils/push.js`: `pushRecipientIds(members, accountId, meta)`. Con `meta.assignedTo` no nulo, **solo** el `userId` igual a él (y que además pase `canReceive`).

- [ ] **Step 1: Tests**
  - `conversationScope`:
    - owner `{}`;
    - supervisor solo `lineId`;
    - agente `lineId` y `assignedTo: { $in: [su ObjectId, null] }`;
    - API key `{}`.
  - `conversationLineScope` del agente no tiene `assignedTo`.
  - `canSeeConversation`: un agente ve la suya y la sin asignar de su línea; no ve la de un compañero ni la de otra línea. El supervisor ve la del compañero.
  - `canReceive`: agente con `meta.assignedTo` de otro → falso; con `null` o suyo → verdadero; supervisor con la de otro → verdadero; `meta` sin la clave `assignedTo` → como hoy.
  - `assignmentEventFor`, de sin asignar a Ana:
    - Ana → `assigned`;
    - Luis (agente de la línea) → `revoked`;
    - supervisor → `assigned`;
    - agente de otra línea → `null`.

    De Ana a sin asignar: Luis → `assigned`.
  - `replyAcquisition`: las cuatro combinaciones (null, suya, de otro con agente, de otro con supervisor).
  - `canReassign`: agente con la suya ✓; agente con una sin asignar ✗; agente con la de otro ✗; supervisor con la de otro ✓.
  - `isValidAssignee`: activo con la línea ✓; desactivado ✗; agente sin la línea ✗; admin ✓ con cualquier línea.
  - `releaseFilter`: desactivado `{}`; admin `null`; agente con `['l1']` → `$nin` con l1.
  - `pushRecipientIds`, asignada a Ana: solo Ana, aunque el owner y el supervisor tengan suscripción. Sin asignar: todos los que ven la línea, como hoy.
  - `permissionsFor`: la lista nueva de cada rol (el agente sigue sin ninguna).
- [ ] **Step 2:** `cd Backend && npm test` → fallan.
- [ ] **Step 3: Implementar.** `conversationScope` sigue siendo lo que usan todas las búsquedas de hoy, así que con esto el agente ya deja de ver las de sus compañeros. `canReceive` mira `assignedTo` solo si la clave está: los eventos que todavía no la llevan se comportan como hoy hasta la Tarea 2.
- [ ] **Step 4:** `npm test` → pasan.
- [ ] **Step 5: Commit** — `git commit -m "Asignación: las reglas, como funciones puras"`

### Task 2: El modelo, lo que se ve y los eventos (PR 1)

**Files:**
- Modify:
  - `Backend/src/models/conversation.model.js`;
  - `Backend/src/controllers/chat.controller.js` (`listConversations`, `markConversationRead`);
  - `Backend/src/controllers/contact.controller.js` (`CONVERSATION_SUMMARY_FIELDS`, `visibleConversations`, `visibleConversationStages`);
  - `Backend/src/controllers/stream.controller.js`;
  - cada `sendToAccount` de un evento de conversación (la lista: `grep -rn "lineId: .*lineId ?? null\|const meta = " Backend/src`):
    - `controllers/webhook.controller.js`, `controllers/template.controller.js`;
    - `services/reaction.service.js`, `services/message.status.service.js`, `services/message.change.service.js`, `services/history.import.service.js`;
  - `services/push.service.js` (`notifyInbound` recibe `assignedTo`);
  - `docs/arquitectura/chat.md` (eventos), `docs/arquitectura/api.md` (`GET /chats`).
- Test: `Backend/tests/isolation/assignment.test.js` (nuevo); `Backend/tests/isolation/push.test.js`

**Interfaces:**
- Consumes: `conversationMeta`, `canSeeConversation`, `assignmentEventFor` (Tarea 1).
- Produces:
  - **`Conversation`, campos nuevos:**
    - `assignedTo`, `assignedBy`: ObjectId → `User`, `default: null`;
    - `assignedAt`: Date, `default: null`;
    - `transferRequest`: subdocumento `{ requestedBy: ObjectId → User, requestedAt: Date }`, sin `_id`, `default: undefined`.
  - **Índice nuevo:** `conversation_assignee` `{ userId: 1, assignedTo: 1 }`, parcial con `assignedTo: { $type: 'objectId' }`. Para liberar las de una persona (Tarea 6).
  - **`serializeConversation(item)`** en `chat.controller.js`: lo que hoy arma el `map` de `listConversations`, más dos campos. `item` viene con `populate` de `contactId`, `assignedTo` (`name`) y `transferRequest.requestedBy` (`name`). Las Tareas 4 y 5 responden con él.
    - `assignedTo: { id, name } | null`;
    - `transferRequest: { requestedBy: { id, name }, requestedAt } | null`.
  - **`sendAssignmentChange(accountId, data, before, after)`** en `stream.controller.js`: a cada conexión, el evento que diga `assignmentEventFor`. `conversation_assigned` lleva `data`; `conversation_revoked`, solo `{ id: data.id }`.
  - **`sendToUser(accountId, userId, event, data)`** en `stream.controller.js`: a las conexiones de esa persona.
  - **`markConversationRead(accountId, conversation)`**: recibe el documento, no `(conversationId, lineId)`, para emitir con `conversationMeta`.

- [ ] **Step 1: Tests de aislamiento** en `tests/isolation/assignment.test.js`. Escenario: una cuenta con la línea L1 y tres conversaciones (c1 sin asignar, c2 de Ana, c3 de Luis), con Ana y Luis agentes de L1 y un supervisor de L1.
  - `GET /chats`:
    - Ana ve c1 y c2, y no c3;
    - el supervisor ve las tres;
    - cada item trae `assignedTo` con `{ id, name }` o `null`.
  - Ana pide c3 → 404 en cada uno, sin llamar a Meta:
    - `GET /chats/:id/messages`;
    - `GET /media/:id` de un mensaje de c3;
    - `POST /chats/:id/messages`, `/media` y `/template`;
    - `PUT …/reaction`.
  - **Contactos:** la ficha y la lista de contactos (`GET /contacts/:id`, `GET /contacts`) **no** enseñan c3 a Ana: el contacto sí, su conversación en L1 no.
  - **Push** (en `push.test.js`): un entrante en c2 avisa solo a Ana (`pushCalls`); en c1, a Ana, a Luis y al supervisor.
- [ ] **Step 2:** `npm run test:isolation` → fallan.
- [ ] **Step 3: Implementar.**
  - El modelo y `serializeConversation`.
  - `visibleConversations` usa `canSeeConversation`, y `visibleConversationStages` añade la condición de `assignedTo` para el agente (con `$$this.assignedTo`, que puede faltar: `$ifNull` a `null`). `CONVERSATION_SUMMARY_FIELDS` añade `assignedTo`. Los **filtros** («con conversación») siguen mirando todas, como en la Fase 3.
  - Cada `sendToAccount` de un evento de conversación pasa `conversationMeta(conversation)` en lugar de `{ lineId }`:
    - donde la conversación se lee con `select`, se añade `assignedTo`;
    - en `history.import.service.js`, la `meta` de la línea se cambia por la de la conversación de cada evento;
    - `notifyInbound` recibe `assignedTo` y lo pone en la `meta` de `pushRecipientIds`.
  - Comprobar con `grep -rn "lineId: .*lineId ?? null" Backend/src`: solo queda `campaign.service.js` (no es de una conversación).
- [ ] **Step 4:** `npm test && npm run test:isolation` → pasan; los tests de la Fase 3 siguen en verde.
- [ ] **Step 5: Commit** — `git commit -m "Asignación: el agente solo ve las suyas y las sin asignar"`

### Task 3: Responder toma la conversación (PR 1)

**Files:**
- Create: `Backend/src/services/assignment.service.js`
- Modify:
  - `Backend/src/controllers/chat.controller.js`: `sendMessageController`, `sendMediaMessageController`, `sendConversationTemplateController`, `startConversationTemplateController` y sus `catch`;
  - `docs/arquitectura/chat.md` y `docs/arquitectura/api.md` (el 409 y la regla);
  - `docs/arquitectura/whatsapp-envio.md` (§ flujo saliente: adquirir antes de Meta).
- Test: `Backend/tests/isolation/assignment.test.js`

**Interfaces:**
- Consumes: `replyAcquisition`, `conversationScope`, `conversationMeta` (Tarea 1); `sendAssignmentChange`, `serializeConversation` (Tarea 2).
- Produces, en `services/assignment.service.js`:
  - `acquireConversation(auth, conversationId, { strict = false }) → Conversation`:
    1. Escritura condicional: `findOneAndUpdate({ _id, userId: accountId, ...conversationLineScope(auth), assignedTo: null }, { $set: { assignedTo: yo, assignedAt: ahora, assignedBy: yo }, $unset: { transferRequest: 1 } }, { new: true })`.
    2. Si la tomó, emite con `emitAssignmentChange` y la devuelve.
    3. Si no, la relee y decide con `replyAcquisition`.
    4. `'conflict'`, o cualquier dueño ajeno con `strict` (la Tarea 4 lo usa para «tomar»), lanza un error `statusCode: 409`, `code: 'assigned_to_other'`, `details: { assignedToName, conversationId }`, con el mensaje «Esta conversación la atiende {nombre}.».
    5. No encontrada → `statusCode: 404`.
  - `emitAssignmentChange(accountId, before, updated)`: `sendAssignmentChange` con `serializeConversation` del documento ya poblado.
  - Error que llega al cliente: `409 [{ message, code: 'assigned_to_other', assignedToName, conversationId }]`. Los `catch` de los cuatro controladores añaden `code` y `...details` al cuerpo cuando los hay.

- [ ] **Step 1: Tests** en `tests/isolation/assignment.test.js`
  - Ana responde c1 (texto) → 201 y c1 queda `assignedTo: Ana`, `assignedBy: Ana`.
  - El owner responde una sin asignar → se la queda él.
  - El supervisor responde c2 (de Ana) → 201, firmado por el supervisor, y c2 **sigue siendo de Ana**.
  - **La carrera:** c1 sin asignar, Ana y Luis responden a la vez (`Promise.all` de dos `POST`):
    - una respuesta es 201 y la otra 404 o 409 (según si su búsqueda vio ya el cambio);
    - `metaCalls` crece en **uno**;
    - c1 queda de quien recibió 201.
  - `acquireConversation` directo, Luis sobre c2 → lanza 409 `assigned_to_other` con `assignedToName: 'Ana'`.
  - **Conversación nueva:** Luis inicia una plantilla (`POST /chats/template`) con el número del contacto de c2 → 409 con `assignedToName` y `conversationId` de c2, sin llamar a Meta; la respuesta no trae mensajes de c2.
  - **Sin conversación previa:** Luis inicia con un número nuevo → 200 y la conversación creada queda suya.
  - **Meta rechaza el envío** (`onMeta` con error) → el mensaje queda fallido y c1 queda de quien lo intentó.
  - **Nada automático asigna:** con c1 sin asignar, `POST /api/v1/templates/send` (API key) a su contacto → c1 sigue sin asignar. Una reacción de Ana a un mensaje de c1 → c1 sigue sin asignar.
  - **El evento:** con un cliente SSE falso de Luis registrado (`addClient`), Ana toma c1 → Luis recibe `conversation_revoked { id }` y ningún `message_created` de c1 después.
- [ ] **Step 2:** `npm run test:isolation` → fallan.
- [ ] **Step 3: Implementar.**
  - En cada envío desde el chat, `acquireConversation` va **antes** de `markHumanReply`, de guardar el archivo y de llamar a Meta.
  - Sin id, pero con una conversación existente para ese número en esa línea (el `target` / `existing` de hoy), se adquiere esa.
  - Una conversación **creada** por el envío (no había ninguna) se toma después con `acquireConversation` no estricto, ignorando un 409: es la carrera que el spec deja documentada (§ 4, Fase 4).
  - `processMessageSending` y `processTemplateSending` **no** cambian: el bot, las campañas y la API siguen sin asignar.
  - **`setReactionController` no adquiere:** reaccionar no es responder, igual que no pausa al bot.
- [ ] **Step 4:** `npm test && npm run test:isolation` → pasan.
- [ ] **Step 5:** Docs (`chat.md`, `api.md`, `whatsapp-envio.md`) y **commit** — `git commit -m "Asignación: responder una sin asignar la toma, antes de llamar a Meta"`. Abrir el **PR 1**, con la revisión de Codex.

### Task 4: Asignar, tomar y a quién (PR 2, rama `fase4-transferir`)

**Files:**
- Modify:
  - `Backend/src/services/assignment.service.js`;
  - `Backend/src/controllers/chat.controller.js` (tres controladores);
  - `Backend/src/routes/chat.routes.js`;
  - `Backend/src/schemas/chat.schema.js` (`assignSchema`: `{ userId: string | null }`);
  - `docs/arquitectura/api.md`.
- Test: `Backend/tests/isolation/assignment.test.js`

**Interfaces:**
- Consumes: `canReassign`, `isValidAssignee` (Tarea 1); `acquireConversation`, `emitAssignmentChange` (Tarea 3); `serializeConversation` (Tarea 2).
- Produces:
  - **`POST /chats/:id/take`** → `200 serializeConversation`. Es `acquireConversation(auth, id, { strict: true })`; ya suya → 200 sin cambios.
  - **`POST /chats/:id/assign { userId: string | null }`** → `200 serializeConversation`. Es `assignConversation(auth, id, userId)`:
    1. La conversación con `conversationScope` (404).
    2. `canReassign` (403 `forbidden`, «Solo puedes transferir las conversaciones que atiendes.»).
    3. El destino, si no es `null`: un `User` de la cuenta con `isValidAssignee` para la línea de la conversación (si no, 400 `invalid_assignee`, «Esa persona no puede atender esta línea.»).
    4. Escritura condicional sobre el `assignedTo` leído, con `assignedBy: yo`, `assignedAt` y `$unset: { transferRequest: 1 }` (si otro cambió antes: 409 `assignment_changed`, «La conversación cambió de manos. Vuelve a intentarlo.»).
    5. El mismo dueño → 200 sin escribir ni emitir.
  - **`GET /chats/:id/assignees`** → `200 [{ id, name, role }]`: los usuarios activos de la cuenta que pueden atender esa línea (`isValidAssignee`), en orden de alta. Lo usa el menú de asignar. 404 si no ve la conversación.

- [ ] **Step 1: Tests**
  - El supervisor asigna c1 a Luis → 200; Luis la ve, y Ana deja de verla si era suya.
  - Ana transfiere c2 (suya) a Luis → 200.
  - Ana la suelta (`userId: null`) → queda sin asignar.
  - Ana intenta asignar c1 (sin asignar) a Luis → 403, y c1 no cambia.
  - Asignar a un desactivado, a un agente sin esa línea o a un id de otra cuenta → 400 `invalid_assignee`.
  - `take` de c2 por Luis → 409 `assigned_to_other`; `take` de c1 → suya.
  - `assignees` de una conversación de L1: Ana, Luis, el supervisor, el owner y el admin; no un agente de L2 ni un desactivado.
  - El cambio de asignación borra una `transferRequest` pendiente.
- [ ] **Step 2:** fallan. **Step 3:** implementar. **Step 4:** pasan.
- [ ] **Step 5: Commit** — `git commit -m "Asignación: asignar, tomar y a quién se puede asignar"`

### Task 5: Pedir que te la transfieran (PR 2)

**Files:**
- Modify: `Backend/src/services/assignment.service.js`, `Backend/src/controllers/chat.controller.js`, `Backend/src/routes/chat.routes.js`, `docs/arquitectura/chat.md` (eventos), `docs/arquitectura/api.md`
- Test: `Backend/tests/isolation/assignment.test.js`

**Interfaces:**
- Consumes: `conversationLineScope`, `canReassign`, `isValidAssignee`, `conversationMeta` (Tarea 1); `sendToUser` (Tarea 2); `emitAssignmentChange` (Tarea 3).
- Produces:
  - **`POST /chats/:id/transfer-request`** → `202`. La conversación se busca con `conversationLineScope` (el agente **no** necesita verla; spec § 4, Fase 4).
    - Sin asignar → 409 `not_assigned` («Nadie la atiende: respóndela y será tuya.»); ya suya → 409 `already_yours`.
    - Si no, guarda `transferRequest = { requestedBy: yo, requestedAt }`, reemplazando la que hubiera.
    - Emite `transfer_requested { id, transferRequest }` con `conversationMeta`: le llega al que la atiende y a quienes ven todas sus conversaciones. Ni el historial ni el último mensaje van en la respuesta.
  - **`POST /chats/:id/transfer-request/accept`** → `200 serializeConversation`:
    1. Con `conversationScope` y `canReassign` (404 / 403).
    2. Sin solicitud → 404 `no_transfer_request`.
    3. El solicitante ya no vale (`isValidAssignee`): se borra la solicitud y 409 `invalid_assignee`.
    4. Escritura condicional sobre `assignedTo` y `transferRequest.requestedBy` leídos (si falla, 409 `assignment_changed`).
    5. Emite el cambio y, por `sendToUser`, `transfer_answered { id, accepted: true }` al solicitante.
  - **`POST /chats/:id/transfer-request/reject`** → `204`. Mismo acceso; borra la solicitud de forma condicional y emite:
    - `transfer_requested { id, transferRequest: null }` con `conversationMeta`;
    - `transfer_answered { id, accepted: false }` al solicitante.

- [ ] **Step 1: Tests**
  - Luis pide c2 → 202 y la respuesta no trae mensajes.
  - Ana (y el supervisor) ven `transferRequest` en `GET /chats`.
  - Ana acepta → c2 de Luis, sin solicitud; Ana deja de verla.
  - Ana rechaza → c2 sigue de Ana, sin solicitud.
  - Un agente de L2 pide c2 → 404.
  - Pedir c1 (sin asignar) → 409 `not_assigned`.
  - Una segunda solicitud reemplaza a la primera.
  - **Solicitud vieja:** el supervisor reasigna c2 a otra persona y Ana intenta aceptar → 403 (ya no es suya) y nada cambia.
  - **Solicitante desactivado:** Luis queda desactivado y el supervisor acepta → 409 `invalid_assignee` y la solicitud se borra.
  - Luis acepta su propia solicitud → 404 (no ve c2).
- [ ] **Step 2:** fallan. **Step 3:** implementar. **Step 4:** pasan.
- [ ] **Step 5: Commit** — `git commit -m "Asignación: pedir que te transfieran una conversación"`

### Task 6: Quitar acceso libera las conversaciones (PR 2)

**Files:**
- Modify: `Backend/src/services/assignment.service.js`, `Backend/src/controllers/team.controller.js` (`updateMember`), `docs/arquitectura/chat.md`, `docs/estado.md`
- Test: `Backend/tests/isolation/assignment.test.js`

**Interfaces:**
- Consumes: `releaseFilter` (Tarea 1).
- Produces: `releaseAssignments(accountId, member) → number`, con el `User` ya actualizado:
  - `updateMany({ userId: accountId, assignedTo: member._id, ...releaseFilter(member) }, { $set: { assignedTo: null, assignedAt: ahora, assignedBy: null } })`;
  - borra las `transferRequest` que pidió él con el mismo filtro;
  - si cambió algo, emite `conversations_updated {}` a toda la cuenta: la bandeja vuelve a leer la lista.

- [ ] **Step 1: Tests**
  - Desactivar a Ana → c2 sin asignar, y su solicitud pendiente desaparece.
  - Quitarle L1 a Luis con c3 en L1 y otra suya en L2 → solo se libera la de L1.
  - Pasar a Luis a admin → no se libera nada.
  - Cambiarle solo el nombre de una línea, o nada de acceso → nada.
- [ ] **Step 2:** fallan. **Step 3:** `updateMember` llama a `releaseAssignments` después de guardar y **antes** de `disconnectUser`. **Step 4:** pasan.
- [ ] **Step 5: Commit** — `git commit -m "Asignación: desactivar o quitar una línea libera sus conversaciones"`. Abrir el **PR 2**, con la revisión de Codex.

### Task 7: Los datos de la asignación en el frontend (PR 3, rama `fase4-ui`; cuando esté el diseño)

**Files:**
- Modify:
  - `Frontend/src/models/conversation.mode.ts` (`assignedTo`, `transferRequest`);
  - `Frontend/src/services/api.service.ts` (los cuatro endpoints, y los cinco eventos);
  - `Frontend/src/context/sse.provider.tsx`;
  - `Frontend/src/hooks/useConversations.ts`;
  - `docs/arquitectura/frontend.md` y `docs/arquitectura/chat.md`.
- Create: `Frontend/src/hooks/useConversationAssignment.ts`

**Interfaces:**
- Consumes: la API de las Tareas 2 a 6, sin `?assigned=`: la lista ya trae todo lo que la persona ve, y las pestañas filtran en el cliente.
- Produces:
  - `useConversationAssignment(conversationId)` → `{ assignees, take, assign(userId | null), requestTransfer, acceptTransfer, rejectTransfer }`, con React Query y sus mutaciones.
  - **Los eventos SSE en la caché de `useConversations`:**
    - `conversation_assigned`: actualiza el item, o invalida la lista si no lo tenía;
    - `conversation_revoked`: lo quita y, si está abierta, la cierra con un aviso;
    - `transfer_requested`: actualiza `transferRequest`;
    - `conversations_updated`: invalida;
    - `transfer_answered`: un aviso al solicitante.

- [ ] **Step 1:** Implementar. `npm run lint && npm run build` → sin errores.
- [ ] **Step 2: Commit** — `git commit -m "Asignación: los datos y los eventos en el frontend"`

### Task 8: La bandeja y el chat, según el diseño (PR 3)

**Files:**
- Modify: `Frontend/src/components/Chat/ConversationList.tsx`, `ChatHeader.tsx`, `ChatThread.tsx`, `NewConversationPanel.tsx`, `SendTemplateDialog.tsx`, más lo que pida el diseño
- Create: `Design/Wasmish Chat - Asignación.html` (el diseño que devuelva Claude Design)

- [ ] **Step 1:** Leer la skill de marca y el diseño.
- [ ] **Step 2: Implementar siguiéndolo.** Las reglas de qué se enseña salen de `can('conversations.assign')`, `account.memberCount` (con menos de 2 personas, nada de esto) y `canReassign` en el cliente.
- [ ] **Step 3: Probar en el navegador** con Playwright, con owner, supervisor y dos agentes:
  - las pestañas;
  - tomar al responder;
  - asignar y transferir;
  - el 409 «la atiende Ana» con «Solicitar que te la transfieran»;
  - aceptar y rechazar;
  - una conversación que se pierde con el chat abierto;
  - una cuenta de una sola persona sin cambios.
- [ ] **Step 4:** `npm run lint && npm run build`. **Commit** — `git commit -m "Asignación: pestañas, menú de asignar y solicitudes en el chat"`. Abrir el **PR 3**, con la revisión de Codex.

## Al terminar

- `docs/estado.md` al empezar cada PR («En curso») y al terminar la fase (la versión, en su PR).
- **Volver atrás:** una imagen anterior a la Fase 4 ignora `assignedTo`, así que el agente vuelve a ver todas las conversaciones de sus líneas, y nada se rompe ni se borra.
- Lo siguiente del spec es la **Fase 5** (round-robin por línea, disponibilidad, cerrar conversaciones, métricas por agente, notas internas).

## Decisiones del plan (para revisar)

- **Sin `GET /chats?assigned=`** (lo nombraba el spec): la lista no se pagina y ya trae todo lo que la persona ve, así que las pestañas filtran en el cliente y no hace falta otra petición. Si algún día se pagina, el parámetro vuelve.
- **Un permiso nuevo, `conversations.assign`** (owner, admin y supervisor), en lugar de mirar el rol en el controlador: sigue la regla de la Fase 3 y llega a la UI en `permissions`. Lo que el agente puede hacer con las suyas lo decide `canReassign`, no un permiso.
- **El agente no asigna a un compañero una conversación sin asignar**: la toma (respondiendo o con «Tomar») y después la transfiere. La matriz le da «tomar sin asignar, transferir las suyas».
- **«Tomar» con dueño ajeno da 409** a cualquiera, también al supervisor: para quitársela a alguien está «Asignar», que deja claro que la mueve.
- **Reaccionar no toma la conversación**, igual que no pausa al bot.
- **La conversación creada por un envío** se toma después de crearla. Si otro agente la creó a la vez, se queda con quien la creó primero (la carrera documentada en el spec).
- **El 409 de una conversación nueva incluye su `conversationId`**: el agente no la ve, pero lo necesita para pedir la transferencia. El id no enseña nada sin acceso.
- **Liberar al quitar acceso emite un único `conversations_updated`** y no un evento por conversación: pueden ser cientos, y la bandeja vuelve a leer la lista de todos modos.
- **La solicitud rechazada o aceptada avisa al solicitante con `transfer_answered`** (`sendToUser`): no ve la conversación, así que los eventos de ella no le llegarían.
- **Una solicitud reemplazada no avisa al primero que la pidió**: es raro, y su aviso solo diría «ya no está».
- **Sin índice para la lista del agente**: hoy la lista lee todas las conversaciones de la cuenta sin paginar, y `{ userId, assignedTo }` (para liberar) basta.
- **Un evento que ya estaba saliendo al cambiar de manos** puede llegarle al que la pierde, una vez y en el mismo instante: la `meta` se arma con la conversación leída al empezar. `conversation_revoked` la quita de su caché de todos modos.
