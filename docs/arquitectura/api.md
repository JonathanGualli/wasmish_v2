# API: autenticación, límites y endpoints

Cómo se autentica cada ruta, el rate limiting y la tabla completa de endpoints del backend.

> Parte de la documentación de Wasmish: el mapa de todos los temas está en el [AGENTS.md](../../AGENTS.md) de la raíz.
> Las decisiones de producto con fecha están en [decisiones.md](../decisiones.md).

## Contenido

- [Autenticación — dos vías](#autenticación--dos-vías)
- [Lo que `login` y `verify` NO devuelven](#lo-que-login-y-verify-no-devuelven)
- [Rate limiting](#rate-limiting)
- [Endpoints completos](#endpoints-completos)

---

### Autenticación — dos vías

**Autenticación — dos vías:**
- **Cookie JWT** (`authRequired`, `validate.token.middleware.js`) para las rutas de la web/app. En dev la cookie usa `secure:false`/`sameSite:'lax'`; en prod (`NODE_ENV=production`) `secure:true`/`sameSite:'none'`. Desde la Fase 1 de multi-línea (2026-10-11), `authRequired` **lee el usuario de la BD en cada petición** y deja `req.auth = { userId, accountId, role, lineIds, isSuperadmin }` (`sessionAuthFor`, en `utils/account.js`). Un usuario que ya no existe, **desactivado** (`status: 'inactive'`) o sin cuenta (sin migrar) recibe **401** aunque su cookie siga siendo válida. El dueño de los datos es `req.auth.accountId`, la cuenta; nunca la persona de la sesión. Sin cookie, 401; con un JWT inválido, 403.
- **API key** (`validateApiKey`, `validate.api.key.middleware.js`) para la API pública (`/v1/...`): lee `Authorization: Bearer wm_xxx`, la **hashea** (SHA-256) y busca por `keyHash`. La key es **de la cuenta** (`ApiKey.userId` guarda la cuenta): carga la `Account` y deja `req.auth = { userId: null, accountId, role: 'api', lineIds: null }`, donde `lineIds: null` significa todas las líneas. Así la key sigue valiendo aunque la cuenta cambie de owner. Una key cuya cuenta no existe, 401.
- **El login no revela qué correos existen.** Un correo inexistente y una contraseña incorrecta devuelven **lo mismo**: 400 con «Correo o contraseña incorrectos» (antes eran 404 y 400, con mensajes distintos). Y `bcrypt.compare` corre **siempre**, contra `HASH_DE_DESCARTE` si el usuario no existe: sin eso las respuestas serían idénticas pero los tiempos no (~1 ms sin usuario frente a ~120 ms con él), y esa diferencia sola basta para enumerar. Medido: 121 ms en ambos casos. `register` sí sigue diciendo si un correo está en uso — taparlo requiere verificación por correo, que no existe todavía.
- **El login de un usuario desactivado** responde **403** con «Tu usuario está desactivado. Habla con el administrador de tu cuenta.», pero solo con la contraseña correcta: con una incorrecta recibe el mismo 400 que un correo inexistente.
- **Registro** (`/register`): crea **una cuenta nueva y su owner** con el mismo `_id` (`createAccountWithOwner`, en `services/account.service.js`). Solo usa `name`, `email` y `password`: el rol, el estado, `isSuperadmin` o una cuenta que vengan en el cuerpo se ignoran.
- **Superadmin** (`requireSuperadmin`, `require.superadmin.middleware.js`) para `/api/admin/...`: se monta **después** de `authRequired` y mira `req.auth.isSuperadmin`, que `authRequired` acaba de leer **de la BD en esta misma petición**, no del JWT: quitarlo tiene efecto inmediato. El campo viejo `rol` ya no da acceso (se conserva para volver a una imagen anterior). Login, `/verify`, `/profile` y `/register` devuelven `isSuperadmin`, y el frontend enseña el menú de administración con él.

### Lo que `login` y `verify` NO devuelven

**Lo que `login` y `verify` NO devuelven:** el token de WhatsApp **nunca** sale del backend. Ambos endpoints devuelven `whatsappConnected: boolean`, no `tokenWhatsapp`. El frontend no lo necesita — todas las llamadas a Meta las hace el backend. Mismo criterio en `admin.controller.js`.

### Rate limiting

**Rate limiting** (`rate.limit.middleware.js`, `express-rate-limit`):
- `authLimiter` — `/login` y `/register`: 10 por IP cada 15 min, con `skipSuccessfulRequests` (solo cuenta los fallos).
- `publicApiIpLimiter` — 120/min por IP, **antes** de `validateApiKey`: frena a quien prueba keys al azar, cuando todavía no hay usuario que limitar.
- `publicApiUserLimiter` — 60/min **por cuenta** (`req.auth.accountId`), **después** de `validateApiKey`: el abuso de una key filtrada no le come el cupo a los demás clientes.

No se aplica a `/api/webhook` (Meta manda ráfagas) ni a `/api/stream` (conexión persistente). Requiere `app.set('trust proxy', 1)` — ya está en `app.js`; sin eso, detrás de Traefik todas las peticiones comparten IP aparente y se bloquean entre sí.

### Endpoints completos

**Endpoints completos:**

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/register` | No | Registrar usuario: crea su cuenta y lo deja de owner |
| POST | `/api/login` | No | Login, setea cookie JWT |
| POST | `/api/logout` | No | Borra cookie |
| GET | `/api/verify` | No | Verifica cookie JWT activa |
| GET | `/api/profile` | JWT | Perfil del usuario autenticado |
| PUT | `/api/users/update-user-token-whatsapp` | JWT | Guarda token WA cifrado (carga manual). Pide `tokenWhatsapp`, `phoneNumberId` y `waBusinessId` (400 si falta alguno); 409 si el número está en otra cuenta, 400 si no es del WABA ([Un número, una cuenta](whatsapp-envio.md#embedded-signup-objetivo-central--saas-multi-cliente)) |
| POST | `/api/whatsapp/connect` | JWT | Embedded Signup: canjea el `code` de Meta → token permanente, comprueba el número en el WABA, suscribe webhook, guarda credenciales. 409 si el número está en otra cuenta, 400 si no es del WABA |
| POST | `/api/chats/messages` | JWT | Enviar mensaje por número (reutiliza su conversación). **409** si el contacto nunca escribió o la ventana está cerrada: hay que empezar con una plantilla |
| POST | `/api/chats/:id/messages` | JWT | Enviar mensaje a conversación existente. **409** (`code: window_closed`) si la ventana de 24 h está cerrada, sin llamar a Meta |
| POST | `/api/chats/:id/media` | JWT | Enviar un archivo a una conversación. Cuerpo = el archivo crudo (Content-Type = su tipo); `X-Filename`, `X-Caption` (URI-encoded) y `X-Temporal-Id` en cabeceras, `X-Send-As: document` para una imagen como documento. 400 si no vale, **409** fuera de la ventana. Responde el mensaje (`201`) aunque Meta lo rechace |
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
| POST | `/api/contacts/import/preview` | JWT | Importar, sin escribir nada: `{ rows, country, extraTagNames }` (≤ 10 000 filas ya emparejadas, con su número de fila). Conteos, errores y avisos por fila (con el `field` que los causó), una muestra de 3 (`sample`, con lo que ya tiene el existente en `current` y lo que no se aplica en `ignored`) y `rowGroups` (las filas de cada teléfono, para armar las tandas) |
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
