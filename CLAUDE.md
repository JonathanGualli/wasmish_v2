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

Construido el 2026-05-17. Stats: **332 nodos, 533 edges, 18 comunidades**.

- `graphify-out/graph.json` — datos del grafo
- `graphify-out/graph.html` — visualización interactiva
- `graphify-out/GRAPH_REPORT.md` — reporte completo

**God nodes:** `useAuthContext`, `useModalContext`, `decrypt`, `CustomButton`, `AppRoutes`, `sendUser` (SSE), `Auth Routes`

**Comunidades principales:**
- Frontend UI Components & Hooks
- Backend Chat & Messaging Controllers
- Backend Infrastructure & Routes
- Frontend Auth Context
- Real-time SSE Services
- Backend Auth System

---

## Comandos de desarrollo

Monorepo con dos workspaces independientes: `Backend/` y `Frontend/`. Cada uno tiene su propio `package.json` y `node_modules`.

**Backend** (Express 5 + MongoDB, port 3001):
```bash
cd Backend && npm run dev      # nodemon src/index.js
```

**Frontend** (React + Vite, port 5173):
```bash
cd Frontend && npm run dev     # vite dev server
cd Frontend && npm run build   # tsc -b && vite build
cd Frontend && npm run lint    # eslint
cd Frontend && npm run preview # preview production build
```

No hay suite de tests configurada.

---

## Arquitectura

### Backend (`Backend/src/`)

Express 5 app. Entry: `index.js` → `app.js`. Patrón: `routes/` → `controllers/` → `models/` (Mongoose). Cuerpos de request validados con **Zod** via `middlewares/validator.middleware.js` — los errores se devuelven como array de `issues` con status 400. Rutas protegidas usan `middlewares/validate.token.middleware.js` (`authRequired`), que lee un JWT de una cookie httpOnly llamada `token`.

**Configuración (`.env` en `Backend/`, cargado con `dotenv`):** `MONGO_URI`, `TOKEN_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`, `META_GRAPH_VERSION`. `config.js` y `db.js` leen de `process.env` — ya **no** hay secretos hardcodeados. `.env` está en `.gitignore`.

**MongoDB:** conecta a `process.env.MONGO_URI` (por defecto `mongodb://127.0.0.1:27017/wasmish`).

**Autenticación — dos vías:**
- **Cookie JWT** (`authRequired`, `validate.token.middleware.js`) para las rutas de la web/app. En dev la cookie usa `secure:false`/`sameSite:'lax'`; en prod (`NODE_ENV=production`) `secure:true`/`sameSite:'none'`.
- **API key** (`validateApiKey`, `validate.api.key.middleware.js`) para la API pública (`/v1/...`): lee `Authorization: Bearer wm_xxx`, la **hashea** (SHA-256) y busca por `keyHash` para cargar el user dueño; deja `req.user = { id }` igual que `authRequired`.
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

**Embedded Signup (objetivo central — SaaS multi-cliente):** que cada cliente conecte su WhatsApp con "login con Facebook". Frontend: `libs/facebookSdk.ts` (carga el SDK) + `useConnectWhatsapp` (popup con `config_id`, captura `code` + `phone_number_id` + `waba_id`) → `POST /api/whatsapp/connect`. Requiere App Review para cuentas reales (en modo dev solo con testers). En local el frontend se expone con **ngrok** (dominio fijo) y Vite proxya `/api` → `localhost:3001`.

**API pública de plantillas (`sendTemplateController`):** autenticada por API key. Descifra el token WA del user, envía la plantilla a Meta (parámetros posicionales `["Juan"]` o nombrados `[{name,value}]`), persiste la conversación + `Message` (con `status`; si Meta rechaza, `status:'failed'` + error), y **emite `message_created` por SSE** para que aparezca en vivo en la UI del dueño.

**Botones de plantilla (`buildButtonComponents`):** el `sub_type` que espera Meta **se deduce de la definición guardada** (`Template.buttons`), no del `subType` que mande el cliente — ese campo quedó opcional, solo como respaldo si la plantilla nunca se sincronizó. Es necesario porque el mismo botón «Copiar código» se envía como `sub_type:'url'` + `{type:'text'}` en una plantilla `AUTHENTICATION` y como `sub_type:'copy_code'` + `{type:'coupon_code'}` en una de cupón, y por fuera son idénticos. Se rechaza con **400, antes de llamar a Meta**, el índice inexistente (Meta lo aceptaba y descartaba el parámetro en silencio) y el botón de URL fija sin `{{1}}` (Meta respondía 132018). `sendTemplateController` re-sincroniza la plantilla si el documento es anterior a este cambio, detectándolo por la ausencia de `parameterFormat`.

**Flujo de mensaje saliente (`sendMessageController`):**
1. Busca conversación por `id` (params) o `destinationNumber` (body)
2. Decripta `user.tokenWhatsapp` → llama Meta Cloud API
3. Si no existe conversación, la crea; si existe, actualiza `lastMessage` y **`lastMessageAt`** — nunca `updatedAt`, que Mongoose pisa en el `save()` por `timestamps: true` y que además no es el campo por el que ordena `listConversations`. La conversación y el `Message` comparten un único `const now` para que el orden de la lista y el cursor de paginación estén en la misma escala
4. Persiste `Message` con `temporalId` (para UI optimista). Si Meta rechaza, guarda igual `status:'failed'` + `errorCode`/`errorDetail` (no se pierde)
5. Emite `message_created` via SSE; el POST responde el mensaje normalizado con `id` real (para que los `message_status` posteriores casen con el optimista del frontend)

**SSE (`stream.controller.js`):** `clients` es un `Map<userId, Set<Response>>`. `sendUser(userId, event, data)` escribe a todos los sockets del usuario. Keep-alive cada 25 segundos.

**Eventos SSE y sus payloads:**
- `message_created`: `{ id, conversationId, sender, text, timestamp, status, temporalId? }` — en los **inbound** (webhook) incluye además `unreadCount`, el valor real de la BD
- `message_status`: `{ id, conversationId, waMessageId, status, deliveredAt, readAt, failedAt, errorCode, errorDetail }`
- `conversation_updated`: `{ id, unreadCount }`

**`unreadCount`:** se incrementa en cada mensaje inbound (webhook). Se resetea a 0 en `GET /api/chats/:id/messages` **solo cuando no hay cursor** (`hasCursor === false`, o sea al abrir el chat) — paginar hacia atrás en el historial no es leer, y si reseteara siempre, un mensaje que llegue mientras el usuario hace scroll perdería su badge. El `updateOne` filtra por `unreadCount: { $gt: 0 }` y solo emite `conversation_updated` si `modifiedCount > 0`, para no inundar el SSE al reabrir chats ya leídos.

**Webhook entrante (`webhook.controller.js`):**
- **Firma obligatoria.** `POST /api/webhook` pasa por `verifyWebhookSignature`: HMAC-SHA256 del **cuerpo crudo** (`req.rawBody`, guardado en el `verify` de `express.json` en `app.js`) con `META_APP_SECRET`, comparado con `X-Hub-Signature-256` usando `timingSafeEqual`. Hay que validar sobre los bytes originales: re-serializar `req.body` cambia el orden de claves y la firma nunca cuadra. **Falla cerrado** — si `META_APP_SECRET` falta, rechaza todo con 401 (y avisa por `console.error` al arrancar). Confirmar esa variable en el `.env` del servidor antes de desplegar, o los clientes dejan de recibir mensajes.
- **Transiciones de estado monótonas.** `STATUS_RANK = { sent: 0, delivered: 1, read: 2, failed: 3 }`: un webhook solo se aplica si **sube** de rango. Meta no garantiza orden ni unicidad, así que un `delivered` que llega después de un `read` haría retroceder el estado. Si `read` llega sin `delivered` previo, se infiere `deliveredAt` con el mismo timestamp (leído implica entregado). Si el estado no avanza, se hace `continue` — tampoco se emite `message_status`.

**Índices MongoDB relevantes:**
- `Conversation`: `{ userId: 1, contactPhone: 1 }` unique — no puede haber dos conversaciones del mismo user con el mismo teléfono
- `Message`: `{ conversationId: 1, timestamp: 1 }`

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

**Páginas privadas:** `dashboard`, `quickStart`, `settings`, `chats`, `templates`

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

**`temporalId`:** string generado en el frontend antes de enviar. El backend lo guarda en `Message.temporalId` y lo devuelve en `message_created` SSE. El frontend lo usa para evitar duplicados al recibir el evento de vuelta.

**Hooks disponibles:**
- `useLogin`, `useSignUp`, `useLogOut`, `useVerifyLogin` — auth
- `useConversations` — lista de conversaciones (query + suscripción SSE)
- `useConversationMessages(conversationId)` — mensajes paginados + suscripción SSE
- `useConversationSendMessages` — envío de mensajes (UI optimista; marca `failed` en error)
- `useUpdateWhatsappToken` — carga manual de credenciales de WhatsApp
- `useConnectWhatsapp` — Embedded Signup (SDK de Facebook → `/api/whatsapp/connect`)
- `useTemplates` — sync + listado de plantillas
- `useApiKey` — gestión de API keys (listar / generar / revocar)

**Íconos:** `lucide-react` + `@heroicons/react`. Componentes UI accesibles con `@headlessui/react`.
