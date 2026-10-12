# Multi-línea · Fase 2c: varias líneas por cuenta — Implementation Plan

> **Para quien lo ejecute:** en Wasmish los planes se ejecutan **nativo** (rama, PR, revisión cruzada; ver «Planes» en `AGENTS.md`). Las referencias de `writing-plans` a `subagent-driven-development` o `executing-plans` no aplican. Los pasos usan casillas (`- [ ]`).

**Goal:** Que una cuenta pueda tener **varias líneas** de WhatsApp: conectar otro número sin perder el actual (hasta `Account.limits.maxLines`), ponerles nombre, elegir la línea por defecto, desconectarlas, y elegir la línea al empezar una conversación y al crear una campaña. El superadmin sube el límite cuenta por cuenta. Con `maxLines: 1` todo funciona como hoy.

**Architecture:** Se da la vuelta a la escritura (spec § 4, Fase 2, «Doble escritura»). **`Line` y `Waba` pasan a ser la fuente de la conexión**, y el `User` del owner queda como **copia de la línea por defecto** (`legacyUserFields`), para que la imagen anterior (1.0.14) siga funcionando mientras ninguna cuenta tenga dos líneas. Conectar, desconectar y cambiar la línea por defecto pasan por `services/line.service.js`, que escribe primero `Waba` y `Line`, después `Account.defaultLineId` y por último la copia en `User`. Lo que lee la conexión (`findInboundLine`, `findSendingLine`) lee solo `Line` y `Waba`; la reserva de `User` de la 2b desaparece de los envíos y se queda, más estrecha, en el webhook. Encima va la API de líneas (`/lines`), el límite en el panel de superadmin y la UI.

**Tech Stack:** Express 5, Mongoose 8, Zod, `node:test`, `mongodb-memory-server`; React 19, TypeScript, React Query, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-11-multi-linea-multi-agente-design.md` (§ 2.2 «Tokens por WABA» y «La vuelta atrás»; § 3.1; § 3.5; § 4, Fase 2; § 5; § 6). Plan anterior: `docs/superpowers/plans/2026-10-12-multi-linea-fase-2b.md` («Lo que este plan no cubre»). Decisión del 2026-10-12 (`docs/decisiones.md`): el token vive solo en el `Waba`, cada conexión lo reemplaza y todas las líneas del WABA lo leen de ahí.

## Global Constraints

- **`maxLines` sigue en 1 en todas las cuentas reales** hasta que se haga la prueba del token en WasmishTest (spec § 2.2) y se ensaye la vuelta atrás en local (spec § 5). Esta fase se puede desplegar antes: con `maxLines: 1`, conectar otro número **reemplaza** al actual, como hoy.
- **El token, solo del `Waba`.** Conectar un número de un WABA reemplaza el token de ese `Waba`; ninguna línea guarda su propia copia.
- **Escribe la conexión solo `line.service.js`** (`applyConnection`, `disconnectLine`, `setDefaultLine`). Ningún controlador escribe `User.tokenWhatsapp/phoneNumberId/waBusinessId`: lo hace `writeLegacyUser`, desde la línea por defecto.
- **Bajar el límite nunca desconecta** una línea: solo impide conectar otra mientras se esté por encima (spec § 3.5).
- **El cliente de la API no cambia nada:** sin `lineId` ni `from`, la línea por defecto (`Account.defaultLineId`), y la respuesta es idéntica.
- Una línea de otra cuenta → **404**, nunca 403, con su test en `tests/isolation/`. El token nunca sale en una respuesta.
- Textos al usuario en español; errores como `[{ message }]`. Commits sin coautor ni atribución. Cuatro PRs, cada uno con su rama; un solo despliegue (1.0.15) cuando estén los cuatro.
- Antes de tocar la UI (Tareas 3 y 4), la skill de marca (`.agents/skills/brand-guidelines/SKILL.md`).
- Comprobar con `cd Backend && npm test && npm run test:isolation`, y en las Tareas 2 a 4 también `cd Frontend && npm run lint && npm run build`. Las Tareas 3 y 4 se prueban además en el navegador.

## Review Focus

- **Una cuenta con `maxLines: 1` vuelve a conectar con otro número** (el «Volver a conectar» de hoy): el número nuevo reemplaza al anterior, el anterior queda `disconnected` con su historial y el OTP de `/v1` sale por el nuevo → test en la Tarea 1.
- **Un número pasa de una cuenta a otra:** A lo desconecta y B lo conecta. Los entrantes van a B, y el historial de A sigue en su línea desconectada → test en la Tarea 1.
- **Dos conexiones a la vez con la cuenta en el límite:** nunca quedan más líneas activas que `maxLines` → test en la Tarea 1.
- **Se desconecta la línea por defecto teniendo otra activa:** `/v1` sin `lineId` sale por la otra, y la copia de `User` la sigue (la vuelta atrás a la 1.0.14 envía por ella) → test en la Tarea 2.
- **El superadmin baja el límite por debajo de las líneas activas:** las dos siguen enviando y recibiendo, renovar el token de una funciona, y conectar una tercera da 409 → test en la Tarea 2.
- **Elegir una línea de otro WABA** en la conversación nueva o en una campaña: solo se ofrecen las plantillas de ese WABA, y una plantilla de otro WABA da 400 → test en la Tarea 2 (la UI, en la Tarea 4).

---

### Task 1: `Line` como fuente de la conexión (PR 1, rama `fase2c-conexion`)

Sin cambio visible con `maxLines: 1`. Conectar sigue haciéndose por los dos endpoints de hoy (`POST /whatsapp/connect` y `PUT /update-user-token-whatsapp`), que pasan a compartir `applyConnection`.

**Files:**
- Modify: `Backend/src/utils/line.js`, `Backend/tests/line.test.js`
- Modify: `Backend/src/services/line.service.js`, `Backend/src/services/whatsapp.connection.service.js`
- Modify: `Backend/src/controllers/whatsapp.controller.js`, `Backend/src/controllers/user.controller.js`
- Modify: `Backend/src/utils/whatsapp.line.js` (mensajes)
- Modify: `Backend/src/services/line.migration.service.js`, `Backend/scripts/migrate-lines.js`
- Modify: `Backend/scripts/simulate-webhook.js` (busca la cuenta del número en `Line`: una segunda línea no está en `User`)
- Modify: `Backend/tests/isolation/lines.test.js`, `whatsapp.test.js`, `webhook.test.js`, `chats.test.js`, `account.test.js`, `migrate-lines.test.js`, `helpers.js`
- Modify: `Backend/AGENTS.md`, `docs/arquitectura/whatsapp-envio.md`, `webhook-adjuntos.md`, `pruebas-y-scripts.md`

**Interfaces:**
- Produces (puras, en `utils/line.js`):
  - `legacyUserFields(defaultLine, waba) → { tokenWhatsapp, phoneNumberId, waBusinessId }`: los de la línea si está `active` y su `waba` tiene token; si no, los tres `null`.
  - `planConnection({ lines, maxLines, phoneNumberId }) → { action: 'renew', lineId } | { action: 'add' } | { action: 'replace', replaceLineIds } | { error: 'limit' }`. `lines` son las de la cuenta (`_id`, `phoneNumberId`, `status`). Ese número ya activo → `renew` (renovar el token nunca choca con el límite). Si no, con menos activas que `maxLines` → `add` (también si el número tiene una línea `disconnected`: se reactiva). Con `maxLines === 1` y una activa de otro número → `replace` (lo de hoy). Si no → `limit`.
  - `sendingLineFor({ line, waba, requested }) → { line: SendingLine } | { issue: 'not_connected' | 'disconnected' }`. Sustituye a la de la 2b: ya no recibe `owner`. Sin `line`: `requested` (se pidió una línea o un número concreto) → `disconnected`; si no → `not_connected`. Línea no `active` o sin token en su `waba` → `disconnected`. `SendingLine` no cambia (`{ accountId, lineId, phoneNumberId, waBusinessId, tokenWhatsapp }`, token cifrado).
  - `legacyUserIssues({ owner, defaultLine, waba }) → string[]`: en qué no coincide `User` con `legacyUserFields(defaultLine, waba)`. Vacío = al día. Sustituye a `lineStateIssues`. `lineMatchesOwner` desaparece.
- Produces (en `line.service.js`):
  - `applyConnection({ accountId, plan, waBusinessId, tokenWhatsapp, details }) → Promise<{ lineId }>` (token ya cifrado; `details` de `verifyWabaPhoneNumber`). En este orden: `Waba` con el token nuevo; si `replace`, las líneas de `replaceLineIds` a `disconnected`; la línea del número `active`, con su `wabaId` y los `details`; `Account.defaultLineId` = esta línea si no había por defecto activa o si se reemplazó; `writeLegacyUser(accountId)`. **Después de escribir**, si la cuenta tiene más activas que `maxLines`, deja esta línea `disconnected` y lanza 409 con `lineLimitMessage(maxLines)`: dos conexiones a la vez pasaron las dos la comprobación.
  - `writeLegacyUser(accountId) → Promise<void>`: escribe en el owner `legacyUserFields` de la línea por defecto. Si falla (p. ej. E11000 en `User.phoneNumberId`), `console.error` y sigue: `User` ya no enruta, solo sirve para volver atrás, y `migrate:lines -- --check` lo detecta.
  - `findInboundLine(phoneNumberId) → Promise<InboundLine | null>`: la línea `active` de ese número (`line_phoneNumberId_active_unique` garantiza una) y el token de su `Waba`. **Reserva** (spec: «nunca se descarta»), solo si ninguna cuenta tiene una `Line` de ese número: el `User` que lo tiene, con `lineId: null`, su token y `console.error`. Un número que existe como `Line` pero no está activo en ninguna cuenta → `null`: una línea desconectada no recibe.
  - `findSendingLine(accountId, { lineId, phoneNumberId })`, con la misma firma: con `lineId`, esa línea de la cuenta o 404; si no, la del número `phoneNumberId` (una conversación sin línea); si no, `Account.defaultLineId`. Sin reserva de `User`.
- Produces (en `whatsapp.connection.service.js`):
  - `isPhoneNumberTaken(accountId, phoneNumberId)`: **cambia el primer parámetro** (la cuenta, no el `_id` del owner). Ocupado = una `Line` `active` de otra cuenta, o el `User` de otra cuenta.
  - `connectNumber({ accountId, tokenWhatsapp, waBusinessId, phoneNumberId, details }) → Promise<{ lineId }>`: lo que comparten los dos controladores después de hablar con Meta: `planConnection` (409 `lineLimitMessage` si `limit`) y `applyConnection`. Los controladores hacen antes, en el orden de hoy: número ocupado (409) → WABA ocupado (409) → **límite (409, antes de llamar a Meta)** → Meta → `claimWaba` → `connectNumber`. Desaparece `syncLinesAfterConnecting`.
- `lineLimitMessage(maxLines)` en `utils/whatsapp.line.js`: con 1, `'Tu plan permite 1 línea conectada. Desconéctala antes de conectar otra, o pide más líneas.'`; con más, `` `Tu plan permite ${maxLines} líneas conectadas. Desconecta una antes de conectar otra, o pide más líneas.` `` (con `maxLines: 1` nunca se ve al conectar, porque reemplaza; sale en la carrera y en la Tarea 2).
- Respuestas de los dos endpoints de conexión: las de hoy, más `lineId`.
- `migrate:lines` en la 2c: `syncLinesFromOwner` (que deja activa **solo** la línea de `User`) se usa únicamente en las cuentas que **no tienen ninguna `Line` activa** y sí conexión en `User` (cuentas conectadas con la imagen anterior). En las demás no toca `Line`: comprueba `legacyUserIssues`, las cuenta en `pending.accountsOutOfSync` (`--check` sale con 1) y las lista, **sin corregirlas** (no se sabe cuál de los dos tiene razón). El resto de pasos (líneas históricas, `lineId` de conversaciones y campañas, WABA de plantillas, índices) no cambia.

- [ ] **Step 1: Tests puros que fallan** en `tests/line.test.js` (se borran los de `lineMatchesOwner`, `lineStateIssues` y el `sendingLineFor` de la 2b)

```js
test('legacyUserFields: la línea activa y el token de su WABA', ...);
test('legacyUserFields: sin línea, desconectada o sin token → los tres null', ...);
test('planConnection: el mismo número activo → renew, aunque se esté por encima del límite', ...);
test('planConnection: por debajo del límite → add, también para reactivar una desconectada', ...);
// Regresión que vigila (Review Focus 1): el «Volver a conectar» de hoy
test('planConnection: maxLines 1 y otra activa → replace', ...);   // replaceLineIds = [la activa]
test('planConnection: maxLines 2 con dos activas → limit', ...);
test('sendingLineFor: línea activa con token → SendingLine', ...);
test('sendingLineFor: línea desconectada o sin token → disconnected', ...);
test('sendingLineFor: sin línea → not_connected, o disconnected si se pidió una', ...);
test('legacyUserIssues: User con otro número que la línea por defecto', ...);
```

- [ ] **Step 2: Tests de aislamiento que fallan**

```js
// whatsapp.test.js
test('conectar con maxLines 2 añade una segunda línea y conserva la primera', ...);   // dos activas, defaultLineId la primera
// Regresión que vigila (Review Focus 1)
test('conectar otro número con maxLines 1 lo reemplaza y /v1 sale por el nuevo', ...);
test('conectar con la cuenta en el límite → 409 sin llamar a Meta', ...);            // 0 metaCalls
test('conectar un número del mismo WABA reemplaza el token del Waba para las dos líneas', ...);
// Regresión que vigila (Review Focus 3): la carrera la simula una línea activa sembrada después del plan
test('applyConnection deja la línea desconectada si al terminar se pasa del límite', ...);
test('tras conectar, User es la copia de la línea por defecto', ...);
// lines.test.js / webhook.test.js
test('findInboundLine: cada número activo llega a su línea y su cuenta', ...);
// Regresión que vigila (Review Focus 2)
test('un número desconectado en A y conectado en B: el entrante va a B', ...);
test('un número que solo es línea desconectada no recibe', ...);
test('sin ninguna Line del número pero con User: la reserva y su console.error', ...);
// chats.test.js
test('cada conversación responde por su línea, con dos líneas activas', ...);   // metaCalls con el phoneNumberId de cada una
// migrate-lines.test.js
test('migrar no desactiva la segunda línea de una cuenta', ...);
test('--check detecta un User que no es copia de la línea por defecto, y migrar no lo toca', ...);
```

`seedAccount` acepta `maxLines` (por defecto 1). `connectWhatsapp(account, { phoneNumberId, waBusinessId })` permite conectar números distintos.

- [ ] **Step 3: Ejecutarlos y ver que fallan.** Run: `cd Backend && npm test && npm run test:isolation` · Expected: FAIL.

- [ ] **Step 4: Implementar** las funciones de arriba y cambiar los dos controladores de conexión. Los tests de la 2b que probaban la reserva de `User` en los envíos (`con la proyección desajustada, el envío sale con el token de User`, el cambio de número a medias de `account.test.js`) se reescriben: ahora un `User` desajustado no afecta a los envíos.

- [ ] **Step 5: Ejecutar todo y ver que pasa**, y probar en local con el número de WasmishTest por el formulario manual: conectar, enviar y recibir con `webhook:simulate`; `npm run migrate:lines -- --check` sale con 0.

- [ ] **Step 6: Documentar.** `whatsapp-envio.md`: `Line`/`Waba` son la fuente, `User` la copia de la línea por defecto, conectar añade, renueva o reemplaza según el límite, y desaparece la reserva de los envíos. `webhook-adjuntos.md`: una línea desconectada no recibe y la reserva solo queda para un número sin ninguna `Line`. `pruebas-y-scripts.md`: lo que hace `migrate:lines` en la 2c. `Backend/AGENTS.md`: la conexión solo la escribe `line.service.js`.

- [ ] **Step 7: Commit**

```bash
git add Backend/src Backend/scripts Backend/tests Backend/AGENTS.md docs/arquitectura
git commit -m "líneas: Line es la fuente de la conexión y User su copia"
```

---

### Task 2: La API de líneas y el límite del superadmin (PR 2, rama `fase2c-lineas-api`)

**Files:**
- Create: `Backend/src/routes/line.routes.js`, `Backend/src/controllers/line.controller.js`, `Backend/src/schemas/line.schema.js`
- Modify: `Backend/src/app.js` (la ruta nueva), `Backend/src/utils/line.js`, `Backend/tests/line.test.js`, `Backend/src/services/line.service.js`
- Modify: `Backend/src/controllers/admin.controller.js`, `Backend/src/routes/admin.routes.js`, `Backend/src/schemas/` (el esquema de límites, en `line.schema.js`)
- Modify: `Backend/src/controllers/chat.controller.js` (`listConversations`), `template.controller.js` (`getTemplatesController`, `syncTemplatesController`), `Backend/src/schemas/campaign.schema.js`, `campaign.controller.js`
- Modify: `Backend/tests/isolation/lines.test.js`, `account.test.js`, `templates.test.js`, `campaigns.test.js`, `chats.test.js`
- Modify: `docs/arquitectura/api.md`, `whatsapp-envio.md`, `campanas.md`

**Interfaces:**
- Consumes: `writeLegacyUser`, `lineLimitMessage` (Tarea 1).
- Produces:
  - `nextDefaultLine(lines, removedLineId) → line | null` (pura): la activa conectada más recientemente (`updatedAt`) que no es `removedLineId`.
  - `serializeLine(line, { defaultLineId, waba }) → { id, name, phoneNumberId, displayPhoneNumber, verifiedName, status, isDefault, waBusinessId }`. Nunca el token.
  - `GET /lines` → `{ lines: SerializedLine[], maxLines }`: todas las de la cuenta (también las desconectadas, con su historial), las activas primero y la por defecto la primera.
  - `PATCH /lines/:id` con `{ name?: string | null, isDefault?: true }` (`updateLineSchema`: `name` recortado, máximo 40, vacío → `null`; al menos uno de los dos). `isDefault` en una línea no activa → 409 `'Solo una línea conectada puede ser la línea por defecto.'`. Responde la línea serializada.
  - `POST /lines/:id/disconnect` → la línea serializada. Idempotente. Si era la por defecto, `defaultLineId` = `nextDefaultLine(...)`; después `writeLegacyUser`. No llama a Meta ni borra el token del `Waba` (otras líneas del WABA lo usan).
  - `disconnectLine(accountId, lineId)` y `setDefaultLine(accountId, lineId)` en `line.service.js`; los dos dan 404 `LINE_NOT_FOUND_MESSAGE` si la línea no es de la cuenta.
  - `GET /admin/clients`: cada cliente con `lines: { active, max }` (de su cuenta). `GET /admin/stats`: `connectedClients` = cuentas con al menos una línea activa.
  - `PATCH /admin/accounts/:accountId/limits` con `{ maxLines }` (entero de 1 a 50) → `{ accountId, maxLines }`. Cuenta inexistente → 404. Bajar el límite no desconecta nada.
  - `listConversations`: cada conversación con `lineId` (string o `null`).
  - `GET /templates?lineId=`: con `lineId`, las del WABA de esa línea (404 si no es de la cuenta); sin él, las de **todos los WABA con alguna línea activa** de la cuenta (sin ninguna, todas, como hoy). Cada plantilla ya lleva su `waBusinessId`. `GET /templates/sync` sincroniza cada WABA con línea activa.
  - `campaignDraftSchema` y `createCampaignSchema`: `lineId` opcional (`objectIdSchema.nullish()`). `createCampaign` usa `findSendingLine(accountId, { lineId })` (404 si es de otra cuenta, sin crear la campaña) y conserva el 400 de plantilla de otro WABA.

Todas las rutas nuevas llevan `authRequired`; las de admin, además `requireSuperadmin`. Restringir líneas a owner y admin llega con los roles (Fase 3).

- [ ] **Step 1: Tests puros que fallan** en `tests/line.test.js`

```js
test('nextDefaultLine: la activa más reciente que no es la quitada', ...);
test('nextDefaultLine: sin otra activa → null', ...);
```

- [ ] **Step 2: Tests de aislamiento que fallan**

```js
// lines.test.js
test('GET /lines: B no ve las líneas de A, y nunca sale el token', ...);
test('PATCH /lines/:id: B no renombra ni hace por defecto una línea de A (404, sin cambios)', ...);
test('POST /lines/:id/disconnect: B no desconecta una línea de A (404, sigue activa)', ...);
test('isDefault en una línea desconectada → 409', ...);
// Regresión que vigila (Review Focus 4)
test('desconectar la línea por defecto: /v1 sin lineId sale por la otra y User la copia', ...);
test('desconectar la única línea: /v1 da el 409 de sin WhatsApp', ...);
// Regresión que vigila (Review Focus 5)
test('bajar maxLines por debajo de las activas no desconecta nada y bloquea conectar otra', ...);
// account.test.js
test('PATCH /admin/accounts/:id/limits: solo el superadmin (403) y una cuenta inexistente → 404', ...);
test('GET /admin/clients cuenta las líneas activas de cada cuenta', ...);
// templates.test.js
test('GET /templates?lineId=: solo las del WABA de esa línea; de otra cuenta → 404', ...);
test('GET /templates sin lineId: las de los WABA con línea activa', ...);
// campaigns.test.js
test('crear una campaña con el lineId de otra cuenta → 404 y sin campaña', ...);
// Regresión que vigila (Review Focus 6)
test('crear una campaña en la línea de otro WABA con una plantilla del primero → 400', ...);
test('la campaña sale por la línea elegida', ...);                 // metaCalls con su phoneNumberId
// chats.test.js
test('GET /chats devuelve el lineId de cada conversación', ...);
```

- [ ] **Step 3: Ejecutarlos y ver que fallan.** Run: `cd Backend && npm test && npm run test:isolation` · Expected: FAIL.

- [ ] **Step 4: Implementar** las rutas, el servicio y los cambios de los controladores.

- [ ] **Step 5: Ejecutar todo y ver que pasa.** Run: `cd Backend && npm test && npm run test:isolation && cd ../Frontend && npm run build` · Expected: PASS (el front no usa nada nuevo todavía).

- [ ] **Step 6: Documentar** en `api.md` (las rutas de `/lines` y de límites, en la tabla), `whatsapp-envio.md` (desconectar, la línea por defecto y la API pública) y `campanas.md` (`lineId` al crear).

- [ ] **Step 7: Commit**

```bash
git add Backend/src Backend/tests docs/arquitectura
git commit -m "líneas: listar, renombrar, elegir la por defecto y desconectar; límite del superadmin"
```

---

### Task 3: Ajustes → Líneas y el límite en el panel (PR 3, rama `fase2c-ajustes`)

**Files:**
- Create: `Frontend/src/models/line.model.ts`, `Frontend/src/hooks/useLines.ts`, `Frontend/src/utils/lineLabel.ts`
- Create: `Frontend/src/pages/private/Settings/LinesCard.tsx` (la tarjeta de WhatsApp de hoy, convertida en la lista de líneas)
- Modify: `Frontend/src/pages/private/Settings/SettingsPage.tsx`, `Frontend/src/services/api.service.ts`, `Frontend/src/hooks/useConnectWhatsapp.ts`, `useUpdateWhatsappToken.ts`
- Modify: `Frontend/src/pages/private/Admin/AdminColumns.tsx`, `AdminPage.tsx`, `Frontend/src/models/admin.model.ts`, `Frontend/src/hooks/useAdmin.ts`
- Modify: `docs/arquitectura/frontend.md` (la lista de hooks), `whatsapp-envio.md` (Embedded Signup en la UI)

**Interfaces:**
- Consumes: `GET /lines`, `PATCH /lines/:id`, `POST /lines/:id/disconnect`, `PATCH /admin/accounts/:accountId/limits` (Tarea 2).
- Produces:
  - `Line = { id; name: string | null; phoneNumberId; displayPhoneNumber: string | null; verifiedName: string | null; status: 'active' | 'disconnected'; isDefault: boolean; waBusinessId: string | null }` y `LinesResponse = { lines: Line[]; maxLines: number }`.
  - `useLines() → { lines, activeLines, defaultLine, maxLines, hasManyLines, isLoading, rename, makeDefault, disconnect }`, con la clave `['lines']`. `hasManyLines` = más de una activa. Conectar (los dos caminos) invalida `['lines']`.
  - `lineLabel(line) → string`: `name` ?? `verifiedName` ?? `displayPhoneNumber` ?? `phoneNumberId`.

La tarjeta de líneas (con la skill de marca antes):
- Cada línea con su etiqueta, su número visible, «Por defecto» y su estado. En las activas: renombrar en el sitio, «Usar por defecto» y «Desconectar».
- **Desconectar pide confirmación** (`ConfirmDialog`) con `'Dejarás de enviar y recibir mensajes de este número en Wasmish. Sus conversaciones se conservan.'`. Si es la por defecto, se añade `'La API sin lineId pasará a usar {lineLabel(siguiente)}.'` o, si no hay otra, `'La API dejará de enviar hasta que conectes un número.'`.
- Las desconectadas, plegadas bajo «Números anteriores».
- Botón «Conectar otro número» (Embedded Signup). Con `maxLines: 1` y una línea, el texto de hoy, «Volver a conectar». En el límite (`maxLines > 1`), deshabilitado y con `lineLimitMessage`. El formulario manual se queda plegado, como hoy.
- `SettingsPage` deja de leer `user.phoneNumberId` para saber si hay conexión.

En el panel de superadmin, la columna «Líneas» (`activas / máximo`) con un botón para editar el máximo: un diálogo con un número de 1 a 50.

- [ ] **Step 1: Implementar** el modelo, el hook, `lineLabel`, la tarjeta y el panel.

- [ ] **Step 2: Comprobar.** Run: `cd Frontend && npm run lint && npm run build` · Expected: PASS.

- [ ] **Step 3: Probar en el navegador** (Playwright, como en «Pruebas en navegador local»), con una cuenta con `maxLines: 2` y dos líneas sembradas: renombrar, cambiar la por defecto y desconectar (con su confirmación); con `maxLines: 1`, que se ve como hoy; el superadmin cambia el máximo. Capturas en el PR.

- [ ] **Step 4: Documentar** `useLines` en `frontend.md` y la tarjeta en `whatsapp-envio.md`.

- [ ] **Step 5: Commit**

```bash
git add Frontend/src docs/arquitectura
git commit -m "ajustes: la lista de líneas y el límite de líneas en el panel"
```

---

### Task 4: Elegir la línea en la UI (PR 4, rama `fase2c-elegir-linea`)

Todo lo de esta tarea **solo se ve con más de una línea activa** (`hasManyLines`). Con una, la UI es la de hoy.

**Files:**
- Create: `Frontend/src/components/Line/LineSelect.tsx`, `Frontend/src/components/Line/LineChip.tsx`
- Modify: `Frontend/src/models/conversation.mode.ts` (`lineId`), `Frontend/src/models/template.model.ts` (`waBusinessId: string | null`)
- Modify: `Frontend/src/components/Chat/NewConversationPanel.tsx`, `ConversationList.tsx`, la cabecera del chat (`ChatThread.tsx`)
- Modify: `Frontend/src/pages/private/Campaigns/NewCampaign/useCampaignWizard.ts`, `MessageStep.tsx`, `ReviewStep.tsx`, `Frontend/src/hooks/useCampaignDraft.ts`, `useNewCampaign.ts`
- Modify: `Frontend/src/pages/private/Contacts/ContactPanel.tsx`
- Modify: `Frontend/src/hooks/useSendTemplate.ts` (`useStartConversation` manda `lineId`)
- Modify: `docs/arquitectura/chat.md`, `campanas.md`, `contactos.md`

**Interfaces:**
- Consumes: `useLines`, `lineLabel` (Tarea 3); `lineId` en `GET /chats`, en las plantillas (`waBusinessId`) y en `POST /campaigns` (Tarea 2); `lineId` en `POST /chats/messages` y `/chats/template` (2b).
- Produces:
  - `LineSelect({ value, onChange })`: las líneas activas, la por defecto preseleccionada. No se pinta sin `hasManyLines`.
  - `LineChip({ lineId })`: la etiqueta de la línea; nada sin `hasManyLines` o con `lineId` desconocido.

Dónde:
- **Conversación nueva:** `LineSelect` arriba; las plantillas, solo las del `waBusinessId` de la línea elegida; el envío (`useStartConversation`) lleva `lineId`. Cambiar de línea vacía la plantilla elegida si no es de su WABA.
- **Asistente de campañas:** `LineSelect` en el paso del mensaje, antes de la plantilla, con el mismo filtro. El borrador guarda `lineId`; si al recuperarlo esa línea ya no está activa, se vuelve a la por defecto y se vacía la plantilla. La revisión muestra la línea. `POST /campaigns` lleva `lineId`.
- **Bandeja:** `LineChip` en cada conversación y un filtro por línea encima de la lista (en el cliente: la lista ya trae todas). La cabecera del chat abierto, también con `LineChip`.
- **Ficha del contacto:** con más de una conversación, la ventana de cada una con su `LineChip` (spec: «la ventana siempre se enseña con su línea»).

- [ ] **Step 1: Implementar** los dos componentes (con la skill de marca antes) y los cambios de cada pantalla.

- [ ] **Step 2: Comprobar.** Run: `cd Frontend && npm run lint && npm run build` · Expected: PASS.

- [ ] **Step 3: Probar en el navegador** con dos líneas de WABA distintos (sembradas): la conversación nueva por la segunda línea ofrece solo sus plantillas y el envío lleva su `lineId`; una campaña por la segunda línea; el filtro de la bandeja; un borrador de campaña con una línea desconectada después. Con una sola línea, ninguna de estas piezas aparece. Capturas en el PR.

- [ ] **Step 4: Documentar** en `chat.md` (selector y chip), `campanas.md` (la línea en el asistente y el borrador) y `contactos.md` (la ventana por línea en la ficha).

- [ ] **Step 5: Commit**

```bash
git add Frontend/src docs/arquitectura
git commit -m "líneas: elegir la línea en la conversación nueva y en las campañas, y verla en la bandeja"
```

---

## Al terminar

- `docs/estado.md` en cada PR: «En curso» con lo que falta; al cerrar el cuarto, la 1.0.15 lista para desplegar y, en «Lo siguiente», la prueba del token y encender `maxLines > 1` en una cuenta de prueba.
- Resumen para Jonathan y revisión cruzada de Codex en una ronda por PR.

## Decisiones del plan (para revisar)

- **Se puede desplegar sin la prueba del token.** La regla del spec vale con cualquier resultado: el token vive solo en el `Waba` y cada conexión lo reemplaza. La prueba decide si se puede **encender** `maxLines > 1`, y eso es un cambio de datos que hace el superadmin, cuenta por cuenta.
- **Con `maxLines: 1`, conectar otro número reemplaza al actual**, como hoy. La alternativa (exigir desconectar antes) cambiaría lo que el cliente ya conoce. Con `maxLines > 1`, en el límite da 409: se desconecta una primero.
- **`User` es copia, nunca fuente.** Un fallo al escribirla se loguea y no rompe la conexión; `migrate:lines -- --check` lo detecta. La reserva de `User` sale de los envíos (con `Line` como fuente, una copia desajustada no debe decidir nada) y se queda en el webhook, solo para un número sin ninguna `Line`, para no perder mensajes.
- **Una línea desconectada no recibe.** Meta sigue mandando sus webhooks (la app sigue suscrita al WABA), y se ignoran. Desconectar no llama a Meta ni borra el token del `Waba`.
- **El límite se vuelve a comprobar después de escribir**, en vez de con una transacción: el Mongo de los tests y, quizá, el de producción no son réplica. Si dos conexiones a la vez lo superan, la segunda se deshace.
- **`migrate:lines` ya no reconstruye las líneas desde `User`**, salvo en una cuenta sin ninguna línea activa. Si `User` y la línea por defecto no coinciden, lo informa y no elige.
- **`GET /templates` sin `lineId` lista las de todos los WABA con línea activa**; la UI filtra por el WABA de la línea elegida. En la 2b listaba las del WABA de la línea por defecto.
- **El filtro de la bandeja va en el cliente:** `GET /chats` ya devuelve todas las conversaciones.
- **Gestionar líneas lo puede hacer cualquier usuario de la cuenta** hasta la Fase 3, porque hoy todos son owners.
- **El superadmin solo edita `maxLines`.** `maxUsers` llega con la Fase 3.

## Antes de desplegar (Jonathan)

Con `/deploy`, cuando estén unidos los cuatro PRs y la 1.0.15 subida. Esta fase no migra datos:

1. `mongodump` de producción.
2. Compilar la imagen nueva **sin arrancarla** y, con la 1.0.14 en marcha, `docker compose run --rm --no-deps wasmish-api npm run migrate:lines -- --check` → 0 (cada `User` es copia de su línea por defecto).
3. `up` de la 1.0.15 y otra vez `--check` → 0.
4. Comprobar: un entrante en vivo, una respuesta desde el chat, `POST /api/v1/templates/send` con 200 en los logs, y en Ajustes la línea de cada cuenta.

**Volver atrás:** las imágenes `:1.0.14` leen `User`, que es copia de la línea por defecto. Funciona **mientras ninguna cuenta tenga más de una línea activa**; por eso `maxLines > 1` se enciende después y, antes de hacerlo en una cuenta real, se ensaya la vuelta atrás en local (spec § 5).

## Después de desplegar: encender varias líneas

1. La prueba del token en WasmishTest (spec § 2.2): conectar un segundo número del mismo WABA por el Embedded Signup y comprobar que el primero sigue enviando.
2. El ensayo de la vuelta atrás en local (spec § 5) con dos líneas.
3. `maxLines: 2` en una cuenta de prueba desde el panel; después, en las de los clientes que lo pidan.

## Lo que este plan no cubre

- Fase 3 (equipo, roles y acceso por línea) y Fase 4 (asignación).
- Quitar los campos de conexión de `User` (Fase 5).
- `webhook:simulate -- --line` (el spec lo menciona; con `--phone-number-id` ya se elige el número, y la Tarea 1 hace que lo busque en `Line`).
