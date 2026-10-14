# Registrar el número en la Cloud API al conectarlo — Implementation Plan

> **Para quien lo ejecute:** en Wasmish los planes se ejecutan **nativo** (rama, PR, revisión cruzada; ver «Planes» en `AGENTS.md`). Las referencias de `writing-plans` a `subagent-driven-development` o `executing-plans` no aplican. Los pasos usan casillas (`- [ ]`).

**Goal:** Que un número **nuevo** conectado por el Embedded Signup (o por el formulario manual) quede **registrado en la Cloud API** y pueda enviar, y que Wasmish guarde el PIN de la verificación en dos pasos que se fija al registrarlo, para dárselo al cliente si lo necesita.

**Architecture:** Meta pide al proveedor tres pasos después del Embedded Signup: canjear el código, suscribir la app al WABA y **registrar el número** (`POST /{phone-number-id}/register` con un PIN de 6 dígitos, que pasa a ser el PIN de la verificación en dos pasos del número). Wasmish hace los dos primeros; el tercero no existe. Con el cliente real no se notó porque su número ya estaba registrado; con un número recién estrenado, la conexión sale bien pero enviar falla (`133010`, cuenta no registrada). El plan añade el registro como un paso más de la conexión, **solo si Meta dice explícitamente que el número no está registrado** (`platform_type: 'NOT_APPLICABLE'`, que se puede pedir en el `GET /{waba-id}/phone_numbers` que ya hace `verifyWabaPhoneNumber`). El PIN se apunta cifrado en el `Waba` **antes** de llamar a Meta (`pendingTwoStepPins`), para no perderlo si algo falla después; al guardar la línea pasa a `Line.twoStepPin`, y se lee con `GET /api/lines/:id/pin`. La UI para verlo va después, con su brief a Claude Design.

**Tech Stack:** Express 5, Mongoose 8, `node:test`, `mongodb-memory-server`.

**Fuente (no hay spec):** la guía de Meta [Onboarding business customers as a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider) (pasos «Subscribe to webhooks», «Register the phone number»), [Register a business phone number](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration/) y la [colección de Meta en Postman](https://www.postman.com/meta/whatsapp-business-platform/request/mk4p87j/register-phone-number): el registro solo se hace por la API, con un límite de **10 intentos por número cada 72 h**; registrar en la Cloud API lo quita de la On-Premises; y, según la colección de Postman, hay que registrar el número **en los 14 días siguientes al Embedded Signup**. Decisión de Jonathan (2026-10-13): **guardar el PIN, el cliente lo puede necesitar después** (para llevarse el número a otro proveedor, por ejemplo).

## Global Constraints

- **Solo se registra un número con `platform_type: 'NOT_APPLICABLE'`.** `CLOUD_API` (ya registrado), `ON_PREMISE` (sería una migración, otro trabajo), un valor desconocido o el campo ausente → **no se llama a `/register`** y la conexión sigue como hoy; los tres últimos dejan un `console.warn` con el valor, para verlo en los logs. Renovar el token de un número ya registrado (el cliente de la API pública) nunca llama a `/register` ni toca su PIN: con un PIN distinto del que tiene, Meta lo rechazaría y no podría reconectar.
- **El PIN, siempre cifrado** con `encrypt` (`utils/crypto.js`): mientras se registra, en `Waba.pendingTwoStepPins` (por `phoneNumberId`); después, en `Line.twoStepPin`. Nunca sale en `GET /lines` ni en otra respuesta que no sea `GET /lines/:id/pin`. Un PIN que Wasmish no fijó (número ya registrado) es `null`: no se inventa.
- **El PIN se apunta antes de llamar a Meta** y se borra de `pendingTwoStepPins` solo cuando ya está en la línea, o cuando Meta **rechazó** el registro (respuesta con `waErrorCode`: el número no quedó registrado con él). Si el resultado es desconocido (sin respuesta) o la conexión falla después del registro, se queda, y el siguiente intento lo reutiliza: para registrar (el mismo PIN) o para dárselo a la línea si Meta ya dice `CLOUD_API`.
- **Si el registro falla, la conexión falla**, como cuando falla suscribir la app: 502 con un mensaje en español, `code: 'phone_number_registration_failed'` y el `errorCode` de Meta; la línea no se guarda. Una línea guardada que no puede enviar es peor que un error al conectar.
- Una línea de otra cuenta en `GET /lines/:id/pin` → **404**, nunca 403, con su test en `tests/isolation/`. Hasta la Fase 3 lo puede ver cualquier usuario de la cuenta, como el resto de `/lines`; la Fase 3 lo deja para owner y admin (los que conectan líneas, spec multi-línea § 3.3).
- **El cliente de la API pública no nota nada:** `/v1` no cambia.
- Textos al usuario en español; errores como `[{ message, code }]`. Commits sin coautor ni atribución. Un PR (rama `registrar-numero`), backend y documentación; la UI en otro, cuando esté el diseño. Ningún cliente por su nombre en el repo: «el cliente real» o «el cliente de la API pública».
- Comprobar con `cd Backend && npm test && npm run test:isolation`.

## Review Focus

- **El cliente de la API pública renueva el token** (su número ya está en la Cloud API, sin PIN guardado): ninguna llamada a `/register`, `twoStepPin` sigue `null`, y la plantilla que envía después por `/v1` sale con el token nuevo → test en la Tarea 1.
- **Meta no manda `platform_type`, o manda uno desconocido**, al renovar un número ya conectado: ninguna llamada a `/register`, la renovación se guarda y la línea sigue como estaba → test en la Tarea 1.
- **El registro sale bien y la conexión falla después** (otra cuenta activa el número a la vez, el candado de líneas ocupado), **o la respuesta de `/register` se pierde**: al repetir, Meta dice `CLOUD_API` y la línea se guarda con **el PIN del primer intento** → test en la Tarea 1.
- **Meta rechaza el registro** (PIN de dos pasos ya puesto por otro, `133005`; demasiados intentos, `133016`): 502 con el mensaje en español y el `errorCode` de Meta, ninguna línea activa, y el PIN apuntado se borra → test en la Tarea 1.
- **Otra cuenta pide el PIN de mi línea**, o un id mal formado: 404, sin el PIN; y el PIN no se cuela en `GET /lines`, que lee la `Line` entera → tests en la Tarea 2.

---

### Task 1: Registrar el número al conectarlo y guardar su PIN

**Files:**
- Modify: `Backend/src/libs/whatsapp.js` (nueva `registerPhoneNumber`; `getWabaPhoneNumbers` pide además `platform_type`)
- Modify: `Backend/src/utils/whatsapp.line.js` (`describeWabaPhoneNumber` devuelve `platformType`; nuevas `needsRegistration`, `generateTwoStepPin`, `PHONE_NUMBER_REGISTRATION_FAILED_MESSAGE`, `LINE_ERROR_CODES.registrationFailed`)
- Modify: `Backend/src/services/whatsapp.connection.service.js` (nueva `registerIfNeeded`)
- Modify: `Backend/src/services/line.service.js:285-331` (`applyConnection` recibe y guarda `twoStepPin`, y lo borra de los pendientes del `Waba`)
- Modify: `Backend/src/models/line.model.js` (campo `twoStepPin`) y `Backend/src/models/waba.model.js` (campo `pendingTwoStepPins`)
- Modify: `Backend/src/controllers/whatsapp.controller.js` y `Backend/src/controllers/user.controller.js` (llaman a `registerIfNeeded` antes de `applyConnection`)
- Modify: `Frontend/src/models/line.model.ts:36-43` (el código nuevo en `LINE_ERROR`, para que el front lo conozca; sin UI nueva)
- Modify: `docs/arquitectura/whatsapp-envio.md` § Embedded Signup (el paso nuevo en la lista numerada y los campos en «Dónde vive la conexión»)
- Test: `Backend/tests/whatsapp.line.test.js`, `Backend/tests/isolation/whatsapp.test.js`

**Interfaces:**
- Produces:
  - `registerPhoneNumber({ token, phoneNumberId, pin }) → Promise` en `libs/whatsapp.js`: `POST /${phoneNumberId}/register` con `{ messaging_product: 'whatsapp', pin }` y `Authorization: Bearer`, por `whatsappApi` (así el Meta falso de los tests la ve).
  - `describeWabaPhoneNumber(body, phoneNumberId) → { phoneNumberId, displayPhoneNumber, verifiedName, platformType } | null` (`platformType: entry.platform_type ?? null`).
  - `needsRegistration(details) → boolean`: `details?.platformType === 'NOT_APPLICABLE'`.
  - `generateTwoStepPin() → string`: 6 dígitos con `crypto.randomInt(0, 1_000_000)` y relleno de ceros a la izquierda.
  - `PHONE_NUMBER_REGISTRATION_FAILED_MESSAGE = 'WhatsApp no dejó activar este número para enviar mensajes. Inténtalo de nuevo en unos minutos; si se repite, escríbenos.'` y `LINE_ERROR_CODES.registrationFailed = 'phone_number_registration_failed'`.
  - `Waba.pendingTwoStepPins: { type: Map, of: String, default: undefined }`: PIN cifrado por `phoneNumberId`, mientras se registra. Se escribe y se borra con `$set` / `$unset` de `pendingTwoStepPins.<phoneNumberId>` (los ids son dígitos).
  - `Line.twoStepPin: { type: String, default: null }`, con un comentario: cifrado, lo fija Wasmish al registrar el número, `null` si el número ya estaba registrado.
  - `registerIfNeeded({ accountId, waBusinessId, token, phoneNumberId, details }) → Promise<string | null>` en `services/whatsapp.connection.service.js` (el `Waba` ya está reclamado por `claimWaba`; se busca con `{ waBusinessId, accountId }`). Devuelve el PIN **cifrado** que tiene que llevar la línea, o `null`:
    - `needsRegistration(details)`: el PIN apuntado de ese número o uno nuevo de `generateTwoStepPin`; si es nuevo, se apunta **antes** de llamar a `registerPhoneNumber`. Si Meta responde con error (`waErrorCode`), se borra el apuntado y se lanza `Error(PHONE_NUMBER_REGISTRATION_FAILED_MESSAGE)` con `statusCode: 502`, `code: LINE_ERROR_CODES.registrationFailed` y el `waErrorCode` / `waErrorDetail` del original (así `connectionErrorResponse` lo responde sin cambios y deja el detalle de Meta en el log). Sin respuesta (red, timeout): el mismo error, sin `waErrorCode`, y el PIN se queda apuntado.
    - Si no: el PIN apuntado de un intento anterior, si lo hay, o `null`. Con `platformType` distinto de `CLOUD_API`, un `console.warn('Registrar número: platform_type inesperado', phoneNumberId, platformType)`.
  - `applyConnection({ accountId, waBusinessId, tokenWhatsapp, phoneNumberId, details, twoStepPin = null })`: con `twoStepPin` lo pone en el `$set` de la línea y, después, hace `$unset` de `pendingTwoStepPins.<phoneNumberId>` en el `Waba`; con `null` no toca el que hubiera.

- [ ] **Step 1: Tests de las funciones puras** en `Backend/tests/whatsapp.line.test.js`

```js
test('describeWabaPhoneNumber devuelve platform_type como platformType', () => {
    const body = { data: [{ id: '111', platform_type: 'CLOUD_API' }, { id: '222' }] };
    assert.equal(describeWabaPhoneNumber(body, '111').platformType, 'CLOUD_API');
    assert.equal(describeWabaPhoneNumber(body, '222').platformType, null);
});

// Regresión que vigila: un número nuevo del Embedded Signup no se registraba y no podía enviar (133010).
test('needsRegistration: solo un número que Meta dice que no está registrado', () => {
    assert.equal(needsRegistration({ platformType: 'NOT_APPLICABLE' }), true);
    for (const platformType of ['CLOUD_API', 'ON_PREMISE', 'ALGO_NUEVO', null, undefined]) {
        assert.equal(needsRegistration({ platformType }), false, String(platformType));
    }
    assert.equal(needsRegistration(null), false);
});

test('generateTwoStepPin: seis dígitos, con ceros a la izquierda, y no siempre el mismo', () => {
    const pins = Array.from({ length: 200 }, generateTwoStepPin);
    assert.ok(pins.every(pin => /^\d{6}$/.test(pin)));
    assert.ok(new Set(pins).size > 1);
});
```

El test que ya existe `devuelve el número del WABA con sus datos` pasa a esperar también `platformType: null`.

- [ ] **Step 2:** `cd Backend && npm test` → fallan los tres nuevos y el ajustado.

- [ ] **Step 3: Implementar** `describeWabaPhoneNumber`, `needsRegistration`, `generateTwoStepPin`, el mensaje y el código en `utils/whatsapp.line.js`, y `getWabaPhoneNumbers` con `fields: 'id,display_phone_number,verified_name,platform_type'`.

- [ ] **Step 4:** `cd Backend && npm test` → todo en verde.

- [ ] **Step 5: Commit** — `git commit -m "Saber si un número está registrado en la Cloud API y generar su PIN"`

- [ ] **Step 6: Tests de aislamiento** en `Backend/tests/isolation/whatsapp.test.js`

`fakeMeta(numbers, { onPhoneNumbers, platformType = 'CLOUD_API', onRegister })`: los números salen con ese `platform_type` (con `platformType: undefined`, sin el campo), y `config.url.endsWith('/register')` responde `{ data: { success: true } }`, o lo que haga `onRegister(config)`, que puede lanzar (un error con `waErrorCode` es un rechazo de Meta, como el interceptor de `whatsappApi`; uno sin él, una respuesta perdida). Con `'CLOUD_API'` por defecto, los tests de hoy siguen igual, incluida la secuencia exacta de llamadas de `comprueba el número antes de suscribir la app`. El test de la segunda página (que usa `onMeta` directo) devuelve números sin `platform_type`: con esta regla no registra, así que no cambia.

```js
// Regresión que vigila: un número nuevo del Embedded Signup quedaba sin registrar y no podía enviar (133010).
test('POST /whatsapp/connect: un número sin registrar se registra con un PIN, y se guarda cifrado', async () => {
    // cuenta nueva, fakeMeta(['981'], { platformType: 'NOT_APPLICABLE' }), connect con waBusinessId 'waba-<label>'
    // → 200; las llamadas, en orden: oauth, phone_numbers, subscribed_apps, '/981/register'
    // → el cuerpo de /register: messaging_product 'whatsapp' y un pin de 6 dígitos
    // → decrypt(Line.twoStepPin) === ese pin, y el Waba ya no tiene '981' en pendingTwoStepPins
});

test('PUT /users/update-user-token-whatsapp: el formulario manual también registra un número sin registrar', async () => {
    // fakeMeta(['982'], { platformType: 'NOT_APPLICABLE' }) → 200, hubo una llamada a '/982/register' y la línea tiene twoStepPin
});

test('un número ya registrado, sin platform_type o con uno desconocido no se registra', async () => {
    // para 'CLOUD_API', undefined y 'ALGO_NUEVO' (una cuenta por caso): → 200, ninguna llamada termina en '/register', twoStepPin null
});

// Regresión que vigila: renovar el token de un número ya registrado (el cliente de la API pública) no puede tocar su PIN.
test('renovar el token no vuelve a registrar ni borra el PIN, y /v1 envía con el token nuevo', async () => {
    // conectar con NOT_APPLICABLE (guarda el PIN); reconectar el mismo número con CLOUD_API (token 'token-nuevo')
    // → 200, ninguna llamada nueva a '/register', twoStepPin igual que antes
    // → POST /api/v1/templates/send con la API key de la cuenta (como en tests/isolation/lines.test.js):
    //   la llamada a '/<número>/messages' lleva 'Authorization: Bearer token-nuevo'
});

// Regresión que vigila: un PIN con el que Meta ya registró el número no se puede perder.
test('si la conexión falla después de registrar, al repetir la línea se guarda con el PIN del primer intento', async () => {
    // fakeMeta(['985'], { platformType: 'NOT_APPLICABLE', onRegister: (config) => { guardar config.data.pin;
    //   crear una Line activa de otra cuenta con '985' (la carrera de siempre) } })
    // → 409; repetir con fakeMeta(['985']) (CLOUD_API) después de desconectar la de la otra cuenta
    // → 200, ninguna llamada nueva a '/register', decrypt(twoStepPin) === el pin guardado
});

test('si la respuesta de /register se pierde, al repetir la línea se guarda con ese PIN', async () => {
    // onRegister: guardar el pin y lanzar un Error sin waErrorCode → 502 'phone_number_registration_failed', sin errorCode
    // repetir con CLOUD_API → 200, decrypt(twoStepPin) === el pin del primer intento
});

test('si Meta rechaza el registro: 502 con el código, el errorCode de Meta, ninguna línea activa y el PIN apuntado borrado', async () => {
    // onRegister lanza con waErrorCode 133016
    // → 502, body[0].code === 'phone_number_registration_failed', body[0].errorCode === 133016,
    //   body[0].message === PHONE_NUMBER_REGISTRATION_FAILED_MESSAGE, 0 líneas activas de esa cuenta,
    //   el Waba sin '984' en pendingTwoStepPins
});
```

- [ ] **Step 7:** `cd Backend && npm run test:isolation` → fallan los nuevos; los de antes, en verde.

- [ ] **Step 8: Implementar** `registerPhoneNumber`, `registerIfNeeded`, los campos `Waba.pendingTwoStepPins` y `Line.twoStepPin`, y `applyConnection` con `twoStepPin`. En `connectWhatsappEmbedded`, `registerIfNeeded` va **después de `subscribeAppToWaba`** (el orden de la guía de Meta) y antes de `applyConnection`; en `updateUserTokenWhatsapp`, después de `claimWaba`. Los dos pasan el resultado a `applyConnection` como `twoStepPin`.

- [ ] **Step 9:** `cd Backend && npm test && npm run test:isolation` → todo en verde.

- [ ] **Step 10: Documentación.** En `whatsapp-envio.md` § Embedded Signup, entre el paso 4 (suscribir la app) y `applyConnection`: «**Registrar el número** (`registerIfNeeded`, Embedded Signup y formulario manual): si Meta dice que no está registrado (`platform_type: 'NOT_APPLICABLE'`, en la misma respuesta de `/phone_numbers`), `POST /{phone-number-id}/register` con un PIN de 6 dígitos al azar, que pasa a ser el PIN de la verificación en dos pasos del número. El PIN se apunta cifrado en `Waba.pendingTwoStepPins` antes de llamar a Meta y pasa a `Line.twoStepPin` al guardar la línea: si la conexión falla después del registro, el siguiente intento lo recupera. Un número ya registrado (renovar el token, un cliente que viene de otro proveedor), en On-Premises o con un `platform_type` desconocido no se registra y su PIN no se toca (los dos últimos dejan un aviso en el log). Si Meta lo rechaza, 502 `phone_number_registration_failed` y no se guarda la línea. Meta permite 10 intentos por número cada 72 h, y el registro tiene que hacerse en los 14 días siguientes al Embedded Signup.» Renumerar la lista. Y `LINE_ERROR.registrationFailed` en `Frontend/src/models/line.model.ts`.

- [ ] **Step 11:** `cd Frontend && npm run lint && npm run build` → en verde.

- [ ] **Step 12: Commit** — `git commit -m "Registrar en la Cloud API el número que se conecta y guardar su PIN"`

### Task 2: `GET /api/lines/:id/pin`

**Files:**
- Modify: `Backend/src/controllers/line.controller.js` (nuevo `getLinePin`)
- Modify: `Backend/src/routes/line.routes.js` (`router.get('/lines/:id/pin', authRequired, getLinePin)`)
- Modify: `docs/arquitectura/api.md` (la ruta en la tabla, junto a las de `/lines`, y el código `phone_number_registration_failed` en la lista de códigos de `GET /api/lines`)
- Test: `Backend/tests/isolation/lines.test.js`

**Interfaces:**
- Consumes: `Line.twoStepPin` (Tarea 1); `findOwnedLine` y `sendNotFound` de `line.controller.js`; `decrypt` de `utils/crypto.js`.
- Produces: `GET /api/lines/:id/pin` → `200 { pin: string | null }` (`null` si Wasmish no lo fijó); 404 `LINE_NOT_FOUND_MESSAGE` si la línea no es de la cuenta o el id está mal formado. Vale también para una línea desconectada: el número sigue teniendo ese PIN.

- [ ] **Step 1: Tests** en `Backend/tests/isolation/lines.test.js`

```js
test('GET /lines/:id/pin: el PIN de una línea propia, descifrado; null si no tiene', async () => {
    // línea con twoStepPin: encrypt('123456') → 200 { pin: '123456' }; otra sin él → 200 { pin: null }
});

test('GET /lines/:id/pin: la línea de otra cuenta o un id mal formado → 404, sin el PIN', async () => {
    // B pide el de A → 404 y el cuerpo no contiene '123456'; '/lines/no-es-un-id/pin' → 404
});

// Regresión que vigila: GET /lines lee la línea entera; el PIN no puede salir ahí.
test('GET /lines no incluye el PIN', async () => {
    // con una línea con twoStepPin, ninguna línea de la respuesta tiene 'twoStepPin' ni 'pin', y el texto no contiene el PIN
});
```

- [ ] **Step 2:** `cd Backend && npm run test:isolation` → fallan los dos primeros (404 de Express en la ruta que no existe); el tercero ya pasa, y se queda como guarda.

- [ ] **Step 3: Implementar** `getLinePin` y la ruta.

- [ ] **Step 4:** `cd Backend && npm test && npm run test:isolation` → en verde. Actualizar `api.md`.

- [ ] **Step 5: Commit** — `git commit -m "GET /lines/:id/pin: el PIN de dos pasos de una línea"`

### Task 3: El brief de la UI

**Files:**
- Create: `docs/superpowers/specs/2026-10-13-pin-linea-brief-ui.md`

Un brief corto como los que ya hay (qué tiene que poder hacer el usuario y qué ve, no cómo se ve): en Ajustes → Líneas, el owner ve el PIN de dos pasos de una línea **cuando lo pide** (no a la vista), puede copiarlo, y entiende para qué sirve (lo pide WhatsApp para llevarse el número a otro proveedor o a la app). Una línea sin PIN guardado dice que el número ya estaba registrado cuando se conectó y que el PIN lo tiene quien lo registró. Jonathan se lo pasa a Claude Design; la implementación va en otro PR, con el diseño.

- [ ] **Step 1:** escribir el brief.
- [ ] **Step 2: Commit** — `git commit -m "Brief de la UI del PIN de una línea"`

## Al terminar

- PR `registrar-numero` contra `master`, con la revisión de Codex (`.github/revision-cruzada.md`) publicada como comentario y la respuesta punto por punto.
- `docs/estado.md`: «En curso» se vacía al unir, y en «Lo siguiente» queda la UI del PIN (esperando el diseño). La versión (1.0.16) va en su propio PR cuando Jonathan quiera desplegar.
- **Después de desplegar,** la prueba con el número nuevo en producción, con una cuenta de prueba: conectar por el Embedded Signup y ver en los logs que hubo `/register` (si sale el aviso de `platform_type inesperado`, el valor que manda Meta para un número nuevo no es `NOT_APPLICABLE`: se corrige `needsRegistration` con ese valor); recibir y responder desde Wasmish; `GET /lines/:id/pin` con el PIN; y renovar el token (repetir el Embedded Signup con el mismo número) sin que se vuelva a registrar. Cierra el cabo suelto «Conectar WhatsApp sin probar contra Meta de verdad».

## Decisiones del plan (para revisar)

- **Registrar solo con `NOT_APPLICABLE`** (revisión de Codex). Un valor desconocido o ausente no registra: el peor caso es el de hoy (el número conecta y no envía), con un aviso en el log, en vez de intentar registrar con un PIN nuevo un número que quizá ya lo está y tumbar su renovación. Que un número nuevo llega con `NOT_APPLICABLE` está sin comprobar contra Meta: lo confirma la prueba en producción.
- **El PIN pendiente, en el `Waba`** (revisión de Codex). Antes de `applyConnection` no existe la línea, y crearla a medias (`disconnected`) la enseñaría en Ajustes. El `Waba` ya está reclamado para la cuenta en ese punto (`claimWaba`), y el PIN se queda allí solo hasta que llega a la línea.
- **Un fallo del registro tumba la conexión** (502), en lugar de guardar la línea y avisar. Se reintenta repitiendo la conexión; la suscripción de la app, que ya se hizo, se repite sin problema.
- **El PIN en la `Line`, no en el `Waba`:** es de cada número.
- **El formulario manual también registra:** son las mismas comprobaciones que el Embedded Signup (lo dice `user.controller.js`), y un número de pruebas que Jonathan conecte a mano tendría el mismo problema.
- **La UI, en otro PR**, por la regla de Claude Design. Hasta entonces, el PIN se puede leer con la API (`GET /lines/:id/pin`) si un cliente lo pide.
