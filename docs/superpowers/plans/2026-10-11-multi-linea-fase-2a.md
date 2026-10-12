# Multi-línea · Fase 2a: líneas, ampliar y migrar — Implementation Plan

> **Para quien lo ejecute:** en Wasmish los planes se ejecutan **nativo** (rama, PR, revisión cruzada; ver «Planes» en `AGENTS.md`). Las referencias de `writing-plans` a `subagent-driven-development` o `executing-plans` no aplican. Los pasos usan casillas (`- [ ]`).

**Goal:** Que existan `Waba` y `Line`, siempre al día con la conexión de WhatsApp de cada cuenta, y que cada conversación, campaña y plantilla sepa su línea o su WABA (las de hoy, por migración; las nuevas, al nacer). Nada lee todavía los modelos nuevos para enrutar: el webhook y los envíos funcionan exactamente como hoy.

**Architecture:** Paso «ampliar» del spec (§ 4, Fase 2, 2a). **En la 2a, `User` sigue siendo la única fuente de verdad** de la conexión, porque es lo que enruta; `Waba` y `Line` son una **proyección** de él. La calcula una sola función idempotente, `syncLinesFromOwner(accountId)`, que lee el owner de la BD, deja `Waba`, `Line` y `Account.defaultLineId` como corresponden, y vuelve a leer el owner al terminar: si cambió entre medias, repite. Así las conexiones escriben `User` como hoy (una escritura de un documento, con su índice único) y después sincronizan; una sincronización fallida o cortada la arregla la siguiente, dos a la vez convergen, y la migración y `--check` usan la misma función. La Fase 2b dará la vuelta: `Line` pasará a ser la fuente, y `User` la copia (`legacyUserFields`).

**Tech Stack:** Express 5, Mongoose 8, `node:test`, `mongodb-memory-server`.

**Spec:** `docs/superpowers/specs/2026-10-11-multi-linea-multi-agente-design.md` (§ 2.2 «Números anteriores al actual», «El hueco entre desplegar y migrar» y «La vuelta atrás»; § 3.1; § 4 «Fase 2»; § 5). Revisado por Codex el 2026-10-11: sus seis hallazgos llevaron a este diseño (proyección en lugar de doble escritura con compensaciones).

## Global Constraints

- **Sin cambio de enrutado ni visible.** El webhook sigue buscando `User.findOne({ phoneNumberId })`; los envíos, el token y el número del owner (`findAccountOwner`). Ningún controlador **lee** `Waba` ni `Line` para decidir nada en esta fase.
- **`User` manda.** Nada escribe en `Waba`, `Line` ni `Account.defaultLineId` salvo `syncLinesFromOwner` y la parte de la migración que crea líneas de números anteriores. Lo que no cuadre con `User` se corrige a favor de `User`.
- `Account.limits.maxLines` sigue en 1: el número actual del owner es la **única** línea activa de la cuenta; todas las demás, `disconnected`, con su historial.
- El índice `conversation_contact_unique` **no se toca** (se cambia en la 2b): la imagen anterior sigue creando conversaciones sin `lineId`.
- El token va cifrado en `Waba` (se copia tal cual, ya cifrado, de `User`) y nunca sale del backend. Textos al usuario en español; errores como `[{ message }]`.
- Commits sin coautor ni atribución. Rama: `fase2a-lineas`. Un solo PR.
- Comprobar con `cd Backend && npm test && npm run test:isolation`.

## Review Focus

- **Dos conexiones de la misma cuenta a la vez** (dos renovaciones con tokens distintos, o dos números distintos): al terminar las dos, `Waba` y `Line` coinciden con el `User` final y hay **una sola** línea activa → tests con intercalación controlada en la Tarea 1.
- **Una vuelta atrás y un nuevo despliegue**: con la imagen anterior se conecta otro número (solo cambia `User`); al volver, una sincronización deja ese número como única línea activa y por defecto → test en la Tarea 1 y ensayo en «Antes de desplegar».
- **Un WABA en dos cuentas.** Hoy se permite y ya está roto (`Template.templateId` es único global: la sincronización movería las plantillas de una cuenta a otra). Conectar uno que ya usa otra cuenta, según `User` **o** `Waba`, da 409 antes de llamar a Meta; la migración para sin escribir si encuentra uno compartido → tests de las Tareas 2 y 3.
- **Un número que ya usó otra cuenta.** A tuvo X (sus conversaciones viejas lo guardan) y hoy X es de B: línea `disconnected` X en A y `active` X en B, sin chocar (índice único parcial a `status: 'active'`) → test de índice en la Tarea 1.
- **Lo que nace entre desplegar y migrar** (una conversación, una campaña) queda con `lineId: null`; volver a correr `migrate:lines` lo completa, y `--check` lo dice → Tarea 3.

---

### Task 1: Modelos `Waba` y `Line`, y `syncLinesFromOwner`

**Files:**
- Create: `Backend/src/models/waba.model.js`, `Backend/src/models/line.model.js`
- Modify: `Backend/src/models/account.model.js` (`defaultLineId`), `conversation.model.js` (`lineId`), `campaign.model.js` (`lineId`), `template.model.js` (`waBusinessId`)
- Create: `Backend/src/utils/line.js`, `Backend/tests/line.test.js`
- Create: `Backend/src/services/line.service.js`, `Backend/tests/isolation/lines.test.js`
- Modify: `Backend/tests/isolation/helpers.js` (exportar `Waba` y `Line`)
- Modify: `Backend/AGENTS.md` (índices y tests puros)

**Interfaces:**
- Produces:
  - `Waba`: `accountId` (obligatorio), `waBusinessId: String` (obligatorio, **único global**, índice `waba_waBusinessId_unique`), `tokenWhatsapp: String` (cifrado, `null` por defecto), `timestamps`.
  - `Line`: `accountId` (obligatorio, indexado), `wabaId` (ref `Waba`, `null`: las líneas de números anteriores no saben su WABA), `phoneNumberId: String` (obligatorio), `displayPhoneNumber`, `verifiedName`, `name` (`String`, `null`), `status: 'active' | 'disconnected'` (`'active'` por defecto), `timestamps`. Índices: `line_phoneNumberId_active_unique` `{ phoneNumberId: 1 }` único **parcial** `{ status: 'active' }` y `line_account_phone_unique` `{ accountId: 1, phoneNumberId: 1 }` único.
  - `Account.defaultLineId`, `Conversation.lineId` (indexado), `Campaign.lineId` (ref `Line`, `null`); `Template.waBusinessId` (`String`, `null`). Cada uno con un comentario: se guarda, pero en la 2a nada lo usa para enrutar.
  - En `utils/line.js` (puras):
    - `ownerConnection(owner) → { waBusinessId, tokenWhatsapp, phoneNumberId } | null`: la conexión que dice `User`; `null` si falta alguno de los tres.
    - `lineStateIssues({ owner, account, lines, waba }) → string[]`: en qué no coincide la proyección con `User` (textos cortos en español). Vacío = al día. Casos: falta la línea activa del número actual; hay otra línea activa; `defaultLineId` no apunta a la del número actual (o no es `null` sin conexión); falta el `Waba` del owner, es de otra cuenta, su token no es el de `User` o la línea activa no apunta a él.
  - En `services/line.service.js`:
    - `syncLinesFromOwner(accountId, { details = null, afterRead = null } = {}) → Promise<{ attempts: number }>`. Lee el owner (`findAccountOwner`). Con `ownerConnection` presente: upsert de `Waba` con filtro `{ waBusinessId, accountId }` y `$set: { tokenWhatsapp }` (si el WABA es de otra cuenta, el E11000 sube); upsert de la `Line` `{ accountId, phoneNumberId }` con `wabaId`, `status: 'active'` y, si llega `details`, `displayPhoneNumber` y `verifiedName`; `Line.updateMany({ accountId, phoneNumberId: { $ne: actual }, status: 'active' }, { status: 'disconnected' })`; `Account.defaultLineId` = esa línea. Sin conexión: todas las líneas de la cuenta, `disconnected`, y `defaultLineId: null`. Después vuelve a leer el owner: si `tokenWhatsapp`, `phoneNumberId` o `waBusinessId` cambiaron, repite (como mucho 3 intentos; al tercero lanza). `afterRead` es **solo para los tests**: se llama tras leer el owner en cada intento, para provocar un cambio a mitad.
    - `findLineId(accountId, phoneNumberId) → Promise<ObjectId | null>`: la `Line` de ese número en esa cuenta (activa o no), o `null`.

- [ ] **Step 1: Escribir los tests puros que fallan** en `tests/line.test.js`

```js
test('ownerConnection: con los tres campos, la conexión; si falta uno, null', ...);
test('lineStateIssues: proyección al día → []', ...);
test('lineStateIssues: sin la línea activa del número actual', ...);           // issues no vacío
test('lineStateIssues: dos líneas activas', ...);
test('lineStateIssues: defaultLineId apunta a otra línea', ...);
test('lineStateIssues: el token del Waba no es el de User', ...);
test('lineStateIssues: sin conexión, cualquier línea activa sobra', ...);
```

- [ ] **Step 2: Ejecutarlos y ver que fallan.** Run: `cd Backend && node --test tests/line.test.js` · Expected: FAIL, `utils/line.js` no existe.

- [ ] **Step 3: Implementar `utils/line.js`, los modelos y los campos nuevos.**

- [ ] **Step 4: Escribir los tests de `syncLinesFromOwner`** en `tests/isolation/lines.test.js`; cada uno termina comprobando `lineStateIssues(...)` vacío con lo que hay en la BD:

```js
test('sincronizar crea el WABA y la línea activa por defecto, con el token de User', ...);
test('sincronizar dos veces no duplica nada', ...);                                   // 1 Waba, 1 Line
test('otro número en User: la línea anterior queda desconectada y la nueva por defecto', ...);
// Regresión que vigila (vuelta atrás): la imagen anterior cambió el número solo en User.
test('con una línea activa vieja y defaultLineId viejo, sincronizar los corrige', ...);
test('dos renovaciones a la vez: el token final del Waba es el de User', ...);
// afterRead del primer sync cambia User a T2 y corre un segundo sync completo → el primero repite; Waba.tokenWhatsapp === T2.
test('dos cambios de número a la vez: una sola línea activa, la de User', ...);
// mismo patrón con phoneNumberId Y → Z; Line activa solo Z, defaultLineId la de Z.
test('un WABA de otra cuenta: el sync lanza E11000 y no toca el Waba ajeno', ...);
test('un número activo en una cuenta y desconectado en otra conviven; dos activos, no', ...);
// índice parcial: Line activa '555' en A y desconectada '555' en B → ok; otra activa '555' en B → E11000
```

(`await Line.init()` y `await Waba.init()` antes, para que existan los índices.)

- [ ] **Step 5: Ejecutarlos, ver que fallan, implementar `line.service.js` y verlos pasar.** Run: `cd Backend && npm run test:isolation` · Expected: primero FAIL (no existe el servicio), después PASS.

- [ ] **Step 6: Documentar** en `Backend/AGENTS.md`: los índices de `Waba` y `Line`, y `utils/line.js` en los tests puros.

- [ ] **Step 7: Commit**

```bash
git add Backend/src Backend/tests Backend/AGENTS.md
git commit -m "líneas: modelos Waba y Line, y la proyección syncLinesFromOwner"
```

---

### Task 2: Conectar sincroniza las líneas; un WABA, una cuenta

**Files:**
- Modify: `Backend/src/controllers/whatsapp.controller.js`, `Backend/src/controllers/user.controller.js`, `Backend/src/services/whatsapp.connection.service.js`
- Modify: `Backend/tests/isolation/whatsapp.test.js`
- Modify: `docs/arquitectura/whatsapp-envio.md` («Un número, una cuenta» y «Dónde se guarda la conexión»)

**Interfaces:**
- Consumes: `syncLinesFromOwner` (Tarea 1); el `line` que ya devuelve `verifyWabaPhoneNumber` (`{ phoneNumberId, displayPhoneNumber, verifiedName }`).
- Produces: `WABA_TAKEN_MESSAGE = 'Esa cuenta de WhatsApp Business ya está conectada a otra cuenta de Wasmish.'` e `isWabaTaken(accountId, waBusinessId) → Promise<boolean>` en `whatsapp.connection.service.js`: `true` si otra cuenta lo tiene en `User.waBusinessId` (de cualquier usuario cuyo `accountId` no sea este) **o** en `Waba`. Mirar `User` cubre el hueco entre desplegar y migrar, cuando `Waba` aún está vacía.

Los dos controladores, en el orden de la Fase 0: `isPhoneNumberTaken` e `isWabaTaken` (409, sin llamar a Meta) → Meta → guardar `User` **como hoy** → `syncLinesFromOwner(accountId, { details: line })`. Si la sincronización falla, la conexión **no** se deshace (el enrutado lee `User`, que ya está bien): `console.error` y 200; la siguiente sincronización o `migrate:lines` la completan.

- [ ] **Step 1: Escribir los tests que fallan** en `tests/isolation/whatsapp.test.js`

```js
test('conectar deja Waba y Line al día con User, con el nombre y el número que da Meta', ...);
// formulario manual con Meta falso → lineStateIssues vacío; la línea tiene displayPhoneNumber y verifiedName del fake.
test('un WABA de otra cuenta → 409 sin llamar a Meta', ...);              // B con el waBusinessId de A ya guardado en Waba
// Regresión que vigila (hueco de despliegue): A conectado solo en User, sin Waba todavía.
test('un WABA que otra cuenta tiene solo en User → 409 sin llamar a Meta', ...);
test('si Meta rechaza el número, ni WABA ni línea', ...);                 // el 400 de la Fase 0; 0 Waba y 0 Line de esa cuenta
test('la carrera de dos cuentas por un número: la que pierde no deja línea', ...);
// el test de carrera que ya existe, comprobando además 0 Line activas con ese número en la cuenta perdedora
```

`fakeMeta` del archivo devuelve los números del WABA: que incluya `display_phone_number` y `verified_name`.

- [ ] **Step 2: Ejecutarlos y ver que fallan.** Run: `cd Backend && node --test tests/isolation/whatsapp.test.js` · Expected: FAIL.

- [ ] **Step 3: Implementar** `isWabaTaken`, `WABA_TAKEN_MESSAGE` y las llamadas en los dos controladores.

- [ ] **Step 4: Ejecutar todo y ver que pasa.** Run: `cd Backend && npm test && npm run test:isolation` · Expected: PASS, también los tests de las fases 0 y 1 de este archivo.

- [ ] **Step 5: Documentar** en `whatsapp-envio.md`: un WABA es de una sola cuenta (409); la conexión se guarda en `User` y `Waba`/`Line` la reflejan (`syncLinesFromOwner`); con `maxLines: 1`, otro número deja la línea anterior desconectada.

- [ ] **Step 6: Commit**

```bash
git add Backend/src Backend/tests docs/arquitectura/whatsapp-envio.md
git commit -m "líneas: conectar sincroniza Waba y Line, y un WABA es de una sola cuenta"
```

---

### Task 3: La migración `migrate:lines`

**Files:**
- Modify: `Backend/src/utils/line.js`, `Backend/tests/line.test.js`
- Create: `Backend/scripts/migrate-lines.js`; Modify: `Backend/package.json` (`migrate:lines`)
- Modify: `Backend/tests/isolation/lines.test.js`
- Modify: `docs/arquitectura/pruebas-y-scripts.md`

**Interfaces:**
- Consumes: `syncLinesFromOwner`, `lineStateIssues`, `ownerConnection` (Tarea 1).
- Produces:
  - `sharedWabas(owners) → Array<{ waBusinessId, accountIds: string[] }>` (pura): los WABA que aparecen en `User.waBusinessId` de owners de más de una cuenta.
  - `historicalLines(conversationPhoneIds, existingPhoneIds) → { create: string[] } | { stop: string }` (pura): los números de conversaciones que todavía no tienen línea en la cuenta; `stop` si hay una conversación sin número (`null`).
  - `runLineMigration({ dryRun, check }) → Promise<{ stop: string[], pending, issues }>` exportada desde el script (o un servicio si el script queda largo), para poder probarla con Mongo en memoria.

Orden de `migrate:lines`:
1. Todos los owners. `sharedWabas` con ellos **y** con los `Waba` que ya existan; algo compartido → `stop`.
2. Por cuenta: `historicalLines` con `distinct('phoneNumberId', { userId: accountId })` y sus líneas; `stop` si hace falta.
3. Algún `stop` → la lista (correo y motivo), **nada escrito**, código 1.
4. Conteos: líneas por crear (actuales y anteriores), conversaciones y campañas sin `lineId`, cuentas desajustadas (`lineStateIssues`). Con `--dry-run` termina aquí; con `--check`, igual, y sale con 1 si queda algo.
5. Aplicar: `syncLinesFromOwner(accountId)` por cuenta (lee `User` en el momento: una conexión que ocurra durante la migración no se pisa); las líneas anteriores, `disconnected` con upsert por `{ accountId, phoneNumberId }`; `Conversation.updateMany({ userId, phoneNumberId, lineId: null }, { lineId })` por número; `Campaign.updateMany({ userId, lineId: null }, { lineId: defaultLineId })` si la cuenta tiene línea por defecto.

- [ ] **Step 1: Tests puros que fallan** en `tests/line.test.js`

```js
test('sharedWabas: un WABA en dos cuentas aparece con las dos', ...);
test('sharedWabas: el mismo WABA en una sola cuenta no cuenta', ...);
test('historicalLines: solo los números que aún no tienen línea', ...);         // (['111','222'], ['111']) → { create: ['222'] }
test('historicalLines: una conversación sin número para la migración', ...);    // ([null]) → { stop }
```

- [ ] **Step 2: Tests de la migración que fallan** en `tests/isolation/lines.test.js`

```js
test('migrar: cada conversación recibe la línea de su propio número', ...);
// cuenta con User en '111' y conversaciones en '111' y '222' → línea activa '111' por defecto, '222' desconectada;
// cada conversación con la suya; la campaña con la de '111'; una segunda pasada: pending 0 e issues [].
test('migrar: dos owners con el mismo WABA paran sin escribir nada', ...);
// Waba vacía, dos cuentas con el mismo waBusinessId en User → stop no vacío; 0 Waba, 0 Line.
test('migrar con --check no escribe y dice lo pendiente', ...);
```

- [ ] **Step 3: Ejecutarlos y ver que fallan.** Run: `cd Backend && npm test && npm run test:isolation` · Expected: FAIL.

- [ ] **Step 4: Implementar** `sharedWabas`, `historicalLines` y el script, con el patrón de `migrate-accounts.js` (cabecera con el uso, URI con la contraseña oculta).

- [ ] **Step 5: Ejecutar todo y ver que pasa**, y probarlo en el Mongo local: `npm run migrate:lines -- --dry-run && npm run migrate:lines && npm run migrate:lines -- --check` → la tercera sale con 0.

- [ ] **Step 6: Documentar** `### migrate:lines` en `pruebas-y-scripts.md`: qué crea, que va por el número real de cada conversación, que la conexión actual sale de `User` en el momento (se puede correr con la API en marcha), cuándo para y `--check`.

- [ ] **Step 7: Commit**

```bash
git add Backend/src Backend/tests Backend/scripts/migrate-lines.js Backend/package.json docs/arquitectura/pruebas-y-scripts.md
git commit -m "líneas: la migración migrate:lines, por el número real de cada conversación"
```

---

### Task 4: Lo nuevo nace con su línea y su WABA

**Files:**
- Modify: `Backend/src/controllers/contact.controller.js` (`findOrCreateConversation`), `campaign.controller.js` (`createCampaign`), `template.controller.js` (`syncTemplatesForUser`)
- Modify: `Backend/tests/isolation/helpers.js` (`connectWhatsapp` acepta `{ waBusinessId }` y sincroniza las líneas), `webhook.test.js`, `campaigns.test.js`, `templates.test.js`
- Modify: `docs/arquitectura/webhook-adjuntos.md` (`findOrCreateConversation`), `campanas.md`, `whatsapp-envio.md` (la sincronización de plantillas)

**Interfaces:**
- Consumes: `findLineId`, `syncLinesFromOwner`, `Account.defaultLineId`.

Reglas:
- `findOrCreateConversation` pone `lineId: await findLineId(userId, phoneNumberId)` **solo al crear**. Una conversación existente no cambia de línea.
- `createCampaign` pone `lineId` = `Account.defaultLineId`.
- `syncTemplatesForUser` pone `waBusinessId: user.waBusinessId` en cada plantilla.
- Sin línea todavía (antes de migrar), `null`: lo completa la siguiente pasada de `migrate:lines`.

- [ ] **Step 1: Escribir los tests que fallan**

```js
// webhook.test.js
test('una conversación nueva nace con la línea de su número', ...);    // postWebhook de un número nuevo → lineId de la Line de A
// campaigns.test.js
test('una campaña nueva nace con la línea por defecto de su cuenta', ...);
// templates.test.js
test('sincronizar guarda el WABA en cada plantilla', ...);
// onMeta responde a GET `/<waba>/message_templates` con una plantilla → GET /templates/sync 200 y su waBusinessId
```

- [ ] **Step 2: Ejecutarlos y ver que fallan.** Run: `cd Backend && npm run test:isolation` · Expected: FAIL en los tres.

- [ ] **Step 3: Implementar** las tres reglas.

- [ ] **Step 4: Ejecutar todo y ver que pasa.** Run: `cd Backend && npm test && npm run test:isolation` · Expected: PASS.

- [ ] **Step 5: Probar en local**: `npm run dev` y `npm run webhook:simulate -- texto` con un número nuevo → su conversación tiene `lineId`; `npm run migrate:lines -- --check` sale con 0.

- [ ] **Step 6: Documentar** cada campo donde se explica su modelo, con «(Fase 2a: se guarda, todavía no se usa para enrutar)».

- [ ] **Step 7: Commit**

```bash
git add Backend/src Backend/tests docs
git commit -m "líneas: las conversaciones, campañas y plantillas nuevas guardan su línea y su WABA"
```

---

## Al terminar

- `docs/estado.md`: «En curso» y, en «Lo siguiente», la Fase 2b (enrutar por `Line`, que pasa a ser la fuente; plantillas por WABA; la API pública con `lineId`/`from`; contactos con varias conversaciones; el índice nuevo de conversaciones) y la 2c (la UI de líneas).
- Resumen para Jonathan y revisión cruzada de Codex en una ronda.

## Decisiones del plan (para revisar)

- **La Fase 2 va en tres PRs y tres despliegues:** 2a (este: ampliar y migrar, sin enrutar), 2b (enrutar por línea, con la reserva del camino viejo) y 2c (la UI).
- **En la 2a, `Waba` y `Line` son una proyección de `User`**, no una segunda fuente con doble escritura. El spec hablaba de doble escritura con `legacyUserFields`; eso queda para la 2b, cuando la fuente pase a ser `Line`. Así no hacen falta compensaciones ni transacciones (el Mongo de producción no es un replica set), y las carreras, los fallos a medias y la vuelta atrás se corrigen solos en la siguiente sincronización.
- **Si la sincronización falla tras conectar, la conexión no se deshace** (200 y `console.error`): el enrutado lee `User`, que está bien.
- **`Line.phoneNumberId` es único solo entre las líneas activas** (el spec decía «único global»): un número puede haber sido de una cuenta y hoy ser de otra, y las dos conservan su historial.
- **Un WABA es de una sola cuenta: 409 nuevo** al conectar uno que ya usa otra cuenta. Hoy se permite, pero ya está roto por las plantillas.
- **Las líneas de números anteriores no tienen WABA** (`wabaId: null`): no hay forma fiable de saber cuál era, y desde ellas no se envía.
- **`check:lines` es `migrate:lines --check`**, no un script aparte.
- **El índice viejo de conversaciones se queda hasta la 2b.**

## Antes de desplegar (Jonathan)

La Fase 1 tiene que estar desplegada antes. Con `/deploy`:

1. `mongodump` de producción. **Antes de desplegar**, ensayar con una copia: restaurar el dump en el Mongo local (con el `.env` local, nunca apuntando a producción) y correr `migrate:lines -- --dry-run`, `migrate:lines` y `migrate:lines -- --check`. Si para, la lista dice qué cuenta revisar.
2. Desplegar la imagen nueva. No hace falta parar nada: nada lee las líneas, y la migración lee `User` en el momento.
3. `migrate:lines -- --dry-run`, revisar los conteos, y `migrate:lines`.
4. `migrate:lines -- --check` tiene que salir con 0; si algo nació entre los pasos 2 y 3, se corre `migrate:lines` otra vez.
5. Comprobar: un entrante en vivo, un envío y `POST /api/v1/templates/send` con 200 en los logs.

**Volver atrás:** la imagen anterior ignora `wabas`, `lines` y los campos nuevos; `User` sigue siendo la fuente. Si con ella se conecta otro número, al volver a la 2a basta con `migrate:lines` (la sincronización lo corrige). Ensayado en local antes de pedir el despliegue: migrar, arrancar `v1.0.12` (la de la Fase 1) contra esa BD, cambiar el número en `User` y registrar una cuenta, volver a la rama y comprobar que `migrate:lines -- --check` lo detecta y `migrate:lines` lo arregla.

## Lo que este plan no cubre

- Leer las líneas (Fase 2b): el webhook por `Line`, los envíos con el token del `Waba` y el número de la línea, las plantillas por WABA, la API pública con `lineId`/`from`, los contactos con varias conversaciones, el reparto del worker por línea y el índice nuevo de conversaciones.
- La UI de líneas y `maxLines` > 1 (Fase 2c).
- Si repetir el Embedded Signup en el mismo WABA invalida el token anterior (spec § 2.2): hay que comprobarlo en WasmishTest **antes de la 2b**.
