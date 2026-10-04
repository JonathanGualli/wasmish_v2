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

Reconstruido el 2026-09-09 (full: AST + semántica LLM), reconstruido de nuevo el 2026-10-03 (`/graphify --update`: AST de todo el código + caché semántica + re-extracción de los docs/imágenes cambiados). Stats: **629 nodos, 1200 edges, 44 comunidades**. Ojo: `graphify update .` (CLI, solo AST) había dejado el `graph.json` en 332 nodos sin la capa semántica — preferir `/graphify --update`. Hay un `.graphifyignore` en la raíz que excluye `.agents/` (definiciones de skills empaquetadas) y los `.dc.html`/`support.js` del brand — sin él el grafo se contaminaba con ~17% de ruido ajeno al proyecto.

- `graphify-out/graph.json` — datos del grafo
- `graphify-out/graph.html` — visualización interactiva
- `graphify-out/GRAPH_REPORT.md` — reporte completo

**God nodes** (más conectados): `CLAUDE.md`, `useAuthContext`, `useModalContext`, spec de ventana 24 h, guía de deploy, `describeInboundMessage`, `processTemplateSending`, `CustomButton`, `ChatThread`, `AppRoutes`

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
```
`scripts/simulate-webhook.js` firma el payload con `META_APP_SECRET` igual que Meta y se lo manda al backend local (que tiene que estar levantado). Como el SSE dispara igual, los mensajes **aparecen en vivo** en el chat del navegador. Las muestras de cada tipo están escritas a mano desde la documentación de Meta: si alguna no cuadra con la realidad, se corrige ahí **y** en `utils/inbound.message.js`.

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
Cubren **funciones puras**, sin BD ni red: `utils/crypto.js`, `utils/message.status.js`, `utils/whatsapp.window.js`, `utils/inbound.message.js`, `utils/media.storage.js`, `utils/contact.identity.js`, `utils/contact.query.js`, `utils/marketing.preference.js` y las de plantillas de `template.controller.js` (`buildButtonComponents`, `renderTemplateBody`). Cada test que corresponde a un bug ya corregido lleva un comentario explicando la regresión que vigila — verificados reintroduciendo el bug a propósito y comprobando que fallan. El Frontend no tiene tests.

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
| POST | `/api/chats/messages` | JWT | Enviar mensaje (conversación nueva o por número) |
| POST | `/api/chats/:id/messages` | JWT | Enviar mensaje a conversación existente |
| GET | `/api/chats` | JWT | Listar conversaciones del usuario |
| GET | `/api/chats/:id/messages` | JWT | Mensajes paginados (cursor-based) |
| POST | `/api/chats/:id/template` | JWT | Enviar plantilla a una conversación existente (para reabrir la ventana de 24 h). Body: `{ templateName, language?, parameters?, buttons? }` |
| POST | `/api/chats/template` | JWT | Iniciar conversación con plantilla desde la bandeja. Body: `{ destinationNumber, contactName?, templateName, language?, parameters?, buttons? }` — el número solo dígitos (8–15) |
| GET | `/api/media/:id` | JWT | Adjunto de un mensaje (`:id` es el **id del mensaje**, no el del archivo) |
| GET | `/api/contacts` | JWT | Contactos paginados (`?search`, `?filter=all\|with_conversation\|without_conversation\|opted_out`, `?page`, `?limit` máx 50), ordenados por actividad |
| GET | `/api/contacts/:id` | JWT | Ficha: contacto + `activity` (primer mensaje, enviados, recibidos, fallidos) |
| POST | `/api/contacts` | JWT | Alta manual (`phone` obligatorio). No envía nada. 409 con `contactId` si el teléfono ya existe |
| PATCH | `/api/contacts/:id` | JWT | Editar `phone`, `name`, `email`, `company`, `notes`. El teléfono **no** cambia si hay conversación (409) |
| DELETE | `/api/contacts/:id` | JWT | Borrar, **solo si nunca hubo conversación** (409 si la hay) |
| GET | `/api/stream` | JWT | SSE stream del usuario |
| GET | `/api/templates/sync` | JWT | Sincronizar plantillas desde Meta API → MongoDB |
| GET | `/api/templates` | JWT | Listar plantillas guardadas en DB |
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

**Adjuntos (fotos, audios, documentos):** Meta no manda el archivo en el webhook, manda un `mediaId`. `descargarAdjunto` (en `webhook.controller.js`) resuelve `GET /{media-id}` → URL temporal, baja los bytes y los guarda en `MEDIA_DIR` con el nombre `<mediaId>.<ext>`. Se hace **síncrono, antes de crear el `Message`**, para que cuando el mensaje llegue por SSE la foto ya se pueda pintar — cuesta unos cientos de ms de webhook y ahorra una cola y un segundo evento. **Nunca tumba el mensaje**: si la descarga falla (token caducado, archivo enorme, Meta caída) devuelve `mediaFile: null` y el mensaje se guarda igual con su etiqueta.

El webhook trae también una `url` ya resuelta, pero **caduca en horas** mientras que el `mediaId` sirve los 30 días que Meta guarda el archivo; por eso se pasa siempre por el id, y así el mismo código sirve para reintentar una descarga vieja. El tope es `MEDIA_MAX_BYTES` (25 MB) y se comprueba con el `file_size` que devuelve Meta **antes** de bajar nada.

**Servir los adjuntos (`GET /api/media/:id`):** el `:id` es el del **mensaje**, no el del archivo, para que la comprobación de propietario sea la de siempre (mensaje → conversación → `userId`) y no se pueda pedir el archivo de otro conociendo su `mediaId` — que viaja en los payloads de Meta. Un usuario ajeno recibe **404, no 403**: un 403 confirmaría que ese mensaje existe. `utils/media.storage.js` es el único sitio que construye rutas: el nombre sale del `mediaId` validado contra `/^\d{1,64}$/` y `rutaDeArchivo` vuelve a comprobar que no se ha salido del directorio. Un mime desconocido se guarda como `.bin` y se sirve como `application/octet-stream`, para que el navegador lo descargue en vez de interpretarlo.

**`caption` vs `text`:** `text` cae a la etiqueta («Imagen») cuando el contacto no escribió nada, porque es lo que se ve en la bandeja. `caption` guarda **solo** lo que escribió de verdad, y es `null` si no escribió. Sin esa distinción la UI pondría «Imagen» debajo de una imagen que ya se está viendo.

**Ventana de 24 h de WhatsApp:** Meta solo entrega texto libre dentro de las 24 h siguientes al **último mensaje del contacto**; fuera de eso, solo plantillas aprobadas (si no, error 131047). El backend guarda `Conversation.lastInboundAt` y `utils/whatsapp.window.js` (`getWindowExpiry`, puro y testeado) es **el único sitio donde vive ese «24»**. Al frontend no se le manda un booleano — caducaría en cuanto pasa el tiempo — sino `windowExpiresAt` (ISO o `null` si el contacto nunca escribió), que la UI compara con su propio reloj. Lo publican `GET /api/chats`, el `message_created` de los entrantes y el `conversation_updated` de los entrantes no-texto.

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
- **Requisito en Meta:** el campo `user_preferences` tiene que estar marcado en *App Dashboard → WhatsApp → Configuración → Campos del webhook*. Sin él Meta no lo manda y solo funciona el camino del 131050. Marcarlo no toca la URL del webhook.

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
- `contact_updated`: `{ id, marketingOptOut, marketingOptOutAt }` — baja o alta de publicidad; `useContacts` refresca la lista y la ficha

**`unreadCount`:** se incrementa en cada mensaje inbound (webhook). Se resetea a 0 en `GET /api/chats/:id/messages` **solo cuando no hay cursor** (`hasCursor === false`, o sea al abrir el chat) — paginar hacia atrás en el historial no es leer, y si reseteara siempre, un mensaje que llegue mientras el usuario hace scroll perdería su badge. El `updateOne` filtra por `unreadCount: { $gt: 0 }` y solo emite `conversation_updated` si `modifiedCount > 0`, para no inundar el SSE al reabrir chats ya leídos.

**Webhook entrante (`webhook.controller.js`):**
- **Firma obligatoria.** `POST /api/webhook` pasa por `verifyWebhookSignature`: HMAC-SHA256 del **cuerpo crudo** (`req.rawBody`, guardado en el `verify` de `express.json` en `app.js`) con `META_APP_SECRET`, comparado con `X-Hub-Signature-256` usando `timingSafeEqual`. Hay que validar sobre los bytes originales: re-serializar `req.body` cambia el orden de claves y la firma nunca cuadra. **Falla cerrado** — si `META_APP_SECRET` falta, rechaza todo con 401 (y avisa por `console.error` al arrancar). Confirmar esa variable en el `.env` del servidor antes de desplegar, o los clientes dejan de recibir mensajes.
- **Transiciones de estado monótonas.** La lógica vive en `utils/message.status.js` (`resolveStatusTransition`, función pura y testeada; devuelve `null` si no hay que hacer nada). `STATUS_RANK = { sent: 0, delivered: 1, read: 2, failed: 3 }`: un webhook solo se aplica si **sube** de rango. Meta no garantiza orden ni unicidad, así que un `delivered` que llega después de un `read` haría retroceder el estado. Si `read` llega sin `delivered` previo, se infiere `deliveredAt` con el mismo timestamp (leído implica entregado). Si el estado no avanza, se hace `continue` — tampoco se emite `message_status`.
- **Se guarda todo entrante, no solo el texto.** `utils/inbound.message.js` (`describeInboundMessage`, pura y testeada) traduce la forma que manda Meta — `image.caption`, `document.filename`, `button.text`, `interactive.button_reply.title`… — a `{ type, text, mediaId, mimeType }`, y a partir de ahí **todos los tipos siguen el mismo camino**: `Message`, `lastMessage`, `unreadCount++` y `message_created`. Es el único sitio que conoce esas formas.
- **`text` nunca sale vacío.** `Message.text` es `required`, y un throw dentro del webhook hace que Meta reintente y que el mensaje del cliente acabe perdiéndose. Por eso todo tipo tiene etiqueta de reserva («Imagen», «Nota de voz», el nombre del archivo) y hasta un tipo que Meta invente mañana cae en «Mensaje no compatible». Es el test que más importa de `inbound.message.test.js`.
- **Lo que Meta no entrega, lo nombra igual.** Una encuesta llega como `{ type:'unsupported', errors:[…], unsupported:{ type:'poll_creation' } }` — comprobado con un webhook real. `ETIQUETAS_NO_SOPORTADO` traduce ese subtipo («Encuesta») y, si no lo conoce, cae al genérico antes que enseñar el nombre en inglés de Meta. La lista crece según aparezcan tipos nuevos en producción.
- **Un mensaje roto no tumba el lote.** El cuerpo de cada bucle vive en `procesarEntrante` / `procesarEstado`, y `handleWebhook` los llama envueltos en `try/catch`. Si el error subiera, la respuesta sería 500 y **Meta reintentaría el lote entero** y habría que volver a procesar lo que ya se guardó (el índice único de `waMessageId` evita el duplicado, pero no el trabajo ni el ruido). Con el catch, Meta recibe 200 y como mucho se pierde el que venía mal, con su `waMessageId` y su `type` en el log.
- **Tres listas por `value`:** `messages`, `statuses` y `user_preferences` (bajas de publicidad, ver Contactos), cada elemento en su propio `try/catch`.
- **Los `system` se ignoran** (avisos del tipo «este contacto cambió de número»): `describeInboundMessage` devuelve `null`, no se guardan y **no abren la ventana**.
- **`lastInboundAt` solo avanza**, igual que el estado: `if (!conversation.lastInboundAt || timestamp > conversation.lastInboundAt)`. Un webhook viejo que llegue tarde cerraría la ventana antes de tiempo.
- **Quién escribe sale de `value.contacts`**, no solo de `messages[].from`: `describeInboundContact` casa el perfil por teléfono o BSUID (con varios remitentes en un lote, coger el primero pondría el nombre de otra persona). Un entrante **sin teléfono ni BSUID** se descarta con un `warn`. Antes, uno sin teléfono reventaba al crear la conversación (`contactPhone` era `required`) y el mensaje se perdía.
- La conversación nueva (`findOrCreateConversation`) se crea con **`unreadCount: 0`**, no 1: el `+1` de más abajo corre también para ella y el primer mensaje de un contacto nuevo salía con badge 2. Si Meta revela el teléfono de alguien que antes escribió solo con usuario, se copia a `contactPhone`.

**Índices MongoDB relevantes:**
- `Conversation`: `conversation_contact_unique` = `{ userId: 1, contactId: 1 }` único **parcial** (`contactId: { $type: 'objectId' }`) — una conversación por contacto; parcial para que las anteriores a los contactos, sin `contactId`, no choquen entre sí. Más `contactId_1` simple, para el `$lookup` de la lista de contactos. El viejo `userId_1_contactPhone_1` ya **no existe** (lo borra `backfill:contacts`): un contacto puede no tener teléfono.
- `Contact`: `contact_phone_unique` `{ userId, phone }` y `contact_waUserId_unique` `{ userId, waUserId }`, únicos **parciales** por `$type: 'string'` — el mismo motivo que `waMessageId_unico`: los dos campos pueden ser `null`
- `Message`: `{ conversationId: 1, timestamp: 1 }`
- `Message`: **dos** índices sobre `waMessageId`, y hacen falta los dos. `waMessageId_unico` es único **parcial** (`$type: 'string'`, no `sparse`: los fallidos se guardan con `null` explícito y dos `null` chocarían) — frena el duplicado cuando Meta reintenta un webhook; `procesarEntrante` trata el E11000 como «ya guardado» y sale sin emitir SSE. `waMessageId_busqueda` es el normal: Mongo no usa el parcial para `{ waMessageId: 'wamid.x' }` y cada acuse de recibo haría un escaneo completo.

---

### Frontend (`Frontend/src/`)

React 19 + TypeScript + Vite + Tailwind v4. Estado: React Query v5 (server state) + React Context (auth, modal).

**Provider tree** (`main.tsx`):
```
QueryClientProvider
  └── AuthProvider          ← auth state, login/signup/logout
        └── SSEProvider     ← UNA sola conexión SSE global (pub/sub), solo con sesión
              └── ModalProvider   ← global modal visibility
                    └── App       ← renderiza <Modal /> + children
                          └── AppRouter
```

**Routing** (`AppRouter.tsx`):
- Público: `/login`, `/register`
- Protegido: `/*` → `PrivateGuard` → `PrivateRouter` → páginas bajo `PrivateLayout`
- Constantes de rutas en `models/routes.models.ts` (`AppRoutes`) — **no hardcodear strings de rutas**.

**Páginas privadas:** `quickStart` (destino de `/`), `chats`, `contacts`, `templates`, `docs` (documentación de la API pública), `settings`, y `admin` — esta última solo se registra en `PrivateRouter` si `user.rol === 'superadmin'`. `AppRoutes.private.dashboard` y `pages/private/DashboardPage` existen pero no están enrutados.

**`AuthProvider` — lógica no obvia:**
- `isLoading = !authChecked || loginMutation.isPending`
- `authChecked` se setea en `true` cuando `isVerifying` (de `useVerifyLogin`) termina
- `PrivateGuard` bloquea el render hasta que `isLoading` sea `false`
- Si `verifyData` llega → setea `user`; si `verifyError` → setea `user = null`

**Flujo de datos:**
- Todas las llamadas HTTP van por `services/api.service.ts` (base URL `http://localhost:3001/api`, `withCredentials: true`)
- Cada feature tiene un hook en `hooks/` que envuelve una mutation o query de React Query
- SSE: **una sola conexión global** vía `SSEProvider` (`context/sse.provider.tsx`). Los hooks se **suscriben** con `useSSE().subscribe(evento, handler)` (devuelve la función de des-suscripción); ya no abren su propia conexión. `createSSEConnection("stream", handlers)` se usa solo dentro del provider. Base URL relativa (`/api`) → pasa por el proxy de Vite

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

**Contactos (`pages/private/Contacts`):** tabla paginada en el servidor (`DataTable` + `ContactColumns`/`ContactRow`), búsqueda con `useDebouncedValue`, filtros por conversación y baja de publicidad, y la ficha lateral `ContactPanel` (datos, origen —«Escribió él», «Desde un anuncio»…—, actividad y ventana de 24 h con `useConversationWindow`). El estado de cada fila lo resume `contactStatus` (`utils/contactDisplay.ts`): baja de publicidad > sin conversación > ventana abierta/cerrada. Un contacto sin teléfono se muestra por su `@usuario`. `ContactForm` avisa del teléfono duplicado **mientras se escribe** (`useContactByPhone`, que exige coincidencia exacta porque la búsqueda es por subcadena) y además maneja el 409 del backend con «Ver contacto». La lista se refresca con cada `message_created` del SSE, y las mutaciones invalidan también `['conversations']`, porque el nombre del contacto es el título de su chat.

**Ir de la ficha al chat (`ChatsNavigationState`):** la ficha navega a `chats` con `state: { conversationId }` (abrir su conversación) o `state: { draft: { phone, name } }` (empezar una nueva, **reemplazando** el borrador que hubiera sin preguntar). `ChatPage` consume ese `state` una sola vez y lo borra del historial con `navigate(..., { replace: true, state: null })`; si se quedara, recargar la página volvería a pisar el borrador.

**`SendTemplateDialog` + `useSendTemplate`:** **sin UI optimista** — el mensaje lo inserta el `message_created` del SSE; adelantarlo lo duplicaría, porque este envío no lleva `temporalId` con el que deduplicar. Los errores van al **modal global** (igual que en `NewConversationPanel`, con el texto de `templateSendError`: si rechazó Meta, su código y detalle); el diálogo sigue abierto debajo, sin perder lo escrito. Ojo: el modal vive en otro portal, así que para el `Dialog` de Headless UI pulsar su X es un «clic fuera» — `handleDialogClose` ignora el cierre mientras el modal está visible. El diálogo deriva los campos del `bodyText` (`extractPlaceholders`) y **los valores de los botones** de `Template.buttons` (`buttonsNeedingValue`: OTP, `COPY_CODE` y URL con `{{ }}` — el mismo criterio que `buildButtonComponents` en el backend). Sin eso, cualquier plantilla `AUTHENTICATION` fallaba al enviarse desde el chat. Una plantilla sincronizada antes de que existiera `Template.buttons` no muestra esos campos: hay que pulsar *Sincronizar* en la página de Plantillas.

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
- `useTemplates` — sync + listado de plantillas
- `useApiKey` — gestión de API keys (listar / generar / revocar)
- `useContacts(pageIndex, pageSize, search, filter)`, `useContact(id)`, `useContactByPhone(phone)`, `useContactMutations` — sección de Contactos (en `useContacts.ts`)
- `useDebouncedValue` — retrasa un valor (la búsqueda de contactos)

**Íconos:** `lucide-react` + `@heroicons/react`. Componentes UI accesibles con `@headlessui/react`.
