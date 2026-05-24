# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Preferencias del proyecto

### Brand guidelines — diseño y UI

**Antes de crear o modificar cualquier componente, página, o estilo, consultar el skill `/brand-guidelines`.**

Esto incluye: nuevos componentes React, modificaciones de clases Tailwind, elección de colores, diseño de páginas, variantes de botones/inputs, layouts, iconografía, o cualquier decisión visual. El skill contiene la paleta de tokens, reglas de componentes, y anti-patterns del proyecto.

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

**MongoDB:** conecta a `mongodb://127.0.0.1:27017/wasmish` (hardcoded en `db.js`).

**Endpoints completos:**

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/register` | No | Registrar usuario |
| POST | `/api/login` | No | Login, setea cookie JWT |
| POST | `/api/logout` | No | Borra cookie |
| GET | `/api/verify` | No | Verifica cookie JWT activa |
| GET | `/api/profile` | Sí | Perfil del usuario autenticado |
| PUT | `/api/users/update-user-token-whatsapp` | Sí | Guarda token WA encriptado |
| POST | `/api/chats/messages` | Sí | Enviar mensaje (conversación nueva o por número) |
| POST | `/api/chats/:id/messages` | Sí | Enviar mensaje a conversación existente |
| GET | `/api/chats` | Sí | Listar conversaciones del usuario |
| GET | `/api/chats/:id/messages` | Sí | Mensajes paginados (cursor-based) |
| GET | `/api/stream` | Sí | SSE stream del usuario |
| GET | `/api/templates/sync` | Sí | Sincronizar plantillas desde Meta API → MongoDB |
| GET | `/api/templates` | Sí | Listar plantillas guardadas en DB |
| POST | `/api/api-key/generate` | Sí | Generar API key encriptada |
| GET | `/api/webhook` | No | Verificación webhook Meta (hub.challenge) |
| POST | `/api/webhook` | No | Recibir mensajes/status de WhatsApp |

**WhatsApp:** `libs/whatsapp.js` llama a `graph.facebook.com/v20.0`. Cada user guarda `tokenWhatsapp`, `phoneNumberId`, `waBusinessId` en MongoDB. El token se encripta con AES-256-CBC (`utils/crypto.js`, key derivada de `TOKEN_SECRET`); **`decrypt` se llama en cada mensaje saliente y sync de plantillas.**

**⚠️ Producción:** `config.js` exporta `TOKEN_SECRET = 'jonathan'` y `WHATSAPP_VERIFY_TOKEN = 'solventyc'` como strings hardcoded — mover a variables de entorno antes de deploy.

**Flujo de mensaje saliente (`sendMessageController`):**
1. Busca conversación por `id` (params) o `destinationNumber` (body)
2. Decripta `user.tokenWhatsapp` → llama Meta Cloud API
3. Si no existe conversación, la crea; si existe, actualiza `lastMessage`
4. Persiste `Message` en DB con `temporalId` (viene del frontend para UI optimista)
5. Emite `message_created` via SSE al usuario

**SSE (`stream.controller.js`):** `clients` es un `Map<userId, Set<Response>>`. `sendUser(userId, event, data)` escribe a todos los sockets del usuario. Keep-alive cada 25 segundos.

**Eventos SSE y sus payloads:**
- `message_created`: `{ id, conversationId, sender, text, timestamp, status, temporalId? }`
- `message_status`: `{ id, conversationId, waMessageId, status, deliveredAt, readAt, failedAt, errorCode, errorDetail }`
- `conversation_updated`: `{ id, unreadCount }`

**`unreadCount`:** se incrementa en cada mensaje inbound (webhook). Se resetea a 0 cuando `GET /api/chats/:id/messages` es llamado; emite `conversation_updated` via SSE.

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
- SSE se abre con `createSSEConnection("stream", handlers)` — devuelve `{ close }` para cleanup en `useEffect`

**`useConversationMessages` — patrón crítico:**
- `useInfiniteQuery` con cursor `?limit=50&before=<ISO timestamp>`
- El cursor `nextCursor` viene del backend como el `timestamp` del último mensaje de la página
- SSE `message_created`: si `temporalId` ya existe en el cache → **no agrega el mensaje** (deduplicación de UI optimista)
- SSE `message_status`: actualiza en-place el mensaje por `id` en todas las páginas del cache
- Abre su propio SSE connection (se cierra al desmontar)

**`temporalId`:** string generado en el frontend antes de enviar. El backend lo guarda en `Message.temporalId` y lo devuelve en `message_created` SSE. El frontend lo usa para evitar duplicados al recibir el evento de vuelta.

**Hooks disponibles:**
- `useLogin`, `useSignUp`, `useLogOut`, `useVerifyLogin` — auth
- `useConversations` — lista de conversaciones (React Query query)
- `useConversationMessages(conversationId)` — mensajes paginados + SSE
- `useConversationSendMessages` — envío de mensajes
- `useUpdateWhatsappToken` — settings de WhatsApp
- `useTemplates` — listado de plantillas
- `useApiKey` — generación de API keys

**Íconos:** `lucide-react` + `@heroicons/react`. Componentes UI accesibles con `@headlessui/react`.
