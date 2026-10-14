# Multi-línea · Fase 3: equipo, roles y acceso por línea — Implementation Plan

> **Para quien lo ejecute:** en Wasmish los planes se ejecutan **nativo** (rama, PR, revisión cruzada; ver «Planes» en `AGENTS.md`). Las referencias de `writing-plans` a `subagent-driven-development` o `executing-plans` no aplican. Los pasos usan casillas (`- [ ]`).

**Goal:** Que una cuenta tenga **varios usuarios** con un rol (owner, admin, supervisor, agente) y, los dos últimos, una lista de líneas. Cada uno ve y hace solo lo que su rol y sus líneas le dejan. El owner y los admins invitan con un enlace de un solo uso, cambian roles y líneas y desactivan, dentro de `Account.limits.maxUsers`. El chat dice quién respondió cada mensaje.

**Architecture:** La sesión ya trae `req.auth = { userId, accountId, role, lineIds, isSuperadmin }`, leída de la BD en cada petición (Fase 1). Encima van:
- una función pura, `utils/permissions.js` (`can`, `lineScope`, `conversationScope`, `canReceive`, `permissionsFor`);
- un middleware `requirePermission(action)` en las rutas que el rol puede no tener (403);
- el filtro de líneas en **todas** las búsquedas de conversaciones, campañas y líneas (una línea sin acceso da 404, como lo de otra cuenta).

El SSE guarda la sesión de cada conexión y filtra cada evento con `canReceive`. Cambiar el rol, las líneas o el estado de alguien cierra sus conexiones (`disconnectUser`). El equipo y las invitaciones son un controlador nuevo, `team.controller.js`, con su lógica pura en `utils/team.js`. La UI va al final y sigue el diseño de Claude Design.

**Tech Stack:** Express 5, Mongoose 8, Zod, `node:test`, `mongodb-memory-server`; React 19, TypeScript, React Query, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-11-multi-linea-multi-agente-design.md`: § 3.2 (sesión), § 3.3 (roles, matriz y cómo se aplica), § 3.4 («Tiempo real»), § 3.5 (`maxUsers`), § 4 «Fase 3», § 6 (cómo probarlo), § 7 y § 8 (respuestas de Jonathan). Brief de la UI: `docs/superpowers/specs/2026-10-14-equipo-brief-ui.md`; diseño de Claude Design: `Design/Wasmish Equipo - Usuarios, roles y acceso.html` (entra al repo con el PR de la UI).

## Global Constraints

- **La matriz de la spec § 3.3 manda.** Owner y admin ven todas las líneas; supervisor y agente, solo `lineIds`. El superadmin (`isSuperadmin`) no es un rol de la cuenta y no cambia.
- **Una acción que el rol no tiene → 403** (`requirePermission`): es su propia cuenta, no hay nada que ocultar. **Una conversación, campaña o línea fuera de sus líneas → 404**, igual que lo de otra cuenta (regla 1 de `AGENTS.md`).
- **La autoridad es el backend.** El frontend no copia la matriz: `/verify`, el login y aceptar una invitación devuelven `permissions: string[]` y `lineIds` (`null` = todas), y la UI decide con `can(action)`.
- **La API key no cambia nada:** `role: 'api'`, `lineIds: null`. El cliente de la API pública no nota nada.
- **`maxUsers` cuenta los usuarios activos (owner incluido) más las invitaciones pendientes.** Superarlo → 409. Bajarlo nunca desactiva a nadie ni anula una invitación (spec § 3.5).
- **Un correo es una persona en una sola cuenta** (`User.email` sigue siendo único global; spec § 7.1). Una invitación caduca a los **7 días** y su token se guarda **hasheado** (`hashApiKey`), como las API keys.
- **Sin asignación todavía** (Fase 4): hasta entonces un agente ve todas las conversaciones de sus líneas. `conversationScope` es el único sitio que la Fase 4 cambiará.
- **Volver atrás:** las imágenes anteriores a esta fase no conocen los permisos. Se puede desplegar con todas las cuentas en `maxUsers: 1`. **Antes de subir `maxUsers` en una cuenta real**, se ensaya la vuelta atrás con dos usuarios (spec § 5).
- Identificadores nuevos en inglés; textos al usuario, comentarios, commits y documentación, en español. Errores como `[{ message, code }]`. Commits sin coautor ni atribución.
- **Cuatro PRs**, cada uno con su rama: permisos (Tareas 1 a 3), tiempo real (Tarea 4), equipo e invitaciones (Tareas 5 y 6), UI (Tareas 7 y 8, cuando esté el diseño). Los tres primeros no cambian nada visible mientras las cuentas tengan un solo usuario.
- Comprobar con `cd Backend && npm test && npm run test:isolation`; en la Tarea 3 y en las de UI, también `cd Frontend && npm run lint && npm run build`. La UI se prueba en el navegador con una sesión de owner y otra de agente (spec § 6).

## Review Focus

- **Un agente pide por id una conversación, sus mensajes, un adjunto o una campaña de una línea que no es suya:** 404, igual que si fuera de otra cuenta, y sin enviar nada a Meta → tests en las Tareas 2 y 3.
- **Un agente empieza una conversación sin elegir línea, y la línea por defecto de la cuenta no es suya:** sale por su única línea; si tiene varias, 400 «Elige la línea»; si no tiene ninguna, 404. Nunca por una línea ajena → test en la Tarea 2.
- **Al supervisor le quitan una línea, o pasa a agente, con Chats abierto:** su conexión SSE se cierra y la nueva ya no recibe los eventos de esa línea → test en la Tarea 4.
- **Dos admins invitan a la vez con una sola plaza libre, alguien invita mientras otro acepta o reactiva, o una invitación se acepta dos veces:** nunca hay más plazas ocupadas que `maxUsers`, y el enlace solo crea un usuario → tests en las Tareas 5 y 6 (revisión de Codex).
- **Un admin intenta cambiar o desactivar al owner, o cualquiera se cambia a sí mismo el rol o el estado:** 403 y nada cambia → test en la Tarea 5.

---

### Task 1: Los permisos, como funciones puras (PR 1, rama `fase3-permisos`)

**Files:**
- Create: `Backend/src/utils/permissions.js`
- Test: `Backend/tests/permissions.test.js`
- Modify: `Backend/src/utils/account.js` (`sessionAuthFor` añade `name`, para firmar los mensajes en la Tarea 6) y su test en `Backend/tests/account.test.js`; `Backend/src/middlewares/validate.token.middleware.js` (selecciona también `name`)

**Interfaces:**
- Produces (todo en `utils/permissions.js`):
  - `ROLES = ['owner', 'admin', 'supervisor', 'agent']`.
  - `PERMISSIONS`, acción → roles que la tienen. Lo que no está aquí lo puede hacer cualquier rol: ver y responder conversaciones de sus líneas, ver y editar contactos, ver plantillas, ver sus líneas.
    ```js
    {
      'contacts.import':  ['owner', 'admin', 'supervisor'],
      'contacts.delete':  ['owner', 'admin', 'supervisor'],
      'tags.manage':      ['owner', 'admin', 'supervisor'],   // crear, renombrar y borrar etiquetas, y etiquetar en bloque
      'templates.manage': ['owner', 'admin', 'supervisor'],   // sincronizar y subir/quitar la cabecera
      'campaigns.manage': ['owner', 'admin', 'supervisor'],   // ver, crear, pausar, reanudar y cancelar (en sus líneas)
      'apiKeys.manage':   ['owner', 'admin'],
      'lines.manage':     ['owner', 'admin'],                 // conectar (los dos caminos), renombrar, por defecto, desconectar y ver el PIN
      'team.manage':      ['owner', 'admin'],
    }
    ```
  - `can(auth, action) → boolean`. Falso para una acción desconocida y para `role: 'api'`.
  - `lineScope(auth) → string[] | null`. `null` (todas) para owner, admin y api; `auth.lineIds` para supervisor y agente.
  - `inLineScope(auth, lineId) → boolean`. Con `lineScope` `null`, siempre verdadero; si no, `lineId` (ObjectId o string, o `null`) tiene que estar en la lista. Una conversación sin línea (`lineId: null`) queda fuera para supervisor y agente.
  - `conversationScope(auth) → object`. El filtro de Mongo que se suma a `{ userId: accountId }`: `{}` sin límite de líneas, o `{ lineId: { $in: [ObjectId…] } }`. En la Fase 4 añadirá `assignedTo` para el agente.
  - `permissionsFor(auth) → string[]`: las acciones de `PERMISSIONS` que tiene, en el orden de la tabla.

- [ ] **Step 1: Tests** en `Backend/tests/permissions.test.js`
  - `can`: owner y admin tienen las 8 acciones; supervisor, las 5 primeras y no `apiKeys.manage`, `lines.manage` ni `team.manage`; agente, ninguna; `role: 'api'`, ninguna; `can(owner, 'no.existe')` es falso.
  - `lineScope`: `null` para owner, admin y api aunque traigan `lineIds`; `['l1', 'l2']` para un agente con esas líneas; `[]` para un agente sin líneas.
  - `inLineScope`: un agente con `['l1']` → `l1` verdadero (también como ObjectId), `l2` falso, `null` falso; un owner → `null` verdadero.
  - `conversationScope`: `{}` para owner; para un agente, `{ lineId: { $in: [...] } }` con ObjectIds (`String()` de cada uno da los originales); para un agente sin líneas, `{ lineId: { $in: [] } }`, que no encuentra nada.
  - `permissionsFor`: la lista exacta para cada rol.
  - `sessionAuthFor` (en `account.test.js`): devuelve también `name`.

- [ ] **Step 2:** `cd Backend && npm test` → fallan.
- [ ] **Step 3: Implementar** `utils/permissions.js` y el `name` de `sessionAuthFor`.
- [ ] **Step 4:** `cd Backend && npm test` → en verde.
- [ ] **Step 5: Commit** — `git commit -m "Los permisos de cada rol, como funciones puras"`

### Task 2: Aplicar los permisos y las líneas en las rutas (PR 1)

**Files:**
- Create: `Backend/src/middlewares/require.permission.middleware.js`
- Modify: las rutas `contact.routes.js`, `tag.routes.js`, `template.routes.js`, `campaign.routes.js`, `api.key.routes.js`, `line.routes.js`, `user.routes.js`, `whatsapp.routes.js`
- Modify: las búsquedas en `chat.controller.js` (las de las líneas 157, 182, 214, 278, 323, 361 y 430 de hoy), `media.controller.js:19`, `contact.controller.js` (`findContactConversations` y las conversaciones que **enseña** el listado), `template.controller.js` (`templateWabasFor`, la de `GET /templates?lineId=`), `campaign.controller.js` (listar, ver, fallos, destinatarios, pausar, reanudar, cancelar y crear) y `line.controller.js` (`listLines`, `findOwnedLine`)
- Modify: `Backend/src/utils/line.js` (nueva función pura `pickSendingLineId`) y su test en `Backend/tests/line.test.js`
- Modify: `docs/arquitectura/api.md` (columna de permisos en la tabla de rutas, o una sección «Roles y permisos» con la matriz), `Backend/AGENTS.md` (regla: toda búsqueda de conversación lleva `conversationScope`)
- Test: `Backend/tests/isolation/permissions.test.js` (nuevo), con un ayudante nuevo en `helpers.js`

**Interfaces:**
- Consumes: Tarea 1.
- Produces:
  - `requirePermission(action)`: un middleware que va detrás de `authRequired`. Si `!can(req.auth, action)`, responde `403 [{ message: 'Tu rol no permite esta acción.', code: 'forbidden' }]`.
  - Las rutas que lo llevan:
    - `contacts.import`: `POST /contacts/import/preview` y `POST /contacts/import`.
    - `contacts.delete`: `DELETE /contacts/:id`.
    - `tags.manage`: `POST /tags`, `PATCH /tags/:id`, `DELETE /tags/:id` y `POST /contacts/tags`.
    - `templates.manage`: `GET /templates/sync` y las tres de `header-media`, salvo `GET /templates/media/:id`, que es para ver.
    - `campaigns.manage`: todas las de `/campaigns`.
    - `apiKeys.manage`: las tres de `/api-key`.
    - `lines.manage`: `PATCH /lines/:id`, `POST /lines/:id/disconnect`, `GET /lines/:id/pin`, `PUT /users/update-user-token-whatsapp` y `POST /whatsapp/connect`.
  - Toda búsqueda de conversación de una persona pasa de `{ _id, userId }` a `{ _id, userId, ...conversationScope(req.auth) }`.
  - `listLines` y `findOwnedLine` filtran por `lineScope`, así que un agente solo ve y pide sus líneas. `nextDefaultLineId` sale `null` para supervisor y agente.
  - Campañas: el listado filtra `lineId ∈ lineScope`; una campaña fuera de alcance → 404. Crear con un `lineId` fuera de alcance → 404 (`LINE_NOT_FOUND_MESSAGE`).
  - Plantillas: `GET /templates?lineId=<línea fuera de alcance>` → 404, como una ajena (`templateWabasFor` recibe el `auth`); sin `lineId`, las de los WABA de las líneas a su alcance. La API pública (`resolveApiLine`) no cambia: la API key llega a todas (revisión de Codex).
  - Contactos: **los filtros «con conversación» y «sin conversación» miran cualquier conversación del contacto**, sea de la línea que sea; así `contactSelectionStages` no cambia, y las selecciones que lo reutilizan (campañas, etiquetar en bloque) tampoco. Lo que se **enseña** (`conversations`, `conversation` y la ventana) se filtra después a las líneas a su alcance, con un `$addFields` + `$filter` en `listContacts` y el mismo filtro en `findContactConversations` (revisión de Codex).
  - `pickSendingLineId({ requestedLineId, defaultLineId, accessibleLineIds }) → { lineId } | { error: 'choose_line' | 'no_line' }`: es la regla de «empezar una conversación sin elegir línea».
    - Si se pidió línea, esa (el alcance se comprueba después).
    - Con `accessibleLineIds === null`, la por defecto.
    - Si la por defecto es accesible, la por defecto.
    - Si no, la única accesible (`accessibleLineIds` son las **activas** a las que llega).
    - Con varias accesibles → `choose_line` (400 «Elige por qué línea enviar.», `code: 'choose_line'`).
    - Sin ninguna → `no_line` (404 `LINE_NOT_FOUND_MESSAGE`).

    La usan `sendMessageController` sin conversación y `startConversationTemplateController`, antes de `findSendingLine`. Una línea pedida fuera de alcance → 404.
  - En `helpers.js`: `seedMember(account, { role, lineIds = [], label })`, que crea un `User` de esa cuenta con ese rol y devuelve `{ userId, token }`, como `seedAccount`.

- [ ] **Step 1: Test puro de `pickSendingLineId`** en `tests/line.test.js`, con los casos de arriba: pedida; `null` → por defecto; por defecto accesible; única accesible distinta de la por defecto; dos accesibles → `choose_line`; ninguna → `no_line`.
- [ ] **Step 2: Tests de aislamiento** en `tests/isolation/permissions.test.js`. La cuenta A tiene dos líneas (`maxLines: 2`, `connectWhatsapp` dos veces), una conversación en cada una, una campaña en la segunda y un agente y un supervisor con acceso solo a la primera.
  - El agente → 404 en `GET /chats/:id/messages`, `GET /media/:id`, `POST /chats/:id/messages`, `POST /chats/:id/media` y `POST /chats/:id/template` de la conversación de la segunda línea, **sin ninguna llamada a Meta**.
  - `GET /chats` del agente solo trae la de la primera.
  - `GET /lines` del agente solo trae la primera; `PATCH /lines/<segunda>` → 403 (el permiso se comprueba antes de buscar).
  - El agente → 403 en `GET /campaigns`, `POST /api-key/generate`, `POST /tags`, `POST /contacts/import`, `DELETE /contacts/:id`, `GET /templates/sync` y `POST /whatsapp/connect`.
  - El supervisor: `GET /campaigns` no trae la de la segunda línea; `GET /campaigns/<de la segunda>` → 404; `POST /campaigns` con la segunda línea → 404.
  - El agente con `GET /contacts`: ve todos los contactos de la cuenta, pero el contacto de la conversación de la segunda línea sale **sin** esa conversación (ni última, ni ventana). Con `filter=with_conversation`, ese contacto **sí** sale (tiene conversación, aunque no la vea); con `without_conversation`, no. `GET /contacts/:id` tampoco enseña esa conversación.
  - El agente con `GET /templates?lineId=<segunda>` → 404; sin `lineId`, solo las del WABA de la primera.
  - Regresión que vigila (la línea por defecto es la segunda): el agente que empieza una conversación sin `lineId` sale por la primera; si se le da también la segunda, el sin `lineId` da 400 `choose_line`.
  - El owner hace todo lo anterior como hoy (200), y la API key también (`/v1/templates/send` sin `lineId`).
- [ ] **Step 3:** `cd Backend && npm test && npm run test:isolation` → fallan los nuevos.
- [ ] **Step 4: Implementar** el middleware, las rutas, el filtro en cada búsqueda y `pickSendingLineId`. Revisar con `grep -n "Conversation\.\(find\|findOne\|updateOne\|exists\)" Backend/src/controllers` que ninguna búsqueda de una persona se quede sin `conversationScope`. El webhook, el worker y `processTemplateSending` buscan por la cuenta del sistema, no por la de una persona, y no cambian.
- [ ] **Step 5:** `cd Backend && npm test && npm run test:isolation` → en verde. Documentación: `api.md` y `Backend/AGENTS.md`.
- [ ] **Step 6: Commit** — `git commit -m "Cada rol hace lo suyo y ve solo sus líneas"`

### Task 3: La sesión dice qué puede hacer (PR 1)

**Files:**
- Modify: `Backend/src/controllers/auth.controller.js` (`register`, `login`, `verifyToken`)
- Modify: `Frontend/src/models/user.mode.ts` (los campos nuevos, sin usarlos todavía: la UI es la Tarea 7)
- Modify: `docs/arquitectura/api.md` (la respuesta de login y `/verify`)
- Test: `Backend/tests/isolation/account.test.js`

**Interfaces:**
- Consumes: `permissionsFor`, `lineScope`, `sessionAuthFor`.
- Produces: la respuesta de `register`, `login` y `/verify` añade `role`, `permissions: string[]`, `lineIds: string[] | null` (`lineScope`) y `account: { name, memberCount, managers }`. El resto no cambia.
  - `memberCount`: los usuarios **activos** de la cuenta. El diseño enseña el rol bajo el nombre en el menú lateral y quién respondió cada mensaje **solo con más de una persona** en la cuenta.
  - `managers: [{ name, role }]`: el owner y los admins activos, solo nombre y rol. El diseño los nombra en los Ajustes de un agente o supervisor: «Para ver otra línea o cambiar tu rol, pídeselo a Jonathan Gualli (owner) o a Ana Pérez (admin).»
  - `User` (TS) añade `role: 'owner' | 'admin' | 'supervisor' | 'agent'`, `permissions: string[]`, `lineIds: string[] | null` y `account: { name: string; memberCount: number; managers: { name: string; role: string }[] }`.

- [ ] **Step 1: Test**: `/verify` de un owner da `role: 'owner'`, las 8 acciones, `lineIds: null` y `account.memberCount: 1`; el de un agente con una línea, `permissions: []`, `lineIds: [<esa>]`, `memberCount: 2` y `managers: [{ name: <owner>, role: 'owner' }]`, sin correos.
- [ ] **Step 2:** falla → **Step 3:** implementar → **Step 4:** en verde, y `cd Frontend && npm run lint && npm run build`.
- [ ] **Step 5: Commit** — `git commit -m "Login y /verify dicen el rol, los permisos y las líneas"`. **PR 1**, con la revisión de Codex.

### Task 4: El tiempo real respeta los permisos (PR 2, rama `fase3-tiempo-real`)

**Files:**
- Modify: `Backend/src/utils/permissions.js` (`canReceive`) y `Backend/tests/permissions.test.js`
- Modify: `Backend/src/controllers/stream.controller.js`: las conexiones guardan su `auth`, `sendToAccount` recibe `meta` y nace `disconnectUser`
- Modify: `Backend/src/routes/stream.routes.js` y las 8 llamadas a `sendToAccount` (`chat.controller.js:141` y `:187`, `template.controller.js:585`, `webhook.controller.js:164`, `:207`, `:253` y `:303`, `campaign.service.js:128`)
- Modify: `docs/arquitectura/chat.md` § «Eventos SSE»
- Test: `Backend/tests/stream.test.js` (nuevo; puro, con respuestas falsas)

**Interfaces:**
- Consumes: `can`, `inLineScope`.
- Produces:
  - `canReceive(auth, meta = {}) → boolean`. Con `meta.permission`, hace falta `can(auth, meta.permission)`. Si `meta` trae la clave `lineId` (aunque valga `null`), hace falta `inLineScope(auth, meta.lineId)`. Sin `meta`, verdadero.
  - `addClient(auth, res)`, `removeClient(auth, res)`: por cuenta, cada conexión como `{ res, auth }`.
  - `sendToAccount(accountId, event, data, meta = {})`: escribe solo en las conexiones con `canReceive(conexión.auth, meta)`.
  - `disconnectUser(userId)`: escribe en cada conexión de esa persona el evento `access_changed` (sin datos) y después `res.end()`. El navegador reconecta solo (`SSEProvider`); qué hace la UI con `access_changed`, en la Tarea 7.
  - El `meta` de cada evento:
    - `message_created`, `conversation_updated` y `message_status`: `{ lineId }` de su conversación. En `message_status` (`webhook.controller.js:303`) la conversación ya está cargada en ese camino (la búsqueda de la línea 261 de hoy); si no, se busca (revisión de Codex).
    - `campaign_progress`: `{ lineId: campaign.lineId, permission: 'campaigns.manage' }`.
    - `contact_updated`: sin `meta`, porque los contactos son de toda la cuenta.

- [ ] **Step 1: Tests puros.**
  - `canReceive`:
    - Un agente con `['l1']` recibe `{ lineId: 'l1' }` y no recibe `{ lineId: 'l2' }` ni `{ lineId: null }`.
    - No recibe `{ lineId: 'l1', permission: 'campaigns.manage' }`; un supervisor con `['l1']`, sí.
  - Aislamiento (`tests/isolation/webhook.test.js`): un acuse de estado (`statuses`) de un mensaje de la línea 2 llega por SSE al owner y **no** al agente de la línea 1 (con un cliente SSE falso registrado con `addClient`).
    - Un owner recibe todo, y cualquiera recibe `{}`.
  - En `stream.test.js`, con respuestas falsas (`{ write, end }` que apuntan lo que reciben):
    - `sendToAccount` con `meta` de la línea 2 escribe al owner y no al agente de la línea 1.
    - `disconnectUser(agente)` escribe `access_changed` y cierra sus dos pestañas, y no toca la del owner.
    - Después, `sendToAccount` ya no le escribe.
- [ ] **Step 2:** fallan → **Step 3:** implementar y pasar el `meta` en las 8 llamadas → **Step 4:** `npm test && npm run test:isolation` en verde. Documentación: `chat.md`.
- [ ] **Step 5: Commit** — `git commit -m "El SSE solo manda a cada uno lo de sus líneas"`. **PR 2**, con la revisión de Codex.

### Task 5: Equipo e invitaciones (PR 3, rama `fase3-equipo`)

**Files:**
- Create: `Backend/src/models/invitation.model.js`, `Backend/src/utils/team.js`, `Backend/src/controllers/team.controller.js`, `Backend/src/routes/team.routes.js` (montada en `app.js`), `Backend/src/schemas/team.schema.js`
- Modify: `Backend/src/controllers/admin.controller.js` (`listClients` y `updateAccountLimits`), `Backend/src/schemas/admin.schema.js`
- Modify: `docs/arquitectura/api.md` (las rutas nuevas) y el mapa de `AGENTS.md`, si hace falta un documento nuevo (si no, la sección va en `api.md`)
- Test: `Backend/tests/team.test.js` (puro) y `Backend/tests/isolation/team.test.js`

**Interfaces:**
- Consumes: `requirePermission('team.manage')`, `disconnectUser`, `hashApiKey`, `authLimiter`.
- Produces:
  - `Invitation { accountId, email (minúsculas), role ('admin'|'supervisor'|'agent'), lineIds: [ObjectId], tokenHash (único), expiresAt, acceptedAt: null, invitedBy }`, con índices `{ tokenHash: 1 }` único y `{ accountId: 1, email: 1 }`.
  - En `utils/team.js`:
    - `INVITATION_TTL_DAYS = 7`.
    - `seatsUsed({ activeUsers, pendingInvitations }) → number`.
    - `hasFreeSeat({ activeUsers, pendingInvitations, maxUsers }) → boolean`.
    - `memberChangeIssue({ actor, target, change }) → null | 'owner_locked' | 'self_change' | 'invalid_role'`. `actor` y `target` son `{ id, role }`; `change` es `{ role?, lineIds?, status? }`.
      - El owner no se cambia por aquí: `owner_locked`.
      - Nadie se cambia a sí mismo el rol ni el estado: `self_change`.
      - Solo se asignan `admin`, `supervisor` y `agent`; cualquier otro rol da `invalid_role`.
  - **Un candado de equipo por cuenta** para todo lo que puede ocupar una plaza (invitar, reinvitar y reactivar): `withAccountLock(accountId, 'teamLock', fn)`. Es el mecanismo de `withLineLock` (`Account.lineLock`, 30 s, se suelta solo si es suyo) sacado a `services/account.lock.service.js` y parametrizado por campo; `withLineLock` pasa a usarlo con `'lineLock'` sin cambiar su comportamiento. Ocupado → 409 «Hay otro cambio en esta cuenta en curso. Inténtalo de nuevo en unos segundos.» (el texto del diseño), `code: 'team_busy'`. Dentro del candado se cuentan las plazas y se escribe (revisión de Codex: sin una sección común, invitar mientras otro acepta o reactiva podía pasarse del límite).
  - Rutas, todas con `authRequired` y `requirePermission('team.manage')`:
    - `GET /team` → `{ members, invitations, maxUsers, seatsUsed }`.
      - `members: [{ id, name, email, role, lineIds, status, createdAt }]`, sin contraseña ni token.
      - `invitations: [{ id, email, role, lineIds, expiresAt, createdAt, invitedByName }]`, solo las pendientes y vigentes, sin token.
    - `POST /team/invitations { email, role, lineIds }` → `201 { invitation, token }`. El `token` sale **una sola vez**, como una API key: `crypto.randomBytes(24).toString('base64url')`, y se guarda su hash. El frontend arma el enlace `<origen>/invite/<token>`. Errores:
      - Un correo de cualquier `User` → 409 «Ese correo ya tiene una cuenta en Wasmish.», `code: 'email_taken'`.
      - Sin plaza → 409 «Tu plan permite N usuarios. Desactiva a alguien o anula una invitación, o pide más usuarios.», `code: 'user_limit'`.
      - Una línea que no es de la cuenta → 404 `LINE_NOT_FOUND_MESSAGE`.
      - Volver a invitar un correo que ya tiene una invitación pendiente en esta cuenta la **reemplaza** (el enlace viejo deja de valer) sin ocupar otra plaza.
      - Para `admin`, `lineIds` se guarda vacío.
    - `DELETE /team/invitations/:id` → anula la invitación (la borra) y libera la plaza; 404 si es ajena.
    - `PATCH /team/members/:id { role?, lineIds?, status? }`:
      - 404 si es ajeno.
      - 403 con el `code` de `memberChangeIssue`. El admin tampoco puede tocar al owner: es `owner_locked`.
      - Reactivar sin plaza → 409 `user_limit`.
      - Los `lineIds` se comprueban como en la invitación.
      - Si cambió algo, `disconnectUser(id)`.
  - Superadmin: `PATCH /admin/accounts/:accountId/limits` acepta también `maxUsers` (entero de 1 a 200; al menos uno de los dos campos). `GET /admin/clients` añade `users: { active, pending, max }` (el diseño enseña «4 / 5» y, al editar, «3 activos · 1 invitación»).

- [ ] **Step 1: Tests puros** (`team.test.js`): `hasFreeSeat` (2 activos + 1 pendiente con `maxUsers` 3 → falso; con 4 → verdadero) y cada caso de `memberChangeIssue`.
- [ ] **Step 2: Tests de aislamiento** (`isolation/team.test.js`):
  - Un agente → 403 en las cuatro rutas.
  - B no ve ni toca a los miembros ni las invitaciones de A (404).
  - Invitar con `maxUsers: 1` → 409 `user_limit`; con 2 → 201 y el token no sale en `GET /team`.
  - Dos `POST /team/invitations` a la vez con una sola plaza libre: uno da 201 y el otro 409 (`user_limit` o `team_busy`), nunca dos 201.
  - Reactivar e invitar a la vez con una plaza libre, y dos reactivaciones a la vez con una: como mucho una sale bien.
  - `withLineLock` sigue pasando todos los tests de líneas de hoy (el candado extraído no cambia su comportamiento).
  - Reinvitar el mismo correo no ocupa otra plaza.
  - Un correo ya registrado → 409 `email_taken`.
  - El admin → 403 al cambiar o desactivar al owner; cualquiera → 403 al cambiarse a sí mismo.
  - Desactivar a un agente: su siguiente petición → 401 (ya lo hace `authRequired`) y su plaza queda libre.
  - El superadmin sube `maxUsers` y `GET /admin/clients` lo enseña.
- [ ] **Step 3:** fallan → **Step 4:** implementar → **Step 5:** en verde. Documentación.
- [ ] **Step 6: Commit** — `git commit -m "Equipo: invitar, cambiar rol y líneas, desactivar, con maxUsers"`

### Task 6: Aceptar la invitación y firmar los mensajes (PR 3)

**Files:**
- Modify: `Backend/src/controllers/team.controller.js` y `team.routes.js` (las dos rutas públicas)
- Modify: `Backend/src/models/message.model.js` (`sentBy`, `sentByName`), `chat.controller.js` (`processMessageSending`, `serializeMessage` y los controladores que envían) y `template.controller.js` (`processTemplateSending`)
- Modify: `docs/arquitectura/api.md`, `docs/arquitectura/chat.md` (el mensaje lleva quién lo envió)
- Test: `Backend/tests/isolation/team.test.js` y `Backend/tests/isolation/chats.test.js`

**Interfaces:**
- Produces:
  - Rutas públicas con `authLimiter`:
    - `GET /invitations/:token` → `{ email, accountName, role, invitedByName, lineNames, expiresAt }`. `lineNames` son los nombres que ve la app (`lineLabel`: nombre interno, verificado o número), vacío para un admin. El diseño los enseña en el panel de la página de aceptar, junto con la fecha en que caduca. Un token desconocido, ya usado o caducado → 404 «Esta invitación no existe o ya no es válida.», `code: 'invitation_invalid'`. Uno caducado con su documento todavía guardado → 410, `code: 'invitation_expired'`, con «La invitación caducó. Pide que te envíen otra.».
    - `POST /invitations/:token/accept { name, password }` (con el esquema de `registerSchema`, sin `email`):
      - **Reclama** la invitación con una sola escritura condicional, `findOneAndUpdate({ tokenHash, acceptedAt: null, expiresAt: { $gt: now }, $or: [{ claimedAt: null }, { claimedAt: { $lt: hace 60 s } }] }, { $set: { claimedAt: now } })`. Mientras está reclamada sigue **pendiente**, así que sigue ocupando su plaza: nunca hay un momento en que la plaza quede libre (revisión de Codex). Un reclamo de más de 60 s (el proceso murió) se puede volver a tomar.
      - Al crear el usuario, durante un instante cuentan los dos (el usuario y la invitación): sobra una plaza, no falta.
      - Crea el `User` (`accountId`, `role`, `lineIds`, `email` de la invitación, `status: 'active'`, contraseña con bcrypt, como `register`).
      - Deja la cookie de sesión y responde como el login (Tarea 3).
      - Después marca `acceptedAt: now`.
      - **Si crear el usuario falla por lo que sea**, quita el reclamo (`claimedAt: null`) para que el enlace siga valiendo. Con E11000 (el correo se registró entretanto) responde 409 `email_taken`; con cualquier otro error, 500.
      - `Invitation` añade `claimedAt: Date | null` (Tarea 5).
      - Aceptar no comprueba `maxUsers`: la invitación ya ocupaba su plaza (spec § 3.5: bajar el plan no anula nada).
  - `Message.sentBy: ObjectId | null` y `Message.sentByName: string | null`. El nombre es una **copia** del de ese momento: así el mensaje lo dice aunque la persona se desactive o cambie de nombre, sin buscar en `User`.
  - `processMessageSending({ …, sender = null })` y `processTemplateSending({ …, sender = null })`, con `sender = { userId, name }` (de `req.auth`). Se pasa solo desde el chat (texto, archivo, plantilla en una conversación y conversación nueva); las campañas y la API lo dejan en `null`.
  - `Message.origin: 'chat' | 'campaign' | 'api' | null`. Lo pone quien envía: el chat, el worker de campañas y `/v1`. Es `null` en los mensajes anteriores a esta fase y en los entrantes. El diseño marca en gris, con icono, los que no escribió una persona («Campaña «Promo octubre»», «API»), y sin este campo un envío por la API no se distingue de uno antiguo del chat.
  - `serializeMessage` añade `sentBy: { id, name } | null` y `origin: { kind: 'chat' | 'campaign' | 'api', campaignName? } | null`.
    - El nombre de la campaña se busca una vez por página de mensajes, con las campañas distintas de esa página.
    - Un mensaje antiguo con `campaignId` sale como `campaign` aunque no tenga `origin`.

- [ ] **Step 1: Tests de aislamiento**:
  - Aceptar → 200 con cookie, y el usuario nuevo tiene el rol y las líneas de la invitación.
  - El mismo enlace otra vez → 404 `invitation_invalid`.
  - Dos aceptaciones a la vez del mismo enlace → un solo usuario creado.
  - Con `maxUsers: 2`, el owner y una invitación pendiente: invitar a otro mientras se acepta (el usuario se crea con el reclamo tomado) → 409 `user_limit`.
  - Si crear el usuario falla (un `User.create` que lanza, simulado), el enlace vuelve a valer.
  - Un enlace caducado → 410.
  - `GET /invitations/:token` no enseña el token ni nada de otra cuenta.
  - Responder desde el chat como agente → el mensaje tiene `sentBy: { id: <agente>, name }` y `origin.kind: 'chat'`.
  - Un envío por `/v1` → `sentBy: null`, `origin.kind: 'api'`; uno de campaña → `origin: { kind: 'campaign', campaignName }`.
- [ ] **Step 2:** fallan → **Step 3:** implementar → **Step 4:** en verde. Documentación.
- [ ] **Step 5: Commit** — `git commit -m "Aceptar la invitación y decir quién envió cada mensaje"`. **PR 3**, con la revisión de Codex.

### Task 7: La UI según los permisos (PR 4, rama `fase3-ui`; cuando esté el diseño)

**Files:**
- Modify: `Frontend/src/context/auth.context.provider.tsx` y `auth.context.ts` (`can(action: string) → boolean`, de `user.permissions`)
- Modify: `components/Sidebar/Sidebar.tsx` (Campañas, solo con `campaigns.manage`), `pages/private/PrivateRouter.tsx` (las rutas de campañas, con la misma condición; sin permiso, a Inicio rápido), Ajustes (`LinesCard`, `LineRow`, `LineActionsMenu`, `LinePin`, `ManualCredentialsForm` y la tarjeta de API keys), Contactos (importar, borrar, etiquetar en bloque, crear etiquetas en `TagSelector`), Plantillas (sincronizar y cabecera) y el chat (quién respondió, en la burbuja propia)
- Modify: `docs/arquitectura/frontend.md`

**Interfaces:**
- Consumes: Tareas 3 y 6. Lo visual, del diseño `Design/Wasmish Equipo - Usuarios, roles y acceso.html`, con estos ajustes:
  - **El diseño dice «Envíos» y «Nuevo envío»; en la app es «Campañas»** (decisión del 2026-10-04 en `docs/decisiones.md`).
  - Con más de una persona en la cuenta (`account.memberCount > 1`), el menú lateral enseña bajo el nombre «Rol · Negocio»; con una, como hoy.
  - Los Ajustes de un agente o supervisor: «Tus líneas» para consultar y «Tu acceso» (rol, cuenta, correo), con a quién pedirle más (`account.managers`).
  - En el chat, el nombre de quien respondió y el origen gris de campañas y API van en la línea de la hora, y solo con más de una persona en la cuenta.
  - **No entran**: el filtro de líneas de la bandeja que dibuja el marco 4e (no existe hoy y no es de esta fase) y el estado «Programado» de las campañas.
- Produces: `useAuthContext().can(action)`. Lo que el rol no puede hacer **no se enseña** (no se deja apagado), salvo donde el diseño diga otra cosa.
- **Al cambiarle el acceso a alguien con Wasmish abierto** (revisión de Codex: reconectar el SSE e invalidar no basta, porque los datos viejos se quedan en pantalla y, con la persona desactivada, la reconexión ni siquiera abre):
  - El `SSEProvider` se suscribe a `access_changed` y, al recibirlo, vacía la caché de React Query (`queryClient.clear()`) y le pide al `AuthProvider` que vuelva a leer `/verify`.
  - Con 401, cierra la sesión y va al login.
  - Con la sesión nueva, si la ruta actual ya no está permitida (`can`), va a Inicio rápido; la conversación abierta que ahora da 404 se cierra con el mismo aviso que una conversación borrada.
  - Además, cualquier 401 de la API cierra la sesión, si no lo hace ya.

- [ ] **Step 1:** implementar siguiendo el diseño, con la skill de marca.
- [ ] **Step 2:** `cd Frontend && npm run lint && npm run build`.
- [ ] **Step 3: Navegador** (Playwright, como en `pruebas-y-scripts.md`), con una sesión de owner y otra de agente:
  - El agente no ve Campañas en el menú, y si entra a la ruta a mano, vuelve a Inicio rápido.
  - En Ajustes solo ve sus líneas, sin conectar, renombrar, desconectar ni PIN, y sin API keys.
  - En Contactos no ve importar ni borrar.
  - En el chat, sus respuestas dicen su nombre.
  - Con el agente en una conversación de la línea 2 y **dos pestañas** abiertas, el owner le quita esa línea: en las dos, la conversación se cierra y desaparece de la bandeja sin recargar. Al desactivarlo, las dos van al login.
- [ ] **Step 4: Commit** — `git commit -m "La interfaz enseña a cada rol lo que puede hacer"`

### Task 8: Ajustes → Equipo, aceptar la invitación y los usuarios en el superadmin (PR 4)

**Files:**
- Create: `Frontend/src/pages/private/Settings/Team/` (los componentes que pida el diseño), `Frontend/src/hooks/useTeam.ts`, `Frontend/src/pages/public/AcceptInvitationPage/`
- Modify: `Frontend/src/AppRouter.tsx` (la ruta pública `/invite/:token`, con `AppRoutes.invite`; el diseño pinta `/invitacion/…`, pero las rutas de la app van en inglés, como `/login` y `/register`), `models/routes.models.ts`, `services/api.service.ts` y el panel de superadmin (la columna de usuarios, como la de líneas)
- Modify: `docs/arquitectura/frontend.md` y, si nace, la sección del equipo en `docs/arquitectura/`
- Modify: `docs/estado.md`

**Interfaces:**
- Consumes: las rutas de las Tareas 5 y 6.
- Produces: `useTeam()` → `{ members, invitations, maxUsers, seatsUsed, invite, revokeInvitation, updateMember }`. La página de aceptar la invitación usa las piezas de `components/Auth/` (spec de la marca: «06 · Acceso»). Al aceptar, entra a Chats, como dice el diseño.

- [ ] **Step 1:** implementar siguiendo el diseño.
- [ ] **Step 2:** `lint` y `build`.
- [ ] **Step 3: Navegador**:
  - El owner invita, copia el enlace y ve la invitación pendiente y las plazas.
  - En otra sesión limpia se abre el enlace, se crea la cuenta y se entra como agente.
  - El owner le cambia las líneas y el agente pierde la conversación de la otra línea **sin recargar** (el SSE se cierra y vuelve).
  - El owner lo desactiva y el agente queda fuera.
  - Un enlace usado o caducado enseña su mensaje.
  - El superadmin sube `maxUsers`.
- [ ] **Step 4: Commit** — `git commit -m "Ajustes → Equipo y aceptar la invitación"`. **PR 4**, con la revisión de Codex.

## Al terminar

- `docs/estado.md` al empezar cada PR («En curso») y al terminar la fase (la versión, en su PR).
- **Antes de subir `maxUsers` en una cuenta real:** el ensayo de la vuelta atrás con dos usuarios (spec § 5). Con la imagen anterior, el agente vería y haría todo; por eso se enciende primero en la cuenta de prueba de Jonathan.
- Sigue la **Fase 4**: la asignación (`assignedTo`, «Mías / Sin asignar / Todas», transferir).

## Decisiones del plan (para revisar)

- **Ocho acciones con nombre, no una por fila de la matriz.** Lo que todos los roles pueden hacer (ver y responder en sus líneas, ver y editar contactos, ver plantillas) no lleva permiso; solo lleva línea. Transferir la propiedad y borrar la cuenta no tienen endpoint todavía y no entran.
- **Etiquetar en bloque es «gestionar etiquetas»** (`tags.manage`): el agente etiqueta un contacto desde su ficha (es editar el contacto), pero no crea etiquetas ni etiqueta en bloque. Por eso el `TagSelector` del agente no ofrece «crear».
- **Ver las campañas también es `campaigns.manage`**: la matriz pone ✗ al agente en «ver, crear, pausar, cancelar».
- **Renombrar una línea, hacerla por defecto y ver su PIN son `lines.manage`**, como conectar y desconectar. El brief del PIN ya decía «owner y admin».
- **Empezar una conversación sin elegir línea** (`pickSendingLineId`): la por defecto si es suya; si no, su única línea; con varias, que elija. Así la UI no cambia para un agente con una sola línea (el selector solo sale con más de una).
- **El nombre de quien envió se copia en el mensaje** (`sentByName`) en lugar de buscarlo en `User` cada vez: el historial dice quién fue aunque esa persona ya no esté, y la lista de mensajes no hace otra consulta.
- **El enlace de invitación lo arma el frontend** con su propio origen, sin una variable de entorno nueva en el backend.
- **Volver a invitar un correo reemplaza la invitación pendiente**: sirve para reenviar un enlace perdido sin anular primero.
- **Aceptar una invitación no mira `maxUsers`**: su plaza ya estaba contada, y bajar el plan no anula lo que existe.
- **«Con conversación» mira todas las conversaciones del contacto**, también las de líneas que no ve (revisión de Codex): el filtro y las selecciones de campañas y etiquetas no cambian según quién los pide. Solo se oculta el contenido.
- **Un candado de equipo** (`teamLock`) aparte del de líneas, para que cambiar el equipo no bloquee las líneas ni al revés.
- **Las conversaciones sin línea** (anteriores a las líneas, o la reserva de la 2b) quedan fuera para supervisor y agente: no son de ninguna línea suya. Las ven owner y admin.
