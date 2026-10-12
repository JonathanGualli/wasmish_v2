# Multi-línea · Fase 0: un número, una cuenta — Implementation Plan

> **Para quien lo ejecute:** en Wasmish los planes se ejecutan **nativo** (rama, PR, revisión cruzada; ver «Planes» en `AGENTS.md`). Las referencias de `writing-plans` a `subagent-driven-development` o `executing-plans` no aplican. Los pasos usan casillas (`- [ ]`).

**Goal:** Que un `phoneNumberId` solo pueda estar conectado a una cuenta, y solo si Meta confirma que es del WABA de ese token; y que enviar o sincronizar sin WhatsApp conectado responda con un error claro, no con un 500.

**Architecture:** Los tests de aislamiento sustituyen el transporte de `whatsappApi`, de modo que ninguno llega a Meta y los caminos que pasan por Meta se pueden probar. Una función pura normaliza la respuesta de `GET /{waba-id}/phone_numbers`. Un servicio nuevo hace las dos comprobaciones (número libre en la BD y número del WABA en Meta), y lo usan tanto el Embedded Signup como el formulario manual. Un índice único parcial en `User.phoneNumberId` cierra las carreras. La comprobación «WhatsApp conectado» de `processTemplateSending` pasa a una función compartida.

**Tech Stack:** Express 5, Mongoose 8, Zod 4, axios, `node:test`, `mongodb-memory-server` (tests de aislamiento).

**Spec:** `docs/superpowers/specs/2026-10-11-multi-linea-multi-agente-design.md` (§ 2.2 «El enrutado por número, primero» y § 4 «Fase 0»). Revisado por Codex el 2026-10-11; sus hallazgos 9 y 10 están incorporados aquí.

## Global Constraints

- Mensajes al usuario en español; identificadores nuevos en inglés; comentarios y commits en español.
- Errores como array `[{ message }]`. Las funciones que no saben de HTTP lanzan un `Error` con `statusCode`, como ya hace `processTemplateSending`.
- A Meta solo se llama desde `libs/whatsapp.js`. **Los tests nunca llegan a Meta**: desde la Tarea 1, cualquier llamada sin respuesta preparada hace fallar el archivo de tests.
- Índices únicos sobre campos que pueden ser `null`: **parciales con `$type: 'string'`**, no `sparse`.
- Los textos del PR, los commits y los comentarios describen el **refuerzo**, no cómo aprovechar lo que había antes: el repo es público.
- Sin datos reales en los tests (nombres de clientes, números, WABA).
- Commits sin coautor ni atribución. Rama: `fase0-un-numero-una-cuenta`.
- Comprobar con `cd Backend && npm test && npm run test:isolation`.

## Review Focus

- **Reconectar el propio número** (repetir el Embedded Signup para renovar el token) no puede dar 409: la comprobación excluye al propio usuario → test de `isPhoneNumberTaken` en la Tarea 3.
- **Dos conexiones a la vez del mismo número** pasan las dos la comprobación previa. El índice único rechaza la segunda con E11000, que tiene que salir como **409, no 500**, y sin guardar nada → test de la carrera, con Meta falso, en la Tarea 3.
- **Un número que Meta no lista en ese WABA**, o una respuesta sin `data` → 400 y nada guardado, nunca una excepción → tests de la Tarea 2 y de la Tarea 3.
- **El envío de archivos sin WhatsApp** también es 409 y **no deja el archivo en disco**: la comprobación va antes de `saveByContentHash` → test de `/chats/:id/media` en la Tarea 4.
- **El helper `connectWhatsapp`** ponía `phoneNumberId: '999'` a todas las cuentas: con el índice único, conectar dos cuentas en el mismo archivo rompería → `99${seq}` en la Tarea 3.

---

### Task 1: Meta falso en los tests de aislamiento

**Files:**
- Modify: `Backend/tests/isolation/helpers.js`
- Create: `Backend/tests/isolation/meta.test.js`

**Interfaces:**
- Consumes: `whatsappApi` (la instancia de axios que exporta `Backend/src/libs/whatsapp.js`; todas las llamadas a Meta pasan por ella, también `exchangeCodeForToken`).
- Produces, exportado desde `helpers.js`:
  - `metaCalls: Array<{ method: string, url: string }>`: todas las llamadas, en orden. `url` es la ruta relativa (`/waba-x/phone_numbers`).
  - `onMeta(responder | null)`: `responder(config) → Promise<{ data, status? } | undefined>`. `undefined` = llamada no prevista.
  - Una llamada no prevista: el transporte lanza `Error('Llamada a Meta no prevista en un test: <METHOD> <url>')` y la anota en `unexpectedMetaCalls`. El `after` que ya existe en `helpers.js` comprueba `assert.deepEqual(unexpectedMetaCalls, [])`: un archivo con una llamada imprevista falla aunque sus tests pasen.
- `whatsappApi.defaults.adapter` se sustituye en `helpers.js` justo después de importar la app. Devuelve `{ data, status: status ?? 200, statusText: 'OK', headers: {}, config, request: {} }`.

- [ ] **Step 1: Escribir los tests que fallan** en `tests/isolation/meta.test.js`

```js
// Los tests de aislamiento nunca llegan a Meta: el transporte de whatsappApi
// está sustituido en helpers.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { metaCalls, onMeta } from './helpers.js';

const { whatsappApi } = await import('../../src/libs/whatsapp.js');

test('con respuesta preparada, la llamada devuelve sus datos y queda anotada', async () => {
    onMeta(async (config) => (config.url === '/prueba' ? { data: { ok: true } } : undefined));
    const res = await whatsappApi.get('/prueba');
    assert.deepEqual(res.data, { ok: true });
    assert.deepEqual(metaCalls.at(-1), { method: 'get', url: '/prueba' });
    onMeta(null);
});
```

- [ ] **Step 2: Ejecutarlo y ver que falla**

Run: `cd Backend && node --test tests/isolation/meta.test.js`
Expected: FAIL, `metaCalls` y `onMeta` no se exportan desde `helpers.js`.

- [ ] **Step 3: Implementar el transporte falso en `helpers.js`**

- [ ] **Step 4: Comprobar a mano que una llamada imprevista hace fallar el archivo**

Añadir temporalmente `test('x', async () => { await whatsappApi.get('/nada').catch(() => {}); })` a `meta.test.js` y ejecutarlo: el archivo tiene que fallar en el `after` con `/nada` en el mensaje. Quitar ese test.

- [ ] **Step 5: Ejecutar todo y ver que pasa**

Run: `cd Backend && npm run test:isolation`
Expected: PASS. Ningún test existente llama a Meta: si alguno falla en el `after`, es que llamaba de verdad y hay que mirarlo antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add Backend/tests/isolation/helpers.js Backend/tests/isolation/meta.test.js
git commit -m "tests: los de aislamiento nunca llegan a Meta"
```

---

### Task 2: Leer los números de un WABA

**Files:**
- Modify: `Backend/src/libs/whatsapp.js` (junto a `getTemplates`)
- Create: `Backend/src/utils/whatsapp.line.js`
- Test: `Backend/tests/whatsapp.line.test.js`

**Interfaces:**
- Produces: `getWabaPhoneNumbers({ token, waBusinessId }) → Promise<AxiosResponse>`, que llama a `GET /{waBusinessId}/phone_numbers` con `params: { fields: 'id,display_phone_number,verified_name', limit: 100 }` y el `Authorization: Bearer`, igual que `getTemplates`.
- Produces: `describeWabaPhoneNumber(body, phoneNumberId) → { phoneNumberId, displayPhoneNumber, verifiedName } | null`. `body` es `response.data` (`{ data: [{ id, display_phone_number, verified_name }] }`). `displayPhoneNumber` y `verifiedName` valen `null` si faltan. La Fase 2 los usa para rellenar la línea.

- [ ] **Step 1: Escribir los tests que fallan**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeWabaPhoneNumber } from '../src/utils/whatsapp.line.js';

const BODY = { data: [
    { id: '111', display_phone_number: '+1 555 000 0001', verified_name: 'Negocio de prueba' },
    { id: '222', display_phone_number: '+1 555 000 0002' },
] };

test('devuelve el número del WABA con sus datos', () => {
    assert.deepEqual(describeWabaPhoneNumber(BODY, '111'),
        { phoneNumberId: '111', displayPhoneNumber: '+1 555 000 0001', verifiedName: 'Negocio de prueba' });
});

test('un dato que Meta no manda queda en null', () => {
    assert.equal(describeWabaPhoneNumber(BODY, '222').verifiedName, null);
});

// Regresión que vigila: el número que llega en la petición tiene que estar en el WABA del token.
test('un número que no está en el WABA da null', () => {
    assert.equal(describeWabaPhoneNumber(BODY, '333'), null);
});

test('una respuesta sin data, vacía o rara da null sin lanzar', () => {
    for (const body of [undefined, null, {}, { data: [] }, { data: 'x' }]) {
        assert.equal(describeWabaPhoneNumber(body, '111'), null);
    }
});

test('un id vacío nunca coincide', () => {
    assert.equal(describeWabaPhoneNumber({ data: [{ id: '' }] }, ''), null);
});
```

- [ ] **Step 2: Ejecutarlos y ver que fallan**

Run: `cd Backend && node --test tests/whatsapp.line.test.js`
Expected: FAIL, `Cannot find module '../src/utils/whatsapp.line.js'`

- [ ] **Step 3: Implementar `describeWabaPhoneNumber` en `utils/whatsapp.line.js` y `getWabaPhoneNumbers` en `libs/whatsapp.js`**

Compara con `String(entry.id) === String(phoneNumberId)` y descarta antes un `phoneNumberId` vacío.

- [ ] **Step 4: Ejecutarlos y ver que pasan**

Run: `cd Backend && npm test`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add Backend/src/utils/whatsapp.line.js Backend/src/libs/whatsapp.js Backend/tests/whatsapp.line.test.js
git commit -m "whatsapp: leer los números de un WABA"
```

---

### Task 3: Un número, una cuenta (Embedded Signup y formulario manual)

**Files:**
- Create: `Backend/src/services/whatsapp.connection.service.js`
- Modify: `Backend/src/models/user.model.js` (índice)
- Modify: `Backend/src/schemas/user.schema.js`
- Modify: `Backend/src/controllers/whatsapp.controller.js`
- Modify: `Backend/src/controllers/user.controller.js`
- Modify: `Backend/tests/isolation/helpers.js` (`seedAccount` devuelve `seq`; `connectWhatsapp` usa `99${seq}`)
- Create: `Backend/tests/isolation/whatsapp.test.js`
- Docs: `docs/arquitectura/whatsapp-envio.md` (comprobaciones del Embedded Signup y su orden) y `docs/arquitectura/api.md` (los 409 y 400 de las dos rutas)

**Interfaces:**
- Consumes: `getWabaPhoneNumbers` y `describeWabaPhoneNumber` (Task 2); `metaCalls` y `onMeta` (Task 1).
- Produces: `isPhoneNumberTaken(userId, phoneNumberId) → Promise<boolean>`: `User.exists({ phoneNumberId, _id: { $ne: userId } })`.
- Produces: `verifyWabaPhoneNumber({ token, waBusinessId, phoneNumberId }) → Promise<{ phoneNumberId, displayPhoneNumber, verifiedName }>`. Si el número no es del WABA, lanza `Error` con `statusCode = 400` y el mensaje «Ese número no pertenece a la cuenta de WhatsApp Business conectada.». Los errores de Meta suben tal cual (`waErrorCode`).
- Produces: `PHONE_NUMBER_TAKEN_MESSAGE = 'Ese número de WhatsApp ya está conectado a otra cuenta de Wasmish.'`
- Índice: `userSchema.index({ phoneNumberId: 1 }, { name: 'user_phoneNumberId_unique', unique: true, partialFilterExpression: { phoneNumberId: { $type: 'string' } } })`.
- `updateUserTokenWhatsappSchema`: `tokenWhatsapp`, `phoneNumberId` y `waBusinessId`, los tres `z.string().min(1)`.

Orden en los dos controladores:
1. `isPhoneNumberTaken` → 409 con `PHONE_NUMBER_TAKEN_MESSAGE`;
2. (solo connect) `exchangeCodeForToken`;
3. `verifyWabaPhoneNumber`;
4. (solo connect) `subscribeAppToWaba`;
5. guardar.

El `catch` traduce `error.code === 11000` a 409 con el mismo mensaje y respeta `error.statusCode` (400 de la verificación); un error de Meta (`waErrorCode`) → 502. Nada se guarda si falla algún paso anterior.

- [ ] **Step 1: Ajustar el helper**

En `seedAccount`, añadir `seq` al objeto que devuelve; en `connectWhatsapp`, `phoneNumberId: \`99${account.seq}\``.

- [ ] **Step 2: Escribir los tests que fallan** en `tests/isolation/whatsapp.test.js`

```js
// Un número de WhatsApp es de una sola cuenta: el webhook enruta por él.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seedAccount, request, connectWhatsapp, metaCalls, onMeta, User } from './helpers.js';

const { isPhoneNumberTaken } = await import('../../src/services/whatsapp.connection.service.js');

const a = await seedAccount('A', { seq: 1 });
const b = await seedAccount('B', { seq: 2 });
await connectWhatsapp(a);
const A_NUMBER = '991';

// Meta devuelve `numbers` como los números del WABA; el resto de llamadas, OK.
const fakeMeta = (numbers, { onPhoneNumbers } = {}) => onMeta(async (config) => {
    if (config.url === '/oauth/access_token') return { data: { access_token: 'token-nuevo' } };
    if (config.url.endsWith('/phone_numbers')) {
        await onPhoneNumbers?.();
        return { data: { data: numbers.map(id => ({ id })) } };
    }
    if (config.url.endsWith('/subscribed_apps')) return { data: { success: true } };
});

const updateToken = (account, phoneNumberId) => request(account, 'PUT', '/users/update-user-token-whatsapp',
    { tokenWhatsapp: 'token-manual', phoneNumberId, waBusinessId: `waba-${account.label}` });

// Regresión que vigila: un número ya conectado en otra cuenta no se puede volver a conectar.
test('PUT /users/update-user-token-whatsapp: B no puede declarar el número de A, y sin llamar a Meta', async () => {
    const before = metaCalls.length;
    const res = await updateToken(b, A_NUMBER);
    assert.equal(res.status, 409, res.text);
    assert.equal(metaCalls.length, before);
    assert.equal((await User.findById(b.userId).lean()).phoneNumberId, null);
});

test('POST /whatsapp/connect: B no puede conectar el número de A, y sin llamar a Meta', async () => {
    const before = metaCalls.length;
    const res = await request(b, 'POST', '/whatsapp/connect', { code: 'x', phoneNumberId: A_NUMBER, waBusinessId: 'waba-b' });
    assert.equal(res.status, 409, res.text);
    assert.equal(metaCalls.length, before);
});

test('PUT /users/update-user-token-whatsapp: faltan phoneNumberId o waBusinessId → 400', async () => {
    const res = await request(b, 'PUT', '/users/update-user-token-whatsapp', { tokenWhatsapp: 'x' });
    assert.equal(res.status, 400, res.text);
});

test('PUT /users/update-user-token-whatsapp: un número que no está en el WABA → 400 y nada guardado', async () => {
    const c = await seedAccount('C', { seq: 3 });
    fakeMeta(['993-otro']);
    const res = await updateToken(c, '993');
    onMeta(null);
    assert.equal(res.status, 400, res.text);
    assert.equal((await User.findById(c.userId).lean()).phoneNumberId, null);
});

test('PUT /users/update-user-token-whatsapp: un número del WABA se guarda, con el token cifrado', async () => {
    const d = await seedAccount('D', { seq: 4 });
    fakeMeta(['994']);
    const res = await updateToken(d, '994');
    onMeta(null);
    assert.equal(res.status, 200, res.text);
    const saved = await User.findById(d.userId).lean();
    assert.equal(saved.phoneNumberId, '994');
    assert.notEqual(saved.tokenWhatsapp, 'token-manual');
});

test('POST /whatsapp/connect: comprueba el número antes de suscribir la app, y lo guarda', async () => {
    const e = await seedAccount('E', { seq: 5 });
    fakeMeta(['995']);
    const before = metaCalls.length;
    const res = await request(e, 'POST', '/whatsapp/connect', { code: 'x', phoneNumberId: '995', waBusinessId: 'waba-e' });
    onMeta(null);
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(metaCalls.slice(before).map(c => c.url),
        ['/oauth/access_token', '/waba-e/phone_numbers', '/waba-e/subscribed_apps']);
    assert.equal((await User.findById(e.userId).lean()).phoneNumberId, '995');
});

test('dos conexiones a la vez: la segunda recibe 409, no 500, y no guarda nada', async () => {
    await User.init();
    const f = await seedAccount('F', { seq: 6 });
    const g = await seedAccount('G', { seq: 7 });
    // Mientras Meta responde a F, G se queda el número: F ya pasó la comprobación previa.
    fakeMeta(['996'], { onPhoneNumbers: () => User.updateOne({ _id: g.userId }, { phoneNumberId: '996' }) });
    const res = await updateToken(f, '996');
    onMeta(null);
    assert.equal(res.status, 409, res.text);
    assert.equal((await User.findById(f.userId).lean()).phoneNumberId, null);
});

test('isPhoneNumberTaken: el número propio no cuenta como tomado (reconectar)', async () => {
    assert.equal(await isPhoneNumberTaken(a.userId, A_NUMBER), false);
    assert.equal(await isPhoneNumberTaken(b.userId, A_NUMBER), true);
});
```

- [ ] **Step 3: Ejecutarlos y ver que fallan**

Run: `cd Backend && node --test tests/isolation/whatsapp.test.js`
Expected: FAIL, `Cannot find module '…/whatsapp.connection.service.js'`

- [ ] **Step 4: Implementar el servicio, el índice, el esquema y los dos controladores**, con el orden de arriba

- [ ] **Step 5: Ejecutar todo y ver que pasa**

Run: `cd Backend && npm test && npm run test:isolation`
Expected: PASS. `campaigns.test.js` sigue en verde con el `connectWhatsapp` nuevo.

- [ ] **Step 6: Documentar** en `whatsapp-envio.md` y en `api.md`

- [ ] **Step 7: Commit**

```bash
git add Backend/src Backend/tests docs/arquitectura
git commit -m "whatsapp: un número solo puede estar en una cuenta y tiene que ser del WABA"
```

---

### Task 4: Sin WhatsApp conectado, un error claro (enviar y sincronizar)

**Files:**
- Modify: `Backend/src/utils/whatsapp.line.js`
- Modify: `Backend/src/controllers/template.controller.js:27-35` (`syncTemplatesForUser`) y `:401-406` (`processTemplateSending`)
- Modify: `Backend/src/controllers/chat.controller.js` (`processMessageSending`, `sendMessageController`, `sendMediaMessageController`)
- Test: `Backend/tests/whatsapp.line.test.js`, `Backend/tests/isolation/whatsapp.test.js`
- Docs: quitar de `docs/estado.md` el cabo suelto «Enviar texto o archivo con la ventana abierta y sin WhatsApp conectado…» y anotar el 409 en `docs/arquitectura/whatsapp-envio.md`

**Interfaces:**
- Produces: `WHATSAPP_NOT_CONNECTED_MESSAGE = 'La cuenta no tiene WhatsApp conectado. Conéctala desde Ajustes antes de enviar.'`
- Produces: `assertWhatsappConnected(user) → void`. Lanza `Error` con `statusCode = 409` y ese mensaje si falta `user.tokenWhatsapp` o `user.phoneNumberId`.
- `sendMessageController` y `sendMediaMessageController` la llaman **después** del 409 de la ventana y **antes** de guardar el archivo o de llamar a `processMessageSending`. `processMessageSending` y `processTemplateSending` también la llaman al principio (la campaña y la API entran por ahí); en `processTemplateSending` reemplaza al `if` que hay hoy. Los `catch` de los dos controladores de chat responden `error.statusCode || 500`.
- `syncTemplatesForUser` comprueba `user.tokenWhatsapp` y `user.waBusinessId` **antes** de `decrypt`, con el 400 y el mensaje que ya tiene («Token or Business ID is required»). El `decrypt` de `descargarAdjunto` en el webhook **no se toca**: su `catch` ya lo cubre, y cambiarlo podría descartar el mensaje entero.

- [ ] **Step 1: Escribir los tests que fallan**

En `tests/whatsapp.line.test.js`:

```js
import { assertWhatsappConnected } from '../src/utils/whatsapp.line.js';

test('sin token o sin número: 409', () => {
    for (const user of [{}, { tokenWhatsapp: 'x' }, { phoneNumberId: '1' }, { tokenWhatsapp: null, phoneNumberId: null }]) {
        assert.throws(() => assertWhatsappConnected(user), { statusCode: 409 });
    }
});

test('con token y número no lanza', () => {
    assert.doesNotThrow(() => assertWhatsappConnected({ tokenWhatsapp: 'x', phoneNumberId: '1' }));
});
```

En `tests/isolation/whatsapp.test.js` (B no tiene WhatsApp; se le abre la ventana):

```js
import fs from 'node:fs/promises';
import { Conversation, PNG } from './helpers.js';

// Regresión que vigila: processMessageSending llamaba a decrypt(null) y respondía 500 «Cannot read properties of null».
test('POST /chats/:id/messages sin WhatsApp y con la ventana abierta: 409', async () => {
    await Conversation.updateOne({ _id: b.conversationId }, { lastInboundAt: new Date() });
    const res = await request(b, 'POST', `/chats/${b.conversationId}/messages`, { text: 'hola', temporalId: 't1' });
    assert.equal(res.status, 409, res.text);
});

test('POST /chats/:id/media sin WhatsApp: 409 y no guarda el archivo', async () => {
    await Conversation.updateOne({ _id: b.conversationId }, { lastInboundAt: new Date() });
    const before = await fs.readdir(process.env.MEDIA_DIR, { recursive: true });
    const res = await request(b, 'POST', `/chats/${b.conversationId}/media`, PNG, { 'Content-Type': 'image/png' });
    assert.equal(res.status, 409, res.text);
    assert.deepEqual(await fs.readdir(process.env.MEDIA_DIR, { recursive: true }), before);
});

// Regresión que vigila: syncTemplatesForUser descifraba antes de comprobar el token y respondía 500.
test('GET /templates/sync sin WhatsApp: 400, sin llamar a Meta', async () => {
    const before = metaCalls.length;
    const res = await request(b, 'GET', '/templates/sync');
    assert.equal(res.status, 400, res.text);
    assert.equal(metaCalls.length, before);
});
```

- [ ] **Step 2: Ejecutarlos y ver que fallan**

Run: `cd Backend && npm test && node --test tests/isolation/whatsapp.test.js`
Expected: FAIL. `assertWhatsappConnected` no existe; los dos endpoints de chat y el de sincronizar dan 500.

- [ ] **Step 3: Implementar `assertWhatsappConnected`**, usarla en los cuatro sitios de arriba y mover la comprobación de `syncTemplatesForUser` antes del `decrypt`

- [ ] **Step 4: Ejecutar todo y ver que pasa**

Run: `cd Backend && npm test && npm run test:isolation`
Expected: PASS

- [ ] **Step 5: Actualizar `docs/estado.md` y `whatsapp-envio.md`, y commit**

```bash
git add Backend/src Backend/tests docs
git commit -m "chat y plantillas: sin WhatsApp conectado, 409 o 400 en vez de 500"
```

---

## Antes de desplegar (Jonathan)

El índice único no se crea si producción ya tiene dos usuarios con el mismo número; Mongoose solo lo deja en el log. Antes del despliegue, consulta de solo lectura en el contenedor de Mongo:

```js
db.users.aggregate([
  { $match: { phoneNumberId: { $type: 'string' } } },
  { $group: { _id: '$phoneNumberId', n: { $sum: 1 }, users: { $push: '$email' } } },
  { $match: { n: { $gt: 1 } } },
])
```

Tiene que devolver `[]`. Después de desplegar, `db.users.getIndexes()` tiene que listar `user_phoneNumberId_unique`. Conviene desplegar poco después de unir el PR.

## Lo que este plan no cubre

Las fases 1 a 4 del spec. Sus preguntas ya están respondidas (§ 7 y 8); el plan por tareas de la Fase 1 se escribe a continuación de este.
