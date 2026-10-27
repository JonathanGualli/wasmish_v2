# API: autenticación, límites y endpoints

Cómo se autentica cada ruta, el rate limiting y la tabla completa de endpoints del backend.

> Parte de la documentación de Wasmish: el mapa de todos los temas está en el [AGENTS.md](../../AGENTS.md) de la raíz.
> Las decisiones de producto con fecha están en [decisiones.md](../decisiones.md).

## Contenido

- [Autenticación — dos vías](#autenticación--dos-vías)
- [Lo que `login` y `verify` NO devuelven](#lo-que-login-y-verify-no-devuelven)
- [Roles y permisos](#roles-y-permisos)
- [Rate limiting](#rate-limiting)
- [Endpoints completos](#endpoints-completos)

---

### Autenticación — dos vías

**Autenticación — dos vías:**
- **Cookie JWT** (`authRequired`, `validate.token.middleware.js`) para las rutas de la web/app. En dev la cookie usa `secure:false`/`sameSite:'lax'`; en prod (`NODE_ENV=production`) `secure:true`/`sameSite:'none'`. Desde la Fase 1 de multi-línea (2026-10-11), `authRequired` **lee el usuario de la BD en cada petición** y deja `req.auth = { userId, accountId, name, role, lineIds, isSuperadmin }` (`sessionAuthFor`, en `utils/account.js`). Un usuario que ya no existe, **desactivado** (`status: 'inactive'`) o sin cuenta (sin migrar) recibe **401** aunque su cookie siga siendo válida. El dueño de los datos es `req.auth.accountId`, la cuenta; nunca la persona de la sesión. Sin cookie, 401; con un JWT inválido, 403. **La sesión dura 30 días desde la última vez que se abre** (2026-10-15, `utils/session.js`): el token y la cookie (con `maxAge`; sin él, el teléfono la perdía al cerrar la app) duran 30 días, y cualquier petición con sesión (`authRequired`, y también `GET /verify`, que la app llama al abrirse) emite uno nuevo cuando al actual le queda menos de 29 (`shouldRenewSession`, que mira el `exp`: así también se renuevan los tokens de 24 h de antes; `setSessionCookie`, en `libs/jwt.js`). Que renueve `authRequired` y no solo `/verify` importa: la app suspendida o la pestaña abierta sin recargar no vuelven a llamar a `/verify` (revisión de Codex del PR #58). Un usuario desactivado no recibe token nuevo: el 401 llega antes. Antes duraba 24 h sin renovarse.
- **API key** (`validateApiKey`, `validate.api.key.middleware.js`) para la API pública (`/v1/...`): lee `Authorization: Bearer wm_xxx`, la **hashea** (SHA-256) y busca por `keyHash`. La key es **de la cuenta** (`ApiKey.userId` guarda la cuenta): carga la `Account` y deja `req.auth = { userId: null, accountId, role: 'api', lineIds: null }`, donde `lineIds: null` significa todas las líneas. Así la key sigue valiendo aunque la cuenta cambie de owner. Una key cuya cuenta no existe, 401.
- **El login no revela qué correos existen.** Un correo inexistente y una contraseña incorrecta devuelven **lo mismo**: 400 con «Correo o contraseña incorrectos» (antes eran 404 y 400, con mensajes distintos). Y `bcrypt.compare` corre **siempre**, contra `HASH_DE_DESCARTE` si el usuario no existe: sin eso las respuestas serían idénticas pero los tiempos no (~1 ms sin usuario frente a ~120 ms con él), y esa diferencia sola basta para enumerar. Medido: 121 ms en ambos casos. `register` sí sigue diciendo si un correo está en uso — taparlo requiere verificación por correo, que no existe todavía.
- **El login de un usuario desactivado** responde **403** con «Tu usuario está desactivado. Habla con el administrador de tu cuenta.», pero solo con la contraseña correcta: con una incorrecta recibe el mismo 400 que un correo inexistente.
- **Registro** (`/register`): crea **una cuenta nueva y su owner** con el mismo `_id` (`createAccountWithOwner`, en `services/account.service.js`). Solo usa `name`, `email` y `password`: el rol, el estado, `isSuperadmin` o una cuenta que vengan en el cuerpo se ignoran.
- **Superadmin** (`requireSuperadmin`, `require.superadmin.middleware.js`) para `/api/admin/...`: se monta **después** de `authRequired` y mira `req.auth.isSuperadmin`, que `authRequired` acaba de leer **de la BD en esta misma petición**, no del JWT: quitarlo tiene efecto inmediato. El campo viejo `rol` ya no da acceso (se conserva para volver a una imagen anterior). Login, `/verify`, `/profile` y `/register` devuelven `isSuperadmin`, y el frontend enseña el menú de administración con él.

### Lo que `login` y `verify` NO devuelven

**Lo que sí devuelven sobre el acceso** (Fase 3, `sessionAccessFor` en `services/account.service.js`): `register`, `login` y `/verify` añaden `role`, `permissions` (las acciones de la tabla de «Roles y permisos» que tiene), `lineIds` (las líneas a su alcance; `null` = todas) y `account: { name, memberCount, managers }`. `memberCount` son las personas activas de la cuenta; `managers`, el owner y los admins activos, **solo nombre y rol**. El frontend decide con esto qué enseña; la autoridad sigue siendo el backend.

**Lo que `login` y `verify` NO devuelven:** el token de WhatsApp **nunca** sale del backend. Ambos endpoints devuelven `whatsappConnected: boolean`, no `tokenWhatsapp`. El frontend no lo necesita — todas las llamadas a Meta las hace el backend. Mismo criterio en `admin.controller.js`.

### Roles y permisos

**Roles y permisos** (Fase 3 de multi-línea, 2026-10-14; spec § 3.3). Un rol por persona (`owner`, `admin`, `supervisor`, `agent`) y, para supervisor y agente, sus líneas (`User.lineIds`). La lógica es pura, en `utils/permissions.js`:

- **`requirePermission(action)`** (`require.permission.middleware.js`, detrás de `authRequired`): una acción que el rol no tiene → **403** `[{ message: 'Tu rol no permite esta acción.', code: 'forbidden' }]`. Es su propia cuenta: no hay nada que ocultar.

  | Acción | Owner | Admin | Supervisor | Agente | Rutas |
  |---|:-:|:-:|:-:|:-:|---|
  | `contacts.import` | ✓ | ✓ | ✓ | ✗ | `POST /contacts/import/preview`, `POST /contacts/import` |
  | `contacts.delete` | ✓ | ✓ | ✓ | ✗ | `DELETE /contacts/:id` |
  | `tags.manage` | ✓ | ✓ | ✓ | ✗ | `POST/PATCH/DELETE /tags`, `POST /contacts/tags` (etiquetar en bloque) |
  | `templates.manage` | ✓ | ✓ | ✓ | ✗ | `GET /templates/sync` y las de `header-media` (salvo `GET /templates/media/:id`) |
  | `campaigns.manage` | ✓ | ✓ | ✓ (sus líneas) | ✗ | todas las de `/campaigns`, también verlas |
  | `apiKeys.manage` | ✓ | ✓ | ✗ | ✗ | las de `/api-key` |
  | `lines.manage` | ✓ | ✓ | ✗ | ✗ | `PATCH /lines/:id`, `POST /lines/:id/disconnect`, `GET /lines/:id/pin`, `POST /lines/:id/history-sync`, `POST /whatsapp/connect`, `PUT /users/update-user-token-whatsapp` |
  | `autoReplies.manage` | ✓ | ✓ | ✗ | ✗ | las de `/auto-replies` |
  | `conversations.assign` | ✓ | ✓ | ✓ (sus líneas) | ✗ | asignar o transferir **cualquier** conversación y resolver sus solicitudes (Fase 4); el agente, solo las suyas |

  Lo demás lo hace cualquier rol **en sus líneas**: ver y responder conversaciones, ver y editar contactos, ver plantillas, ver sus líneas.
- **Las líneas a su alcance** (`lineScope`): owner, admin y la API key, todas (`null`); supervisor y agente, las suyas. Lo de una línea fuera de alcance responde **404**, como lo de otra cuenta:
  - toda búsqueda de conversación de una persona lleva `conversationScope(req.auth)` (chat, mensajes, adjuntos, envíos, plantilla desde el chat); una conversación sin línea solo la ven quienes ven todas. Para el agente, además, solo las **sin asignar o suyas** (Fase 4: [chat.md § Asignación](chat.md#asignación-de-conversaciones));
  - campañas (listar, ver, fallos, destinatarios, pausar, reanudar, cancelar y crear), `GET /lines` y `GET /templates?lineId=`;
  - **las plantillas son del WABA**, y un WABA está a su alcance si tiene alguna de sus líneas (`templateScopeFor`): listarlas (sin ninguna línea, ninguna), sincronizar, la cabecera (subirla, añadir un archivo, quitarla) y la plantilla de una campaña (vista previa y crear). Fuera de alcance, 404 o como si no existiera (revisión de Codex del PR #34). `GET /templates/media/:id` mira solo la cuenta: los archivos de cabecera no son de ninguna línea;
  - en Contactos, el contacto es de toda la cuenta, pero sus conversaciones de otras líneas no se enseñan. Los filtros «con / sin conversación» miran **todas** (no cambian según quién los pide).
- **Empezar algo sin elegir línea** (una conversación nueva o una campaña; `findStartLine`, con `pickSendingLineId`): la línea por defecto si está a su alcance; si no, su única línea activa; con varias, **400** `choose_line` «Elige por qué línea enviar.»; sin ninguna, 404.
- **Responder toma la conversación** (Fase 4): los envíos desde el chat (texto, archivo, plantilla a una conversación o a un número) la toman si estaba sin asignar; un agente en la de un compañero recibe **409** `[{ message: 'Esta conversación la atiende Ana.', code: 'assigned_to_other', assignedToName, conversationId }]` sin llamar a Meta ([chat.md § Asignación](chat.md#asignación-de-conversaciones)).
- La API key (`role: 'api'`) no tiene ninguna de las acciones de la tabla (no las necesita: solo usa `/v1`) y llega a todas las líneas.

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
| POST | `/api/whatsapp/connect` | JWT | Embedded Signup: canjea el `code` de Meta → token permanente, comprueba el número en el WABA, suscribe webhook, guarda la línea (añade, renueva o reemplaza según `maxLines`). Cuerpo `{ code, waBusinessId, phoneNumberId }`; en la coexistencia `{ code, waBusinessId, businessApp: true }` sin `phoneNumberId`, que el backend deduce del WABA (409 `business_app_number_unknown` si no puede). 409 si el número está en otra cuenta o no cabe en el plan, 400 si no es del WABA. Responde también `lineId` |
| GET | `/api/lines` | JWT | Las líneas de la cuenta: `{ lines: [{ id, name, phoneNumberId, displayPhoneNumber, verifiedName, status, isDefault, waBusinessId, createdAt, connectedAt, disconnectedAt, hasTwoStepPin }], maxLines, nextDefaultLineId }`, también las desconectadas; la por defecto, la primera. `nextDefaultLineId`: la que pasaría a ser la por defecto si se desconecta la actual. `hasTwoStepPin`: si Wasmish guardó el PIN de dos pasos del número (el PIN, solo en `GET /api/lines/:id/pin`). `historySync`: el historial de la app de WhatsApp Business ya resumido (`{ status, progress, failedThreads, retryable, canRetry, retryUntil }`), o `null` si la línea no lo pidió en su conexión. Nunca el token ni el PIN (Fase 2c). Los errores de líneas y de conectar llevan un `code` (`line_busy`, `line_limit`, `default_line_inactive`, `line_not_found`, `phone_number_taken`, `phone_number_not_in_waba`, `waba_taken`, `phone_number_registration_failed`, `history_sync_unavailable`) |
| PATCH | `/api/lines/:id` | JWT | `{ name?, isDefault?: true }`: el nombre interno (máx. 40; vacío lo quita) y/o hacerla la por defecto (409 si está desconectada). 404 si es ajena |
| POST | `/api/lines/:id/disconnect` | JWT | Desconecta la línea (deja de enviar y recibir; conserva el historial). Idempotente. Si era la por defecto, pasa a serlo la activa más reciente. 404 si es ajena |
| GET | `/api/lines/:id/pin` | JWT | `{ pin }`: el PIN de la verificación en dos pasos con el que Wasmish registró el número al conectarlo ([whatsapp-envio.md § Embedded Signup](whatsapp-envio.md#embedded-signup-objetivo-central--saas-multi-cliente)), descifrado; `null` si el número ya estaba registrado. También de una línea desconectada. 404 si es ajena (2026-10-13) |
| POST | `/api/lines/:id/history-sync` | JWT | Vuelve a pedir a Meta la agenda o el historial de la app de WhatsApp Business que no se pudo pedir (un `rejected`, o un `uncertain` con más de 30 minutos): 204, y el worker lo pide. 409 `history_sync_unavailable` si no hay nada que reintentar, la línea no es de la app, está desconectada o pasaron 24 h desde la conexión; 404 si es ajena o no está a su alcance ([whatsapp-envio.md § El historial de la app al conectar](whatsapp-envio.md#embedded-signup-objetivo-central--saas-multi-cliente)) (2026-10-26) |
| POST | `/api/chats/messages` | JWT | Enviar mensaje por número (reutiliza su conversación en esa línea). `lineId?` elige la línea (404 si es de otra cuenta; sin él, la por defecto). **409** si el contacto nunca escribió o la ventana está cerrada: hay que empezar con una plantilla |
| POST | `/api/chats/:id/messages` | JWT | Enviar mensaje a conversación existente. **409** (`code: window_closed`) si la ventana de 24 h está cerrada, sin llamar a Meta. `replyToMessageId` (opcional): responde citando ese mensaje, que tiene que ser de esta conversación (404 si no; 400 `reply_unavailable` si no se puede citar) |
| POST | `/api/chats/:id/media` | JWT | Enviar un archivo a una conversación. Cuerpo = el archivo crudo (Content-Type = su tipo); `X-Filename`, `X-Caption` (URI-encoded) y `X-Temporal-Id` en cabeceras, `X-Send-As: document` para una imagen como documento, `X-Reply-To` (el id del mensaje que cita, como `replyToMessageId`). 400 si no vale, **409** fuera de la ventana. Responde el mensaje (`201`) aunque Meta lo rechace |
| GET | `/api/chats` | JWT | Listar las conversaciones que la persona ve, cada una con su `lineId` (`null` si es anterior a las líneas), `assignedTo` y `transferRequest` |
| GET | `/api/chats/:id/messages` | JWT | Mensajes paginados (cursor-based) |
| PUT | `/api/chats/:id/messages/:messageId/reaction` | JWT | Reaccionar a un mensaje del contacto: `{ emoji }`, `''` la quita. 404 si el mensaje no es de esta conversación; 400 `reaction_unavailable` si no se puede (saliente, borrado, más de 30 días); 409 `reaction_in_progress` si otra reacción a ese mensaje va en camino; 502 con `errorCode` si Meta la rechaza. Responde el mensaje ([whatsapp-envio.md](whatsapp-envio.md#responder-citando-y-reaccionar-replytomessageid-sendreaction)) |
| POST | `/api/chats/:id/template` | JWT | Enviar plantilla a una conversación existente (para reabrir la ventana de 24 h). Body: `{ templateName, language?, parameters?, buttons? }` |
| POST | `/api/chats/template` | JWT | Iniciar conversación con plantilla desde la bandeja. Body: `{ destinationNumber, contactName?, templateName, language?, parameters?, buttons?, lineId? }` — el número solo dígitos (8–15); `lineId` elige la línea (404 si es de otra cuenta; sin él, la por defecto) |
| GET | `/api/media/:id` | JWT | Adjunto de un mensaje (`:id` es el **id del mensaje**, no el del archivo) |
| GET | `/api/contacts` | JWT | Contactos paginados (`?search`, `?filter=all\|with_conversation\|without_conversation\|opted_out`, `?tags=id,id` —alguna de—, `?page`, `?limit` máx 50), ordenados por actividad |
| GET | `/api/contacts/:id` | JWT | Ficha: contacto + `activity` (primer mensaje, enviados, recibidos, fallidos) + `noteList` (las notas, de la más nueva a la más vieja: [contactos.md § Notas del contacto](contactos.md#notas-del-contacto-contactnote-contactnotecontrollerjs)) |
| POST | `/api/contacts` | JWT | Alta manual (`phone` obligatorio). No envía nada. 409 con `contactId` si el teléfono ya existe. `notes`, si viene, es la primera nota, a nombre de quien lo crea |
| PATCH | `/api/contacts/:id` | JWT | Editar `phone`, `name`, `email`, `company`. El teléfono **no** cambia si hay conversación (409). `notes` ya no se cambia aquí: igual a la de antes se ignora; distinta, 400 `notes_moved` (pestañas con el frontend anterior) |
| DELETE | `/api/contacts/:id` | JWT | Borrar, **solo si nunca hubo conversación** (409 si la hay), con sus notas |
| POST | `/api/contacts/:id/notes` | JWT | Nota nueva `{ text }` (1 a 1000), a nombre de quien la escribe. 409 `notes_limit` con 500 |
| PATCH | `/api/contacts/:id/notes/:noteId` | JWT | Editar `{ text }`: el autor, o owner y admin (403 `note_not_yours`) |
| DELETE | `/api/contacts/:id/notes/:noteId` | JWT | Borrar: el autor, o owner y admin (403 `note_not_yours`) |
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
| POST | `/api/campaigns` | JWT | Crea la campaña y congela la lista. Body: `{ name, templateId, variables, buttons, excludeOptedOut, recipients, headerMediaId?, saveHeaderAsDefault?, lineId? }` (`lineId`: la línea por la que sale; sin él, la por defecto; 404 si es ajena) (`headerMediaId` también en la vista previa). 400 con los errores, 409 sin WhatsApp conectado |
| GET | `/api/campaigns` | JWT | Campañas paginadas (`?page`, `?limit` máx 50), con estadísticas y su `lineId` |
| GET | `/api/campaigns/:id` | JWT | Una campaña con sus estadísticas |
| GET | `/api/campaigns/:id/failures` | JWT | Fallidos agrupados por código de error (`{ reasons: [{ code, detail, count }] }`): junta los rechazados por Meta y los que fallaron antes de llamarla |
| GET | `/api/campaigns/:id/recipients` | JWT | Destinatarios paginados (`?state=pending\|sent\|delivered\|read\|failed\|skipped\|cancelled\|interrupted`), con error y conversación |
| POST | `/api/campaigns/:id/pause \| resume \| cancel` | JWT | Control de la campaña. 409 si el estado ya no lo permite |
| GET | `/api/stream` | JWT | SSE stream del usuario |
| GET | `/api/templates/sync` | JWT | Sincronizar plantillas desde Meta API → MongoDB, de cada WABA con alguna línea activa |
| GET | `/api/templates` | JWT | Listar plantillas guardadas en DB (con `header`, `headerMedia` resumido y `waBusinessId`): las de los WABA con alguna línea activa o, con `?lineId=`, las del WABA de esa línea (404 si es ajena). Si alguna se sincronizó antes de guardar la cabecera, re-sincroniza una vez |
| PUT | `/api/templates/:templateId/header-media` | JWT | Archivo de la cabecera. Cuerpo = el archivo crudo (Content-Type = su tipo), nombre en `X-Filename` (URI-encoded). Valida formato, tamaño y firma de bytes. No llama a Meta |
| POST | `/api/templates/:templateId/header-media/files` | JWT | Archivo de la cabecera para **un envío** (una campaña), sin tocar el de la plantilla. Mismo cuerpo y validación que el `PUT`; devuelve el archivo (`{ id, mimeType, filename, size }`) para pasarlo como `headerMediaId` |
| DELETE | `/api/templates/:templateId/header-media` | JWT | La plantilla se queda sin archivo (el archivo no se borra: una campaña puede usarlo) |
| GET | `/api/templates/media/:id` | JWT | Ver el archivo de una cabecera (404 si es ajeno) |
| POST | `/api/api-key/generate` | JWT | Generar API key (guarda hash; devuelve la key en claro **una sola vez**) |
| GET | `/api/api-key` | JWT | Listar API keys (preview, estado, último uso; nunca el hash) |
| DELETE | `/api/api-key/:id` | JWT | Revocar (eliminar) una API key |
| POST | `/api/v1/templates/send` | **API key** | **API pública:** enviar plantilla. Body: `{ destinationNumber, templateName, language?, parameters?, contactName?, buttons?, lineId?, from? }`. `lineId` o `from` (el número de la línea; desde la Fase 2b) eligen la línea; sin ellos, la por defecto y todo igual que antes ([whatsapp-envio.md § API pública](whatsapp-envio.md#api-pública-de-plantillas-sendtemplatecontroller)) |
| GET | `/api/admin/stats` | JWT + superadmin | Métricas de plataforma: clientes (cuentas) totales/conectados (con alguna línea activa), mensajes y fallos de 7 días |
| GET | `/api/admin/clients` | JWT + superadmin | Listado paginado de clientes: **una fila por cuenta**, la de su owner (Fase 3: las demás personas no son clientes aparte). `?page`, `?limit` máx 50. Con su `accountId`, `lines: { active, max }`, `users: { active, pending, max }` (personas activas e invitaciones pendientes) y `extraWabas` (cuántos WABA más tiene con líneas conectadas). «Conectado» = con alguna línea activa. Nunca devuelve token WA, texto de mensajes ni teléfonos |
| PATCH | `/api/admin/accounts/:accountId/limits` | JWT + superadmin | `{ maxLines?, maxUsers? }` (al menos uno; líneas de 1 a 50, usuarios de 1 a 200): cuántas líneas y personas puede tener la cuenta. Bajarlos no desconecta ni desactiva nada, solo impide añadir más. Responde `{ accountId, maxLines, maxUsers }`. 404 si la cuenta no existe |
| GET | `/api/team` | JWT + `team.manage` | El equipo (Fase 3): `{ members: [{ id, name, email, role, lineIds, status, createdAt }], invitations: [{ id, email, role, lineIds, expiresAt, createdAt, invitedByName }], maxUsers, seatsUsed }`. Solo las invitaciones pendientes y vigentes; nunca su token |
| POST | `/api/team/invitations` | JWT + `team.manage` | `{ email, role: 'admin'\|'supervisor'\|'agent', lineIds }` (supervisor y agente, al menos una línea de la cuenta; 404 si alguna no lo es) → `201 { invitation, token }`. El token sale **una vez** (se guarda su hash) y caduca a los 7 días; el frontend arma el enlace `<origen>/invite/<token>`. 409 `email_taken` si el correo ya usa Wasmish, 409 `user_limit` sin plaza, 409 `team_busy` con otro cambio a la vez. Volver a invitar un correo con una invitación pendiente la reemplaza (el enlace viejo deja de valer) sin ocupar otra plaza; mientras alguien la está aceptando, 409 `invitation_busy` |
| DELETE | `/api/team/invitations/:id` | JWT + `team.manage` | Anula una invitación pendiente y libera su plaza. 204; 404 si es ajena; 409 `invitation_busy` mientras alguien la está aceptando (su plaza la va a ocupar) |
| PATCH | `/api/team/members/:id` | JWT + `team.manage` | `{ role?, lineIds?, status? }`. 403 `owner_locked` (el owner no se cambia aquí), 403 `self_change` (nadie se cambia a sí mismo el rol ni el estado), 400 `choose_lines` (un supervisor o agente sin líneas), 409 `user_limit` al reactivar sin plaza (activar siempre va con el candado del equipo y relee el estado). Cualquier cambio cierra sus conexiones SSE (`access_changed`). 404 si es ajeno |
| GET | `/api/invitations/:token` | — (con `authLimiter`) | Lo que enseña la página de aceptar: `{ email, accountName, role, invitedByName, lineNames, expiresAt }`. 404 `invitation_invalid` si no existe o ya se usó; 410 `invitation_expired` si caducó |
| POST | `/api/invitations/:token/accept` | — (con `authLimiter`) | `{ name, password }` (las reglas del registro): crea la persona con el correo, el rol y las líneas de la invitación, y entra (la cookie y la respuesta del login). La invitación se **reclama** (`claimedAt`) y sigue ocupando su plaza hasta que el usuario existe; mientras tanto no se puede anular ni reemplazar. Si crear el usuario falla, se suelta; al terminar se cierra solo la invitación con ese token y ese reclamo (si cambió, el usuario se borra y 409). 409 `email_taken` si el correo se registró entretanto |
| GET | `/api/push/config` | JWT | La clave pública VAPID para suscribir el navegador a los avisos: `{ publicKey }`, `null` si los avisos están apagados (app móvil) |
| POST | `/api/push/subscriptions` | JWT | La persona **activa** los avisos en este navegador: `{ endpoint, keys: { p256dh, auth } }` (lo de `PushSubscription.toJSON()`). Si el navegador era de otra persona, pasa a ser suyo. 400 si el `endpoint` no es de un servicio de push conocido (`isAllowedPushEndpoint`); 503 `push_disabled` sin claves VAPID |
| POST | `/api/push/subscriptions/sync` | JWT | Lo mismo, automático (al abrir la app o al renovarse la suscripción): crea la suscripción o actualiza la suya, pero **nunca** se queda con la de otra persona: 409 `push_owned_by_other` |
| DELETE | `/api/push/subscriptions` | JWT | `{ endpoint }`: apaga los avisos de este navegador (también al cerrar sesión). 204; 404 si no es de la persona de la sesión |
| GET | `/api/auto-replies` | JWT + `autoReplies.manage` | Las respuestas automáticas de la cuenta: `{ configured, enabled, timezone, handoffHours, welcome: { enabled, text, returnAfterDays }, outOfHours: { enabled, text, schedule }, keywordRules: [{ id, enabled, keywords, text, lineIds }], fallback: { enabled, text } }`. Sin guardar nunca, las de por defecto (apagadas) y `configured: false`: la página abre el asistente |
| PUT | `/api/auto-replies` | JWT + `autoReplies.manage` | La misma forma (sin `id` en las reglas nuevas): la reemplaza entera y responde como el `GET`. 400 si no es válida (también dos reglas con el mismo `id`); 404 si una regla apunta a una línea ajena |
| POST | `/api/auto-replies/preview` | JWT + `autoReplies.manage` + `previewLimiter` (120 por minuto y cuenta) | `{ settings, messages }` (de 1 a 20 mensajes de hasta 1.000 caracteres) → `{ turns: [{ reply, parts: [{ kind, text, ruleIndex?, keyword? }], repeated, fallbackRepeated, skip }] }`: cómo respondería **esa** configuración (sin guardarla) a una conversación de un contacto nuevo, ahora, mensaje a mensaje (`simulateConversation`). No envía nada; `reply: null` si no respondería. Mientras dura un despliegue acepta también la forma de antes, `{ settings, text }` → `{ reply, parts, matchedRuleIndexes, outOfHours, fallback }`; con los dos campos, 400 |
| GET | `/api/webhook` | No | Verificación webhook Meta (hub.challenge) |
| POST | `/api/webhook` | **Firma HMAC** | Recibir mensajes/status de WhatsApp |
