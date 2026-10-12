# Multi-línea · Fase 2a: líneas, ampliar y migrar — Implementation Plan

> **Para quien lo ejecute:** en Wasmish los planes se ejecutan **nativo** (rama, PR, revisión cruzada; ver «Planes» en `AGENTS.md`). Las referencias de `writing-plans` a `subagent-driven-development` o `executing-plans` no aplican. Los pasos usan casillas (`- [ ]`).

**Goal:** Que existan `Waba` y `Line`, que toda conexión de WhatsApp escriba en ellos **y** en los campos viejos del owner, y que una migración los cree para los datos de hoy (cada conversación con la línea de **su propio** número). Nada lee todavía de los modelos nuevos: el webhook y los envíos enrutan exactamente como hoy.

**Architecture:** Paso «ampliar» del spec (§ 4, Fase 2, 2a): solo se añaden colecciones y campos. La conexión pasa por un servicio que guarda `Waba` (token cifrado, una vez por WABA) y `Line`, apunta `Account.defaultLineId` y copia al owner los campos viejos que calcula `legacyUserFields`, así que la imagen anterior y el código de hoy siguen leyendo datos al día. La migración (`migrate:lines`) es pura en su lógica (`planLineMigration`) e idempotente; `--check` dice si queda algo pendiente o desajustado. La Fase 2b cambiará el enrutado; la 2c, la UI.

**Tech Stack:** Express 5, Mongoose 8, `node:test`, `mongodb-memory-server`.

**Spec:** `docs/superpowers/specs/2026-10-11-multi-linea-multi-agente-design.md` (§ 2.2 «Números anteriores al actual», «El hueco entre desplegar y migrar» y «La vuelta atrás»; § 3.1; § 4 «Fase 2»; § 5).

## Global Constraints

- **Sin cambio de enrutado ni visible.** El webhook sigue buscando `User.findOne({ phoneNumberId })`; los envíos, el token y el número del owner (`findAccountOwner`). Ningún controlador **lee** `Waba` ni `Line` para decidir nada en esta fase, salvo el servicio de conexión.
- **Doble escritura**: toda conexión escribe `Waba`/`Line` **y** `User.tokenWhatsapp/phoneNumberId/waBusinessId` del owner, con los valores de `legacyUserFields(defaultLine, waba)`. Hasta la Fase 5.
- `Account.limits.maxLines` sigue en 1: conectar otro número **reemplaza** la línea por defecto (la anterior queda `disconnected`, con su historial), igual que hoy se sobrescribe `User`.
- El índice `conversation_contact_unique` **no se toca** en esta fase (se cambia en la 2b): la imagen anterior sigue creando conversaciones sin `lineId`.
- El token va cifrado en `Waba` y nunca sale del backend; los textos al usuario, en español; errores como `[{ message }]`.
- Commits sin coautor ni atribución. Rama: `fase2a-lineas`. Un solo PR.
- Comprobar con `cd Backend && npm test && npm run test:isolation`.

## Review Focus

- **Un número que ya usó otra cuenta.** A tuvo el número X (sus conversaciones viejas lo guardan) y hoy X es de B. La migración crea una línea `disconnected` X en A y la `active` X en B, sin chocar: el índice único de `Line.phoneNumberId` es **parcial a `status: 'active'`** → test de `planLineMigration` y de índice en la Tarea 1.
- **Reconectar el mismo número para renovar el token** actualiza el token del `Waba` y no crea otra línea ni otro `Waba` → test de la Tarea 2.
- **Una conexión que falla a medias** (Meta rechaza, número de otra cuenta) no deja `Waba`, `Line` ni campos viejos a medio escribir → tests de la Tarea 2 (los mismos casos de la Fase 0, ahora mirando también `Waba` y `Line`).
- **Un WABA que ya es de otra cuenta.** Hoy se permite, y rompe las plantillas (`Template.templateId` es único global y la sincronización las pasaría de una cuenta a otra). Ahora: 409 sin guardar nada, y la migración **para** si encuentra uno compartido → tests de las Tareas 1 y 2.
- **Una conversación que nace entre desplegar y migrar** queda con `lineId: null`; volver a correr `migrate:lines` la completa, y `--check` lo dice → test de `planLineMigration` (Tarea 1) y paso 6 de «Antes de desplegar».

---

### Task 1: Modelos `Waba` y `Line`, y la migración `migrate:lines`

**Files:**
- Create: `Backend/src/models/waba.model.js`, `Backend/src/models/line.model.js`
- Modify: `Backend/src/models/account.model.js` (`defaultLineId`), `conversation.model.js` (`lineId`), `campaign.model.js` (`lineId`), `template.model.js` (`waBusinessId`)
- Create: `Backend/src/utils/line.js`, `Backend/tests/line.test.js`
- Create: `Backend/scripts/migrate-lines.js`; Modify: `Backend/package.json` (`migrate:lines`)
- Modify: `Backend/tests/isolation/helpers.js` (exportar `Waba` y `Line`)
- Modify: `docs/arquitectura/pruebas-y-scripts.md`, `Backend/AGENTS.md` (índices y tests puros)

**Interfaces:**
- Produces:
  - `Waba`: `accountId` (obligatorio), `waBusinessId: String` (obligatorio, **único global**, índice `waba_waBusinessId_unique`), `tokenWhatsapp: String` (cifrado, por defecto `null`), `timestamps`.
  - `Line`: `accountId` (obligatorio, indexado), `wabaId` (ref `Waba`, por defecto `null`: las líneas de números anteriores no saben su WABA), `phoneNumberId: String` (obligatorio), `displayPhoneNumber`, `verifiedName`, `name` (los tres `String`, por defecto `null`), `status: 'active' | 'disconnected'` (por defecto `'active'`), `timestamps`. Índices: `line_phoneNumberId_active_unique` `{ phoneNumberId: 1 }` único **parcial** `{ status: 'active' }`, y `line_account_phone_unique` `{ accountId: 1, phoneNumberId: 1 }` único (una línea por número dentro de la cuenta, activa o no).
  - `Account.defaultLineId` (ref `Line`, `null`); `Conversation.lineId` (ref `Line`, `null`, indexado); `Campaign.lineId` (ref `Line`, `null`); `Template.waBusinessId` (`String`, `null`).
  - `legacyUserFields(defaultLine, waba) → { tokenWhatsapp, phoneNumberId, waBusinessId }` en `utils/line.js`: los campos viejos del owner. Con línea activa y su WABA, los de ellos; sin línea por defecto activa, los tres `null`.
  - `planLineMigration({ owner, conversationPhoneIds, campaignIds, existingLines, wabaOwners }) → { stop: string[] } | { waba, lines, defaultPhoneNumberId, conversationLines, campaignLine }` en `utils/line.js`:
    - `owner`: el `User` owner (con `accountId`, `tokenWhatsapp`, `phoneNumberId`, `waBusinessId`).
    - `conversationPhoneIds`: los `phoneNumberId` distintos de las conversaciones de la cuenta **sin `lineId`**; `null` dentro significa una conversación sin número.
    - `existingLines`: las `Line` ya creadas de la cuenta (por `phoneNumberId`), para no duplicar.
    - `wabaOwners`: `Map<waBusinessId, accountId>` de los `Waba` que ya existen.
    - Resultado: `waba` = `{ waBusinessId, tokenWhatsapp }` o `null` (cuenta sin conexión completa); `lines` = las que hay que crear, `[{ phoneNumberId, status, withWaba: boolean }]` (el número actual, `active` y con su WABA; los demás, `disconnected` y sin WABA); `defaultPhoneNumberId` = el número actual o `null`; `conversationLines` = los `phoneNumberId` cuyas conversaciones reciben la línea de su número; `campaignLine` = `defaultPhoneNumberId` (las campañas sin `lineId` reciben la línea por defecto).
    - **Para** (`stop`, con el motivo) si hay una conversación sin `phoneNumberId`, o si el WABA del owner ya es de **otra** cuenta en `wabaOwners`.

- [ ] **Step 1: Escribir los tests que fallan** en `tests/line.test.js`

```js
test('legacyUserFields: con línea activa y su WABA, sus tres campos', ...);
// ({ phoneNumberId: '111', status: 'active' }, { waBusinessId: 'w1', tokenWhatsapp: 'cifrado' })
// → { tokenWhatsapp: 'cifrado', phoneNumberId: '111', waBusinessId: 'w1' }
test('legacyUserFields: sin línea por defecto, o desconectada, todo null', ...);

test('planLineMigration: el número actual → WABA, línea activa y por defecto', ...);
// owner con '111' y 'w1'; conversationPhoneIds ['111'] → waba { waBusinessId: 'w1', tokenWhatsapp }, lines [{ '111', active, withWaba: true }],
// defaultPhoneNumberId '111', conversationLines ['111'], campaignLine '111'
test('planLineMigration: cada número anterior → su línea desconectada, y sus conversaciones con ella', ...);
// conversationPhoneIds ['111', '222'] → lines incluye { phoneNumberId: '222', status: 'disconnected', withWaba: false };
// conversationLines ['111', '222']
test('planLineMigration: sin conexión, solo líneas desconectadas y sin línea por defecto', ...);
// owner sin token/número; conversationPhoneIds ['333'] → waba null, defaultPhoneNumberId null, campaignLine null
test('planLineMigration: lo que ya existe no se vuelve a crear', ...);
// existingLines con '111' y '222' → lines []; conversationLines sigue listando los números (conversaciones sin lineId)
test('planLineMigration: una conversación sin número para la migración', ...);   // conversationPhoneIds [null] → stop
test('planLineMigration: un WABA de otra cuenta para la migración', ...);        // wabaOwners con 'w1' → otra cuenta → stop
```

- [ ] **Step 2: Ejecutarlos y ver que fallan**

Run: `cd Backend && node --test tests/line.test.js`
Expected: FAIL, `utils/line.js` no existe.

- [ ] **Step 3: Implementar `utils/line.js`, los dos modelos y los campos nuevos.** Cada campo nuevo lleva su comentario: qué es y que en la 2a nadie lo lee para enrutar.

- [ ] **Step 4: Test del índice parcial** en `tests/isolation/lines.test.js` (nuevo; los índices solo se prueban con Mongo):

```js
test('un número activo en una cuenta y desconectado en otra conviven', ...);
// Line.create activa '555' en A y desconectada '555' en B → ok; otra activa '555' en B → E11000
```

(`await Line.init()` antes, para que el índice exista.)

- [ ] **Step 5: Escribir `scripts/migrate-lines.js`**, con el patrón de `migrate-accounts.js`:
1. Por cada owner (`role: 'owner'`): `conversationPhoneIds` con un `distinct('phoneNumberId', { userId: accountId, lineId: null })`, sus `Line` y el mapa `wabaOwners` (una consulta para todos los `Waba` al principio). `planLineMigration`.
2. Algún `stop` → la lista (correo y motivo), nada escrito, código 1.
3. Conteos: `WABA a crear · líneas a crear (activas / desconectadas) · conversaciones y campañas sin línea`. Con `--dry-run`, termina aquí.
4. Aplicar, en este orden y con escrituras que se pueden repetir: `Waba` con `updateOne({ waBusinessId }, { $setOnInsert: { accountId, waBusinessId }, $set: { tokenWhatsapp } }, { upsert: true })`; cada `Line` con upsert por `{ accountId, phoneNumberId }`; `Account.defaultLineId` si está vacío; `Conversation.updateMany({ userId: accountId, phoneNumberId, lineId: null }, { lineId })` por número; `Campaign.updateMany({ userId: accountId, lineId: null }, { lineId })`.
5. `--check`: no escribe; lista lo pendiente (lo mismo que `--dry-run`) **y** los owners cuyos campos viejos no coinciden con `legacyUserFields` de su línea por defecto. Sale con 1 si hay algo.

- [ ] **Step 6: Probarlo en el Mongo local**

Run: `cd Backend && npm run migrate:lines -- --dry-run && npm run migrate:lines && npm run migrate:lines -- --check`
Expected: la tercera sale con 0 y sin nada pendiente. Con una conversación creada a mano con otro `phoneNumberId`, aparece su línea desconectada y la conversación la recibe (borrarla después).

- [ ] **Step 7: Documentar** en `pruebas-y-scripts.md` (`### migrate:lines`: qué crea, que va por el número real de cada conversación, cuándo para, `--check`) y en `Backend/AGENTS.md` (los índices de `Waba` y `Line`, y `utils/line.js` en los tests puros).

- [ ] **Step 8: Commit**

```bash
git add Backend/src/models Backend/src/utils/line.js Backend/tests Backend/scripts/migrate-lines.js Backend/package.json Backend/AGENTS.md docs/arquitectura/pruebas-y-scripts.md
git commit -m "líneas: modelos Waba y Line, y la migración migrate:lines"
```

---

### Task 2: La conexión escribe `Waba`, `Line` y los campos viejos

**Files:**
- Create: `Backend/src/services/line.service.js`
- Modify: `Backend/src/controllers/whatsapp.controller.js`, `Backend/src/controllers/user.controller.js`, `Backend/src/services/whatsapp.connection.service.js` (el 409 del WABA)
- Modify: `Backend/tests/isolation/whatsapp.test.js`
- Modify: `docs/arquitectura/whatsapp-envio.md` («Un número, una cuenta» y «Dónde se guarda la conexión»)

**Interfaces:**
- Consumes: `legacyUserFields` (Tarea 1), `findAccountOwner`, el `line` que ya devuelve `verifyWabaPhoneNumber` (`{ phoneNumberId, displayPhoneNumber, verifiedName }`).
- Produces:
  - `WABA_TAKEN_MESSAGE = 'Esa cuenta de WhatsApp Business ya está conectada a otra cuenta de Wasmish.'` y `isWabaTaken(accountId, waBusinessId) → Promise<boolean>` en `whatsapp.connection.service.js`, junto a `isPhoneNumberTaken`.
  - `saveWhatsappConnection({ accountId, owner, token, line, waBusinessId }) → Promise<{ waba, line }>` en `line.service.js`. `token` llega en claro y se cifra aquí. En orden:
    1. `Waba`: upsert por `waBusinessId` (con `accountId` en el filtro: si es de otra cuenta, el E11000 sube como 409).
    2. `Line`: upsert por `{ accountId, phoneNumberId }` con `wabaId`, `displayPhoneNumber`, `verifiedName` y `status: 'active'`.
    3. Si la línea por defecto de la cuenta era **otra**, esa pasa a `disconnected`; `Account.defaultLineId` = la nueva.
    4. `owner` recibe `legacyUserFields(line, waba)` y se guarda.
  - Si el paso 1 o el 2 fallan, nada de lo siguiente se escribe. Si falla el 4 (el E11000 de `user_phoneNumberId_unique`, en la carrera), la línea nueva se marca `disconnected` y se restaura la línea por defecto anterior antes de relanzar.

El orden de comprobaciones de la Fase 0 no cambia; `isWabaTaken` va junto a `isPhoneNumberTaken`, antes de llamar a Meta.

- [ ] **Step 1: Escribir los tests que fallan** en `tests/isolation/whatsapp.test.js`

```js
test('conectar crea el WABA y la línea, la deja por defecto y copia los campos viejos', ...);
// cuenta nueva con el formulario manual y Meta falso → Waba { accountId, waBusinessId, tokenWhatsapp cifrado (≠ 'token-manual') },
// Line activa con displayPhoneNumber del fake, Account.defaultLineId = esa línea,
// owner con phoneNumberId y waBusinessId iguales y tokenWhatsapp igual al del Waba.

test('reconectar el mismo número actualiza el token del WABA, sin duplicar', ...);
// dos conexiones seguidas del mismo número y WABA con tokens distintos → 1 Waba y 1 Line; el token del Waba cambió.

test('conectar otro número deja la línea anterior desconectada', ...);
// '991' y luego '9911' en el mismo WABA → la de '991' 'disconnected', la nueva activa y por defecto; owner.phoneNumberId '9911'.

test('un WABA de otra cuenta → 409 y no se guarda nada', ...);
// B intenta conectar con el waBusinessId de A → 409 y WABA_TAKEN_MESSAGE; ni Waba ni Line de B; sin llamar a Meta.

test('si Meta rechaza el número, ni WABA ni línea', ...);
// el caso 400 de la Fase 0 → Waba.countDocuments y Line.countDocuments de esa cuenta siguen en 0.
```

`fakeMeta` del archivo ya devuelve `numbers`; para `displayPhoneNumber`, que devuelva `{ id, display_phone_number: '+1 555 000 ' + id }`.

- [ ] **Step 2: Ejecutarlos y ver que fallan**

Run: `cd Backend && node --test tests/isolation/whatsapp.test.js`
Expected: FAIL (no existen `Waba` ni `Line` tras conectar).

- [ ] **Step 3: Implementar** `saveWhatsappConnection` e `isWabaTaken`, y que los dos controladores las usen en lugar de escribir `user.tokenWhatsapp/phoneNumberId/waBusinessId` a mano. `connectionErrorResponse` traduce también el E11000 del índice de `Waba` a 409 con `WABA_TAKEN_MESSAGE` (mirar `error.keyPattern`).

- [ ] **Step 4: Ejecutar todo y ver que pasa**

Run: `cd Backend && npm test && npm run test:isolation`
Expected: PASS, también los tests de la Fase 0 y de la Fase 1 de este archivo (carrera, segunda página, reconectar).

- [ ] **Step 5: Documentar** en `whatsapp-envio.md`: la conexión guarda `Waba` y `Line` y copia los campos viejos al owner (doble escritura, y por qué); un WABA es de una sola cuenta (409); con `maxLines: 1`, otro número reemplaza la línea por defecto.

- [ ] **Step 6: Commit**

```bash
git add Backend/src Backend/tests docs/arquitectura/whatsapp-envio.md
git commit -m "líneas: la conexión guarda Waba y Line, y sigue escribiendo los campos viejos"
```

---

### Task 3: Lo nuevo nace con su línea y su WABA

**Files:**
- Modify: `Backend/src/controllers/contact.controller.js` (`findOrCreateConversation`), `campaign.controller.js` (`createCampaign`), `template.controller.js` (`syncTemplatesForUser`)
- Modify: `Backend/src/services/line.service.js` (`findLineId`)
- Modify: `Backend/tests/isolation/webhook.test.js`, `campaigns.test.js`, `templates.test.js`
- Modify: `docs/arquitectura/webhook-adjuntos.md` (donde se describe `findOrCreateConversation`), `campanas.md`, `whatsapp-envio.md` (la sincronización de plantillas)

**Interfaces:**
- Consumes: `Line`, `Account.defaultLineId` (Tarea 1).
- Produces: `findLineId(accountId, phoneNumberId) → Promise<ObjectId | null>` en `line.service.js`: la `Line` de ese número en esa cuenta (activa o no), o `null`.

Reglas:
- `findOrCreateConversation` pone `lineId: await findLineId(userId, phoneNumberId)` **solo al crear**. Una conversación existente no cambia de línea.
- `createCampaign` pone `lineId` = `Account.defaultLineId` de la cuenta.
- `syncTemplatesForUser` pone `waBusinessId: user.waBusinessId` en cada plantilla.
- `null` donde no haya línea todavía: lo completa la siguiente pasada de `migrate:lines`.

- [ ] **Step 1: Escribir los tests que fallan**

```js
// webhook.test.js — con la línea de A creada (Line activa con el número de A):
test('una conversación nueva nace con la línea de su número', ...);
// postWebhook de un número nuevo → la Conversation tiene lineId = esa Line.

// campaigns.test.js
test('una campaña nueva nace con la línea por defecto de su cuenta', ...);
// Account.defaultLineId puesto a mano; POST /campaigns de A → Campaign.lineId igual.

// templates.test.js
test('sincronizar guarda el WABA en cada plantilla', ...);
// connectWhatsapp(a) con waBusinessId; onMeta responde a GET `/<waba>/message_templates` con una plantilla
// → GET /templates/sync 200 y Template.findOne({ userId: a.accountId, templateId }).waBusinessId === ese WABA.
```

`connectWhatsapp` de los helpers no pone `waBusinessId`: que acepte `{ waBusinessId }` opcional.

- [ ] **Step 2: Ejecutarlos y ver que fallan.** Run: `cd Backend && npm run test:isolation` · Expected: FAIL en los tres.

- [ ] **Step 3: Implementar** las tres reglas.

- [ ] **Step 4: Ejecutar todo y ver que pasa.** Run: `cd Backend && npm test && npm run test:isolation` · Expected: PASS.

- [ ] **Step 5: Probar en local**: `npm run dev`, `npm run webhook:simulate -- texto` con un número nuevo → su conversación tiene `lineId`; `npm run migrate:lines -- --check` sale con 0.

- [ ] **Step 6: Documentar** cada campo donde se explica su modelo, con «(Fase 2a: se guarda, todavía no se usa para enrutar)».

- [ ] **Step 7: Commit**

```bash
git add Backend/src Backend/tests docs
git commit -m "líneas: las conversaciones, campañas y plantillas nuevas guardan su línea y su WABA"
```

---

## Al terminar

- `docs/estado.md`: «En curso» y, en «Lo siguiente», la Fase 2b (enrutar por `Line`, plantillas por WABA, la API pública con `lineId`/`from`, contactos con varias conversaciones, el índice nuevo de conversaciones) y la 2c (la UI de líneas).
- Resumen para Jonathan y revisión cruzada de Codex en una ronda.

## Decisiones del plan (para revisar)

- **La Fase 2 se parte en tres PRs y tres despliegues:** 2a (este: ampliar y migrar, sin enrutar), 2b (enrutar por línea, con la reserva del camino viejo) y 2c (la UI). El spec ya separaba 2a y 2b; la UI va aparte porque la regla de «backend primero» lo pide y porque 2b sola ya es grande.
- **`Line.phoneNumberId` es único solo entre las líneas activas** (el spec decía «único global»): un número puede haber sido de una cuenta y hoy ser de otra, y las dos tienen que conservar su historial.
- **Un WABA es de una sola cuenta: 409 nuevo** al conectar uno que ya tiene otra cuenta. Hoy se permite, pero ya está roto: la sincronización movería las plantillas de una cuenta a otra (`templateId` es único global). La migración para si encuentra uno compartido.
- **Las líneas de números anteriores no tienen WABA** (`wabaId: null`): no hay forma fiable de saber cuál era, y desde ellas no se envía.
- **`check:lines` es `migrate:lines --check`**, no un script aparte: lo pendiente lo calcula la misma función.
- **El índice viejo de conversaciones se queda hasta la 2b**, para que la imagen anterior (que crea conversaciones sin `lineId`) siga protegida contra duplicados.

## Antes de desplegar (Jonathan)

La Fase 1 tiene que estar desplegada antes (la migración recorre los owners de cada `Account`). Con `/deploy`:

1. `mongodump` de producción. **Antes**, ensayar la migración contra una copia: restaurar el dump en el Mongo local (con el `.env` local, nunca apuntando a producción) y correr `migrate:lines -- --dry-run`, `migrate:lines` y `migrate:lines -- --check`. Si para, la lista dice qué cuenta revisar.
2. Desplegar la imagen nueva. No hace falta parar nada: nada lee las líneas todavía.
3. `migrate:lines -- --dry-run`, revisar los conteos, y `migrate:lines`.
4. `migrate:lines -- --check` tiene que salir con 0. Si alguien conectó o recibió una conversación nueva entre el paso 2 y el 3, se corre `migrate:lines` otra vez.
5. Comprobar: un entrante en vivo, un envío, `POST /api/v1/templates/send` con 200 en los logs.

**Volver atrás:** la imagen anterior ignora `wabas`, `lines` y los campos nuevos, y gracias a la doble escritura encuentra en `User` el token y el número al día.

## Lo que este plan no cubre

- Leer las líneas: el webhook por `Line`, los envíos con el token del `Waba` y el número de la línea, las plantillas por WABA, la API pública con `lineId`/`from`, los contactos con varias conversaciones, el reparto del worker por línea y el índice nuevo de conversaciones (Fase 2b).
- La UI de líneas y `Account.limits.maxLines` > 1 (Fase 2c).
- Si repetir el Embedded Signup en el mismo WABA invalida el token anterior (spec § 2.2): hay que comprobarlo en WasmishTest **antes de la 2b**, que es cuando una cuenta puede tener dos líneas del mismo WABA.
