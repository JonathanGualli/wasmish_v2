# Los avisos de la asignación — Implementation Plan

> **Para quien lo ejecute:** en Wasmish los planes se ejecutan **nativo** (rama, PR, revisión cruzada; ver «Planes» en `AGENTS.md`). Las referencias de `writing-plans` a `subagent-driven-development` o `executing-plans` no aplican. Los pasos usan casillas (`- [ ]`).

**Goal:** Que cada cambio de manos quede en el hilo, que lo que le toca a cada persona la espere en una campanita (y suene en el celular al asignárselo), y que el aviso de arriba sea uno solo, con color según el tipo, en toda la app.

**Architecture:**
- **Historia:** colección `ConversationEvent`. Sus eventos viajan con cada página de `GET /chats/:id/messages` (como mucho 100 por página, acortándola si hace falta) y en vivo con el SSE `conversation_event`.
- **Campanita:** colección `Notification` (caduca a los 30 días), `GET /api/notifications` y `POST /api/notifications/seen`, y tres SSE a la persona.
- **Escrituras:** las hace un servicio nuevo, `services/assignment.history.service.js`, llamado desde `services/assignment.service.js` (el único que cambia `assignedTo`) **después** de cada escritura ganadora y confirmada. Nunca hace fallar la asignación.
- **Push:** `notifyAssignment`, junto a `notifyInbound`, con su misma regla de destinatarios.
- **Frontend:** `notify({ kind, text, action })` reemplaza el contenido libre del aviso global. El hilo intercala los eventos. La campanita va en el `Sidebar` (computadora) y en la barra de arriba (celular).

**Tech Stack:** Express 5, Mongoose 8, Zod, `node:test`, `mongodb-memory-server`; React 19, TypeScript, React Query, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-28-avisos-asignacion-design.md` (con la revisión de Codex del PR #151). Brief: `docs/superpowers/specs/2026-10-28-avisos-asignacion-brief-ui.md`. Diseño: `Design/Wasmish Chats - Avisos de la asignación.html` (5a, 6a, 6b, 7a, 7b, m1, m2, m3; es un export empaquetado: la plantilla y el código del prototipo, con todos los textos, salen del `<script type="__bundler/template">`).

## Global Constraints

- **Nada de esto hace fallar una asignación:** escribir eventos o avisos, emitir sus SSE y mandar el push van en `try/catch`, con un `console.error` sin texto ni datos del cliente (spec § 4).
- **Se escribe después de confirmar:** ningún evento ni aviso de una asignación que `confirmAssignee` / `confirmRequester` deshizo (spec § 4).
- **`at` es la fecha de la escritura ganadora**, no la de guardar el evento; el orden es `at` y después `_id` (spec § 3.1).
- **`pending` de un aviso `requested` se calcula al servirlo** (`transferRequest.id === requestId`); `resolution` solo dice cómo terminó (spec § 4).
- **Toda escritura que quita o reemplaza `transferRequest` resuelve los avisos de la que quitó** si su escritura ganó: la tabla de spec § 4, entera.
- **`canAnswer = canOpen && pending && canReassign(auth, assignedTo)`** (spec § 5.2).
- **Push solo con `pushRecipientIds([recipient], accountId, meta)` y `meta.assignedTo === recipient`** (spec § 7).
- **Avisos:** caducan a los 30 días (`expireAfterSeconds: 30 * 24 * 60 * 60`), 30 por página, `unseenCount` de todos. Eventos: como mucho 100 por página.
- **Con una sola persona (`hasTeam` falso):** el hilo no enseña eventos y la campanita no aparece. El backend los guarda igual.
- **El aviso de arriba:** tipos `error` (`#b4321f`), `info` (verde tinta `#0b3b2e`) y `new` (menta `#6fe3ae`), colores y medidas de la pantalla 7a. Se va a los 5 s, no con el puntero encima, y uno a la vez; Esc lo cierra.
- Textos de eventos, avisos y push: exactamente los del catálogo 6b, el prototipo (5a, m2) y m3 (copiados en las tareas).
- Identificadores nuevos en inglés; textos al usuario, comentarios, commits y documentación, en español. Errores como `[{ message, code }]`. Commits sin coautor ni atribución.
- **Cuatro PRs**, cada uno con su rama, su revisión de Codex y su documentación:
  1. `aviso-arriba`: el aviso nuevo en toda la app (Tarea 1);
  2. `avisos-backend`: Tareas 2 a 5;
  3. `avisos-hilo`: Tarea 6;
  4. `avisos-campanita`: Tareas 7 y 8.

  El 1 no depende de nada; el 3 y el 4, del 2.
- Comprobar con `cd Backend && npm test && npm run test:isolation`; con UI, también `cd Frontend && npm run lint && npm run build` y el navegador (cuenta con owner, supervisor y dos agentes, a 1280 px y a 390 px; y una cuenta de una persona).

## Review Focus

- **Una persona con muchos avisos sin ver (más de 30):** el contador dice todos y el panel llega hasta el más viejo al bajar → test de aislamiento en la Tarea 5.
- **Un supervisor que tiene abierto el panel cuando otro resuelve la solicitud:** el aviso pierde los botones y dice cómo terminó, sin recargar; si pulsa antes de enterarse, recibe el 409 de hoy y el aviso se actualiza → `notification_updated` en la Tarea 4 y el manejo del 409 en la Tarea 8.
- **Un agente con el chat abierto al que le asignan la conversación a otro mientras escribe:** pierde el chat (como hoy) y no le llega el `conversation_event` del cambio → test en la Tarea 3.
- **Un agente que abre una conversación con historia de antes de ser suya:** ve los eventos anteriores (quién la tuvo), no solo los suyos → test en la Tarea 3.
- **Un aviso de una conversación borrada o de un contacto borrado:** se pinta sin abrir y sin romper la lista (`conversation: null`) → test en la Tarea 5.

---

### Task 1: El aviso de arriba nuevo, en toda la app (PR 1, rama `aviso-arriba`)

**Files:**
- Modify: `Frontend/src/components/Notice/Notice.tsx`, `Frontend/src/components/Notice/context/NoticeContext.tsx`, `Frontend/src/main.tsx` (si cambia el provider)
- Create: `Frontend/src/components/Notice/context/useNotice.ts`
- Delete: `Frontend/src/components/Notice/Notice.css`, `Frontend/src/components/Notice/context/UseNoticeContext.ts`
- Modify (las 22 pantallas que usan `useNoticeContext`, ver la tabla)
- Docs: `docs/arquitectura/frontend.md` (cómo avisar), `Frontend/AGENTS.md` si nombra el aviso

**Interfaces:**
- Produces: `useNotice() → { notify(notice: NoticeInput): void; close(): void; visible: boolean }`, con
  `type NoticeKind = 'error' | 'info' | 'new' | 'success'` y
  `interface NoticeInput { kind: NoticeKind; text: string; action?: { label: string; onClick: () => void } }`.
  `visible` reemplaza a `state` donde hoy se lee (para que un clic en el aviso no cuente como «clic fuera» de un diálogo).

- [ ] **Step 1: `NoticeProvider` guarda un solo aviso** (`{ id, kind, text, action }` o `null`); `notify` lo reemplaza (un `id` nuevo reinicia el temporizador). `close()` lo quita con la animación de salida.
- [ ] **Step 2: `Notice` según la pantalla 7a:** portal en `#notice`, arriba a la derecha (`top: 16px; right: 16px; width: 380px`; en menos de 768 px, `left: 16px; right: 16px; width: auto`), icono de 28 px a la izquierda, texto 13,5 px, la acción en negrita y la ✕. Colores (fondo / borde / texto / ✕ / acción / fondo del icono / icono), de `COLOR` del prototipo:
  - `error`: `#b4321f` / `#b4321f` / `#ffffff` / `#f6d3cc` / `#ffffff` / `rgba(255,255,255,0.16)` / `#ffffff`, icono triángulo de alerta;
  - `info`: `#0b3b2e` / `#0b3b2e` / `#ffffff` / `#a9cdbd` / `#6fe3ae` / `#17503f` / `#6fe3ae`, icono de flechas que giran (`RefreshCw` de lucide);
  - `new`: `#6fe3ae` / `#6fe3ae` / `#06251c` / `#12523f` / `#06251c` / `#0b3b2e` / `#6fe3ae`, icono campana;
  - `success`: los colores de `info` con el icono `Check` (decisión del plan, ver al final).

  Con los tokens de marca donde existan (`brand-danger`, `brand-deep`, `brand-accent`…). Se cierra a los 5000 ms; `onMouseEnter` pausa y `onMouseLeave` reanuda desde cero. Esc cierra. `role="status"` (`role="alert"` en `error`). Pulsar la acción ejecuta `onClick` y cierra.
- [ ] **Step 3: cambiar cada pantalla a `notify`.** Texto plano; las listas de errores se unen con un espacio:

  | Archivo | Lo que avisa | `kind` |
  |---|---|---|
  | `pages/public/LoginPage/LoginPage.tsx`, `pages/public/SignUpPage/SignUpPage.tsx` | errores del formulario / de la API | `error` |
  | `pages/private/AutoReplies/AutoRepliesPage.tsx` | guardado o encendido / error | `success` / `error` |
  | `pages/private/Contacts/BulkTagDialog.tsx` | el resultado (`resultMessage` pasa a devolver texto: «Le pusiste Mayorista a 12 contactos.» con las mismas variantes de hoy) / error | `success` / `error` |
  | `pages/private/Contacts/TagManager.tsx`, `ContactForm.tsx`, `ContactPanel.tsx` | errores | `error` |
  | `pages/private/Settings/ApiKeysCard.tsx` | error | `error` |
  | `pages/private/Settings/Lines/LineRow.tsx`, `ManualCredentialsForm.tsx` | «ID de la línea copiado.», «Número conectado correctamente.» | `success` |
  | `pages/private/Templates/TemplateHeaderCell.tsx`, `pages/private/Campaigns/NewCampaign/NewCampaignPage.tsx`, `pages/private/Campaigns/Detail/CampaignDetailPage.tsx` | según cada llamada: errores `error`, confirmaciones `success` | — |
  | `components/Chat/SendTemplateDialog.tsx`, `NewConversationPanel.tsx`, `Composer/ChatComposer.tsx`, `ContactSidebar/ContactDataCard.tsx`, `ContactSidebar/ContactSidebarTags.tsx` | errores | `error` |
  | `components/Chat/ChatThread.tsx` (`lostAccess`) | lo de hoy | `info` |
  | `hooks/useTransferRequest.tsx` (pedir la transferencia; la respuesta) | el error de pedir / la respuesta: «Ana te pasó la conversación con Marisol.» con `action: { label: 'Abrir' }`, o «Ana no te pasó la conversación con Marisol.» | `error` / `new` / `info` |
  | `components/Dialog/ConfirmDialog.tsx` | solo lee `visible` | — |

- [ ] **Step 4:** `grep -rn "useNoticeContext\|setContent" Frontend/src` sin resultados; `cd Frontend && npm run lint && npm run build` en verde.
- [ ] **Step 5: navegador** (1280 y 390 px): un error (etiqueta repetida en Contactos), un `success` (copiar el ID de una línea), la respuesta a una solicitud con «Abrir», el puntero encima lo retiene, Esc lo cierra, uno nuevo reemplaza al anterior, y que los diálogos de etiquetas y de plantilla no se cierran al pulsar la ✕ del aviso.
- [ ] **Step 6: commit** («Aviso de arriba: un tipo y un texto, con color según el tipo, en toda la app») y la sección de `frontend.md`.

---

### Task 2: Las reglas puras (PR 2, rama `avisos-backend`)

**Files:**
- Create: `Backend/src/utils/conversation.events.js`, `Backend/tests/conversation.events.test.js`
- Modify: `Backend/src/utils/assignment.js`, `Backend/tests/assignment.test.js`, `Backend/src/utils/push.js`, `Backend/tests/push.test.js`

**Interfaces:**
- Produces:
  - `EVENTS_PER_PAGE = 100`, `NOTIFICATIONS_PER_PAGE = 30` (en `conversation.events.js`).
  - `eventBounds({ before: Date | null, messages: { timestamp: Date }[], hasMore: boolean }) → { from: Date | null, to: Date | null }`: `to = before`; `from = hasMore ? timestamp del más viejo de messages : null`. `messages` llega del más nuevo al más viejo.
  - `eventCutoff(events: { at: Date }[], cap = EVENTS_PER_PAGE) → Date | null`: con `events` del más nuevo al más viejo (pedidos `cap + 1`), `null` si `events.length <= cap`; si no, el `at` del evento número `cap`.
  - `requestRecipients(members: User[], conversation: { lineId, assignedTo }, requesterId: string) → string[]`: los `_id` (texto) de los activos de la cuenta (`sessionAuthFor` no nulo) que son quien la atiende (si `isValidAssignee`) o tienen `conversations.assign` con la línea (`can` + `inLineScope`), **sin el solicitante**, sin repetir.
  - `buildAssignmentPush({ conversationId, contact, lineName, actorName, kind: 'assigned' | 'passed' }) → { title, body, conversationId, url }`: título y `url` como `buildInboundPush`; cuerpo «{nombre de pila} te asignó esta conversación.» o «{nombre de pila} te pasó esta conversación.»; sin nombre, «Alguien te asignó…» / «Alguien te pasó…».

- [ ] **Step 1: tests que fallan.**
  - `eventBounds`: primera página llena (`before: null`, `hasMore: true`) → `{ from: más viejo, to: null }`; primera y única (`hasMore: false`) → `{ from: null, to: null }`; intermedia → `{ from: más viejo, to: before }`; última → `{ from: null, to: before }`.
  - `eventCutoff`: 100 → `null`; 101 → el `at` del 100; los dos últimos con el mismo `at` → ese `at`.
  - `requestRecipients`: la atiende Ana (agente), hay owner, admin, supervisor con la línea, supervisor sin ella, agente Luis (el solicitante), un admin inactivo → Ana, owner, admin y el supervisor con la línea; el solicitante nunca, aunque sea supervisor; Ana sin la línea (aún no soltada) → fuera.
  - `buildAssignmentPush`: `{ actorName: 'Carla Ríos', kind: 'assigned' }` → cuerpo `'Carla te asignó esta conversación.'`; `passed` con `'Ana Vera'` → `'Ana te pasó esta conversación.'`; `actorName: null` → `'Alguien te asignó esta conversación.'`; con `lineName` el título lleva « · Ventas».
- [ ] **Step 2:** `cd Backend && npm test` → fallan por lo que falta.
- [ ] **Step 3:** implementar en sus archivos (`requestRecipients` en `utils/assignment.js`, junto a `isValidAssignee`; `buildAssignmentPush` en `utils/push.js`, reutilizando lo de `buildInboundPush`).
- [ ] **Step 4:** `npm test` en verde.
- [ ] **Step 5: commit.**

---

### Task 3: Los modelos, el servicio de la historia y los eventos con los mensajes (PR 2)

**Files:**
- Create: `Backend/src/models/conversation.event.model.js`, `Backend/src/models/notification.model.js`, `Backend/src/services/assignment.history.service.js`
- Modify: `Backend/src/controllers/chat.controller.js` (`listMessages`), `Backend/tests/isolation/helpers.js` (cargar los dos modelos)
- Test: `Backend/tests/isolation/assignment-history.test.js` (nuevo)
- Docs: `Backend/AGENTS.md` (los índices), `docs/arquitectura/chat.md` (la historia y `conversation_event`)

**Interfaces:**
- Consumes: Task 2.
- Produces, en `assignment.history.service.js`:
  - `recordEvent({ accountId, conversationId, type, actorId = null, targetId = null, at }) → Promise<void>`: guarda y emite `conversation_event` `{ conversationId, event }` con `sendConversationEvent`; nunca lanza.
  - `serializeEvent(doc) → { id, type, actor: { id, name } | null, target: { id, name } | null, timestamp }` (`timestamp` = `at` en ISO; `doc` con `populate('actorId targetId', 'name')`).
  - `listPageEvents(conversationId, { from, to }) → Promise<doc[]>`: del más nuevo al más viejo, `cap + 1`, con `populate`.
- Modelos (spec § 3): `ConversationEvent` con `at` requerido y el índice `conversation_event_list` `{ conversationId: 1, at: 1, _id: 1 }`; `Notification` con `timestamps: true` y los índices `notification_inbox` `{ recipientId: 1, createdAt: -1, _id: -1 }`, `notification_request` `{ conversationId: 1, requestId: 1 }` parcial con `requestId: { $type: 'objectId' }` y `notification_ttl` `{ createdAt: 1 }` con `expireAfterSeconds: 2592000`.
- `GET /chats/:id/messages?events=1` responde `{ items, nextCursor, events }`, y **solo con `events=1`** trae eventos y recorta la página. Sin el parámetro, la respuesta y la paginación son las de hoy (revisión de Codex del plan, 2). Así:
  - el PR 2 se puede unir solo, porque el frontend de hoy no pide eventos;
  - las pestañas abiertas con la 1.0.33 durante el despliegue no reciben páginas sin mensajes;
  - con una sola persona (`hasTeam` falso), el frontend no los pide y la paginación no cambia.

- [ ] **Step 1: tests de aislamiento que fallan** (cuenta con l1, owner, supervisor, Ana y Luis; eventos sembrados con `ConversationEvent.create` y fechas fijas):
  - `'mensajes: la primera página trae los eventos más nuevos que el último mensaje y los del tramo'`.
  - `'mensajes: recorrer todas las páginas trae cada evento una sola vez, también con un evento a la misma hora que un mensaje'` (25 mensajes, 30 eventos intercalados, `limit=10`).
  - `'mensajes: con 3 mensajes y 230 eventos, las páginas se acortan en 100 y no se pierde ni se repite ninguno'` (comprobar que cada `nextCursor` es el `timestamp` del evento 100 y que la unión de páginas es exacta).
  - `'mensajes: el agente ve los eventos de antes de que fuera suya'` (Review Focus).
  - `'mensajes: sin events=1, la respuesta y las páginas son las de hoy aunque haya 230 eventos'`.
  - `'mensajes: un agente que ya no la ve recibe 404 y ningún evento'` y otra cuenta, 404.
  - `'conversation_event: no le llega al agente que la perdió'` (`openStream` de Ana; se la asignan a Luis; `recordEvent`; Ana no recibe `conversation_event`, Luis sí) (Review Focus).
- [ ] **Step 2:** `npm run test:isolation` → fallan.
- [ ] **Step 3:** los dos modelos, `recordEvent` / `serializeEvent` / `listPageEvents`, y en `listMessages`, solo con `events=1`: `eventBounds` → `listPageEvents` → si `eventCutoff` da `T`, volver a pedir los eventos `>= T` del tramo sin límite, quedarse con los mensajes `>= T` y `nextCursor = T.toISOString()`; responder `events` serializados.
- [ ] **Step 4:** `npm run test:isolation` en verde, y `npm test`.
- [ ] **Step 5: commit** con `Backend/AGENTS.md` y `chat.md`.

---

### Task 4: Cada camino escribe su evento, sus avisos y sus resoluciones (PR 2)

**Files:**
- Modify: `Backend/src/services/assignment.service.js`, `Backend/src/services/assignment.history.service.js`
- Test: `Backend/tests/isolation/assignment-history.test.js`
- Docs: `docs/arquitectura/chat.md` (la tabla de spec § 4 y las resoluciones)

**Interfaces:**
- Consumes: Tasks 2 y 3.
- Produces, en `assignment.history.service.js`:
  - `createNotifications({ accountId, recipientIds, type, actorId, conversationId, requestId = null }) → Promise<doc[]>`: solo inserta; nunca lanza (devuelve `[]` si falla).
  - `emitNotificationsCreated(accountId, docs) → Promise<void>`: a cada destinatario, `notification_created` `{ notification, unseenCount }` serializado con **su** `auth`; nunca lanza.
  - `notifyMembers(args) → Promise<doc[]>`: `createNotifications` y después `emitNotificationsCreated`. Lo usan todos los caminos **menos** `requestTransfer`, que separa los dos pasos (revisión de Codex del plan, 3).
  - `resolveRequest({ accountId, conversationId, requestId, status: 'passed' | 'rejected' | 'gone', by = null }) → Promise<void>`: `updateMany({ conversationId, requestId, resolution: null }, { resolution: { status, by, at: new Date() } })` y `notification_updated` a cada destinatario; nunca lanza.
  - `serializeNotifications(auth, docs) → Promise<object[]>`: la forma de spec § 5.2, en una tanda (conversaciones con su contacto y `assignedTo`, actores); `canOpen = canSeeConversation(auth, conversation)`; `pending = String(conversation.transferRequest?.id) === String(doc.requestId)`; `canAnswer = canOpen && pending && canReassign(auth, conversation.assignedTo)`; sin conversación, `conversation: null`.
  - `memberAuth(accountId, userId) → Promise<auth | null>`: `sessionAuthFor` del `User` leído ahora.
- Cambios en `assignment.service.js` (cada `$set`/`$unset` lleva la fecha en una constante `at` que se reutiliza para el evento):
  - `acquireConversation` (ganó): `recordEvent(take)`.
  - `assignConversation`: escritura con `{ new: false }` (ya lo es) → con `previous.transferRequest` en mano; si `valid`: `take` (target = quien asigna), `release` (target `null`) o `assign` + `notifyMembers(assigned)`; y si `previous.transferRequest`: `resolveRequest` `passed` (target = solicitante, `by` = quien asigna) o `gone`.
  - `requestTransfer`:
    - la lectura inicial pasa a seleccionar `assignedTo lineId`, porque `requestRecipients` necesita la línea; sin ella, excluiría a quien la atiende y al supervisor (revisión de Codex del plan, 4);
    - la escritura pasa a `findOneAndUpdate({ … }, { $set }, { new: false })`, para saber qué solicitud reemplazó, y resuelve esa como `gone`;
    - si `confirmRequester` vale:
      1. `recordEvent(request)`;
      2. `createNotifications(requested, requestRecipients(miembros activos de la cuenta, { lineId, assignedTo }, solicitante))`;
      3. **relectura** de la conversación;
      4. si `transferRequest.id` ya no es esta, `resolveRequest(gone)` de esta y **no se emite**; si sigue, `emitNotificationsCreated` (spec § 4; revisión de Codex del plan, 3).
  - `answerTransfer` rechazada: `recordEvent(reject, target = solicitante)`, `notifyMembers(rejected)`, `resolveRequest(rejected, by)`. Aceptada y válida: `recordEvent(pass)`, `notifyMembers(passed)`, `resolveRequest(passed, by)`. Solicitante inválido: `resolveRequest(gone)`.
  - `confirmAssignee` y `confirmRequester`: su escritura pasa a `findOneAndUpdate(…, { new: false })`; si quitó una solicitud, `resolveRequest(gone)` de esa.
  - `releaseAssignments`: lee los `_id` candidatos y suelta **una por una** con `findOneAndUpdate({ _id, userId, assignedTo: member._id, ...filter }, …, { new: false })`, en tandas de 20 con `Promise.all`; para las que devolvieron documento, un `revoked` (`targetId = member._id`, `actorId: null`, `at` de esa escritura) con `insertMany` sin SSE por evento, y `resolveRequest(gone)` de su solicitud si tenía. Lo mismo, una por una, con las solicitudes que pidió esa persona. Sigue emitiendo un solo `conversations_updated`.
- [ ] **Step 1: tests que fallan** (en `assignment-history.test.js`; avisos leídos de la colección y con `openStream`):
  - Un test por fila de la tabla de spec § 4: el evento (tipo, actor, target), los avisos (a quién) y nada más. `requested`: lo reciben quien la atiende, el supervisor con la línea y el owner, no el solicitante.
  - `'asignar al solicitante resuelve passed; asignar a otro, gone'`.
  - Un test por fila de la tabla de resoluciones de spec § 4 (incluidas `confirmAssignee` y `confirmRequester`, llamadas como en los tests de la Fase 4 con un `User` ya cambiado).
  - `'confirmAssignee deshace: ni evento ni aviso'`.
  - `'una solicitud aceptada mientras requestTransfer aún no creó sus avisos no deja ninguno pendiente'`: sustituir `Notification.insertMany` para que, antes de insertar, acepte la solicitud con otra sesión. Después, en la colección, todos los `requested` de esa solicitud tienen `resolution`; con `serializeNotifications` del supervisor, `request.pending: false` y `canAnswer: false`; y con `openStream` de los destinatarios, **ningún** `notification_created` de esa solicitud (revisión de Codex del plan, 3). La comprobación por HTTP va en la Tarea 5 (revisión de Codex del plan, 7).
  - `'requestTransfer real: el requested lo reciben Ana (la atiende), el supervisor con la línea y el owner'`: por el endpoint, no llamando a `requestRecipients` (revisión de Codex del plan, 4).
  - `'dos reasignaciones con las confirmaciones en orden inverso quedan en orden'`, con una **barrera** (revisión de Codex del plan, 8):
    - envolver `Conversation.findOneAndUpdate` para que marque cuándo la petición de A ya escribió;
    - envolver `User.findOne` para que **solo después de esa marca**, y una vez, retenga la lectura (la de `confirmAssignee` de A) hasta soltarla;
    - con A retenida, B reasigna a Marta;
    - comprobar en la colección que la conversación es de Marta, soltar a A y esperarla;
    - el hilo trae `assign → Luis` antes que `assign → Marta`.
  - `'releaseAssignments no escribe revoked en una conversación que otro movió entre leer y soltar'`: sustituir `Conversation.findOneAndUpdate` para mover una de las candidatas justo antes de su escritura.
  - `'notification_updated le llega al supervisor cuando Ana acepta'` (Review Focus).
- [ ] **Step 2:** fallan.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npm test && npm run test:isolation` en verde (también los de la Fase 4 sin tocar sus aserciones).
- [ ] **Step 5: commit** con `chat.md`.

---

### Task 5: Los endpoints de los avisos y el push (PR 2)

**Files:**
- Create: `Backend/src/routes/notification.routes.js`, `Backend/src/controllers/notification.controller.js`, `Backend/src/schemas/notification.schema.js`
- Modify: `Backend/src/app.js` (montar en `/api`), `Backend/src/services/push.service.js`
- Test: `Backend/tests/isolation/notifications.test.js` (nuevo), `Backend/tests/isolation/push.test.js`
- Docs: `docs/arquitectura/api.md` (los dos endpoints), `docs/arquitectura/chat.md` (los SSE y el push)

**Interfaces:**
- Consumes: Tasks 2 a 4.
- Produces:
  - `GET /api/notifications?before=<cursor>` (`authRequired`) → `{ items, nextCursor: string | null, unseenCount }`, con el orden del spec § 5.2 (`createdAt` y `_id`; revisión de Codex del plan, 10):
    - el cursor es opaco, `<createdAt ISO>_<_id>`, del último de la página;
    - la consulta es `{ userId: accountId, recipientId: userId }` y, con cursor, `$or: [{ createdAt: { $lt: d } }, { createdAt: d, _id: { $lt: id } }]`;
    - orden `sort({ createdAt: -1, _id: -1 })`, pidiendo `NOTIFICATIONS_PER_PAGE + 1` para saber si hay más;
    - un cursor mal formado → 400.

    El cursor lo arman y lo leen dos funciones puras de `utils/conversation.events.js`, `encodeCursor(doc)` y `decodeCursor(text) → { createdAt, id } | null`, con test.
  - `POST /api/notifications/seen` (`authRequired`, `notificationsSeenSchema` = `{ ids: string[] (1 a 100, ObjectId) }` o `{ all: true }`) → `{ unseenCount }`; `updateMany` con `{ userId, recipientId, seenAt: null, … }`; emite `notifications_seen` `{ unseenCount }` a la persona.
  - `notifyAssignment({ accountId, conversationId, recipientId, actorName, kind }) → Promise<void>` en `push.service.js`: como `notifyInbound`, con `members` = el destinatario, `pushRecipientIds([member], accountId, meta)` y `String(meta.assignedTo) === String(recipientId)`; payload `buildAssignmentPush`. Se llama sin `await` desde `assignConversation` (tras `assign`, `kind: 'assigned'`) y desde `answerTransfer` aceptada (`kind: 'passed'`), justo después de su `notifyMembers`.
- [ ] **Step 1: tests que fallan:**
  - `notifications.test.js`: Ana no lee ni marca los de Luis (sus ids en `ids` no cambian nada y `unseenCount` de Luis sigue igual); otra cuenta, igual; sin sesión, 401; con API key, 401.
  - `'35 avisos: dos páginas, sin repetir, y unseenCount 35'`; después de `{ all: true }`, 0 (Review Focus).
  - `'avisos con el mismo createdAt, o con los _id en otro orden que createdAt, se recorren por createdAt sin perder ninguno'` (revisión de Codex del plan, 10).
  - `'una solicitud aceptada mientras se creaban sus avisos sale por HTTP con pending y canAnswer falsos'` (la parte HTTP del test de la Tarea 4).
  - `'un aviso de una conversación borrada sale con conversation: null'` (Review Focus).
  - `'canAnswer es falso para un supervisor que perdió la línea'`.
  - `push.test.js`: asignar a Luis → push solo a sus suscripciones, con el cuerpo de `buildAssignmentPush`; asignárselo a uno mismo, ninguno; `'no sale si ya no es suya al enviar'`; y `'no sale si le quitaron la línea antes de soltarla'`, llamando **directamente** a `notifyAssignment` con la situación ya guardada (revisión de Codex del plan, 9):
    - la conversación sigue asignada a Luis;
    - el `User` de Luis está guardado sin la línea, sin llamar a `releaseAssignments`;
    - comprobar que sigue asignada y que no sale push;
    - y como control, con la línea, sí sale.
- [ ] **Step 2:** fallan.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npm test && npm run test:isolation` en verde.
- [ ] **Step 5: commit** con `api.md` y `chat.md`; PR 2 con su revisión de Codex.

---

### Task 6: La historia en el hilo (PR 3, rama `avisos-hilo`)

**Files:**
- Modify: `Frontend/src/models/message.mode.ts` (o un `models/conversation.event.model.ts` nuevo: `ConversationEvent`), `Frontend/src/context/sse.context.ts`, `Frontend/src/context/sse.provider.tsx` (el `Set` de `conversation_event` en el registro y su `onConversationEvent: dispatch("conversation_event")`; revisión de Codex del plan, 1), `Frontend/src/services/api.service.ts` (pedir los mensajes con `events=1` cuando `hasTeam`, la respuesta con `events` y el handler `onConversationEvent`), `Frontend/src/hooks/useConversationMessages.ts`, `Frontend/src/utils/assignment.ts`, `Frontend/src/components/Chat/ChatThread.tsx`
- Create: `Frontend/src/components/Chat/Assignment/ConversationEventLine.tsx`
- Delete: `Frontend/src/components/Chat/Assignment/AssignmentNotice.tsx`
- Docs: `docs/arquitectura/chat.md` (la historia en la UI; ya no hay aviso flotante en el hilo)

**Interfaces:**
- Consumes: Task 3 (`events` en cada página, `conversation_event`), Task 1 (`notify`).
- Produces:
  - `type ConversationEventType = 'take' | 'assign' | 'release' | 'request' | 'pass' | 'reject' | 'revoked'` y `interface ConversationEvent { id; type; actor: ConversationPerson | null; target: ConversationPerson | null; timestamp: string }`.
  - `useConversationMessages` devuelve además `events: ConversationEvent[]` (todas las páginas, sin repetir por `id`).
  - `eventText(event: ConversationEvent, viewerId: string) → string` en `utils/assignment.ts`, con los textos de 6b (nombre de pila con `firstName`):
    - `take`: «Tomaste esta conversación» / «{A} tomó esta conversación»;
    - `assign`: «Le asignaste esta conversación a {T}» / «{A} te asignó esta conversación» / «{A} le asignó esta conversación a {T}»;
    - `release`: «Dejaste esta conversación sin asignar» / «{A} dejó esta conversación sin asignar»;
    - `request`: «Pediste esta conversación» / «{A} pidió esta conversación»;
    - `pass`: «Se la pasaste a {T}» / «{A} te la pasó» / «{A} se la pasó a {T}»;
    - `reject`: «Rechazaste pasársela a {T}» / «{A} rechazó pasártela» / «{A} rechazó pasársela a {T}»;
    - `revoked`: «Esta conversación quedó sin asignar: ya no tienes acceso a la línea» / «Esta conversación quedó sin asignar: {T} ya no tiene acceso a la línea».

- [ ] **Step 1: el hook.** Cada página guarda `events`; `conversation_event` del `conversationId` abierto lo añade a la primera página si su `id` no está. Si llega con la consulta en curso o sin datos, `cancelQueries` y `invalidateQueries`, como `message_updated` (spec § 8.2).
- [ ] **Step 2: el hilo.** Mezclar mensajes y eventos por fecha (a igual fecha, el evento antes), solo si `hasTeam(user)`. **Una página puede venir sin mensajes** (la recortaron los eventos): «No hay mensajes todavía» solo cuando no hay ni mensajes ni eventos cargados **y** no hay `nextCursor`, y el disparador de cargar los anteriores se monta siempre que haya `nextCursor`, aunque esa página no tenga mensajes (revisión de Codex del plan, 2). `ConversationEventLine` como 6a: centrada, `max-width: 84%`, mini avatar de 18 px de quien lo hizo (menta `#6fe3ae`/`#06251c` si es quien mira, `#e4e7eb`/`#2e3540` si no; en `revoked`, la casilla punteada de 16 px), texto 12,5 px `#4b5361` y la hora en mono 11 px `#97a1ad`. Los separadores de día cuentan también los eventos.
- [ ] **Step 3: quitar el aviso flotante y la barra.** Borrar `toast`/`showToast`/`toastText`/`TOAST_MS` y `assignmentNotice` de `ChatThread`, y `AssignmentNotice.tsx`. Pasan a `notify`: el error de reaccionar (`'error'`, el texto de hoy: «No se pudo reaccionar. {motivo} El mensaje quedó como estaba.»), el mensaje muy antiguo (`'error'`, «Este mensaje es muy antiguo: Wasmish no puede ir hasta él.»), «La conversación cambió de manos. Vuelve a intentarlo.», «La solicitud cambió. Revísala de nuevo.» y «Tu mensaje no se envió: la conversación cambió de manos mientras tanto. Lo dejamos en el campo.» (`'info'`). Las confirmaciones **de éxito** de asignar, soltar, tomar, pasar, rechazar y «Respondiste: ahora la atiendes tú.» se quitan sin reemplazo. **Los errores generales** se quedan como `notify({ kind: 'error', text: message })` (revisión de Codex del plan, 6): un `invalid_assignee` o un fallo de red en `AssigneeControl` (su `onToast(message)`) y los de `answerRequest` en `ChatThread`. `onToast` de `AssigneeControl` pasa a llamarse `onError`.
- [ ] **Step 4:** `npm run lint && npm run build`.
- [ ] **Step 5: navegador:** los siete tipos vistos desde quien lo hizo, quien lo recibe y un tercero (la tabla 6b); recargar no duplica; un evento que llega con el chat recién abierto no se pierde; una cuenta de una persona no enseña eventos; 390 px.
- [ ] **Step 6: commit** con `chat.md`; PR 3 con su revisión de Codex.

---

### Task 7: Los avisos en el frontend (PR 4, rama `avisos-campanita`)

**Files:**
- Create: `Frontend/src/models/notification.model.ts`, `Frontend/src/hooks/useNotifications.ts`
- Modify: `Frontend/src/services/api.service.ts`, `Frontend/src/context/sse.context.ts`, `Frontend/src/context/sse.provider.tsx`, `Frontend/src/hooks/useTransferRequest.tsx`, `Frontend/src/components/Layout/PrivateLayout.tsx`

**Interfaces:**
- Consumes: Task 5, Task 1.
- Produces:
  - `AppNotification` con la forma de spec § 5.2 (`type: 'assigned' | 'passed' | 'rejected' | 'requested'`).
  - `getNotificationsService(before?: string) → Promise<{ items: AppNotification[]; nextCursor: string | null; unseenCount: number }>`, `markNotificationsSeenService(body: { ids: string[] } | { all: true }) → Promise<{ unseenCount: number }>`.
  - `useNotifications() → { items, unseenCount, hasMore, loadMore(), isLoading, markSeen(ids), markAllSeen(), refresh() }`: `useInfiniteQuery` con la clave `['notifications']`; `unseenCount` en su propia caché (`['notifications', 'unseen']`), que actualizan las respuestas y los SSE. `notification_created` antepone el aviso; `notification_updated` lo reemplaza por `id`; `notifications_seen` fija el contador e invalida la lista. `conversation_assigned`, `conversation_revoked` y `conversations_updated` invalidan la lista (cambia `canOpen`).
  - `useNotificationToasts()`, montado en `PrivateLayout` **junto a** `useTransferAnswers`, que sigue montado: le toca escribir el estado de la ficha e invalidar los contactos al aceptar; solo pierde el aviso (revisión de Codex del plan, 5): con `notification_created`, `notify({ kind: 'new', text, action })`. Textos (los de 7a y del prototipo, con el contacto): `assigned` «{A} te asignó la conversación con {contacto}.»; `passed` «{A} te pasó la conversación con {contacto}.»; `rejected` «{A} no te pasó la conversación con {contacto}.» (`kind: 'info'`, sin acción); `requested` «{A} pide la conversación con {contacto}.». Acción «Abrir» solo si `canOpen`: marca visto y navega como hoy (`ChatsNavigationState`).
- [ ] **Step 1:** tipos, servicios y los cuatro SSE nuevos en `SSEEventMap` y en la lista de `api.service.ts`.
- [ ] **Step 2:** `useNotifications` y `useNotificationToasts`. `useTransferAnswers` sigue montado en `PrivateLayout` y solo deja de abrir el aviso (sigue escribiendo el estado de la ficha e invalidando los contactos con `transfer_answered`). En el navegador: la ficha y «Conversación nueva» se actualizan al aceptar y al rechazar.
- [ ] **Step 3:** `npm run lint && npm run build`.
- [ ] **Step 4: commit.**

---

### Task 8: La campanita, según el diseño (PR 4)

**Files:**
- Create: `Frontend/src/components/Notifications/NotificationBell.tsx`, `Frontend/src/components/Notifications/NotificationPanel.tsx`, `Frontend/src/components/Notifications/NotificationItem.tsx`
- Modify: `Frontend/src/components/Sidebar/Sidebar.tsx`, `Frontend/src/components/Layout/PrivateLayout.tsx`, `Frontend/src/components/Chat/ConversationList.tsx`, `Frontend/src/utils/assignment.ts` (`notificationText`)
- Docs: `docs/arquitectura/chat.md` (la campanita), `docs/arquitectura/frontend.md` (la lista de hooks)

**Interfaces:**
- Consumes: Task 7.
- Produces: `notificationText(n: AppNotification, viewerId: string) → { who: string; rest: string; note: string }`, del prototipo (`notifView`):
  - `rest`: `assigned` «te asignó una conversación»; `passed` «te pasó la conversación» (nota «Aceptó tu solicitud.»); `rejected` «rechazó pasarte la conversación»; `requested` «pide que le pases la conversación» si la atiende quien mira, si no «pide que le pasen la conversación».
  - `note` de un `requested` resuelto: `passed` «Se la pasaste a {who}.» / «{by} se la pasó a {who}.»; `rejected` «La rechazaste.» / «{by} la rechazó.»; `gone` o no pendiente sin `resolution`: «Ya no está pendiente.».
  - Sin `canOpen`: «Ahora la atiende {persona o tú}. Ya no la puedes abrir.», o «Ya no la puedes abrir.»; en `rejected`, «La sigue atendiendo {persona}.» o nada.

- [ ] **Step 1: `NotificationBell`** (solo si `hasTeam(user)`): campana con el número de sin ver (insignia menta `#6fe3ae`/`#06251c` con borde del color de la barra; vacío sin número). En el `Sidebar`, como un `SidebarItem` «Avisos» encima de «Ajustes» (con la barra colapsada, el icono con la insignia; desplegada, el texto y la insignia). En el celular, en la barra de `PrivateLayout` (a la derecha) y en la cabecera de la bandeja de `ConversationList` (junto al ☰).
- [ ] **Step 2: `NotificationPanel`.** Computadora (5a): sale desde el botón (`left` junto a la barra, abajo), 410 px de ancho, alto máximo 660 px, con una capa invisible que lo cierra al pulsar fuera. Celular (m2): pantalla completa con «‹ Avisos». Cabecera: «Avisos», «N sin ver», «Marcar todos como vistos» (solo con sin ver). Lista con «cargar más» al llegar al final (`IntersectionObserver`). Vacío: «No tienes avisos» / «Aquí te esperan las conversaciones que te asignen o que te pidan.». Al abrirlo, `refresh()`.
- [ ] **Step 3: `NotificationItem`** como 5a/m2: avatar de 32 px (38 en el celular) con las iniciales de quien lo hizo, «**{who}** {rest}», el contacto, el cuadrado de color de su línea, el nombre de la línea y la hora (mono); la nota; sin ver: fondo `#f1fbf6` y punto `#2fae7a`; sin `canOpen`: opacidad 0,62 y sin cursor. Tocarlo: `markSeen([id])` y, con `canOpen`, abrir la conversación y cerrar el panel. Un `requested` con `canAnswer`: **Rechazar** y **Pasársela a {who}** (`answerTransferService` con `request.requestId`; marca visto). Un 409 (`transfer_request_changed`, `assignment_changed`) → `notify({ kind: 'info', text: 'La solicitud cambió. Revísala de nuevo.' })` y `refresh()` (Review Focus).
- [ ] **Step 4:** `npm run lint && npm run build`.
- [ ] **Step 5: navegador** (owner, supervisor, Ana y Luis; 1280 y 390 px): asignar → aviso arriba y campanita en el otro, push en el celular; pedir → el aviso con botones al que la atiende y al supervisor; aceptar desde la campanita → el del supervisor cambia a «Ana se la pasó a Luis.» sin recargar; marcar todos; una conversación que ya no es tuya, en gris; más de 30 avisos (sembrados) cargan los anteriores; cuenta de una persona, sin campanita.
- [ ] **Step 6: commit** con `chat.md` y `frontend.md`; PR 4 con su revisión de Codex.

---

## Al terminar

- `docs/estado.md`: «En curso» con lo hecho y lo que falta probar; con los cuatro PRs unidos, `version-1.0.34` (con `npm run version:bump`) y el despliegue cuando Jonathan diga: api y web, sin migración (spec § 11).
- `/graphify --update` (con Codex, como el 2026-10-28).

## Decisiones del plan (para revisar)

- **Un cuarto tipo de aviso, `success`** (confirmado por Jonathan el 2026-10-28, tras la revisión de Codex del plan, 11), con los colores de `info` y el icono `Check`: el diseño solo define error, aviso y nuevo, pero hoy hay confirmaciones («ID de la línea copiado.», «Guardado.») que con el icono de «volver a mirar» se leerían mal.
- **`events=1` en `GET /chats/:id/messages`:** el spec decía que el endpoint devuelve los eventos sin más; el plan los hace opcionales para que una página recortada no llegue a un frontend que no la entiende (revisión de Codex del plan, 2).
- **Un `revoked` no se emite por SSE** evento a evento: quitar el acceso ya manda un solo `conversations_updated` (pueden ser cientos), y el hilo lo enseña al volver a cargarse.
- **`releaseAssignments` en tandas de 20** escrituras en paralelo.
- **El resultado de etiquetar varios** pasa de una tarjeta con negritas a una frase.
