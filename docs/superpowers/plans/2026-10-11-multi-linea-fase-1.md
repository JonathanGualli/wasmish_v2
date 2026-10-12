# Multi-línea · Fase 1: la cuenta, separada del usuario — Implementation Plan

> **Para quien lo ejecute:** en Wasmish los planes se ejecutan **nativo** (rama, PR, revisión cruzada; ver «Planes» en `AGENTS.md`). Las referencias de `writing-plans` a `subagent-driven-development` o `executing-plans` no aplican. Los pasos usan casillas (`- [ ]`).

**Goal:** Que exista la cuenta (`Account`) como entidad propia y que todo el backend tome al dueño de los datos de `req.auth.accountId`, no de la persona de la sesión. Sin ningún cambio visible para quien usa Wasmish ni para el cliente de la API pública.

**Architecture:** Opción B del spec: `Account._id` es el `_id` del usuario que la crea, así que el `userId` de contactos, conversaciones, etc. pasa a significar «la cuenta» sin migrar ningún documento. `authRequired` lee el usuario de la BD en cada petición y deja `req.auth`; `validateApiKey` deja el `req.auth` de la cuenta. La conexión de WhatsApp sigue en el `User` del owner hasta la Fase 2: un servicio la busca por cuenta (`findAccountOwner`). Los tests de aislamiento crean cuentas cuyo `_id` **no** es el del usuario: así cualquier `req.user.id` o `user._id` olvidado rompe un test.

**Tech Stack:** Express 5, Mongoose 8, Zod 4, `node:test`, `mongodb-memory-server`; en el frontend, React 19 + TypeScript (un campo nuevo en la sesión).

**Spec:** `docs/superpowers/specs/2026-10-11-multi-linea-multi-agente-design.md` (§ 3.1 «La clave de la cuenta», § 3.2 «Sesión», § 4 «Fase 1» y § 5 «Migración»).

## Global Constraints

- **Sin cambio visible.** Login, `/verify`, `/profile` y `/register` responden con los mismos campos de hoy (`rol` incluido); solo se **añade** `isSuperadmin`. `POST /api/v1/templates/send` responde exactamente lo mismo.
- `User.rol`, `tokenWhatsapp`, `phoneNumberId` y `waBusinessId` **se conservan** (vuelta atrás, hasta la Fase 5). Nada de lo nuevo los borra ni los deja de escribir.
- El código toma la cuenta de `req.auth.accountId` y la persona de `req.auth.userId`. **`req.user` desaparece** del backend al terminar la Tarea 3.
- Roles nuevos: `owner | admin | supervisor | agent` (`User.role`). En esta fase todos los usuarios son `owner`. El superadmin es `User.isSuperadmin`, no un rol.
- Límites por defecto de una cuenta: `limits: { maxLines: 1, maxUsers: 1 }`. Nada los lee todavía.
- Errores como array `[{ message }]`; mensajes en español; identificadores nuevos en inglés; comentarios y commits en español.
- Los tests nunca llegan a Meta (el transporte falso de la Fase 0 sigue en `helpers.js`).
- Commits sin coautor ni atribución. Rama: `fase1-cuenta`. Un solo PR.
- Comprobar con `cd Backend && npm test && npm run test:isolation`, y `cd Frontend && npm run lint && npm run build` en la Tarea 2.

## Review Focus

- **El hueco entre arrancar la imagen nueva y migrar.** Un usuario sin `accountId` tiene que recibir un **401**, nunca un 500 ni una consulta con `accountId: 'undefined'`. Una API key cuya cuenta no existe, también 401. La migración corre **antes** de arrancar la imagen nueva (ver «Antes de desplegar»): sin eso, PractyCo se quedaría sin API → tests de `sessionAuthFor` en la Tarea 1 y de la API key en la Tarea 2.
- **Una migración cortada a medias o repetida.** Si existe la `Account` pero el usuario aún no tiene `accountId`, la siguiente pasada termina el trabajo; una pasada sobre todo migrado no cambia nada → tests de `planAccountMigration` (Tarea 1) y dos pasadas en local (Tarea 1, paso 7).
- **Un usuario desactivado con la cookie todavía válida.** Su siguiente petición da 401, sin esperar a que caduque el JWT. Su login con la contraseña correcta da 403 con el motivo; con una incorrecta, el mismo 400 genérico de siempre (no se puede averiguar quién está desactivado) → tests de la Tarea 2.
- **Un registro que intenta darse privilegios.** `POST /register` con `rol: 'superadmin'`, `isSuperadmin: true`, `role: 'agent'`, `status: 'inactive'` o el `accountId` de otra cuenta crea igualmente una cuenta nueva, con su owner activo y sin superadmin → test de la Tarea 2.
- **Reconectar el propio número con cuentas de `_id` distinto.** `isPhoneNumberTaken` recibe el `_id` del **usuario** que tiene la conexión (el owner), no el de la cuenta: si recibiera el de la cuenta, renovar el token daría 409 → lo cazan los tests de `whatsapp.test.js` cuando los helpers pasan a `_id` distintos (Tarea 3).

---

### Task 1: El modelo `Account` y la migración

**Files:**
- Create: `Backend/src/models/account.model.js`
- Modify: `Backend/src/models/user.model.js`
- Create: `Backend/src/utils/account.js`
- Create: `Backend/tests/account.test.js`
- Create: `Backend/scripts/migrate-accounts.js`
- Modify: `Backend/package.json` (script `migrate:accounts`)
- Modify: `Backend/tests/isolation/helpers.js` (`seedAccount` crea la cuenta)
- Modify: `docs/arquitectura/pruebas-y-scripts.md`, `Backend/AGENTS.md` (índices y lista de tests puros)

**Interfaces:**
- Produces:
  - `Account` (colección `accounts`): `name: String` (obligatorio, `trim`), `ownerId: ObjectId` (ref `User`, obligatorio), `plan: String` (por defecto `null`, solo informativo), `limits: { maxLines: Number = 1, maxUsers: Number = 1 }`, `timestamps`. Sin `defaultLineId` ni `status` todavía: llegan con la fase que los use.
  - `User`, campos nuevos: `accountId: ObjectId` (ref `Account`, **obligatorio**), `role: 'owner' | 'admin' | 'supervisor' | 'agent'` (**obligatorio, sin valor por defecto**: quien crea un usuario decide su rol), `isSuperadmin: Boolean = false`, `lineIds: [ObjectId] = []`. Índice `user_account_owner_unique`: `{ accountId: 1 }` único **parcial** con `{ role: 'owner' }` (un owner por cuenta). Comentario en el modelo: `rol` es el campo viejo y se borra en la Fase 5.
  - `planAccountMigration(user) → { action: 'skip' } | { action: 'stop', reason: string } | { action: 'create', account: { _id, name, ownerId }, userUpdate: { accountId, role: 'owner', isSuperadmin: boolean } }` en `utils/account.js`. `user` es un objeto plano con `_id`, `name`, `rol`, `accountId`.
  - `sessionAuthFor(user) → { userId: string, accountId: string, role: string, lineIds: string[], isSuperadmin: boolean } | null` en `utils/account.js`. `null` si no hay usuario, si `status === 'inactive'` o si no tiene `accountId`.
  - `npm run migrate:accounts` (`-- --dry-run` solo informa).

- [ ] **Step 1: Escribir los tests que fallan** en `tests/account.test.js`

```js
test('planAccountMigration: un admin sin cuenta → cuenta con su mismo _id y él de owner', () => {
    const _id = new mongoose.Types.ObjectId();
    assert.deepEqual(planAccountMigration({ _id, name: 'Ana', rol: 'admin' }), {
        action: 'create',
        account: { _id, name: 'Ana', ownerId: _id },
        userUpdate: { accountId: _id, role: 'owner', isSuperadmin: false },
    });
});
test('planAccountMigration: el superadmin pasa a isSuperadmin: true', ...);           // rol 'superadmin' → isSuperadmin true, role 'owner'
test('planAccountMigration: un agent sin cuenta propia para la migración', ...);      // → { action: 'stop', reason } y reason menciona 'agent'
test('planAccountMigration: con accountId ya puesto no hace nada', ...);              // → { action: 'skip' }, también si rol es 'agent'
test('sessionAuthFor: deja ids como texto y lineIds vacío', ...);                      // { userId: String(_id), accountId: String(accountId), role: 'owner', lineIds: [], isSuperadmin: false }
test('sessionAuthFor: inactivo, sin cuenta o sin usuario → null', ...);               // status 'inactive' → null; sin accountId → null; null → null
```

Los ids van como `ObjectId` reales (con `mongoose.Types.ObjectId`); el módulo es puro y no conecta a ninguna BD.

- [ ] **Step 2: Ejecutarlos y ver que fallan**

Run: `cd Backend && node --test tests/account.test.js`
Expected: FAIL, `utils/account.js` no existe.

- [ ] **Step 3: Implementar `utils/account.js`, `account.model.js` y los campos de `User`**

`sessionAuthFor` convierte `lineIds` con `map(String)` y trata un `lineIds` ausente como `[]`.

- [ ] **Step 4: `seedAccount` crea la cuenta**

En `helpers.js`, exportar `Account` y hacer que `seedAccount` cree primero la cuenta **con el mismo `_id`** que el usuario (`_id` generado antes, `Account.create({ _id, name: marker, ownerId: _id })`) y el usuario con `accountId: _id, role: 'owner', isSuperadmin: rol === 'superadmin'`. La opción `rol` se queda hasta la Tarea 2. La Tarea 3 separa los dos `_id`.

- [ ] **Step 5: Ejecutar todo y ver que pasa**

Run: `cd Backend && npm test && npm run test:isolation`
Expected: PASS (el modelo exige `accountId` y `role`, y los helpers ya los ponen).

- [ ] **Step 6: Escribir `scripts/migrate-accounts.js`**

Con el patrón de `scripts/backfill-contacts.js` (cabecera con el uso, `MONGO_URI` con la contraseña oculta en el log, `--dry-run`). Pasos:
1. Lee todos los usuarios (`_id name email rol accountId`, `lean`) y aplica `planAccountMigration` a cada uno.
2. Si algún plan es `stop`, imprime la lista (correo y motivo), **no escribe nada** y sale con código 1.
3. Imprime `Cuentas a crear: N · ya migrados: M`. Con `--dry-run`, termina aquí.
4. Por cada `create`: `Account.updateOne({ _id }, { $setOnInsert: account }, { upsert: true })` y después `User.updateOne({ _id, accountId: { $exists: false } }, { $set: userUpdate })`. Así una pasada cortada entre las dos escrituras se completa en la siguiente.
5. Imprime cuántas cuentas creó y cuántos usuarios actualizó.

No llama a `syncIndexes` (borraría índices que no están en el esquema).

- [ ] **Step 7: Probarlo en el Mongo local**

Run: `cd Backend && npm run migrate:accounts -- --dry-run && npm run migrate:accounts && npm run migrate:accounts -- --dry-run`
Expected: la primera cuenta N usuarios por migrar; la segunda los migra; la tercera dice `Cuentas a crear: 0`. Con un usuario `rol: 'agent'` creado a mano en local, la primera para con su correo y no escribe nada (borrarlo después).

- [ ] **Step 8: Documentar**

`pruebas-y-scripts.md`: una sección `### migrate:accounts` (qué hace, que es idempotente, que para con un `agent`, y que en producción corre **antes** de arrancar la imagen nueva). `Backend/AGENTS.md`: el índice `user_account_owner_unique` y `utils/account.js` en la lista de tests puros.

- [ ] **Step 9: Commit**

```bash
git add Backend/src/models Backend/src/utils/account.js Backend/tests Backend/scripts/migrate-accounts.js Backend/package.json Backend/AGENTS.md docs/arquitectura/pruebas-y-scripts.md
git commit -m "cuenta: modelo Account, campos nuevos de User y migración migrate:accounts"
```

---

### Task 2: La sesión: `req.auth`, registro, desactivados y superadmin

**Files:**
- Create: `Backend/src/services/account.service.js`
- Modify: `Backend/src/middlewares/validate.token.middleware.js`, `require.superadmin.middleware.js`, `validate.api.key.middleware.js`, `rate.limit.middleware.js`
- Modify: `Backend/src/controllers/auth.controller.js`, `Backend/src/schemas/auth.schema.js`
- Modify: `Backend/tests/isolation/helpers.js` (opción `isSuperadmin`), `Backend/tests/isolation/account.test.js`
- Modify: `Frontend/src/models/user.mode.ts`, `Frontend/src/components/Sidebar/Sidebar.tsx:50-55`, `Frontend/src/pages/private/PrivateRouter.tsx:29`
- Modify: `docs/arquitectura/api.md` (autenticación, límites y `/register`)

**Interfaces:**
- Consumes: `sessionAuthFor(user)` y `Account` (Tarea 1).
- Produces:
  - `req.auth` en toda ruta con `authRequired`: lo que devuelve `sessionAuthFor`. Con API key: `{ userId: null, accountId: string, role: 'api', lineIds: null, isSuperadmin: false }` (`lineIds: null` = todas).
  - `findAccountOwner(accountId) → Promise<UserDoc | null>` en `services/account.service.js`: `User.findOne({ accountId, role: 'owner' })`. Es quien guarda la conexión de WhatsApp hasta la Fase 2.
  - `createAccountWithOwner({ name, email, password }) → Promise<UserDoc>`: genera un `_id`, crea la `Account` (`_id`, `name`, `ownerId: _id`) y después el `User` (`_id`, `accountId: _id`, `role: 'owner'`; `password` ya viene hasheada). Si crear el usuario falla, borra la cuenta y relanza el error.
  - Las respuestas de login, `/verify`, `/profile` y `/register` añaden `isSuperadmin`.

Decisión del plan: **`loadAuth` no es un middleware aparte**; lo hace `authRequired`, que ya está en todas las rutas privadas (61 montajes). Así ninguna ruta nueva puede olvidarlo. Los códigos de hoy se mantienen: sin cookie 401, JWT inválido 403; usuario inexistente, desactivado o sin cuenta: **401** `[{ message: 'Unauthorized' }]`.

- [ ] **Step 1: Escribir los tests que fallan** en `tests/isolation/account.test.js`

```js
test('POST /register crea la cuenta y su owner con el mismo _id', ...);
// 200; User.findOne({ email }) tiene accountId igual a su _id, role 'owner', isSuperadmin false;
// Account.findById(ese _id) existe con ownerId igual; la cookie de la respuesta abre GET /profile (200).

test('POST /register ignora los privilegios del cuerpo', ...);
// cuerpo con rol 'superadmin', isSuperadmin true, role 'agent', status 'inactive', accountId: a.accountId
// → 200; el usuario es owner de una cuenta NUEVA (≠ a.accountId), status 'active', isSuperadmin false;
// GET /admin/stats con su cookie → 403.

test('un usuario desactivado: su cookie deja de valer y el login lo dice', ...);
// User.updateOne({ _id: c.userId }, { status: 'inactive' }) → GET /contacts con su cookie: 401;
// POST /login con su contraseña: 403 y el mensaje 'Tu usuario está desactivado. Habla con el administrador de tu cuenta.';
// POST /login con otra contraseña: 400 y CREDENCIALES_INVALIDAS, igual que un correo inexistente.

test('un usuario sin cuenta (sin migrar) recibe 401, no 500', ...);
// User.updateOne({ _id }, { $unset: { accountId: 1 } }) → GET /contacts: 401; GET /verify: 401.

test('el superadmin sale de isSuperadmin, no de rol', ...);
// usuario con rol 'superadmin' e isSuperadmin false → /admin/stats 403; con isSuperadmin true y rol 'admin' → 200;
// GET /verify devuelve isSuperadmin.

test('una API key cuya cuenta no existe → 401', ...);
// ApiKey con userId de un ObjectId sin Account → POST /v1/templates/send: 401.
```

Para el login hace falta una contraseña real: `seedAccount` guarda `password: 'x'`, así que este test crea su usuario con `bcrypt.hash`. Para la API key, el helper `request` manda `Authorization: Bearer <key>` en `headers`; la `keyHash` se calcula con `hashApiKey` de `utils/crypto.js`. Mientras se escribe, los textos de `/register` y del login se comparan con los del controlador, sin inventarlos.

- [ ] **Step 2: Ejecutarlos y ver que fallan**

Run: `cd Backend && node --test tests/isolation/account.test.js`
Expected: FAIL (el registro no crea `Account`, el desactivado entra, el superadmin se lee de `rol`).

- [ ] **Step 3: Implementar la sesión**

- `authRequired` (async): verifica el JWT como hoy, `User.findById(payload.id).select('accountId role lineIds isSuperadmin status').lean()`, `sessionAuthFor` → `null` = 401. Deja `req.auth` y, **solo hasta la Tarea 3**, `req.user = { id: req.auth.userId }`, con un comentario que lo dice.
- `requireSuperadmin`: `req.auth?.isSuperadmin` o 403. Ya no consulta la BD: `authRequired` la acaba de leer en esta misma petición.
- `validateApiKey`: tras validar la key, `Account.findById(apiKeyDoc.userId).select('_id').lean()`; sin cuenta, 401 `'Cuenta asociada no encontrada'`. Deja el `req.auth` de API key y, **hasta la Tarea 3**, `req.user = { id: accountId }`. El comentario explica que la key es de la cuenta y por eso sobrevive a un cambio de owner.
- `publicApiUserLimiter`: `keyGenerator: (req) => req.auth.accountId`, y su comentario dice «por cuenta».
- `registerSchema` sin `rol` ni `status` (Zod descarta lo que no está en el esquema). `register` llama a `createAccountWithOwner`; un E11000 del correo responde el mismo 400 que el correo repetido.
- `login`: tras `isMatch`, un `status === 'inactive'` responde 403 con el mensaje del test. `verifyToken`: `sessionAuthFor(userFound)` nulo → 401. Login, `/verify`, `/profile` y `/register` añaden `isSuperadmin`. La conexión de WhatsApp que devuelven login y `/verify` se sigue leyendo del propio usuario: en esta fase todo usuario es owner, y la Fase 2 cambia esos campos por `lines`.

- [ ] **Step 4: Los helpers y el frontend**

- `seedAccount`: la opción `rol` pasa a ser `isSuperadmin = false`; `account.test.js` crea el admin con `{ isSuperadmin: true }`.
- Frontend: `isSuperadmin: boolean` en `user.mode.ts`; `Sidebar.tsx` y `PrivateRouter.tsx` comprueban `user?.isSuperadmin` en lugar de `user?.rol === 'superadmin'` (y la dependencia del `useMemo` del Sidebar). Sin cambio visual.

- [ ] **Step 5: Ejecutar todo y ver que pasa**

Run: `cd Backend && npm test && npm run test:isolation && cd ../Frontend && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 6: Documentar** en `api.md`: `authRequired` lee el usuario en cada petición y deja `req.auth` (desactivado o sin cuenta → 401); la API key es **de la cuenta**; `requireSuperadmin` lee `isSuperadmin`; `publicApiUserLimiter` cuenta por cuenta; `/register` crea cuenta y owner e ignora `rol` y `status`.

- [ ] **Step 7: Commit**

```bash
git add Backend/src Backend/tests Frontend/src docs/arquitectura/api.md
git commit -m "sesión: req.auth con la cuenta, registro con cuenta propia y usuarios desactivados fuera"
```

---

### Task 3: Los datos de la cuenta salen de `req.auth.accountId`

**Files:**
- Modify (cada `req.user.id`, listados con `grep -rn "req\.user" Backend/src`): `controllers/api.key.controller.js`, `auth.controller.js` (`profile`), `campaign.controller.js`, `chat.controller.js`, `contact.controller.js`, `contact.import.controller.js`, `media.controller.js`, `tag.controller.js`, `template.controller.js`, `user.controller.js`, `whatsapp.controller.js`, `routes/stream.routes.js`, `controllers/stream.controller.js`, `services/campaign.service.js`
- Modify: `Backend/src/middlewares/validate.token.middleware.js`, `validate.api.key.middleware.js` (quitar el `req.user` provisional)
- Modify: `Backend/tests/isolation/helpers.js` (cuentas con `_id` distinto del usuario), `Backend/tests/isolation/account.test.js` (`/v1`)
- Modify: `AGENTS.md` (regla 1), `Backend/AGENTS.md` (Propiedad y Tiempo real), `docs/arquitectura/chat.md` (SSE)

**Interfaces:**
- Consumes: `req.auth` y `findAccountOwner(accountId)` (Tarea 2).
- Produces:
  - `sendToAccount(accountId: string, event: string, data: object)` en `stream.controller.js`, en lugar de `sendUser`. Las conexiones SSE se agrupan por cuenta: `addClient(req.auth.accountId, res)` en `stream.routes.js`. Sin filtro todavía (llega en la Fase 3 con `canReceive`).
  - `processMessageSending`, `processTemplateSending` y `syncTemplatesForUser` siguen recibiendo `user`, que ahora es **el owner de la cuenta** (el que tiene la conexión): toman el token y el número de `user`, y el dueño de los datos y el canal SSE de `user.accountId`. El parámetro no se renombra: la Fase 2 lo cambia por la línea.

Reglas del cambio, para cada controlador:
- Filtro de propiedad: `userId: req.auth.accountId` (o `new mongoose.Types.ObjectId(req.auth.accountId)` donde hoy convierte `req.user.id`).
- Donde hoy hace `User.findById(req.user.id)` para leer la conexión de WhatsApp: `const owner = await findAccountOwner(req.auth.accountId)` (chat ×5, plantillas ×3, campañas ×1, `user.controller`, `whatsapp.controller`). Se pasa como `user: owner` a las funciones de envío.
- `isPhoneNumberTaken(owner._id, phoneNumberId)`: el `_id` del **usuario** que guarda la conexión, nunca el de la cuenta (ver Review Focus).
- `profile`: `User.findById(req.auth.userId)`.

- [ ] **Step 1: Los helpers crean cuentas con `_id` distinto del usuario**

En `seedAccount`: `accountId = new mongoose.Types.ObjectId()` distinto del `_id` del usuario; la `Account` lleva `ownerId: user._id`; **todos** los datos sembrados (`Tag`, `Contact`, `Conversation`, `TemplateMedia`, `Template`, `Campaign`, `CampaignRecipient`, `ApiKey`) llevan `userId: accountId`. Devuelve también `accountId`, y `assertNoLeak` lo incluye en los ids que no pueden aparecer. El comentario de cabecera explica por qué: en producción coinciden, y separarlos aquí es lo que caza un `req.user.id` olvidado.

- [ ] **Step 2: El test de la API pública** en `tests/isolation/account.test.js` (hoy no hay ninguno de `/v1`, y es lo que usa el cliente real)

```js
test('POST /v1/templates/send con la key de A: sale del número de A y responde como siempre', ...);
// connectWhatsapp(a); una ApiKey { userId: a.accountId, keyHash: hashApiKey('wm_prueba_a') } (la cuenta de A
// no tiene el _id de ningún usuario); onMeta responde a POST `/99${a.seq}/messages` con { messages: [{ id: 'wamid.v1' }] };
// cuerpo { destinationNumber: a.phone, templateName: a.templateName }
// → 200 y el cuerpo es exactamente { success: true, waMessageId: 'wamid.v1', conversationId } (sin más claves),
// con conversationId de una conversación con userId a.accountId; la llamada a Meta fue al número de A.
```

- [ ] **Step 3: Ejecutar los tests de aislamiento y ver que fallan**

Run: `cd Backend && npm run test:isolation`
Expected: FAIL en los controles de «lo propio» (`assertHasOwn`, los 200 de A sobre lo suyo) y en el de `/v1`: hoy buscan por el `_id` del usuario.

- [ ] **Step 4: Cambiar los controladores, servicios y el SSE** según las reglas de arriba, y quitar el `req.user` provisional de los dos middlewares.

- [ ] **Step 5: Comprobar que no queda nada**

Run: `grep -rn "req\.user\|sendUser" Backend/src; grep -rn "User\.findById" Backend/src`
Expected: el primero, vacío. El segundo, solo `auth.controller.js` (`profile` y `verifyToken`) y `validate.token.middleware.js`.

- [ ] **Step 6: Ejecutar todo y ver que pasa**

Run: `cd Backend && npm test && npm run test:isolation`
Expected: PASS, también `whatsapp.test.js` (reconectar el propio número sigue sin dar 409).

- [ ] **Step 7: Documentar**: regla 1 de `AGENTS.md` y «Propiedad» de `Backend/AGENTS.md` con `{ _id, userId: req.auth.accountId }`; «Tiempo real» de `Backend/AGENTS.md` y la sección de SSE de `chat.md` con `sendToAccount(accountId, …)`, y que las conexiones se agrupan por cuenta.

- [ ] **Step 8: Commit**

```bash
git add Backend/src Backend/tests AGENTS.md Backend/AGENTS.md docs/arquitectura/chat.md
git commit -m "cuenta: los controladores toman la cuenta de req.auth y el SSE se agrupa por cuenta"
```

---

### Task 4: Lo que no viene de una sesión: webhook, worker y scripts

**Files:**
- Modify: `Backend/src/controllers/webhook.controller.js` (cada `user._id` que significa la cuenta: `procesarEntrante`, `avisarPreferencia`, `procesarPreferencia`, `procesarCambioDeNumero`, `marcarBajaPorFallo`, `procesarEstado`)
- Modify: `Backend/src/workers/campaign.worker.js` (`User.findById(campaign.userId)` → `findAccountOwner(campaign.userId)`; exportar `processNext` para los tests)
- Modify: `Backend/scripts/simulate-webhook.js`, `Backend/scripts/seed-test-contacts.js` (`user._id` → `user.accountId` como dueño de los datos)
- Modify: `Backend/tests/isolation/helpers.js` (`META_APP_SECRET` de pruebas y `postWebhook`)
- Create: `Backend/tests/isolation/webhook.test.js`
- Modify: `Backend/tests/isolation/campaigns.test.js`

**Interfaces:**
- Consumes: `findAccountOwner` (Tarea 2), `sendToAccount` (Tarea 3), `connectWhatsapp(account)` de los helpers (número `99<seq>`).
- Produces:
  - En `helpers.js`: `process.env.META_APP_SECRET = 'secreto-meta-pruebas'` antes de importar la app, y `postWebhook(payload) → Promise<{ status }>`, que firma el cuerpo con HMAC-SHA256 (cabecera `x-hub-signature-256: sha256=<hex>`) igual que Meta.
  - `processNext(campaign) → Promise<string>` exportada desde `campaign.worker.js`, con un comentario que dice que es para los tests.

El webhook sigue buscando por `User.findOne({ phoneNumberId })` (el owner) y usa `user.accountId` para todo lo que es de la cuenta; el token para descargar adjuntos sigue saliendo de `user`.

- [ ] **Step 1: Escribir los tests que fallan** en `tests/isolation/webhook.test.js`

```js
test('un entrante al número de A queda en la cuenta de A', ...);
// connectWhatsapp(a); postWebhook con un mensaje de texto de '593990009999' a phone_number_id `99${a.seq}`
// → 200; existe Conversation { userId: a.accountId, contactPhone: '593990009999' } con un Message de ese texto;
// no hay ninguna con userId a.userId ni b.accountId.

test('el entrante llega por SSE a la sesión de A y no a la de B', ...);
// abrir GET /stream con la cookie de A y con la de B (fetch + reader, AbortController);
// postWebhook con un texto único → el stream de A trae 'event: message_created' con ese texto en menos de 2 s;
// el de B, leído 300 ms más, no lo trae. Cerrar los dos streams al final.

test('un número que no es de nadie se ignora con 200', ...);
// phone_number_id '000' → 200 y ninguna conversación nueva.
```

Y en `campaigns.test.js`:

```js
test('el worker envía la campaña de una cuenta cuyo _id no es el del owner', ...);
// connectWhatsapp(a); la campaña sembrada de A pasa a 'queued'; processNext(campaign) hasta que devuelva 'idle'
// → su CampaignRecipient queda 'done' y hay un Message con campaignId en una conversación con userId a.accountId.
// Sin Meta: CAMPAIGN_DRY_RUN está encendido en los helpers.
```

- [ ] **Step 2: Ejecutarlos y ver que fallan**

Run: `cd Backend && node --test tests/isolation/webhook.test.js tests/isolation/campaigns.test.js`
Expected: FAIL. El entrante se guarda con el `_id` del usuario y el SSE no llega a A; el worker no encuentra la conexión, porque busca al usuario por el `_id` de la cuenta.

- [ ] **Step 3: Implementar** los cambios de `webhook.controller.js`, `campaign.worker.js` y los dos scripts.

- [ ] **Step 4: Ejecutar todo y ver que pasa**

Run: `cd Backend && npm test && npm run test:isolation`
Expected: PASS.

- [ ] **Step 5: Probar el webhook simulado en local**

Con el Mongo local ya migrado (Tarea 1, paso 7) y `npm run dev`: `npm run webhook:simulate`. El entrante aparece en el chat del navegador en vivo, como antes.

- [ ] **Step 6: Commit**

```bash
git add Backend/src Backend/scripts Backend/tests
git commit -m "cuenta: el webhook, el worker y los scripts guardan con la cuenta del número"
```

---

## Al terminar

- `docs/estado.md`: quitar la entrada de «En curso»; en «Lo siguiente», la Fase 2 (líneas), recordando que antes hay que comprobar en WasmishTest si repetir el Embedded Signup en el mismo WABA invalida el token anterior (spec § 2.2).
- Resumen para Jonathan: lo reutilizado, lo nuevo y las decisiones del plan (abajo).
- Revisión cruzada de Codex sobre el PR, en una ronda.

## Decisiones del plan (para revisar)

- **`authRequired` hace el trabajo de `loadAuth`**, en vez de un middleware nuevo montado en cada ruta: está ya en las 61 rutas privadas y ninguna nueva puede olvidarlo.
- **La conexión de WhatsApp sigue en el `User` del owner** y se busca con `findAccountOwner(accountId)`. Las funciones de envío no cambian de firma, porque la Fase 2 las cambia por la línea.
- **`Account` sin `status` ni `defaultLineId`**: el spec los lista, pero nada los usa en esta fase. Llegan con la fase que los use (suspender una cuenta, o la Fase 2).
- **Sin reserva en el código para los usuarios sin migrar**: reciben 401. La migración corre antes de arrancar la imagen nueva, y otra vez después, para quien se registre en ese intervalo con la imagen vieja.
- **Un solo PR**, no dos como sugería el spec: el cambio real son unas 60 líneas con `req.user` (el spec contó los `userId` de los modelos, que la opción B no toca), y cada commit deja los tests en verde.
- **El login de un desactivado responde 403** con el motivo, y solo después de comprobar la contraseña.

## Antes de desplegar (Jonathan)

Con la skill `/deploy`, que ya contempla scripts previos y posteriores:

1. `mongodump` de producción.
2. Compilar la imagen nueva **sin arrancarla**.
3. **Scripts previos**, con la imagen nueva y sin tocar lo que corre: `migrate:accounts -- --dry-run` (revisar los conteos: tantas cuentas como usuarios y ningún `agent`) y luego `migrate:accounts`. La imagen vieja ignora los campos nuevos, así que sigue funcionando.
4. Arrancar la imagen nueva.
5. **Script posterior:** `migrate:accounts -- --dry-run` tiene que decir `Cuentas a crear: 0`. Si alguien se registró entre el paso 3 y el 4, se corre `migrate:accounts` otra vez.
6. Comprobar: login en la web, `/admin` para el superadmin, un entrante en vivo y un `POST /api/v1/templates/send` con 200 en los logs.

Volver atrás: la imagen anterior ignora `accounts` y los campos nuevos de `User`, y los viejos siguen al día.

## Lo que este plan no cubre

- Permisos, roles distintos de owner, equipo e invitaciones: Fase 3.
- El panel de admin sigue contando usuarios como clientes (es lo mismo con un usuario por cuenta): cambia en la Fase 2, con las líneas.
- `publicApiUserLimiter` por cuenta no tiene test propio (harían falta 61 peticiones): se revisa en el código.
