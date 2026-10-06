# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Preferencias del proyecto

### Brand guidelines — diseño y UI

**Antes de crear o modificar cualquier componente, página, o estilo, consultar el skill `/brand-guidelines`.**

Esto incluye: nuevos componentes React, modificaciones de clases Tailwind, elección de colores, diseño de páginas, variantes de botones/inputs, layouts, iconografía, o cualquier decisión visual. El skill contiene la paleta de tokens, reglas de componentes, y anti-patterns del proyecto.

Identidad vigente: **Manual de marca v1.0 · dirección 3b «Barra oscura»** — verde tinta (`#0B3B2E`) sobre blanco puro y grises fríos, con menta (`#6FE3AE`) como único acento. El verde de WhatsApp `#25D366` **ya no forma parte de la marca**.

Fuentes originales del manual: `Frontend/brand/wasmishbrand/*.dc.html` (canvas de Claude Design). **No mover esa carpeta a `Frontend/dist/`** — un `npm run build` la borra. `.interface-design/system.md` deriva del manual y cubre lo estructural.

### Consultar graphify para preguntas de arquitectura

Cuando el usuario pregunte algo sobre el proyecto que requiera entender la arquitectura completa — flujo de datos, relaciones entre componentes, dónde vive algo, cómo se conectan dos partes — **consultar el grafo de graphify antes de responder**:

```bash
graphify query "<pregunta>"
```

Para preguntas sobre un solo archivo, leer el archivo directamente.
Si hay archivos nuevos, actualizar el grafo con `/graphify --update` antes de consultar.

### Grafo de conocimiento (graphify)

Reconstruido el 2026-09-09 (full: AST + semántica LLM), reconstruido de nuevo el 2026-10-03 (`/graphify --update`: AST de todo el código + caché semántica + re-extracción de los docs/imágenes cambiados). Actualizado el 2026-10-04 con `/graphify --update` (campañas, contactos, baja de publicidad) y otra vez ese día (diseño v2 de campañas y cabeceras de plantilla), el 2026-10-05 (archivo de cabecera por campaña, 409 fuera de ventana, `whatsappErrors.ts`, «Modal» → «Notice») y el 2026-10-06 (UI de etiquetas). Stats: **1552 nodos, 3974 edges, 103 comunidades**. Ojo: `graphify update .` (CLI, solo AST) había dejado el `graph.json` en 332 nodos sin la capa semántica — preferir `/graphify --update`. Hay un `.graphifyignore` en la raíz que excluye `.agents/` (definiciones de skills empaquetadas), los `.dc.html`/`support.js` del brand y `Design/` (diseños exportados de Claude Design) — sin él el grafo se contaminaba con ~17% de ruido ajeno al proyecto.

- `graphify-out/graph.json` — datos del grafo
- `graphify-out/graph.html` — visualización interactiva
- `graphify-out/GRAPH_REPORT.md` — reporte completo

**God nodes** (más conectados): `CLAUDE.md`, `useNoticeContext` (antes `useModalContext`), `pluralize`, brief de la cabecera por campaña, `useAuthContext`, spec de ventana 24 h, `processTemplateSending`, `CustomButton`, brief de campañas

**Comunidades principales:**
- Admin & Settings Pages / Chat Thread UI / Auth Forms & New Conversation
- Backend App Core & Auth
- Chat & Template Controllers
- Webhook & Media Backend / Inbound Message Parsing
- Architecture Decisions / Deploy & Infra Rationale / 24h Window Design Spec
- SSE & Modal Providers

---

## Comandos de desarrollo

Monorepo con dos workspaces independientes: `Backend/` y `Frontend/`. Cada uno tiene su propio `package.json` y `node_modules`.

**Backend** (Express 5 + MongoDB, port 3001):
```bash
cd Backend && npm run dev      # nodemon src/index.js
```

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

**Probar las campañas en local** — contactos de prueba con todos los casos (sin nombre, solo nombre de WhatsApp, sin teléfono, sin empresa, de baja, con ventana abierta o cerrada, sin conversación) y con etiquetas (VIP, ESTÁNDAR, Quito, Guayaquil, Cuenca, Mayorista…: ninguna, una, varias, y el número 7 con las 10):
```bash
cd Backend && npm run seed:contacts                 # crea 60 (o completa los que falten)
cd Backend && npm run seed:contacts -- --count 300
cd Backend && npm run seed:contacts -- --acks       # simula leídos, entregados y fallidos de las campañas a ellos
cd Backend && npm run seed:contacts -- --clean      # borra contactos, conversaciones, mensajes y campañas de prueba, y las etiquetas que queden sin usar
```
`scripts/seed-test-contacts.js` los reconoce por el teléfono `59300099xxxx` o el BSUID `EC.SEED.xxxx`, así que `--clean` nunca toca uno real, y **se niega a correr si `MONGO_URI` no es local** o si la BD conserva el índice viejo `userId_1_contactPhone_1` (con él, el envío a los contactos sin teléfono falla con E11000; se borra con `npm run backfill:contacts`). Con `CAMPAIGN_DRY_RUN` los mensajes se quedan en «Enviado» porque Meta no contesta: `--acks` manda los acuses por el webhook local, firmados como Meta, y el detalle del envío se mueve en vivo. Para elegirlos todos en Contactos, buscar `59300099`.

**Scripts de mantenimiento** (Backend, se conectan a `MONGO_URI`):
```bash
cd Backend && npm run backfill:window -- --dry-run   # informa, no escribe
cd Backend && npm run backfill:window                # aplica
cd Backend && npm run check:duplicates               # informa duplicados por waMessageId
cd Backend && npm run check:duplicates -- --fix      # borra las copias, conserva la más antigua
cd Backend && npm run backfill:contacts -- --dry-run # informa, no escribe
cd Backend && npm run backfill:contacts              # aplica
```
`scripts/backfill-contacts.js` crea un `Contact` por cada conversación anterior a los contactos, la enlaza (`contactId`) y pasa su `contactName` al contacto; al final borra el índice viejo `userId_1_contactPhone_1`. Idempotente (solo toca las conversaciones sin `contactId`). **Ya corrido en producción** el 2026-10-01: 453 contactos, ninguna conversación sin enlazar.

`scripts/backfill-last-inbound.js` rellena `Conversation.lastInboundAt` en las conversaciones anteriores al campo, tomando el último `Message` entrante de cada una. Es idempotente y solo escribe si el valor falta o es más viejo, así que nunca pisa lo que el webhook haya puesto mientras corría.

`scripts/check-duplicate-messages.js` busca `Message` que compartan `waMessageId`. Hay que correrlo **antes de desplegar** en una BD que pueda traer duplicados: si los hay, Mongo no puede crear el índice único (E11000), Mongoose solo lo loguea y la app arranca **sin** la protección.

**Versión de la app** — se cambia en **un solo sitio**:
```bash
cd Backend && npm run version:bump 1.0.4    # o patch | minor | major
```
Escribe el campo `version` de los **dos** `package.json` a la vez (los lee y valida antes de tocar ninguno, para no dejarlos desparejados). De ahí sale todo lo demás y **no hay que tocar nada más**: `vite.config.ts` inyecta `pkg.version` como `__APP_VERSION__` al compilar y `src/config/version.ts` solo lo reexporta (nunca escribir un literal ahí); el Backend lee su propio `package.json` al arrancar (`APP_VERSION` en `config.js`) y lo publica en `GET /api/version`, que sirve para comprobar qué código corre en producción: `curl https://wasmish.solventyc.com/api/version`. La versión se ve en el pie del sidebar.

No se usa un archivo `VERSION` en la raíz del repo a propósito: el deploy sube `Backend/` y `Frontend/` por separado con `tar`, así que un archivo de la raíz nunca llegaría al servidor.

**Frontend** (React + Vite, port 5173):
```bash
cd Frontend && npm run dev     # vite dev server
cd Frontend && npm run build   # tsc -b && vite build
cd Frontend && npm run lint    # eslint
cd Frontend && npm run preview # preview production build
```

**Tests** (solo Backend, `node:test` nativo — sin dependencias):
```bash
cd Backend && npm test         # node --test "tests/**/*.test.js"
cd Backend && npm run test:watch
```
Cubren **funciones puras**, sin BD ni red: `utils/crypto.js`, `utils/message.status.js`, `utils/whatsapp.window.js`, `utils/inbound.message.js`, `utils/media.storage.js`, `utils/contact.identity.js`, `utils/contact.query.js`, `utils/marketing.preference.js`, `utils/campaign.message.js`, `utils/campaign.status.js`, `utils/template.header.js`, `utils/contact.tags.js`, `utils/contact.import.js` y las de plantillas de `template.controller.js` (`buildButtonComponents`, `renderTemplateBody`). Cada test que corresponde a un bug ya corregido lleva un comentario explicando la regresión que vigila — verificados reintroduciendo el bug a propósito y comprobando que fallan. El Frontend no tiene tests.

Los tests fijan `process.env` **antes** de un `await import(...)` dinámico, porque `crypto.js` y el middleware de firma leen la config al importarse; con un `import` estático la variable llegaría tarde.

---

## Arquitectura

### Backend (`Backend/src/`)

Express 5 app. Entry: `index.js` → `app.js`. Patrón: `routes/` → `controllers/` → `models/` (Mongoose). Cuerpos de request validados con **Zod** via `middlewares/validator.middleware.js` — los errores se devuelven como array de `issues` con status 400. Rutas protegidas usan `middlewares/validate.token.middleware.js` (`authRequired`), que lee un JWT de una cookie httpOnly llamada `token`.

**Configuración (`.env` en `Backend/`, cargado con `dotenv`):** `MONGO_URI`, `TOKEN_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`, `META_GRAPH_VERSION`. `config.js` y `db.js` leen de `process.env` — ya **no** hay secretos hardcodeados. `.env` está en `.gitignore`.

**MongoDB:** conecta a `process.env.MONGO_URI` (por defecto `mongodb://127.0.0.1:27017/wasmish`).

**Autenticación — dos vías:**
- **Cookie JWT** (`authRequired`, `validate.token.middleware.js`) para las rutas de la web/app. En dev la cookie usa `secure:false`/`sameSite:'lax'`; en prod (`NODE_ENV=production`) `secure:true`/`sameSite:'none'`.
- **API key** (`validateApiKey`, `validate.api.key.middleware.js`) para la API pública (`/v1/...`): lee `Authorization: Bearer wm_xxx`, la **hashea** (SHA-256) y busca por `keyHash` para cargar el user dueño; deja `req.user = { id }` igual que `authRequired`.
- **El login no revela qué correos existen.** Un correo inexistente y una contraseña incorrecta devuelven **lo mismo**: 400 con «Correo o contraseña incorrectos» (antes eran 404 y 400, con mensajes distintos). Y `bcrypt.compare` corre **siempre**, contra `HASH_DE_DESCARTE` si el usuario no existe: sin eso las respuestas serían idénticas pero los tiempos no (~1 ms sin usuario frente a ~120 ms con él), y esa diferencia sola basta para enumerar. Medido: 121 ms en ambos casos. `register` sí sigue diciendo si un correo está en uso — taparlo requiere verificación por correo, que no existe todavía.
- **Rol** (`requireSuperadmin`, `require.superadmin.middleware.js`) para `/api/admin/...`: se monta **después** de `authRequired` y lee el `rol` **de la BD en cada request**, no del JWT, para que revocar el rol tenga efecto inmediato sin esperar a que caduque la cookie.

**Lo que `login` y `verify` NO devuelven:** el token de WhatsApp **nunca** sale del backend. Ambos endpoints devuelven `whatsappConnected: boolean`, no `tokenWhatsapp`. El frontend no lo necesita — todas las llamadas a Meta las hace el backend. Mismo criterio en `admin.controller.js`.

**Rate limiting** (`rate.limit.middleware.js`, `express-rate-limit`):
- `authLimiter` — `/login` y `/register`: 10 por IP cada 15 min, con `skipSuccessfulRequests` (solo cuenta los fallos).
- `publicApiIpLimiter` — 120/min por IP, **antes** de `validateApiKey`: frena a quien prueba keys al azar, cuando todavía no hay usuario que limitar.
- `publicApiUserLimiter` — 60/min por `req.user.id`, **después** de `validateApiKey`: el abuso de una key filtrada no le come el cupo a los demás clientes.

No se aplica a `/api/webhook` (Meta manda ráfagas) ni a `/api/stream` (conexión persistente). Requiere `app.set('trust proxy', 1)` — ya está en `app.js`; sin eso, detrás de Traefik todas las peticiones comparten IP aparente y se bloquean entre sí.

**Endpoints completos:**

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/register` | No | Registrar usuario |
| POST | `/api/login` | No | Login, setea cookie JWT |
| POST | `/api/logout` | No | Borra cookie |
| GET | `/api/verify` | No | Verifica cookie JWT activa |
| GET | `/api/profile` | JWT | Perfil del usuario autenticado |
| PUT | `/api/users/update-user-token-whatsapp` | JWT | Guarda token WA cifrado (carga manual) |
| POST | `/api/whatsapp/connect` | JWT | Embedded Signup: canjea el `code` de Meta → token permanente, suscribe webhook, guarda credenciales |
| POST | `/api/chats/messages` | JWT | Enviar mensaje por número (reutiliza su conversación). **409** si el contacto nunca escribió o la ventana está cerrada: hay que empezar con una plantilla |
| POST | `/api/chats/:id/messages` | JWT | Enviar mensaje a conversación existente. **409** (`code: window_closed`) si la ventana de 24 h está cerrada, sin llamar a Meta |
| GET | `/api/chats` | JWT | Listar conversaciones del usuario |
| GET | `/api/chats/:id/messages` | JWT | Mensajes paginados (cursor-based) |
| POST | `/api/chats/:id/template` | JWT | Enviar plantilla a una conversación existente (para reabrir la ventana de 24 h). Body: `{ templateName, language?, parameters?, buttons? }` |
| POST | `/api/chats/template` | JWT | Iniciar conversación con plantilla desde la bandeja. Body: `{ destinationNumber, contactName?, templateName, language?, parameters?, buttons? }` — el número solo dígitos (8–15) |
| GET | `/api/media/:id` | JWT | Adjunto de un mensaje (`:id` es el **id del mensaje**, no el del archivo) |
| GET | `/api/contacts` | JWT | Contactos paginados (`?search`, `?filter=all\|with_conversation\|without_conversation\|opted_out`, `?tags=id,id` —alguna de—, `?page`, `?limit` máx 50), ordenados por actividad |
| GET | `/api/contacts/:id` | JWT | Ficha: contacto + `activity` (primer mensaje, enviados, recibidos, fallidos) |
| POST | `/api/contacts` | JWT | Alta manual (`phone` obligatorio). No envía nada. 409 con `contactId` si el teléfono ya existe |
| PATCH | `/api/contacts/:id` | JWT | Editar `phone`, `name`, `email`, `company`, `notes`. El teléfono **no** cambia si hay conversación (409) |
| DELETE | `/api/contacts/:id` | JWT | Borrar, **solo si nunca hubo conversación** (409 si la hay) |
| POST | `/api/contacts/tags` | JWT | Etiquetar en bloque: `{ selection, add, remove }` (`selection` = el formato de los destinatarios de una campaña). Devuelve `{ matched, modified, overLimit }` |
| POST | `/api/contacts/tags/summary` | JWT | Cuántos de una `selection` tienen cada etiqueta, antes de etiquetar: `{ total, tags: [{ id, count }] }` (las que no tiene nadie no salen). Son los números del menú «Etiquetar» |
| POST | `/api/contacts/import/preview` | JWT | Importar, sin escribir nada: `{ rows, country, extraTagNames }` (≤ 10 000 filas ya emparejadas, con su número de fila). Conteos, errores y avisos por fila, y una muestra |
| POST | `/api/contacts/import` | JWT | Importar una tanda (≤ 500 filas, `consent: true`). Repetible sin duplicar. Devuelve conteos y los `contactIds` de la tanda |
| GET | `/api/tags` | JWT | Etiquetas de la cuenta, por nombre, con `contactCount` |
| POST | `/api/tags` | JWT | Crear al vuelo: si ya hay una con el mismo nombre («vip» = «VIP»), devuelve esa (200) |
| PATCH | `/api/tags/:id` | JWT | Renombrar (409 si choca con otra) |
| DELETE | `/api/tags/:id` | JWT | Borrar: se quita de sus contactos (`{ removedFrom }`) |
| POST | `/api/campaigns/preview` | JWT | Campaña, sin crear nada (`templateId` opcional: sin él solo cuenta destinatarios, para el paso 1 del asistente): destinatarios (a enviar, de baja, sin teléfono, repetidos), cuántos usarán cada reserva, mensaje de ejemplo de los primeros (con `values`: el valor de cada variable y si usó la reserva, para resaltarlo), `estimatedSeconds` y `errors`. Responde 200 aunque haya errores |
| POST | `/api/campaigns/preview/recipients` | JWT | Quién recibiría el borrador (`{ recipients, excludeOptedOut }`), por orden alfabético y paginado (`?page`, `?limit`, `?search` — la misma búsqueda que Contactos, en memoria con `matchesContactSearch`), con el `skipReason` de los que se omitirán. Es «Ver los N» del paso 1 |
| POST | `/api/campaigns` | JWT | Crea la campaña y congela la lista. Body: `{ name, templateId, variables, buttons, excludeOptedOut, recipients, headerMediaId?, saveHeaderAsDefault? }` (`headerMediaId` también en la vista previa). 400 con los errores, 409 sin WhatsApp conectado |
| GET | `/api/campaigns` | JWT | Campañas paginadas (`?page`, `?limit` máx 50), con estadísticas |
| GET | `/api/campaigns/:id` | JWT | Una campaña con sus estadísticas |
| GET | `/api/campaigns/:id/failures` | JWT | Fallidos agrupados por código de error (`{ reasons: [{ code, detail, count }] }`): junta los rechazados por Meta y los que fallaron antes de llamarla |
| GET | `/api/campaigns/:id/recipients` | JWT | Destinatarios paginados (`?state=pending\|sent\|delivered\|read\|failed\|skipped\|cancelled\|interrupted`), con error y conversación |
| POST | `/api/campaigns/:id/pause \| resume \| cancel` | JWT | Control de la campaña. 409 si el estado ya no lo permite |
| GET | `/api/stream` | JWT | SSE stream del usuario |
| GET | `/api/templates/sync` | JWT | Sincronizar plantillas desde Meta API → MongoDB |
| GET | `/api/templates` | JWT | Listar plantillas guardadas en DB (con `header` y `headerMedia` resumido). Si alguna se sincronizó antes de guardar la cabecera, re-sincroniza una vez |
| PUT | `/api/templates/:templateId/header-media` | JWT | Archivo de la cabecera. Cuerpo = el archivo crudo (Content-Type = su tipo), nombre en `X-Filename` (URI-encoded). Valida formato, tamaño y firma de bytes. No llama a Meta |
| POST | `/api/templates/:templateId/header-media/files` | JWT | Archivo de la cabecera para **un envío** (una campaña), sin tocar el de la plantilla. Mismo cuerpo y validación que el `PUT`; devuelve el archivo (`{ id, mimeType, filename, size }`) para pasarlo como `headerMediaId` |
| DELETE | `/api/templates/:templateId/header-media` | JWT | La plantilla se queda sin archivo (el archivo no se borra: una campaña puede usarlo) |
| GET | `/api/templates/media/:id` | JWT | Ver el archivo de una cabecera (404 si es ajeno) |
| POST | `/api/api-key/generate` | JWT | Generar API key (guarda hash; devuelve la key en claro **una sola vez**) |
| GET | `/api/api-key` | JWT | Listar API keys (preview, estado, último uso; nunca el hash) |
| DELETE | `/api/api-key/:id` | JWT | Revocar (eliminar) una API key |
| POST | `/api/v1/templates/send` | **API key** | **API pública:** enviar plantilla. Body: `{ destinationNumber, templateName, language?, parameters?, contactName?, buttons? }` |
| GET | `/api/admin/stats` | JWT + superadmin | Métricas de plataforma: clientes totales/conectados, mensajes y fallos de 7 días |
| GET | `/api/admin/clients` | JWT + superadmin | Listado paginado de clientes (`?page`, `?limit` máx 50). Nunca devuelve token WA, texto de mensajes ni teléfonos |
| GET | `/api/webhook` | No | Verificación webhook Meta (hub.challenge) |
| POST | `/api/webhook` | **Firma HMAC** | Recibir mensajes/status de WhatsApp |

**WhatsApp:** `libs/whatsapp.js` llama a `graph.facebook.com/${META_GRAPH_VERSION}`. Cada user guarda `tokenWhatsapp`, `phoneNumberId`, `waBusinessId` en MongoDB. El token WA se **cifra** con AES-256-CBC (`utils/crypto.js`, key derivada de `TOKEN_SECRET`); **`decrypt` se llama en cada mensaje/plantilla saliente y sync**. El **IV se genera dentro de `encrypt()`**, uno nuevo por cifrado, y viaja como prefijo `iv:ciphertext` — no puede volver a nivel de módulo (eso reusaría el mismo IV en todo el proceso y, como todos los tokens de Meta empiezan por `EAA...`, los primeros bloques cifrados saldrían idénticos). Las **API keys** en cambio se **hashean** (SHA-256, `hashApiKey`) — irreversibles. El interceptor de `whatsappApi` preserva el error de Meta en `err.waErrorCode` / `err.waErrorDetail`.

**Embedded Signup (objetivo central — SaaS multi-cliente):** que cada cliente conecte su WhatsApp con "login con Facebook". Frontend: `libs/facebookSdk.ts` (carga el SDK) + `useConnectWhatsapp` (popup con `config_id`, captura `code` + `phone_number_id` + `waba_id`) → `POST /api/whatsapp/connect`. App Review de Meta aprobado: clientes reales pueden conectarse en producción. En local el frontend se expone con **ngrok** (dominio fijo) y Vite proxya `/api` → `localhost:3001`.

**API pública de plantillas (`sendTemplateController`):** autenticada por API key. Descifra el token WA del user, envía la plantilla a Meta (parámetros posicionales `["Juan"]` o nombrados `[{name,value}]`), persiste la conversación + `Message` (con `status`; si Meta rechaza, `status:'failed'` + error), y **emite `message_created` por SSE** para que aparezca en vivo en la UI del dueño.

**Botones de plantilla (`buildButtonComponents`):** el `sub_type` que espera Meta **se deduce de la definición guardada** (`Template.buttons`), no del `subType` que mande el cliente — ese campo quedó opcional, solo como respaldo si la plantilla nunca se sincronizó. Es necesario porque el mismo botón «Copiar código» se envía como `sub_type:'url'` + `{type:'text'}` en una plantilla `AUTHENTICATION` y como `sub_type:'copy_code'` + `{type:'coupon_code'}` en una de cupón, y por fuera son idénticos. Se rechaza con **400, antes de llamar a Meta**, el índice inexistente (Meta lo aceptaba y descartaba el parámetro en silencio) y el botón de URL fija sin `{{1}}` (Meta respondía 132018). `sendTemplateController` re-sincroniza la plantilla si el documento es anterior a este cambio, detectándolo por la ausencia de `parameterFormat`.

**Cabecera de las plantillas (`utils/template.header.js`, `TemplateMedia`):** Meta aprueba el **formato** de la cabecera (imagen, vídeo, documento, texto), no su contenido: el archivo es un parámetro que va en **cada envío**, como las variables. La imagen de ejemplo de la plantilla solo sirve para la revisión; sin parámetro Meta responde **132012** («expected IMAGE, received UNKNOWN»), que es lo que pasaba antes (2026-10-04).
- La sincronización guarda `Template.header` (`{ format, text }` o `null`; **sin default**: `undefined` = sincronizada antes y se re-sincroniza, en `GET /templates` y en `processTemplateSending`).
- Cada plantilla con imagen/vídeo/documento tiene **su archivo guardado** (`Template.headerMedia` → `TemplateMedia`), que se sube en Plantillas, columna «Cabecera». En disco: `MEDIA_DIR/templates/<sha256>.<ext>` (dentro del volumen `media`). Topes: imagen JPG/PNG 5 MB, vídeo MP4/3GP 16 MB, documento PDF 16 MB (Meta admite 100, se baja a propósito). nginx admite 20 MB en `/api/`.
- **Subida a Meta perezosa:** `ensureMetaMediaId` (`services/template.media.service.js`) la sube al enviar la primera vez (`POST /{phone-number-id}/media`, multipart) y reutiliza el id hasta los 25 días o si cambia el número; dentro del `try` del envío, así un token caducado queda como cualquier rechazo. En modo de prueba no se sube nada. Subir en Plantillas no llama a Meta.
- `processTemplateSending` añade el componente `header` antes del cuerpo y guarda el archivo en el `Message` (`type`, `mediaFile`…), así el chat lo enseña con `/api/media/<id del mensaje>`. Sin archivo, o con un formato no soportado (texto **con variable**, ubicación), rechaza con **400 antes de Meta** (`templateHeaderIssue`); los selectores lo enseñan deshabilitado con el motivo y `validateCampaignMessage` lo exige.
- Una campaña **congela** `header` + `headerMedia` al crearse; cambiar o quitar la imagen después no le afecta (por eso un `TemplateMedia` nunca se borra). Si falta su archivo en disco se pausa solo (`pauseReason.code = 'template_header'`); el 132012 está en `CAMPAIGN_STOPPING_ERRORS`.
- **Archivo por campaña** (2026-10-04, diseño v2 el 2026-10-05): en el paso 2 del asistente, `HeaderMediaField` (`components/HeaderMediaField/`, sin dependencias del asistente: se adapta a su **contenedor** con `@container`, para reutilizarlo en el diálogo del chat) enseña el archivo de la plantilla («De la plantilla») y deja usar otro solo para esa campaña (`POST …/header-media/files`, que no toca la plantilla), también arrastrándolo. La subida la lleva `useHeaderMediaUpload`: valida tipo y peso antes (`headerFileIssue`, la misma que usa Plantillas), cuenta el progreso, se puede cancelar y bloquea «Siguiente» mientras dura. Si la plantilla no tiene ninguno se sube ahí: las plantillas con cabecera de archivo ya **no salen deshabilitadas** en el asistente (`bulkDisabledReason`), solo las de un formato que no se sabe enviar. El borrador guarda `headerMedia` (se borra al cambiar de plantilla) y la vista previa y la creación reciben `headerMediaId`: `withCampaignHeader` comprueba que es de la cuenta, del formato (`headerMediaMismatch`, puro) y que sigue en disco, y la campaña lo congela en lugar del de la plantilla. Con la casilla «Usar también como imagen de la plantilla» (`saveHeaderAsDefault`) pasa a ser el de la plantilla **al crear la campaña**. Sin archivo, el error de `validateCampaignMessage` es del campo `headerMedia`, no de `templateId`.
- **Pendiente:** el mismo campo al enviar a un solo contacto (diálogo del chat y conversación nueva), el campo `header` en la API pública, cabecera de texto con variable, y plantillas de carrusel (sin `HEADER`, con tarjetas: no se detectan y fallarían en Meta).

**Adjuntos (fotos, audios, documentos):** Meta no manda el archivo en el webhook, manda un `mediaId`. `descargarAdjunto` (en `webhook.controller.js`) resuelve `GET /{media-id}` → URL temporal, baja los bytes y los guarda en `MEDIA_DIR` con el nombre `<mediaId>.<ext>`. Se hace **síncrono, antes de crear el `Message`**, para que cuando el mensaje llegue por SSE la foto ya se pueda pintar — cuesta unos cientos de ms de webhook y ahorra una cola y un segundo evento. **Nunca tumba el mensaje**: si la descarga falla (token caducado, archivo enorme, Meta caída) devuelve `mediaFile: null` y el mensaje se guarda igual con su etiqueta.

El webhook trae también una `url` ya resuelta, pero **caduca en horas** mientras que el `mediaId` sirve los 30 días que Meta guarda el archivo; por eso se pasa siempre por el id, y así el mismo código sirve para reintentar una descarga vieja. El tope es `MEDIA_MAX_BYTES` (25 MB) y se comprueba con el `file_size` que devuelve Meta **antes** de bajar nada.

**Servir los adjuntos (`GET /api/media/:id`):** el `:id` es el del **mensaje**, no el del archivo, para que la comprobación de propietario sea la de siempre (mensaje → conversación → `userId`) y no se pueda pedir el archivo de otro conociendo su `mediaId` — que viaja en los payloads de Meta. Un usuario ajeno recibe **404, no 403**: un 403 confirmaría que ese mensaje existe. `utils/media.storage.js` es el único sitio que construye rutas: el nombre sale del `mediaId` validado contra `/^\d{1,64}$/` y `rutaDeArchivo` vuelve a comprobar que no se ha salido del directorio. Un mime desconocido se guarda como `.bin` y se sirve como `application/octet-stream`, para que el navegador lo descargue en vez de interpretarlo.

**`caption` vs `text`:** `text` cae a la etiqueta («Imagen») cuando el contacto no escribió nada, porque es lo que se ve en la bandeja. `caption` guarda **solo** lo que escribió de verdad, y es `null` si no escribió. Sin esa distinción la UI pondría «Imagen» debajo de una imagen que ya se está viendo.

**Ventana de 24 h de WhatsApp:** Meta solo entrega texto libre dentro de las 24 h siguientes al **último mensaje del contacto**; fuera de eso, solo plantillas aprobadas (si no, error 131047). El backend guarda `Conversation.lastInboundAt` y `utils/whatsapp.window.js` (`getWindowExpiry`, puro y testeado) es **el único sitio donde vive ese «24»**. Al frontend no se le manda un booleano — caducaría en cuanto pasa el tiempo — sino `windowExpiresAt` (ISO o `null` si el contacto nunca escribió), que la UI compara con su propio reloj. Lo publican `GET /api/chats`, el `message_created` de los entrantes y el `conversation_updated` de los entrantes no-texto.

**El backend también frena el texto libre fuera de ventana** (2026-10-04): `sendMessageController` mira `freeTextBlockReason` (puro, en `whatsapp.window.js`: `null`, `'closed'` o `'never'`) antes de llamar a Meta y responde **409** con el motivo, sin guardar ningún `Message`. La UI ya lo impedía; esto cubre lo que se cuele (otra pestaña, la ventana que se cierra mientras se escribe), y el front marca la burbuja optimista como fallida con ese texto. Sin conversación (un número nuevo) cuenta como `never`. Si a la conversación le falta `lastInboundAt` (anterior al campo, sin backfill), se busca su último `Message` entrante antes de bloquear. Las plantillas no pasan por aquí: abren la conversación.

**Plantilla desde el chat (`sendConversationTemplateController`):** la lógica de envío se extrajo de `sendTemplateController` a **`processTemplateSending`** (en `template.controller.js`), que no sabe nada de HTTP: los errores de negocio salen como `Error` con `statusCode` y quien la llama decide la respuesta. La usan la API pública y esta ruta. El destinatario **sale de la conversación**, no del body, y el `findOne({ _id: id, userId })` es la comprobación de propiedad — sin ese filtro cualquier sesión podría escribir en la conversación de otro. Envía la plantilla pero **no toca `lastInboundAt`**: enviar no reabre la ventana, solo un mensaje del contacto.

**Contactos (`Contact`, `contact.controller.js`):** hasta el 2026-10-01 la persona *era* la conversación (`contactPhone` + `contactName`). Ahora es un documento propio y la conversación apunta a él con **`Conversation.contactId`**. Una conversación por contacto y cuenta.
- **Dos identidades.** Desde abril de 2026 Meta identifica a cada persona por el teléfono (`wa_id`) **y** por el **BSUID** (`user_id`, p. ej. `EC.1349…`, propio de cada negocio). Si la persona activó su nombre de usuario de WhatsApp y no habló con el negocio en 30 días, **el teléfono no llega**. Por eso un contacto necesita al menos uno de los dos (`pre('validate')`), `Conversation.contactPhone` pasó a ser opcional y `whatsappRecipient` manda `to` (teléfono, preferido) o `recipient` (BSUID). `utils/contact.identity.js` es **el único sitio** que conoce cómo los manda Meta. Las plantillas `AUTHENTICATION` solo aceptan teléfono: `processTemplateSending` rechaza con 400 antes de llamar a Meta.
- **Un solo camino de alta.** `resolveContact` (busca por BSUID primero, luego teléfono; crea si no existe) lo usan el webhook (`source:'inbound'` o `'ad'` si trae `referral` de un anuncio Click-to-WhatsApp), el envío desde la UI (`'manual'`) y la API pública (`'api'`). Una carrera de dos webhooks del mismo número nuevo la resuelve el E11000: el perdedor usa el que ganó.
- **Qué se actualiza solo** (`mergeContactUpdates`, puro): teléfono y BSUID solo **rellenan** el hueco (un mensaje no cambia la identidad); `profileName` y `username` son de la persona y se pisan siempre; `name` es el que pone quien usa Wasmish y **nunca** lo pisa WhatsApp, solo se rellena si no hay. Si el identificador nuevo ya es de **otro** contacto (uno nació solo con teléfono y otro solo con BSUID) no se fusionan: un webhook no debe decidir eso, se loguea y sigue.
- **El nombre que se ve** sale de `contactDisplayName`: `name` → `profileName` → `@username` → teléfono → «Contacto de WhatsApp». `listConversations` hace `populate('contactId')` y lo usa como `title`.
- **Conversaciones anteriores** a los contactos se enlazan **al tocarlas** (`getConversationContact` / `linkConversation`), sin cambiarles el `updatedAt`, y su `contactName` (ya **obsoleto**) pasa al contacto si este no tiene nombre. Con eso, correr o no el backfill no rompe nada.
- **Enviar a un número nuevo no crea el contacto antes de tiempo**: `getSendingRecipient` devuelve solo `{ phone }`, y `getSendingConversation` crea contacto + conversación **después** del envío (haya salido o fallado). Un envío que ni sale (plantilla inexistente, botón mal puesto) no deja contactos huérfanos.
- **Edición:** solo `phone`, `name`, `email`, `company`, `notes` (`pickContactFields`); lo que pone WhatsApp se ignora aunque venga en el body. El teléfono se guarda **solo dígitos** (`phoneNumberSchema`, el mismo de `startConversationTemplateSchema`): con `+` o espacios no casaría con el `wa_id` del webhook y nacería un duplicado. La búsqueda escapa el texto (`escapeRegex`) y busca el teléfono por sus dígitos.
- **Baja de publicidad** (`marketingOptOut`, `marketingOptOutAt`, `marketingPreferenceAt`). La persona la pide desde WhatsApp («Dejar de recibir ofertas» en una plantilla de marketing, o «Reanudar») y la escribe **solo el webhook**, por dos caminos: el campo `user_preferences` (`value: 'stop' | 'resume'`) y el error **131050** en un acuse `failed`, que la confirma aunque el otro aviso no llegue. La lógica es pura, en `utils/marketing.preference.js`: Meta no garantiza el orden, así que `marketingPreferenceAt` guarda la fecha del último cambio y se ignora lo más viejo; **el empate lo gana el que llega después** (Meta da la hora en segundos, y una baja y un alta en el mismo segundo no pueden dejar de baja a quien se arrepintió). `applyMarketingPreference` repite esa condición en el filtro del update para que dos webhooks simultáneos no se pisen, y solo devuelve el contacto si cambió el estado; entonces se emite `contact_updated`. Un aviso de alguien que no es contacto se ignora: no se crea. Los envíos a contactos de baja **no se bloquean, a propósito** (decisión de Jonathan, 2026-10-04): salen hacia Meta, que los rechaza con el 131050, y así queda registrado el `Message` fallido de cada intento.
- **Cambio de número** (webhook `user_id_update`). WhatsApp **regenera el BSUID cuando la persona cambia de número**, y avisa con el BSUID viejo, el nuevo y el teléfono actual en `wa_id` (que puede no venir). `describeUserIdUpdate` (puro, en `contact.identity.js`) lo lee y `applyUserIdUpdate` busca el contacto **por el BSUID viejo** y le cambia los dos: es la misma persona y conserva su conversación (la regla de no editar el teléfono es para quien usa Wasmish, no para WhatsApp). También pone al día `Conversation.contactPhone` al momento, o `findConversationByNumber` seguiría encontrando la conversación por el número viejo. Sin este aviso, el siguiente mensaje sin teléfono abría un contacto y una conversación nuevos. Si el BSUID o el número nuevos ya son de **otro** contacto (escribió desde el número nuevo antes de que llegara el aviso) no se toca nada: fusionar no lo decide un webhook. Un reintento del mismo aviso ya no encuentra el BSUID viejo y se ignora. Emite `contact_updated`. Se prueba con `webhook:simulate -- cambio-numero --new-from <número>`.
- **Requisito en Meta:** los campos `user_preferences` y `user_id_update` tienen que estar marcados en *App Dashboard → WhatsApp → Configuración → Campos del webhook*. Sin ellos Meta no los manda: de las bajas solo funciona el camino del 131050, y los cambios de número no llegan. Marcarlos no toca la URL del webhook.

**Etiquetas (`Tag`, `tag.controller.js`, `services/tag.service.js`)** (2026-10-05): segmentan contactos para las campañas («todos los VIP»). Lista propia por cuenta, sin colores, 0..20 por contacto (`Contact.tags`, ids). `Tag.key` (`tagKey`, puro en `utils/contact.tags.js`) es el nombre sin mayúsculas, tildes ni espacios de más, con índice único: «VIP», «vip » y «Vip» son una, y crear al vuelo nunca duplica. Los contactos devuelven solo `tagIds`; los nombres los pone el front con `GET /tags`. Un `tagIds` con un id ajeno → 400 (`resolveOwnedTagIds`). Filtrar por varias es **alguna de** (`$in`, en `buildContactMatch`, puro): la comparten la lista y `selectionQueryStages`, así que `recipients.query.tagIds` de una campaña repite exactamente el filtro de Contactos. El etiquetado en bloque es un update de pipeline (`(tags − remove) ∪ add`) solo donde cabe en 20. `contactSelectionSchema` (en `contact.schema.js`) es la selección compartida por campañas y etiquetado. Diseño: `docs/superpowers/specs/2026-10-05-etiquetas-importar-design.md`. La UI (2026-10-06) está en «Etiquetas en la UI», más abajo.

**Importar contactos (`contact.import.controller.js`, `utils/contact.import.js`)** (2026-10-05, solo backend): el navegador lee el CSV/Excel y empareja columnas; llegan filas ya emparejadas (`phone`, `name`, `lastName`, `email`, `company`, `notes`, `tags`) con su número de fila del Excel. La vista previa y la importación hacen el mismo plan, puro: `planImportRows`.
- **Teléfono** con `libphonenumber-js/max` (`normalizeImportPhone`): `0991…`, `+593 99…`, `00593…` y el número sin el 0 que deja Excel pasan a `593…` con el país elegido; los que traen otro código se respetan. La notación científica de Excel es **error** (ya perdió dígitos). Un fijo se importa con aviso. Ojo: los teléfonos de `seed:contacts` (`59300099xxxx`) **no** son válidos para el importador.
- **Solo el teléfono es error**; un email inválido o un texto largo son avisos (se descarta o se recorta el campo). Nombre + Apellido se juntan. Los repetidos en el archivo se juntan (gana el primer valor no vacío, las etiquetas se suman).
- **Completar, nunca pisar**: a un existente solo se le rellena lo vacío y se le añaden etiquetas; la baja de publicidad no se toca. La escritura (`importUpsert`) es un upsert de pipeline por teléfono con `$ifNull` campo a campo, así que lo que se edite a mano entre la vista previa y la importación no se pisa, y repetir la importación no duplica. Va por `Contact.collection.bulkWrite` (sin Mongoose: los defaults de un contacto nuevo se ponen en el pipeline); un E11000 (un webhook creó el número a la vez) se reintenta y completa. `source: 'import'`.
- La vista previa trae el archivo entero: `/api/contacts/import` tiene su propio `express.json` de 3 MB **antes** del general (100 KB).
- Plantilla descargable: `Frontend/public/plantilla-contactos.xlsx` (Teléfono en formato texto), generada con `Frontend/scripts/build-contacts-template.py`. Archivos con los casos malos para probar a mano en `Backend/scripts/fixtures/`.

**Campañas (`Campaign`, `campaign.controller.js`, `workers/campaign.worker.js`):** una plantilla a muchos contactos, personalizada por contacto.
- **Destinatarios** (`recipients`): `{ mode:'ids', contactIds }` o `{ mode:'query', search, filter, excludeIds }` («todos los que coinciden»), que repite **exactamente** la consulta de la lista de Contactos (`contactSelectionStages`, compartida con `listContacts`). Tope `CAMPAIGN_MAX_RECIPIENTS` (5000). La lista se **congela** al crear: un `CampaignRecipient` por contacto, índice único `{campaignId, contactId}` (un repetido se envía una vez).
- **El mensaje** (`utils/campaign.message.js`, puro): cada variable del cuerpo y cada botón que pide valor (cupón, URL con `{{ }}`) tiene `source` = `fixed` (texto para todos) o un campo del contacto (`name`, `firstName`, `company`, `phone`, `email`) con **reserva obligatoria**, porque Meta rechaza un parámetro vacío y cualquier dato puede faltar. `cleanValue` quita saltos de línea, tabuladores y espacios repetidos (Meta rechaza el parámetro). `validateCampaignMessage` exige plantilla `APPROVED` y categoría `MARKETING`/`UTILITY`: las de autenticación no van en masivo. La campaña guarda una **copia** de la plantilla: lo que se envía es lo que se revisó.
- **Bajas:** la baja es solo de publicidad, así que `excludeOptedOut` **solo cuenta con plantillas de marketing** (`shouldExcludeOptedOut`, en `utils/campaign.status.js`): con una de utilidad se les envía igual, y sin plantilla (paso 1) no se excluye a nadie. La campaña guarda el valor ya resuelto. En la UI el aviso y la casilla «Excluirlos» salen en el **paso 2**, solo al elegir una de marketing, y **empiezan marcados** (decisión de Jonathan, 2026-10-04); desmarcarla los envía y queda el rechazo 131050 registrado. `recipientSkipReason` se mira al crear y **otra vez antes de enviar**.
- **El worker** corre en el proceso de la API (`index.js` lo arranca tras conectar a Mongo) y usa `CampaignRecipient` como cola: pasa un `pending` a `sending` con `findOneAndUpdate` atómico y llama a `processTemplateSending` con `contact`, la plantilla ya resuelta y `campaignId`. Una campaña activa **por cuenta**, un envío por campaña y vuelta, `CAMPAIGN_RATE_PER_SECOND` (10) sumando todas. Estados: `queued → sending → completed`, más `paused`/`cancelled`. Se **pausa solo** ante un error de cuenta o de plantilla (`CAMPAIGN_STOPPING_ERRORS`: token caducado, cuenta bloqueada, plantilla pausada…, y el 409 de WhatsApp desconectado), con `pauseReason`; ante un 130429 frena 10 s. No hay reintentos: un mensaje por destinatario.
- **Reinicios:** al arrancar, un destinatario en `sending` pasa a **`interrupted`** y no se reintenta (no se sabe si Meta lo recibió; mejor uno sin enviar que uno repetido). `SIGTERM`/`SIGINT` dejan terminar el envío en curso. Supone **una sola instancia** de la API.
- **Estadísticas** (`buildCampaignStats`, pura, en `utils/campaign.status.js`; la usa `services/campaign.service.js`): la cola (`CampaignRecipient.status`) más los `Message` con `campaignId`, que el webhook va moviendo a entregado/leído/fallido. `done` = se creó su Message; `failed` en el destinatario = error antes de Meta, sin Message.
- **Modo de prueba `CAMPAIGN_DRY_RUN`:** no llama a Meta (`fakeTemplateSend`) y simula el 131050 de un dado de baja con plantilla de marketing. **Encendido por defecto fuera de producción**: en local una campaña de verdad mandaría WhatsApps reales a los contactos de la BD. El Dockerfile fija `NODE_ENV=production`, que lo apaga en el servidor. Cada campaña guarda `Campaign.dryRun` al crearse y el worker no llama a Meta si el flag **o** el campo están encendidos: lo creado como prueba nunca sale de verdad aunque el servidor arranque después sin el modo. La vista previa devuelve `dryRun` y la UI lo avisa en el paso 3, en el detalle y con la píldora «Prueba». Ojo: en modo de prueba **no se comprueba el token de WhatsApp** — un token caducado no hace fallar nada.

**Flujo de mensaje saliente (`sendMessageController`):**
1. Con `id` (params) busca la conversación con `findOne({ _id: id, userId })` — es la comprobación de propiedad; sin `id`, el destinatario es `destinationNumber` (body) y se reutiliza la conversación de su contacto si existe
2. Decripta `user.tokenWhatsapp` → llama Meta Cloud API con el destinatario del contacto (teléfono o BSUID)
3. `getSendingConversation` da la conversación (la crea con su contacto si no existía); se actualiza `lastMessage` y **`lastMessageAt`** — nunca `updatedAt`, que Mongoose pisa en el `save()` por `timestamps: true` y que además no es el campo por el que ordena `listConversations`. La conversación y el `Message` comparten un único `const now` para que el orden de la lista y el cursor de paginación estén en la misma escala
4. Persiste `Message` con `temporalId` (para UI optimista). Si Meta rechaza, guarda igual `status:'failed'` + `errorCode`/`errorDetail` (no se pierde)
5. Emite `message_created` via SSE; el POST responde el mensaje normalizado con `id` real (para que los `message_status` posteriores casen con el optimista del frontend)

**SSE (`stream.controller.js`):** `clients` es un `Map<userId, Set<Response>>`. `sendUser(userId, event, data)` escribe a todos los sockets del usuario. Keep-alive cada 25 segundos.

**Eventos SSE y sus payloads:**
- `message_created`: `{ id, conversationId, sender, text, timestamp, status, temporalId? }` — en los **inbound** (webhook) incluye además `type`, `unreadCount` (el valor real de la BD) y `windowExpiresAt`
- `message_status`: `{ id, conversationId, waMessageId, status, deliveredAt, readAt, failedAt, errorCode, errorDetail }`
- `conversation_updated`: `{ id, unreadCount }` — solo lo emite el reset de no leídos de `listMessages`
- `contact_updated`: `{ id, marketingOptOut, marketingOptOutAt }` en una baja o alta de publicidad; `{ id }` en un cambio de número. `useContacts` refresca la lista y la ficha, y `useConversations` la bandeja (el título y el teléfono salen del contacto)
- `campaign_progress`: la campaña serializada con `stats` — como mucho uno por segundo y campaña, y siempre en los cambios de estado
- `message_created` y `message_status` llevan `campaignId` si el mensaje salió de una campaña. Una campaña grande dispara cientos seguidos: la bandeja y Contactos los agrupan con `useThrottledInvalidate`

**`unreadCount`:** se incrementa en cada mensaje inbound (webhook). Se resetea a 0 en `GET /api/chats/:id/messages` **solo cuando no hay cursor** (`hasCursor === false`, o sea al abrir el chat) — paginar hacia atrás en el historial no es leer, y si reseteara siempre, un mensaje que llegue mientras el usuario hace scroll perdería su badge. El `updateOne` filtra por `unreadCount: { $gt: 0 }` y solo emite `conversation_updated` si `modifiedCount > 0`, para no inundar el SSE al reabrir chats ya leídos.

**Webhook entrante (`webhook.controller.js`):**
- **Firma obligatoria.** `POST /api/webhook` pasa por `verifyWebhookSignature`: HMAC-SHA256 del **cuerpo crudo** (`req.rawBody`, guardado en el `verify` de `express.json` en `app.js`) con `META_APP_SECRET`, comparado con `X-Hub-Signature-256` usando `timingSafeEqual`. Hay que validar sobre los bytes originales: re-serializar `req.body` cambia el orden de claves y la firma nunca cuadra. **Falla cerrado** — si `META_APP_SECRET` falta, rechaza todo con 401 (y avisa por `console.error` al arrancar). Confirmar esa variable en el `.env` del servidor antes de desplegar, o los clientes dejan de recibir mensajes.
- **Transiciones de estado monótonas.** La lógica vive en `utils/message.status.js` (`resolveStatusTransition`, función pura y testeada; devuelve `null` si no hay que hacer nada). `STATUS_RANK = { sent: 0, delivered: 1, read: 2, failed: 3 }`: un webhook solo se aplica si **sube** de rango. Meta no garantiza orden ni unicidad, así que un `delivered` que llega después de un `read` haría retroceder el estado. Si `read` llega sin `delivered` previo, se infiere `deliveredAt` con el mismo timestamp (leído implica entregado). Si el estado no avanza, se hace `continue` — tampoco se emite `message_status`.
- **Se guarda todo entrante, no solo el texto.** `utils/inbound.message.js` (`describeInboundMessage`, pura y testeada) traduce la forma que manda Meta — `image.caption`, `document.filename`, `button.text`, `interactive.button_reply.title`… — a `{ type, text, mediaId, mimeType }`, y a partir de ahí **todos los tipos siguen el mismo camino**: `Message`, `lastMessage`, `unreadCount++` y `message_created`. Es el único sitio que conoce esas formas.
- **`text` nunca sale vacío.** `Message.text` es `required`, y un throw dentro del webhook hace que Meta reintente y que el mensaje del cliente acabe perdiéndose. Por eso todo tipo tiene etiqueta de reserva («Imagen», «Nota de voz», el nombre del archivo) y hasta un tipo que Meta invente mañana cae en «Mensaje no compatible». Es el test que más importa de `inbound.message.test.js`.
- **Lo que Meta no entrega, lo nombra igual.** Una encuesta llega como `{ type:'unsupported', errors:[…], unsupported:{ type:'poll_creation' } }` — comprobado con un webhook real. `ETIQUETAS_NO_SOPORTADO` traduce ese subtipo («Encuesta») y, si no lo conoce, cae al genérico antes que enseñar el nombre en inglés de Meta. La lista crece según aparezcan tipos nuevos en producción.
- **Un mensaje roto no tumba el lote.** El cuerpo de cada bucle vive en `procesarEntrante` / `procesarEstado`, y `handleWebhook` los llama envueltos en `try/catch`. Si el error subiera, la respuesta sería 500 y **Meta reintentaría el lote entero** y habría que volver a procesar lo que ya se guardó (el índice único de `waMessageId` evita el duplicado, pero no el trabajo ni el ruido). Con el catch, Meta recibe 200 y como mucho se pierde el que venía mal, con su `waMessageId` y su `type` en el log.
- **Cuatro listas por `value`:** `messages`, `statuses`, `user_preferences` (bajas de publicidad) y `user_id_update` (cambios de número), las dos últimas en Contactos; cada elemento en su propio `try/catch`.
- **Los `system` se ignoran** (avisos del tipo «este contacto cambió de número»): `describeInboundMessage` devuelve `null`, no se guardan y **no abren la ventana**.
- **`lastInboundAt` solo avanza**, igual que el estado: `if (!conversation.lastInboundAt || timestamp > conversation.lastInboundAt)`. Un webhook viejo que llegue tarde cerraría la ventana antes de tiempo.
- **Quién escribe sale de `value.contacts`**, no solo de `messages[].from`: `describeInboundContact` casa el perfil por teléfono o BSUID (con varios remitentes en un lote, coger el primero pondría el nombre de otra persona). Un entrante **sin teléfono ni BSUID** se descarta con un `warn`. Antes, uno sin teléfono reventaba al crear la conversación (`contactPhone` era `required`) y el mensaje se perdía.
- La conversación nueva (`findOrCreateConversation`) se crea con **`unreadCount: 0`**, no 1: el `+1` de más abajo corre también para ella y el primer mensaje de un contacto nuevo salía con badge 2. Si Meta revela el teléfono de alguien que antes escribió solo con usuario, se copia a `contactPhone`.

**Índices MongoDB relevantes:**
- `Conversation`: `conversation_contact_unique` = `{ userId: 1, contactId: 1 }` único **parcial** (`contactId: { $type: 'objectId' }`) — una conversación por contacto; parcial para que las anteriores a los contactos, sin `contactId`, no choquen entre sí. Más `contactId_1` simple, para el `$lookup` de la lista de contactos. El viejo `userId_1_contactPhone_1` ya **no existe** (lo borra `backfill:contacts`): un contacto puede no tener teléfono.
- `Contact`: `contact_phone_unique` `{ userId, phone }` y `contact_waUserId_unique` `{ userId, waUserId }`, únicos **parciales** por `$type: 'string'` — el mismo motivo que `waMessageId_unico`: los dos campos pueden ser `null`
- `Message`: `{ conversationId: 1, timestamp: 1 }`
- `Message`: `campaignId_status` `{ campaignId: 1, status: 1 }`, normal (ni parcial ni sparse, ver el comentario en el modelo) — las estadísticas de una campaña
- `CampaignRecipient`: `{ campaignId, contactId }` único y `{ campaignId, status, _id }` (la cola y los conteos). `Campaign`: `{ userId, createdAt: -1 }` y `{ status, createdAt }` (el worker)
- `Message`: **dos** índices sobre `waMessageId`, y hacen falta los dos. `waMessageId_unico` es único **parcial** (`$type: 'string'`, no `sparse`: los fallidos se guardan con `null` explícito y dos `null` chocarían) — frena el duplicado cuando Meta reintenta un webhook; `procesarEntrante` trata el E11000 como «ya guardado» y sale sin emitir SSE. `waMessageId_busqueda` es el normal: Mongo no usa el parcial para `{ waMessageId: 'wamid.x' }` y cada acuse de recibo haría un escaneo completo.

---

### Frontend (`Frontend/src/`)

React 19 + TypeScript + Vite + Tailwind v4. Estado: React Query v5 (server state) + React Context (auth, aviso global).

**Provider tree** (`main.tsx`):
```
QueryClientProvider
  └── AuthProvider          ← auth state, login/signup/logout
        └── SSEProvider     ← UNA sola conexión SSE global (pub/sub), solo con sesión
              └── NoticeProvider  ← aviso global (notificación arriba a la derecha)
                    └── App       ← renderiza <Notice /> + children
                          └── AppRouter
```

**Routing** (`AppRouter.tsx`):
- Público: `/login`, `/register`
- Protegido: `/*` → `PrivateGuard` → `PrivateRouter` → páginas bajo `PrivateLayout`
- Constantes de rutas en `models/routes.models.ts` (`AppRoutes`) — **no hardcodear strings de rutas**.

**Páginas privadas:** `quickStart` (destino de `/`), `chats`, `contacts`, `campaigns` (Campañas: lista, `campaigns/new` el asistente y `campaigns/:id` el detalle — rutas completas en `CampaignPaths`), `templates`, `docs` (documentación de la API pública), `settings`, y `admin` — esta última solo se registra en `PrivateRouter` si `user.rol === 'superadmin'`. `AppRoutes.private.dashboard` y `pages/private/DashboardPage` existen pero no están enrutados.

**`AuthProvider` — lógica no obvia:**
- `isLoading = !authChecked || loginMutation.isPending`
- `authChecked` se setea en `true` cuando `isVerifying` (de `useVerifyLogin`) termina
- `PrivateGuard` bloquea el render hasta que `isLoading` sea `false`
- Si `verifyData` llega → setea `user`; si `verifyError` → setea `user = null`

**Flujo de datos:**
- Todas las llamadas HTTP van por `services/api.service.ts` (base URL `http://localhost:3001/api`, `withCredentials: true`)
- Cada feature tiene un hook en `hooks/` que envuelve una mutation o query de React Query
- SSE: **una sola conexión global** vía `SSEProvider` (`context/sse.provider.tsx`). Los hooks se **suscriben** con `useSSE().subscribe(evento, handler)` (devuelve la función de des-suscripción); ya no abren su propia conexión. `createSSEConnection("stream", handlers)` se usa solo dentro del provider. Base URL relativa (`/api`) → pasa por el proxy de Vite
- **Reconexión del SSE:** si el servidor responde con error (un reinicio de nodemon tras el proxy de Vite da 500, un despliegue da 502), `EventSource` se rinde para siempre. El `SSEProvider` reconecta él mismo con espera creciente (1 s → 30 s) y, al volver tras un corte, hace `queryClient.invalidateQueries()` (solo se vuelven a pedir las de pantalla), porque los eventos del corte se perdieron. En dev había además una conexión **zombi**: el proxy de Vite no cerraba la respuesta al navegador cuando el backend moría, así que ni había error ni reconexión. Lo arregla el `configure` del proxy en `vite.config.ts`, que la destruye cuando se cierra la del backend

**`useConversationMessages` — patrón crítico:**
- `useInfiniteQuery` con cursor `?limit=50&before=<ISO timestamp>`
- El cursor `nextCursor` viene del backend como el `timestamp` del último mensaje de la página
- SSE `message_created`: si `temporalId` ya existe en el cache → **no agrega el mensaje** (deduplicación de UI optimista)
- SSE `message_status`: actualiza en-place el mensaje por `id` en todas las páginas del cache
- Se **suscribe** al `SSEProvider` global (ya no abre su propia conexión); filtra eventos por `conversationId`

**Nunca mutar el cache de React Query.** `[...oldData.pages]` es una copia **shallow**: `newPages[0]` sigue apuntando al mismo objeto de página que está en el cache y en el snapshot de rollback de `onMutate`. Escribir `newPages[0].items = ...` corrompe ambos y rompe el structural sharing (renders omitidos o datos viejos en pantalla). El patrón correcto — en `onMutate` y en `onSuccess` de `useConversationSendMessages` — es `newPages[0] = { ...newPages[0], items: ... }`.

**`useConversations` — reglas del handler de `message_created`:**
- **Reordena**: tras el `map`, ordena por `updatedAt` desc para replicar en vivo el `lastMessageAt: -1` del backend. Sin eso, el chat con mensaje nuevo se queda hundido hasta el próximo refetch.
- **Enviar no es leer**: para `sender === 'me'` el `unreadCount` **no se toca** (`(c.unreadCount ?? 0)`, nunca `0`). El reset tiene un solo dueño: el evento `conversation_updated`.
- Para mensajes entrantes prefiere `payload.unreadCount` (el valor real de la BD, que el webhook ya manda) sobre el `+1` local, que queda de respaldo — así no se desincroniza con varias pestañas abiertas.
- `windowExpiresAt: payload.windowExpiresAt ?? c.windowExpiresAt` — un mensaje propio no trae el campo y **no debe** reabrir la ventana; el `??` conserva el que ya había.

**Ventana de 24 h en la UI (`ChatThread`):** `useConversationWindow(windowExpiresAt)` compara el ISO del backend con el reloj local y hace tick cada 60 s (recalcula al vuelo cuando `expiresAt` cambia, si no la UI quedaría hasta un minuto vieja). Tres estados del composer: normal, aviso naranja bajo el umbral de `WINDOW_WARNING_MS` (2 h), y bloqueado con el botón «Enviar plantilla». `windowBlocked = Boolean(conversation) && !isOpen`: mientras la lista carga no se sabe el estado real, y bloquear por defecto haría parpadear el aviso en cada carga.

**Conversación nueva (`NewConversationPanel`):** no es un modal — ocupa el sitio del hilo, y la bandeja enseña una fila «Borrador» mientras exista. **El borrador sobrevive** a abrir otra conversación, cambiar de página o recargar: `ChatPage` lo guarda en `sessionStorage` (`utils/conversationDraft.ts`, clave con el id del usuario) y la fila lo vuelve a abrir. Solo se borra al pulsar *Descartar*, al enviarlo, al cerrar sesión (`clearAllDrafts` en `logOut`) o al cerrar la pestaña. Nunca va a la BD. `useTemplateForm` arranca con lo guardado y expone `selectedName` aparte de `selected`, porque mientras cargan las plantillas `selected` es `undefined` y guardar ese valor borraría la plantilla elegida. **Solo envía plantillas**: a un número que nunca escribió WhatsApp no le entrega texto libre (131047). Va a `POST /api/chats/template`, que llama a `processTemplateSending` con `destinationNumber` + `contactName`; si el número ya tiene conversación la reutiliza (índice único), y el panel lo avisa antes con «Abrirla». Si Meta rechaza, la conversación queda creada con el mensaje fallido — por eso `useStartConversation` invalida la bandeja también en el error. Los mensajes con `templateName` se pintan en el hilo con «Plantilla · nombre» encima y sus botones debajo (`TemplateButtons`, de la definición sincronizada).

**Contactos (`pages/private/Contacts`):** tabla paginada en el servidor (`DataTable` + `ContactColumns`/`ContactRow`), búsqueda con `useDebouncedValue`, filtros por conversación y baja de publicidad, y la ficha lateral `ContactPanel` (datos, origen —«Escribió él», «Desde un anuncio»…—, actividad y ventana de 24 h con `useConversationWindow`). El estado de cada fila lo resume `contactStatus` (`utils/contactDisplay.ts`): baja de publicidad > sin conversación > ventana abierta/cerrada. Un contacto sin teléfono se muestra por su `@usuario`. `ContactForm` avisa del teléfono duplicado **mientras se escribe** (`useContactByPhone`, que exige coincidencia exacta porque la búsqueda es por subcadena) y además maneja el 409 del backend con «Ver contacto». La lista se refresca con cada `message_created` del SSE, y las mutaciones invalidan también `['conversations']`, porque el nombre del contacto es el título de su chat, y `['tags']`, porque cambian sus números. El botón «Importar» de la cabecera **no hace nada todavía**, a propósito: importar contactos es otro trabajo (el backend ya existe).

**Etiquetas en la UI** (2026-10-06, diseño en `Design/Wasmish Etiquetas.html`):
- Se ven como una **etiqueta de papel** (`TagChip`: radio 4px, borde gris, fondo blanco), para no confundirlas con las píldoras de estado. La columna «Etiquetas» de la tabla **reemplazó a «Origen»** (que sigue en la ficha): las 2 primeras y «+N», con las del filtro activo primero y marcadas (`TagChips`).
- **Filtro** (`TagFilter`, un `Popover`): selección múltiple con el número de contactos de cada una (`contactCount`) y el enlace «Gestionar etiquetas». Activo, se nombra en una franja sobre la tabla con su X y «Quitar filtro», porque cambia a quién se selecciona para una campaña. Cambiarlo con «todos los que coinciden» pide confirmar, como la búsqueda y el filtro: `useContactSelection` guarda `tagIds` en la selección `query`, y el borrador de campaña las lleva en `recipients.query.tagIds`.
- **Etiquetar en bloque** (`BulkTagDialog`, desde la `SelectionBar`; no en modo campaña): Añadir/Quitar, buscar o crear, y los números de la selección de `POST /contacts/tags/summary` («17 ya la tienen», «2 de 3»). El botón dice a cuántos («Añadir VIP a 128 contactos») y el aviso global cuenta el resultado, también los que no cupieron en 20 (`overLimit`). En escritorio flota sobre la barra; en móvil es una hoja inferior. Al terminar se quita la selección.
- **Ficha y formulario:** la fila «Etiquetas» de Datos, con «Cambiar», y `TagSelector` en `ContactForm`. Las etiquetas **nuevas se crean al guardar** (`createMissing`), no al escribirlas: cancelar no deja etiquetas vacías. `utils/tags.ts` replica `tagKey` del backend para que «vip » encuentre «VIP» mientras se escribe.
- **Gestionar** (`TagManager`, panel lateral): renombrar en la fila (avisa del choque antes del 409), borrar con `ConfirmDialog` y el número de contactos, y «Ver contactos» (la lista filtrada solo por esa etiqueta).
- **Paso 3 de la campaña:** la línea «Etiquetas: VIP o ESTÁNDAR» solo si se eligió «todos los que coinciden» con un filtro de etiquetas; marcados uno a uno, no.
- En móvil la `SelectionBar` cambia «Quitar selección» por una X, para que quepan «Etiquetar» y la acción principal.

**Borrador de campaña (`utils/campaignDraft.ts`):** uno por usuario, en **`localStorage`** (no `sessionStorage` como el de Chats: una campaña se prepara con calma y se retoma otro día), con la selección de destinatarios, el paso, la plantilla, las variables, el archivo de la cabecera elegido para la campaña y el nombre. Se borra al enviarlo, al descartarlo o al **cerrar sesión** (`clearAllCampaignDrafts` en `logOut`), para no dejar la lista en un equipo compartido. `selectedCount` guarda cuántos había: con «todos los que coinciden» la búsqueda se repite al reanudar y el número puede cambiar (el paso 1 lo avisa). `useCampaignDraft` lo carga con el id del usuario; `useNewCampaign` (recibe ese mismo store, para que descartarlo se vea en toda la página) pregunta con `DraftConflictDialog` antes de empezar otro.

**Campañas en la UI (`pages/private/Campaigns/`):**
- **Selección en Contactos** (`useContactSelection`): `ids` (los marcados, sobreviven a cambiar de página o de filtro) o `query` («todos los que coinciden», menos los desmarcados). Esta va atada a la búsqueda y al filtro: cambiarlos pide confirmación y la reinicia. `DataTable` acepta `selection` (casillas, cabecera parcial y banner); la barra flotante es `SelectionBar`.
- **Contactos en modo campaña** (`ContactsNavigationState.campaignPick`): `new` desde «Nueva campaña» y `edit` desde «Cambiar selección» del paso 1 (parte de la selección del borrador y vuelve con «Volver a la campaña»). Sin modo, «Enviar plantilla» crea el borrador. Elegir destinatarios se ve como el **paso 1 de la campaña**, no como otra sección: la cabecera es la del asistente (`WizardHeader`, compartida con `NewCampaignPage`), el sidebar marca «Campañas» (lo lee del `state` de la navegación), y la `SelectionBar` se ve desde el principio con la pista «Marca los contactos…» y «Continuar» deshabilitado (`emptyHint`). La primera vez, en modo `new`, sale una explicación de tres pasos; se recuerda en `localStorage` (`hasSeenPickIntro`, fuera del prefijo de los borradores: cerrar sesión no la vuelve a mostrar). En móvil la tabla no tiene cabecera, así que `DataTable` pone encima de las tarjetas la fila «Seleccionar esta página».
- **Asistente** (`NewCampaign/`, estado en `useCampaignWizard`): página, no modal, con el pie fijo. Todo vive en el borrador y se guarda en cada cambio. La validación es la de la vista previa del backend (la misma que al crear); los errores de campo se enseñan tras pulsar «Siguiente», y mientras la vista previa no está al día (`isUpdating`) no se avanza. Las plantillas de autenticación salen deshabilitadas con su motivo.
- **Detalle** (`Detail/`): progreso, cifras acumuladas, embudo enviados→leídos, motivos de fallo (`useCampaignFailures`) y destinatarios filtrables por estado. En el paso 1, «Ver los N» despliega la lista en el sitio (sin ventana), con buscador y scroll infinito (`useOnVisible`). Los filtros usan conteos **exclusivos** (`recipientStateCounts`): las estadísticas son acumuladas (un leído también cuenta como entregado). Los textos de estados viven en `utils/campaignDisplay.ts`; los de los errores de WhatsApp, en `utils/whatsappErrors.ts`, que comparten campañas y chat.
- **Fuera por ahora:** el aviso del límite diario de mensajes de WhatsApp (no hay forma fiable de leerlo; se decidió quitarlo hasta tenerla).

**Ir de la ficha al chat (`ChatsNavigationState`):** la ficha navega a `chats` con `state: { conversationId }` (abrir su conversación) o `state: { draft: { phone, name } }` (empezar una nueva, **reemplazando** el borrador que hubiera sin preguntar). `ChatPage` consume ese `state` una sola vez y lo borra del historial con `navigate(..., { replace: true, state: null })`; si se quedara, recargar la página volvería a pisar el borrador.

**`SendTemplateDialog` + `useSendTemplate`:** **sin UI optimista** — el mensaje lo inserta el `message_created` del SSE; adelantarlo lo duplicaría, porque este envío no lleva `temporalId` con el que deduplicar. Los errores van al **aviso global** (igual que en `NewConversationPanel`, con el texto de `templateSendError`: si rechazó Meta, su código y detalle); el diálogo sigue abierto debajo, sin perder lo escrito. Ojo: el aviso vive en otro portal, así que para el `Dialog` de Headless UI pulsar su X es un «clic fuera» — `handleDialogClose` ignora el cierre mientras el aviso está visible. El diálogo deriva los campos del `bodyText` (`extractPlaceholders`) y **los valores de los botones** de `Template.buttons` (`buttonsNeedingValue`: OTP, `COPY_CODE` y URL con `{{ }}` — el mismo criterio que `buildButtonComponents` en el backend). Sin eso, cualquier plantilla `AUTHENTICATION` fallaba al enviarse desde el chat. Una plantilla sincronizada antes de que existiera `Template.buttons` no muestra esos campos: hay que pulsar *Sincronizar* en la página de Plantillas.

**Errores de WhatsApp en palabras (`utils/whatsappErrors.ts`):** un diccionario de los códigos de Meta (cuenta, ritmo, destinatario, plantilla) con qué hacer cuando hay algo que hacer. Lo usan el «Fallido» de cada mensaje del chat (motivo en palabras, y debajo el código y el texto original de Meta, para soporte), `templateSendError` y las campañas (`failureLabel`). Un código que no esté se enseña con el detalle de Meta, en inglés. Sin código, el error es nuestro (de antes de llamar a Meta) y ya viene en español.

**Mensajes que no son texto:** el backend ya manda el `text` resuelto (el caption, el nombre del archivo o una etiqueta), así que la bandeja no necesita saber nada — pinta `lastMessage` y ya. En el hilo, `MessageTypeIcon` le pone delante el icono de Lucide que corresponde al `type`, y devuelve `null` para `'text'`, que es casi todo el historial: la burbuja normal no cambia. Un `type` desconocido cae en el interrogante, nunca en un hueco. Cuando el mensaje trae archivo (`hasMedia`), `MessageMedia` lo pinta: `<img>` para imagen y sticker, `<video controls>`, `<audio controls>`, y una fila descargable para documentos. La URL es `/api/media/<id>` y es del **mismo origen** que la app (proxy de Vite en dev, nginx en prod), así que la cookie de sesión viaja sola y basta con ponerla en el `src` — sin `fetch` ni blobs. Debajo del archivo solo se pinta el `caption`, nunca la etiqueta.

**`temporalId`:** string generado en el frontend antes de enviar. El backend lo guarda en `Message.temporalId` y lo devuelve en `message_created` SSE. El frontend lo usa para evitar duplicados al recibir el evento de vuelta.

**Hooks disponibles:**
- `useLogin`, `useSignUp`, `useLogOut`, `useVerifyLogin` — auth
- `useConversations` — lista de conversaciones (query + suscripción SSE)
- `useConversationMessages(conversationId)` — mensajes paginados + suscripción SSE
- `useConversationSendMessages` — envío de mensajes (UI optimista; marca `failed` en error)
- `useUpdateWhatsappToken` — carga manual de credenciales de WhatsApp
- `useConnectWhatsapp` — Embedded Signup (SDK de Facebook → `/api/whatsapp/connect`)
- `useConversationWindow(windowExpiresAt)` — cuenta atrás de la ventana de 24 h (tick de 60 s)
- `useSendTemplate` — envío de plantilla a una conversación (sin UI optimista); `useStartConversation`, en el mismo archivo, la conversación nueva
- `useTemplateForm` — estado compartido del formulario de plantilla (elegida, valores, botones, payload); lo usan `SendTemplateDialog` y `NewConversationPanel`
- `useHeaderMediaUpload(template, onUploaded)` — subir el archivo de la cabecera de un envío (progreso, cancelar, error en palabras)
- `useTemplates` — sync + listado de plantillas, y `uploadHeaderMedia` / `removeHeaderMedia` (el archivo de la cabecera; `utils/templateHeader.ts` replica `templateHeaderIssue` para los selectores y `TemplateBubble` pinta la cabecera con `template`)
- `useApiKey` — gestión de API keys (listar / generar / revocar)
- `useContacts(pageIndex, pageSize, search, filter, tagIds)`, `useContact(id)`, `useContactByPhone(phone)`, `useContactMutations` — sección de Contactos (en `useContacts.ts`)
- `useTags`, `useTagSelectionSummary(selection, enabled)`, `useTagMutations` (create/rename/remove/bulk y `createMissing`), `tagError` — etiquetas (en `useTags.ts`)
- `useDebouncedValue` — retrasa un valor (la búsqueda de contactos)
- `useOnVisible(onVisible, enabled)` — centinela de scroll infinito (IntersectionObserver); al reactivarse vuelve a avisar si sigue a la vista
- `useThrottledInvalidate(queryKey, ms)` — invalida como mucho una vez por intervalo (la primera al momento, la última al final). Lo usan `useConversations` (conversaciones nuevas), `useContacts` y `useCampaign`: sin él, una campaña pedía la lista entera en cada evento SSE, y como invalidar cancela la petición en curso, la lista podía no pintarse hasta el final
- `useCampaigns(pageIndex, pageSize)`, `useCampaign(id)`, `useCampaignRecipients(id, state, …)`, `useCampaignFailures(id, enabled)`, `useCampaignPreview(input)` (devuelve también `isUpdating`), `useCampaignAudience(input, search, pageSize)` (infinita), `useCampaignMutations` (create/pause/resume/cancel), `campaignErrors` — campañas (en `useCampaigns.ts`). `campaign_progress` actualiza la campaña en la caché sin pedir nada; el detalle escucha también los `message_status` con su `campaignId`, porque entregas y lecturas llegan horas después. La vista previa espera 400 ms y mantiene la anterior mientras recalcula

**Íconos:** `lucide-react` + `@heroicons/react`. Componentes UI accesibles con `@headlessui/react`.

**Componentes compartidos** (en `components/`, reutilizarlos antes de maquetar a mano): `PageShell`/`PageHeader`, `DataTable` (con `selection` opcional), `BlankState` (lista vacía o error a pantalla completa), `Callout` (avisos, con `action` opcional a la derecha), `ConfirmDialog` (confirmar una acción; `onSecondary` si el botón secundario hace algo más que cerrar), `Checkbox` (con estado parcial y área de toque de 44px), `SelectField` (desplegable nativo con el aspecto de `AuthField`), `ProgressBar`, `SearchInput` (la caja con lupa de la bandeja, Contactos y los destinatarios), `Pill`, en `components/Tag/` `TagChip`/`TagChips` (una etiqueta y las de una fila) y `TagSelector` (buscar, crear y quitar escribiendo), y en `components/Chat/` `TemplatePicker` (genérico, con `disabledReason`), `CategoryPill`, `TemplateBubble` (con `highlights` para marcar dato o reserva) y `TemplateButtons`. El aviso global (`components/Notice`, `useNoticeContext`) es una notificación: arriba a la derecha, no bloquea la página y se cierra solo a los 5 s. Hasta el 2026-10-04 se llamaba `Modal`/`useModalContext`, y no lo es: un **modal** bloquea la página hasta que se elige algo (`ConfirmDialog`, `SendTemplateDialog`). Para avisar de lo que pasó, `useNoticeContext`; para que la persona lea o decida antes de seguir, un diálogo.
