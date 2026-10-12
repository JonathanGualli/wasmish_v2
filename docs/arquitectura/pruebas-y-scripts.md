# Pruebas locales, scripts y versión

Cómo probar sin tocar producción (webhook simulado, contactos de prueba), los tests de aislamiento, los scripts de mantenimiento y el cambio de versión.

> Parte de la documentación de Wasmish: el mapa de todos los temas está en el [AGENTS.md](../../AGENTS.md) de la raíz.
> Las decisiones de producto con fecha están en [decisiones.md](../decisiones.md).

## Contenido

- [Probar el webhook en local](#probar-el-webhook-en-local)
- [Probar las campañas en local](#probar-las-campañas-en-local)
- [Scripts de mantenimiento](#scripts-de-mantenimiento)
- [Versión de la app](#versión-de-la-app)
- [Tests de aislamiento](#tests-de-aislamiento)
- [Entorno local](#entorno-local)
- [Probar la UI en el navegador](#probar-la-ui-en-el-navegador)
- [Un error 190 en local es el token, no el código](#un-error-190-en-local-es-el-token-no-el-código)

---

### Probar el webhook en local

**Probar el webhook en local** — el webhook de Meta es **único por app**: apuntarlo a ngrok deja a los clientes reales sin mensajes entrantes, así que no se toca. En su lugar:
```bash
cd Backend && npm run webhook:simulate -- --list        # tipos disponibles
cd Backend && npm run webhook:simulate -- audio boton   # manda esos dos
cd Backend && npm run webhook:simulate -- --all
cd Backend && npm run webhook:simulate -- --clean       # borra la conversación de prueba
cd Backend && npm run webhook:simulate -- baja-marketing  # aviso de baja de publicidad (alta-marketing para volver)
cd Backend && npm run webhook:simulate -- cambio-numero --new-from 593000000001   # cambia de número y de BSUID
```
`scripts/simulate-webhook.js` firma el payload con `META_APP_SECRET` igual que Meta y se lo manda al backend local (que tiene que estar levantado). Como el SSE dispara igual, los mensajes **aparecen en vivo** en el chat del navegador. Las muestras de cada tipo están escritas a mano desde la documentación de Meta: si alguna no cuadra con la realidad, se corrige ahí **y** en `utils/inbound.message.js`.

### Probar las campañas en local

**Probar las campañas en local** — contactos de prueba con todos los casos (sin nombre, solo nombre de WhatsApp, sin teléfono, sin empresa, de baja, con ventana abierta o cerrada, sin conversación) y con etiquetas (VIP, ESTÁNDAR, Quito, Guayaquil, Cuenca, Mayorista…: ninguna, una, varias, y el número 7 con las 10):
```bash
cd Backend && npm run seed:contacts                 # crea 60 (o completa los que falten)
cd Backend && npm run seed:contacts -- --count 300
cd Backend && npm run seed:contacts -- --acks       # simula leídos, entregados y fallidos de las campañas a ellos
cd Backend && npm run seed:contacts -- --clean      # borra contactos, conversaciones, mensajes y campañas de prueba, y las etiquetas que queden sin usar
```
`scripts/seed-test-contacts.js` los reconoce por el teléfono `59300099xxxx` o el BSUID `EC.SEED.xxxx`, así que `--clean` nunca toca uno real, y **se niega a correr si `MONGO_URI` no es local** o si la BD conserva el índice viejo `userId_1_contactPhone_1` (con él, el envío a los contactos sin teléfono falla con E11000; se borra con `npm run backfill:contacts`). Con `CAMPAIGN_DRY_RUN` los mensajes se quedan en «Enviado» porque Meta no contesta: `--acks` manda los acuses por el webhook local, firmados como Meta, y el detalle del envío se mueve en vivo. Para elegirlos todos en Contactos, buscar `59300099`.

### Scripts de mantenimiento

**Scripts de mantenimiento** (Backend, se conectan a `MONGO_URI`):
```bash
cd Backend && npm run backfill:window -- --dry-run   # informa, no escribe
cd Backend && npm run backfill:window                # aplica
cd Backend && npm run check:duplicates               # informa duplicados por waMessageId
cd Backend && npm run check:duplicates -- --fix      # borra las copias, conserva la más antigua
cd Backend && npm run backfill:contacts -- --dry-run # informa, no escribe
cd Backend && npm run backfill:contacts              # aplica
cd Backend && npm run migrate:accounts -- --dry-run  # informa, no escribe
cd Backend && npm run migrate:accounts               # aplica
cd Backend && npm run migrate:lines -- --dry-run     # informa, no escribe
cd Backend && npm run migrate:lines -- --check       # informa, y sale con 1 si queda algo
cd Backend && npm run migrate:lines                  # aplica
```
`scripts/backfill-contacts.js` crea un `Contact` por cada conversación anterior a los contactos, la enlaza (`contactId`) y pasa su `contactName` al contacto; al final borra el índice viejo `userId_1_contactPhone_1`. Idempotente (solo toca las conversaciones sin `contactId`). **Ya corrido en producción** el 2026-10-01: 453 contactos, ninguna conversación sin enlazar.

`scripts/backfill-last-inbound.js` rellena `Conversation.lastInboundAt` en las conversaciones anteriores al campo, tomando el último `Message` entrante de cada una. Es idempotente y solo escribe si el valor falta o es más viejo, así que nunca pisa lo que el webhook haya puesto mientras corría.

`scripts/migrate-accounts.js` (2026-10-11, Fase 1 de multi-línea) crea la `Account` de cada usuario que no la tiene, **con su mismo `_id`**, y lo deja de owner (`accountId`, `role: 'owner'`, `isSuperadmin` a partir del `rol` viejo). Idempotente: no toca a quien ya tiene `accountId`, y si una pasada se corta entre crear la cuenta y actualizar al usuario, la siguiente lo termina. Un usuario `rol: 'agent'` sin cuenta lo **para entero**, sin escribir nada y con su correo en la salida, porque no hay forma de saber de qué cuenta es (la lógica, pura y con test: `planAccountMigration` en `utils/account.js`). En producción corre **antes** de arrancar la imagen que lo necesita, y la pasada final con la API vieja parada: la imagen nueva responde 401 a un usuario sin cuenta.

`scripts/migrate-lines.js` (2026-10-11, Fase 2a de multi-línea; la lógica en `services/line.migration.service.js`, `runLineMigration`) crea las líneas de los datos de hoy. La del número actual de cada cuenta, con su `Waba`, la deja `syncLinesFromOwner` como dice `User`. Cada **número anterior** que aparece en sus conversaciones recibe una línea `disconnected` y sin WABA, y cada conversación recibe la línea de **su propio** `phoneNumberId`, no la del número actual, así que el historial y la ventana de un número viejo no pasan al nuevo. Las campañas reciben la línea por defecto de su cuenta. Idempotente, y se puede correr **con la API en marcha**, porque la conexión actual se lee de `User` en el momento de escribir. **Para sin escribir nada** si un WABA está en dos cuentas (en `User` o en `Waba`) o si una conversación no tiene número. **Desde la Fase 2b** (2026-10-12) cambia además el índice de conversaciones: crea `conversation_line_contact_unique` (una por contacto y línea) y `conversation_contact_without_line_unique` (una por contacto entre las que no tienen línea), y después borra el viejo `conversation_contact_unique` (una por contacto en toda la cuenta), que Mongoose no borra solo. En producción se corre con la imagen nueva **antes de arrancarla**: el código que enruta por línea no puede correr con el índice viejo, que no deja a un contacto tener una conversación en cada línea. El script se conecta sin `autoIndex` ni `autoCreate`, así que `--check` y `--dry-run` no crean ningún índice. `--check` dice lo pendiente, el índice viejo si sigue y las cuentas cuya proyección no cuadra con `User` (`lineStateIssues`), y sale con 1 si queda algo.

`scripts/check-duplicate-messages.js` busca `Message` que compartan `waMessageId`. Hay que correrlo **antes de desplegar** en una BD que pueda traer duplicados: si los hay, Mongo no puede crear el índice único (E11000), Mongoose solo lo loguea y la app arranca **sin** la protección.

### Versión de la app

**Versión de la app** — se cambia en **un solo sitio**:
```bash
cd Backend && npm run version:bump 1.0.4    # o patch | minor | major
```
Escribe el campo `version` de los **dos** `package.json` a la vez (los lee y valida antes de tocar ninguno, para no dejarlos desparejados). De ahí sale todo lo demás y **no hay que tocar nada más**: `vite.config.ts` inyecta `pkg.version` como `__APP_VERSION__` al compilar y `src/config/version.ts` solo lo reexporta (nunca escribir un literal ahí); el Backend lee su propio `package.json` al arrancar (`APP_VERSION` en `config.js`) y lo publica en `GET /api/version`, que sirve para comprobar qué código corre en producción: `curl https://wasmish.solventyc.com/api/version`. La versión se ve en el pie del sidebar.

No se usa un archivo `VERSION` en la raíz del repo a propósito: el deploy sube `Backend/` y `Frontend/` por separado con `tar`, así que un archivo de la raíz nunca llegaría al servidor.

### Tests de aislamiento

**Tests de aislamiento** (`tests/isolation/`, 2026-10-11): que una cuenta no vea ni toque lo de otra, que hasta ahora dependía solo de que cada consulta llevara su `userId`. Levantan la app de verdad (`app.js`, sin `index.js`: sin worker ni puerto fijo) contra un **Mongo en memoria** (`mongodb-memory-server`, única dependencia de desarrollo) de la **misma versión que producción**, fijada en `config.mongodbMemoryServer.version` del `package.json` (8.0.28; si se actualiza el Mongo del servidor, cambiarla ahí). La primera vez descarga el binario a `~/.cache/mongodb-binaries`. `helpers.js` crea dos cuentas, A y B, con uno de cada cosa marcado `SECRETO-<cuenta>`, y cada test hace que B pida lo de A con tres comprobaciones: **404** (no 403), **la BD sin cambios** (un 404 después de escribir también pasaría el código) y un **control** en el que A sí llega con su propio id (sin él, una URL mal escrita también daría 404). `assertNoLeak` busca la marca, el teléfono y los ids de A en el texto de la respuesta. Cubren chat (lista, mensajes, texto, plantilla, archivo, `/media`), contactos y etiquetas (también los ids que llegan en el cuerpo: `tagIds`, selecciones, `add`), campañas (detalle, pausar/reanudar/cancelar, vista previa y creación con contactos, plantilla o cabecera ajenos), plantillas y sus archivos, API keys, la API pública `/v1`, el admin, la sesión (registro, usuarios desactivados o sin cuenta, superadmin), el webhook (`webhook.test.js`: entrantes, bajas de publicidad, cambios de número y el 131050 llegan a la cuenta del número, firmados con `postWebhook`), el SSE (`openStream`: lo de A llega a las pestañas de A y no a las de B) y el worker de campañas (`processNext`, exportada para esto). **La cuenta de cada una no tiene el `_id` de su usuario** (Fase 1 de multi-línea): en producción coinciden, así que un `req.auth.userId` o un `user._id` usado como cuenta funcionaría allí de casualidad; aquí rompe el control de «lo propio» de cada test. Por eso los conteos de propiedad de los tests usan `account.accountId`, y `account.userId` solo para lo que es de la persona (el `User`, el JWT). **Nada llega a Meta, nunca** (2026-10-11): `helpers.js` sustituye el transporte de `whatsappApi` (`defaults.adapter`), por donde pasan todas las llamadas. Un test prepara las respuestas con `onMeta(responder)` y ve las llamadas en `metaCalls`; una llamada sin respuesta preparada lanza, y el `after` hace fallar el archivo aunque el controlador se haya tragado el error. Así se prueban también los caminos que pasan por Meta (`whatsapp.test.js`: conectar un número, su verificación en el WABA y la carrera de dos conexiones). Verificados quitando el filtro por cuenta en 10 sitios, uno a uno: todos fallan. Con `NODE_ENV=test`, `app.js` no monta `morgan`. **Un endpoint nuevo con `:id`, o que reciba ids en el cuerpo, lleva su caso aquí.**

### Entorno local

- **Node 22**, el mismo de producción (`node:22-alpine`). Con Node 20 los globs de `npm test` no encuentran los archivos. Sin `npm ci` en `Backend/` y `Frontend/` falla `libphonenumber-js`.
- **MongoDB local** en `127.0.0.1:27017`, base `wasmish`: es la que usa `npm run dev`. **Nunca se apunta el `.env` local a la base de producción.**
- **`npm run dev` del backend** usa `node --watch-path` (solo `src/`, `package.json` y `.env`), que reinicia también al cambiar el `.env`. **Nunca `--watch-path=.`**: la app escribe en `media/` y entra en bucle. `node --watch` a secas vigila `node_modules` y se come los vigilantes de inotify.
- **`ENOSPC` al arrancar Vite o el backend:** se agotaron los vigilantes de inotify (varias ventanas de VS Code, indexadores). Se arregla subiendo `fs.inotify.max_user_watches` (p. ej. a 524288 en `/etc/sysctl.d/60-inotify.conf`) o cerrando ventanas.
- **Campañas en local:** `CAMPAIGN_DRY_RUN` sin poner = modo de prueba encendido (no sale nada hacia Meta). Para ver el progreso despacio, `CAMPAIGN_RATE_PER_SECOND=0.47` hace que 56 envíos tarden unos 2 minutos. En producción no se pone ninguna de las dos.
- **ngrok** sirve para el Embedded Signup en local (apuntando a Vite, puerto 5173) y para el webhook de una **app de Meta de pruebas** (apuntando al 3001). El webhook de la app de producción no se mueve nunca.

### Probar la UI en el navegador

Para ver una pantalla funcionando sin pedir contraseñas:

- **Sesión:** un JWT `{ id: <userId> }` firmado con el `TOKEN_SECRET` del `Backend/.env` (`expiresIn: '1h'`). Ojo: dotenv 17 imprime «injected env…» por la salida estándar; hay que quedarse con la última línea, o el token sale corrupto y el backend responde 400 sin cuerpo.
- **Navegador:** `playwright-core` instalado fuera del proyecto (no es dependencia del repo), con el Chrome del sistema. `context.addCookies` falla con «Invalid cookie fields»: lo que funciona es abrir `/login` y hacer `document.cookie = 'token=…; path=/'`.
- **Datos:** si la prueba crea algo en la BD local, se borra al terminar. Para pruebas del backend aisladas, mejor otro puerto y una base desechable que se borra al acabar.
- El frontend escucha en `localhost:5173` (también en IPv6) y el backend en `:3001`.

### Un error 190 en local es el token, no el código

Si una llamada a Meta empieza a fallar en local con el **error 190** («Error validating access token: Session has expired»), casi siempre es el token de WhatsApp de la cuenta local, que caducó: un token cargado a mano en Ajustes dura horas; el del Embedded Signup no caduca. Puede aparecer disfrazado (un `GET /api/templates/sync` que da 500 o 502). **Comprobar el token antes de buscar el fallo en el código recién tocado.** Para no sufrirlo, conectar la cuenta local por Embedded Signup.
