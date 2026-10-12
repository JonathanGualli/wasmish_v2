# Multi-línea y multi-agente — análisis y diseño

Fecha: 2026-10-11. Estado: **diseño aprobado** por Jonathan el 2026-10-11, con sus respuestas en los § 7 y 8. No quedan preguntas abiertas. Plan de la Fase 0 (aprobado): `docs/superpowers/plans/2026-10-11-multi-linea-fase-0.md`.

Objetivo: que una cuenta (organización) tenga **varias líneas** de WhatsApp y **varios usuarios** con roles, con acceso por línea y asignación de conversaciones, sin romper al cliente que ya usa la API pública ni a las cuentas actuales.

Fuentes: el grafo de graphify (actualizado el 2026-10-11, después del último cambio de código) y la lectura del código. El grafo sirvió para ver el acoplamiento estructural: `user.model.js` lo importan 13 archivos, entre ellos los controladores de chat, plantillas, campañas, webhook y WhatsApp, y el worker. Los problemas de comportamiento (de qué número sale una plantilla, la clave de la conversación) salieron de leer el código, no del grafo.

---

## 1. Estado actual

### 1.1 Cómo se modela hoy

**No existe la cuenta como entidad.** El documento `User` es a la vez la persona que inicia sesión, la cuenta (el *tenant*: todo lo demás cuelga de su `_id` vía `userId`) y la línea de WhatsApp.

| Entidad | Modelo | Ligada a la cuenta por | Notas |
|---|---|---|---|
| Usuario = cuenta = línea | `Backend/src/models/user.model.js` | — | `tokenWhatsapp` (cifrado), `phoneNumberId`, `waBusinessId`: **uno de cada**. `phoneNumberId` **sin índice único** |
| Contacto | `contact.model.js` | `userId` | Únicos `{ userId, phone }` y `{ userId, waUserId }` |
| Conversación | `conversation.model.js` | `userId` | Única `{ userId, contactId }`. Guarda `phoneNumberId` (obligatorio), pero **no es parte de la clave** |
| Mensaje | `message.model.js` | vía `conversationId` | No guarda quién lo envió |
| Plantilla | `template.model.js` | `userId` | Sin `waBusinessId`; `templateId` único global |
| Archivo de cabecera | `template.media.model.js` | `userId` | `metaPhoneNumberId`: el único sitio que ya sabe de qué número es un `media_id` |
| Etiqueta, campaña, destinatario, API key | `tag`, `campaign`, `campaign.recipient`, `api.keys` | `userId` | Campaña sin línea |

### 1.2 Roles y permisos que existen

- `User.rol`: `admin | agent | superadmin`, por defecto `admin` (`user.model.js`). El registro es público y acepta `rol: admin|agent` y `status` del cuerpo (`schemas/auth.schema.js:8-9`). **`agent` hoy no cambia nada**.
- Un solo guard: `requireSuperadmin` (`middlewares/require.superadmin.middleware.js`), que lee el rol de la BD en cada petición; solo protege `/api/admin/*`.
- Sesión: JWT `{ id }` en cookie (`libs/jwt.js`); `authRequired` pone `req.user = { id }` sin leer la BD (`validate.token.middleware.js:11`). La API key pone `req.user = { id: dueño }` (`validate.api.key.middleware.js:31`).
- `status: 'inactive'` existe, pero **el login no lo mira** (`auth.controller.js:77`).
- Frontend: `user.rol === 'superadmin'` en `components/Sidebar/Sidebar.tsx:50` y `pages/private/PrivateRouter.tsx:29`. Nada más.

### 1.3 Dónde está acoplado «1 cuenta = 1 línea = 1 agente»

| # | Dónde | Qué supone |
|---|---|---|
| 1 | `controllers/webhook.controller.js:346` — `User.findOne({ phoneNumberId })` | El número identifica **al usuario**, y nada garantiza que un número esté en una sola cuenta |
| 2 | `controllers/whatsapp.controller.js:18-24` y `controllers/user.controller.js:10-17` | Conectar **sobrescribe** token, número y WABA del usuario: un segundo número reemplaza al primero |
| 3 | `controllers/chat.controller.js:90-91` (`processMessageSending`) | Token del usuario; número de la conversación con reserva en `user.phoneNumberId` |
| 4 | `controllers/template.controller.js:402-409` (`processTemplateSending`) | **Siempre** `user.phoneNumberId`, aunque la conversación sea de otro número |
| 5 | `template.controller.js:27-29` (`syncTemplatesForUser`), `:416` y `:426` | Un WABA por cuenta; plantillas buscadas por `{ userId, name }`: con dos WABA, dos plantillas del mismo nombre chocan |
| 6 | `conversation.model.js` (índice `conversation_contact_unique`) y `contact.controller.js:117-118` (`findOrCreateConversation`) | Un contacto que escribe a dos números caería en **la misma** conversación, con la ventana de 24 h mezclada (la ventana es por número del negocio) |
| 7 | `campaign.controller.js:253-254`, `workers/campaign.worker.js:46-52` y `:121` | La campaña sale del número del usuario; el worker reparte el ritmo **por cuenta**, cuando Meta lo limita **por número** |
| 8 | `controllers/stream.controller.js` y sus 8 `sendUser(String(user._id), …)` (webhook ×4, chat ×2, plantillas ×1, `campaign.service.js` ×1) | Los eventos van a **un** usuario: los demás de la cuenta no se enteran |
| 9 | `req.user.id` como dueño en todos los controladores: unas 250 apariciones de `userId` en `src/` (contactos 59, chat 26, campañas 23, etiquetas 21, plantillas 18, importar 14…) y 19 `User.findById/findOne` | La persona de la sesión **es** la cuenta |
| 10 | `template.controller.js:561-566` (`sendTemplateController`, API pública) | Envía desde `user.phoneNumberId`: el cliente de la API no puede elegir línea |
| 11 | `controllers/admin.controller.js:20-21`, `:41-42` y `:103` | «Clientes» = usuarios; «conectados» = usuarios con token |
| 12 | Frontend: `models/user.mode.ts`, `Settings/SettingsPage.tsx:42` (`isConnected = Boolean(user?.phoneNumberId)`) y el formulario de token manual, `hooks/useConnectWhatsapp.ts` | Un número por usuario en la sesión y en Ajustes |
| 13 | `auth.controller.js:92-94` y `:142-144` | Login y `/verify` devuelven el número del usuario |
| 14 | `scripts/simulate-webhook.js`, `scripts/seed-test-contacts.js` | Buscan «el» usuario y «su» número |
| 15 | `contact.controller.js:246` (`findContactConversation`), `:307-308` (`$arrayElemAt` en `contactSelectionStages`), `:378-399` (`getContact` y su `activity`); `Frontend/.../Contacts/ContactPanel.tsx:186` | **Una** conversación por contacto: la lista y la ficha enseñan una sola ventana, un solo `conversationId` y sus estadísticas *(Codex)* |
| 16 | `chat.controller.js:152` (`findConversationByNumber`), usado en `:219` | Comprueba la ventana de 24 h por cuenta y teléfono, sin línea *(Codex)* |
| 17 | `validate.api.key.middleware.js:23` (`User.findById(apiKeyDoc.userId)`) y `rate.limit.middleware.js:26` (`publicApiUserLimiter` por `req.user.id`) | La API key es de **un usuario**, y el límite de envíos también *(Codex)* |
| 18 | `template.controller.js:27-31` (`syncTemplatesForUser`) | Descifra el token **antes** de comprobar que exista: `GET /templates/sync` sin WhatsApp da 500 *(Codex; se arregla en la Fase 0)* |

---

## 2. Brechas

### 2.1 Qué falta

1. **Cuenta separada del usuario**: dónde viven las líneas, el plan y los límites, y a qué se ligan los datos.
2. **Línea** como entidad (número + WABA + token), con enrutado del webhook por `phone_number_id` **único global**.
3. **Conversación por línea**: la clave pasa a ser `{ cuenta, línea, contacto }`.
4. **Usuarios de la cuenta**: invitar, rol, líneas a las que accede, desactivar. **No hay servicio de correo** en el backend (ni `nodemailer` ni ningún proveedor): invitar necesita otro mecanismo o montarlo.
5. **Permisos** aplicados en el backend (middleware) y reflejados en la UI.
6. **Quién envió** cada mensaje (`Message.sentBy`) y **a quién está asignada** cada conversación.
7. **Tiempo real por cuenta**, filtrado por línea y asignación.
8. **Elegir la línea** al iniciar una conversación, al crear una campaña y en la API pública.

### 2.2 Riesgos

- **El enrutado por número, primero.** Con varias líneas por cuenta, «este `phone_number_id` es de esta cuenta» se vuelve el centro del sistema, y hoy ni la base de datos ni la conexión lo garantizan del todo. Se refuerza en la **Fase 0**, antes que nada.
- **Tokens por WABA.** El token del Embedded Signup es del negocio del cliente y sirve para todos los números de ese WABA. Va **una vez por WABA**, no copiado en cada línea. Las plantillas también son del WABA. **No sé** si repetir el Embedded Signup para un segundo número del mismo WABA invalida el token anterior: hay que comprobarlo en la app WasmishTest antes de la Fase 2.
- **El webhook es único por app.** No se toca: el enrutado es interno, por `phone_number_id` → línea.
- **Aislamiento.** Si un controlador sigue usando `req.user.id` como cuenta tras el cambio, para el dueño funcionará «de casualidad» (ver 3.1) y para un agente invitado fallará o filtrará datos. Los tests de aislamiento tienen que usar usuarios cuyo id **no** coincida con el de la cuenta, y sumar una dimensión nueva: un agente de A **sin acceso** a una línea de A.
- **El cliente de la API pública.** Usa `POST /api/v1/templates/send` para el OTP. Sin `lineId` en la petición, la API usa la **línea por defecto** de la cuenta; respuesta idéntica. Durante el despliegue con migración, Meta reintenta los webhooks que no reciben 200, así que unos minutos de parada no pierden mensajes. Su API sí fallaría en ese tiempo: conviene una hora de poco tráfico.
- **Datos existentes.** Migración de `User` → cuenta + WABA + línea, más `lineId` en conversaciones y campañas y `waBusinessId` en plantillas. El índice único viejo de la conversación hay que **borrarlo a mano**: Mongoose crea índices nuevos pero no borra los viejos, y el viejo `{ userId, contactId }` impediría la segunda conversación de un contacto.
- **Números anteriores al actual** *(Codex)*. Hoy conectar otro número sobrescribe `User.phoneNumberId`, pero las conversaciones guardan el número con el que nacieron. Si se asignara la línea actual a **todas** las conversaciones, el historial y las ventanas de un número viejo pasarían al nuevo. La migración trabaja **por el `phoneNumberId` real de cada conversación** (ver Fase 2).
- **El hueco entre desplegar y migrar** *(Codex)*. Si el webhook pasa a buscar `Line` antes de que existan las líneas, un número real parece desconocido: el webhook lo ignora y responde 200, y **Meta no reintenta un 200**, así que el mensaje se pierde. La API pública se quedaría sin línea por defecto. Ver la transición en dos pasos de la Fase 2.
- **La vuelta atrás** *(Codex)*. Conservar los campos viejos de `User` no basta si dejan de escribirse: una renovación de token o una cuenta nueva solo en `Waba`/`Line` dejarían a la imagen anterior con datos viejos o vacíos. Mientras dure el periodo de vuelta atrás hay **doble escritura** (Fase 2).
- **Carreras al asignar** *(Codex)*. Hoy se llama a Meta antes de guardar nada. Si dos agentes responden a la vez una conversación sin asignar, comprobar y asignar después dejaría salir las dos respuestas. La asignación se adquiere de forma atómica **antes** de llamar a Meta (Fase 4).
- **Una sola instancia.** SSE (un `Map` en memoria) y el worker suponen un solo proceso. No cambia con esto, pero sigue siendo el límite para escalar.
- **No leídos.** `unreadCount` es de la conversación y lo comparten todos los que la ven. Es aceptable en la primera versión.

---

## 3. Propuesta de diseño

### 3.1 Modelo de datos

```
Account (organización)
 ├── User ×N            role: owner | admin | supervisor | agent · lineIds[] · isSuperadmin
 ├── Waba ×N            waBusinessId (único global) · token cifrado
 │    └── Line ×N       phoneNumberId (único global) · displayPhoneNumber · verifiedName · name
 ├── Contact ×N         de la cuenta, compartido por todas las líneas
 ├── Conversation ×N    lineId · contactId (único por cuenta+línea+contacto) · assignedTo
 │    └── Message       sentBy
 ├── Template           + waBusinessId
 ├── Campaign           + lineId
 └── Tag, ApiKey, TemplateMedia   sin cambios
```

| Modelo | Campos nuevos o cambiados |
|---|---|
| `Account` (nuevo) | `name`, `ownerId`, `defaultLineId`, `status`, `plan` (nombre, solo informativo), `limits: { maxLines: 1, maxUsers: 1 }`. Los límites los edita el superadmin: son a la vez el **plan comercial** (§ 3.5) y el interruptor para encender multi-línea cuenta por cuenta |
| `User` | `accountId`, `role`, `lineIds: [ObjectId]` (lo ignoran owner y admin, que ven todas), `isSuperadmin`. `tokenWhatsapp`, `phoneNumberId`, `waBusinessId` y `rol` **se conservan** hasta la Fase 5 (vuelta atrás) |
| `Waba` (nuevo) | `accountId`, `waBusinessId` (único), `tokenWhatsapp` (cifrado, como hoy) |
| `Line` (nuevo) | `accountId`, `wabaId`, `phoneNumberId` (único), `displayPhoneNumber`, `verifiedName`, `name` («Ventas»), `status: active | disconnected` |
| `Conversation` | `lineId`; índice único `{ userId, lineId, contactId }` (parcial, como el actual); `assignedTo`, `assignedAt`, `assignedBy` (Fase 4) |
| `Message` | `sentBy` (usuario que lo envió desde el chat; `null` en campañas y API) |
| `Template` | `waBusinessId`; búsquedas por `{ userId, waBusinessId, name }` |
| `Campaign` | `lineId` |

**La clave de la cuenta en los datos.** Tres alternativas:

- **A. Renombrar `userId` → `accountId`** en 9 colecciones, unas 250 líneas de código y todos los documentos. Queda lo más limpio, pero es el cambio más grande y el más arriesgado.
- **B (recomendada). `Account._id` = `_id` del usuario que la crea.** Vale para las cuentas migradas y también para las nuevas: el registro crea los dos con el mismo id. El campo `userId` de contactos, conversaciones, etc. **no se toca**: pasa a significar «la cuenta», y su comentario en cada modelo lo dice. En el código, el dueño de los datos sale de `req.auth.accountId`, nunca de `req.user.id`. **No hay que migrar ningún documento** de esas colecciones. El coste es un nombre que engaña; el renombrado puede hacerse más adelante, si molesta.
- **C. El usuario dueño hace de cuenta** (los agentes con `ownerId`). No hay colección nueva, pero las líneas, el plan y la facturación cuelgan de una persona, y transferir la propiedad sería imposible. Descartada.

### 3.2 Sesión

Un middleware `loadAuth`, montado después de `authRequired` y de `validateApiKey`. Lee el usuario de la BD en cada petición, igual que ya hace `requireSuperadmin`, para que quitar acceso tenga efecto inmediato. Hoy 19 controladores ya hacen ese `findById` por su cuenta. El middleware:

- rechaza al usuario `inactive` con 401;
- deja `req.auth = { userId, accountId, role, lineIds, isSuperadmin }`;
- con API key, deja `req.auth = { userId: null, accountId, role: 'api', lineIds: null }`, donde `null` significa todas.

### 3.3 Roles y permisos

Hay **un rol por cuenta** más **una lista de líneas**: owner y admin ven todas las líneas; supervisor y agente, solo las suyas. Se descartó un rol distinto en cada línea (supervisor en una, agente en otra): complica la UI y la matriz, y ningún cliente lo ha pedido. El superadmin de la plataforma va aparte (`isSuperadmin`), no es un rol de la cuenta.

| Acción | Owner | Admin | Supervisor | Agente |
|---|:-:|:-:|:-:|:-:|
| Ver conversaciones de sus líneas | todas | todas | todas | sin asignar + suyas; **nunca** las de sus compañeros |
| Responder (texto, archivo, plantilla) | ✓ | ✓ | ✓ | ✓ (responder una sin asignar se la asigna) |
| Iniciar conversación (plantilla) | ✓ | ✓ | ✓ | ✓ |
| Asignar o transferir conversaciones | ✓ | ✓ | ✓ | tomar sin asignar, transferir las suyas y **pedir** que le transfieran una ajena |
| Aceptar o rechazar una solicitud de transferencia | ✓ | ✓ | ✓ | solo de las suyas |
| Ver y editar los contactos (todos los de la cuenta) | ✓ | ✓ | ✓ | ✓ |
| Importar o borrar contactos, gestionar etiquetas | ✓ | ✓ | ✓ | ✗ |
| Ver plantillas | ✓ | ✓ | ✓ | ✓ |
| Sincronizar plantillas y subir su cabecera | ✓ | ✓ | ✓ | ✗ |
| Campañas: ver, crear, pausar, cancelar | ✓ | ✓ | ✓ (en sus líneas) | ✗ |
| API keys | ✓ | ✓ | ✗ | ✗ |
| Conectar o desconectar líneas (Embedded Signup y formulario de token manual) | ✓ | ✓ | ✗ | ✗ |
| Usuarios: invitar, rol, líneas, desactivar | ✓ | ✓ (no al owner) | ✗ | ✗ |
| Cuenta: nombre, transferir propiedad, borrar | ✓ | ✗ | ✗ | ✗ |
| Panel de la plataforma (`/admin`) | solo `isSuperadmin` | | | |

**Cómo se aplica:**

- `utils/permissions.js` es puro y lleva test. Define `PERMISSIONS` (acción → roles), `can(auth, action)`, `lineScope(auth)` (`null` = todas, o la lista) y `conversationScope(auth)`, que devuelve el filtro de Mongo: línea y, para el agente, `assignedTo ∈ [él, null]`.
- `requirePermission(action)` responde **403** a una acción que el rol no tiene. Es su propia cuenta: no hay nada que ocultar.
- Una conversación de una línea sin acceso responde **404**, como si fuera de otra cuenta (regla 1). `conversationScope` entra en **todas** las búsquedas de conversación (chat, mensajes, media, envíos, plantillas desde el chat), en el mismo sitio donde hoy está `{ _id, userId }`.
- El frontend **no copia la matriz**: `/verify` y el login devuelven `permissions: string[]` y `lines`, y un `can(action)` en `AuthProvider` decide qué se enseña. La autoridad es siempre el backend.

### 3.4 Asignación de conversaciones

| Opción | Qué necesita | Cuándo |
|---|---|---|
| **Manual**: tomar, asignar y transferir | `assignedTo` y tres endpoints | **MVP (Fase 4)** |
| **Round-robin** entre los agentes de la línea, al llegar un entrante a una conversación sin asignar | `Line.autoAssign`, el puntero del turno en la línea; función pura `nextAgent(agents, lastAssignedId)` | Fase 5 |
| **Por disponibilidad y carga** | Presencia (conectado por SSE o un interruptor «disponible») y un concepto de **conversación cerrada** para contar la carga | Después; depende de la pregunta 5 |

Recomiendo la manual en el MVP y el round-robin opcional por línea justo después: cubre el caso de «nadie se pisa» sin inventar presencia ni estados.

**Reglas:**

- Un entrante en una conversación asignada sigue con su agente.
- Desactivar a un agente, o quitarle una línea, devuelve sus conversaciones de esa línea a «sin asignar» en la misma operación.
- Cada cambio de asignación emite el evento SSE `conversation_assigned`.
- Las notas internas al transferir («Ana → Luis: pide factura») no van en el MVP: necesitan un tipo de mensaje interno que toca el chat entero.

**Tiempo real:** `sendUser(userId, …)` pasa a ser `sendToAccount(accountId, event, data, meta)`, con `meta = { lineId, assignedTo }`. Cada conexión SSE guarda su `req.auth`, y una función pura `canReceive(auth, meta)` (con test) decide quién recibe cada evento.

La conexión abierta conserva el `req.auth` con el que se abrió, así que **cualquier** cambio de acceso la cierra: estado, rol o líneas (`disconnectUser(userId)`). No basta con cerrarla al quitar una línea: un supervisor que pasa a agente seguiría recibiendo lo de sus compañeros *(Codex)*. El navegador reconecta solo y vuelve con el acceso nuevo.

Cuando una conversación cambia de manos, el agente que la pierde recibe `conversation_revoked { id }` **antes** de que se filtre por la asignación nueva, y la UI la quita de su caché. Si no, filtrar solo por el nuevo dueño le impediría enterarse de que la perdió *(Codex)*.

### 3.5 Planes: por líneas y por agentes

Jonathan decidió cobrar **por líneas y por agentes**, como los proveedores parecidos. Las dos tablas de precios que compartió (2026-10-11) limitan lo mismo:

| Proveedor | Plan | Precio/mes | Líneas | Usuarios | Contactos | Además |
|---|---|---|---|---|---|---|
| Uno (sin nombre en la captura) | Equipo | $83 | 2 | 3 | 5.000 activos | IA 30.000 créditos |
| | Empresa | $191 | 5 | 10 | 15.000 activos | IA 70.000, embudos |
| | Corporativo | $499 | 15 | 30 | 60.000 activos | IA 200.000, embudos |
| WhatChimp (anual) | Basic | $24 | 1 | 2 | 5.000 | IA 100K tokens |
| | Pro | $60 | hasta 4 | 5 | 15.000 | **roles y permisos**, **reparto automático**, supervisión |
| | Enterprise | desde $119 | 5–25 | 10+ | 50K–250K | gestor de cuenta |

Qué se lleva el diseño de esto:

- **Los dos límites del MVP** son `Account.limits.maxLines` y `Account.limits.maxUsers`. Cuentan los usuarios **activos**, el owner incluido (los dos proveedores dicen «Agentes (Usuarios)» y «team members»). Un usuario desactivado libera su plaza.
- **Superar el límite** bloquea añadir más (409 con el motivo, y la UI lo dice antes de intentarlo). **Bajar de plan nunca desconecta** una línea ni desactiva a nadie: solo impide añadir hasta volver por debajo.
- **Los planes con nombre** (Equipo, Empresa…) se resuelven con `Account.plan` como etiqueta y los límites copiados en la cuenta. Así cabe un acuerdo a medida, como el «desde» de WhatChimp, sin crear una colección `Plan`. **El cobro va fuera de Wasmish por ahora**: el superadmin ajusta los límites a mano. Lo ideal, según Jonathan, es que vaya dentro (pasarela, renovación automática); eso es un proyecto aparte después del MVP, y es cuando se añade `Plan`.
- **Después del MVP (decidido):** el límite de **contactos activos**, que los dos usan (falta definir «activo»: ¿con conversación en el mes?). Y funciones por plan: WhatChimp reserva roles y el reparto automático al plan Pro. Esto último sería `Account.features`; no hace falta mientras todos los planes las incluyan.

---

## 4. Plan por fases

Cada fase es una rama, uno o más PRs (backend con sus tests primero y la UI después, si pasa de unas 400–500 líneas), revisión cruzada y un despliegue. Hay **vendible** al final de la Fase 2 (varias líneas, un usuario) y el MVP comercial completo al final de la Fase 4.

### Fase 0 — Cerrar el enrutado por número (prerrequisito, sin cambio visible)

- Comprobar contra Meta que el `phoneNumberId` es del WABA con ese token (`GET /{waba-id}/phone_numbers`), tanto en el Embedded Signup como en el formulario manual.
- Índice único en `User.phoneNumberId`: un número, una cuenta (409 si ya es de otra).
- Corregir el envío de texto o archivo sin WhatsApp conectado, que hoy da 500 en vez de 409 (el cabo suelto de `estado.md`), y `GET /templates/sync` en el mismo caso (§ 1.3 #18).
- Los tests de aislamiento sustituyen el transporte de `whatsappApi` para que **nunca** lleguen a Meta, ni siquiera si una regresión mueve una comprobación.
- Archivos: `libs/whatsapp.js`, `utils/whatsapp.line.js` (nuevo), `services/whatsapp.connection.service.js` (nuevo), `controllers/whatsapp.controller.js`, `controllers/user.controller.js`, `schemas/user.schema.js`, `models/user.model.js`, `controllers/chat.controller.js`, `controllers/template.controller.js`, `tests/isolation/whatsapp.test.js` (nuevo), `tests/isolation/helpers.js`.
- Detalle por tareas: `docs/superpowers/plans/2026-10-11-multi-linea-fase-0.md`.

### Fase 1 — La cuenta, separada del usuario (sin cambio visible)

- `models/account.model.js` (nuevo); `User` con `accountId`, `role`, `isSuperadmin` y `lineIds`.
- `middlewares/load.auth.middleware.js` (nuevo) en todas las rutas privadas y en las de API key; el login rechaza `inactive`.
- `req.user.id` → `req.auth.accountId` como dueño en **todos** los controladores y servicios (lista 1.3 #9) y en `stream.routes.js`. `sendUser` → `sendToAccount`; sin filtro todavía, porque cada cuenta tiene un solo usuario.
- El registro crea la cuenta y su owner con el mismo `_id`, e ignora `rol` y `status` del cuerpo.
- `requireSuperadmin` lee `isSuperadmin`.
- **API key de la cuenta** *(Codex)*. `validateApiKey` carga `Account.findById(apiKeyDoc.userId)`, no el `User`: la key sigue valiendo aunque se transfiera la propiedad, porque la cuenta **conserva su `_id`** al cambiar de owner. `publicApiUserLimiter` cuenta por `req.auth.accountId`. Test: `/v1` con una cuenta cuyo `_id` no es el de ningún usuario responde exactamente lo mismo que hoy.
- `scripts/migrate-accounts.js` (nuevo, `npm run migrate:accounts`), idempotente y con `--dry-run`: una cuenta por usuario (un `rol: 'agent'` sin cuenta propia hace parar el script con su lista, en vez de inventarle una), `role: owner`, `isSuperadmin` desde `rol`. La lógica de qué crear a partir de cada usuario va en una función pura con test (`planAccountMigration(user)`).
- Tests: `seedAccount` crea la cuenta; un test **construye una cuenta cuyo `_id` no es el del usuario** y comprueba que todo sigue aislado. Es el que caza un `req.user.id` olvidado.
- Probablemente dos PRs: el modelo, el middleware y la migración primero; el cambio de los controladores después. Los dos son seguros por separado gracias a que la cuenta y su owner comparten id.

### Fase 2 — Líneas (vendible: varias líneas, un usuario)

Se despliega en **dos pasos**, para que nunca haya un momento en que un número real no tenga dónde llegar *(Codex)*:

- **2a · Ampliar.** Llegan los modelos y la migración, y la conexión escribe en `Waba`/`Line` **y** en los campos viejos de `User`. El webhook y los envíos **siguen enrutando como hoy**. Se migra con `--dry-run` primero y se comprueba con `check:lines`: cada `User.phoneNumberId` tiene su `Line` y cada conversación su `lineId`.
- **2b · Cambiar.** El webhook enruta por `Line`. Si un `phone_number_id` no tiene `Line` pero sí un `User` (algo que la migración debió cubrir), se procesa por el camino viejo, en la línea por defecto de esa cuenta, y deja un `console.error` para investigarlo. **Nunca** se descarta como desconocido. La API pública, igual: sin `defaultLineId` usa la reserva vieja.
- **Doble escritura** hasta la Fase 5. Todo cambio de la línea por defecto (conectar, renovar el token, desconectar) y toda cuenta nueva escriben también `User.tokenWhatsapp/phoneNumberId/waBusinessId` del owner. Lo calcula una función pura con test, `legacyUserFields(defaultLine, waba)`. Así la imagen anterior funciona con datos al día mientras la cuenta tenga una sola línea.

Además:

- `models/waba.model.js` y `models/line.model.js` (nuevos).
- Webhook: `Line.findOne({ phoneNumberId })` → cuenta y línea (`webhook.controller.js:346`), con la reserva de 2b.
- Conectar crea o actualiza el WABA y **añade** una línea, respetando `Account.limits.maxLines`. Desconectar una línea la marca `disconnected` y conserva su historial.
- Envíos: el token y el número salen de la línea de la conversación (`processMessageSending`, `processTemplateSending`). En una conversación nueva, la línea va en el cuerpo, con la línea por defecto como reserva.
- Plantillas por WABA (`syncTemplatesForWaba`, búsquedas con `waBusinessId`). `TemplateMedia` ya distingue el número.
- `Conversation.lineId` + índice nuevo; `findOrCreateConversation({ userId, lineId, contact })`.
- **La línea primero** *(Codex)*. En un envío sin `:id`, la línea se resuelve y se valida **antes** de buscar la conversación. `findConversationByNumber` (`chat.controller.js:152`) y sus reservas filtran por línea: un contacto que escribió hace poco a A1 tiene la ventana **cerrada** en A2 si nunca le escribió ahí. Test de aislamiento: A1 abierta y A2 cerrada → 409 en A2.
- **Contactos con varias conversaciones** *(Codex)*. La lista y la ficha (`contactSelectionStages`, `getContact`, `ContactPanel`) devuelven `conversations: [{ lineId, conversationId, lastInteractionAt, windowExpiresAt }]` en lugar de una sola. La ventana siempre se enseña **con su línea**. Desde la Fase 3, solo las conversaciones que el usuario puede ver (`conversationScope`), y la `activity` se calcula solo sobre esas. Lo que protege el teléfono y el borrado («un contacto con conversación no se borra ni cambia de teléfono») sigue mirando **cualquier** conversación, también las que quien edita no ve. El filtro «con conversación» de la lista mira cualquiera: que exista no es dato de nadie; su contenido sí.
- `Campaign.lineId`; el worker reparte el ritmo por línea (`pickActiveCampaigns`).
- API pública: la línea se elige con `lineId` **o** con `from` (el número de la línea en E.164, comparado con `Line.displayPhoneNumber` sin espacios ni símbolos). Mandar los dos y que no coincidan → 400. Una línea que no es de la cuenta → 404. Sin ninguno, la línea por defecto: **el cliente actual no cambia nada**. La función que resuelve la línea (`resolveApiLine`) es pura y lleva test.
- Admin: cuenta cuentas y líneas.
- Migración (`migrate:lines`), **por número real** *(Codex)*:
  1. Inventario por cuenta de los `Conversation.phoneNumberId` distintos.
  2. El número actual del usuario → `Line` activa con su `Waba`, y pasa a `defaultLineId`.
  3. Cada número anterior → `Line` `disconnected` y sin token: conserva el historial, pero no se envía desde ella.
  4. Cada conversación recibe la `Line` **de su propio número**.
  5. Las campañas, la de su cuenta (hoy todas salieron del número actual de su momento; si se puede deducir de sus `Message`, mejor).
  6. Las plantillas reciben el `waBusinessId` actual con la siguiente sincronización. Las que Meta ya no devuelve se quedan sin él y no entran en las búsquedas.
  7. Se borra el índice `conversation_contact_unique`.

  Con datos ambiguos (una conversación sin `phoneNumberId`, o un número que ya es `Line` de **otra** cuenta), el script **se detiene** con la lista, sin migrar a medias. La lógica es pura y lleva test (`planLineMigration(user, conversationPhoneIds)`).
- `scripts/simulate-webhook.js` acepta `--line`.
- UI: Ajustes → «Líneas» (lista, conectar otra, nombre interno); selector de línea en conversación nueva y en el asistente de campañas; la línea de cada chat en la bandeja, con filtro. Antes, la skill de marca.

### Fase 3 — Equipo: usuarios, roles y acceso por línea (vendible: multi-agente)

- `utils/permissions.js`, `requirePermission`, `conversationScope` en todas las búsquedas de conversación, y `canReceive` en el SSE.
- `disconnectUser(userId)` al cambiar estado, rol o líneas (§ 3.4, tiempo real).
- Usuarios: `GET/POST/PATCH /team` (invitar, rol, líneas, desactivar), con `Account.limits.maxUsers`.
- Invitación con **enlace de un solo uso**: el admin la crea (correo, rol, líneas) y copia el enlace para mandarlo por donde quiera. `Invitation { accountId, email, role, lineIds, tokenHash, expiresAt, acceptedAt, invitedBy }`: el token se guarda hasheado, como las API keys. Aceptarla (`POST /invitations/:token/accept { name, password }`) crea el usuario y la consume. Una invitación pendiente **ocupa plaza** en `maxUsers`. Un correo ya registrado en cualquier cuenta no se puede invitar (un correo, una persona, una cuenta), y caduca a los 7 días.
- `Message.sentBy` en `processMessageSending` y `processTemplateSending`; el chat enseña quién respondió.
- `/verify` y el login devuelven `permissions` y `lines`.
- UI: Ajustes → «Equipo»; `can()` en `Sidebar`, `PrivateRouter` y los botones de acción.

### Fase 4 — Asignación manual (completa el MVP)

- `Conversation.assignedTo/assignedAt/assignedBy`. Endpoints `POST /chats/:id/assign { userId | null }` y `POST /chats/:id/take`. `GET /chats?assigned=me|unassigned|all`.
- Responder una sin asignar la toma; desactivar a alguien o quitarle una línea libera sus conversaciones.
- **Adquirir antes de enviar** *(Codex)*. En una conversación existente, el envío primero la adquiere con una sola escritura condicional, `findOneAndUpdate({ _id, ...conversationScope(auth), assignedTo: { $in: [null, yo] } }, { assignedTo: yo, assignedAt })`, y **solo entonces** llama a Meta. El que pierde recibe el 409 `assigned_to_other` sin haber enviado nada. Lo mismo para una conversación nueva cuyo contacto **ya** tiene conversación en esa línea: se busca y se adquiere antes de Meta. Si el envío a Meta falla, la conversación **se queda asignada** a quien lo intentó: es suya, y el mensaje fallido está en ella.
  Queda un caso sin cerrar: dos agentes que **inician a la vez** una conversación con un contacto que nunca tuvo conversación en esa línea. Ahí no hay nada que adquirir antes de Meta sin romper la regla actual de que un envío que no sale no deja contacto ni conversación detrás. Las dos plantillas salen, el índice único las junta en una conversación y se la queda el primero que la crea. Es raro y no pierde nada; queda documentado y no se cierra. *(Decisión del agente: revisarla.)*
- **Escribir a un contacto que atiende otro agente.** El agente ve todos los contactos, pero no las conversaciones de sus compañeros, así que puede intentar escribir a un contacto cuya conversación en esa línea atiende otro. Respuesta: 409 `{ code: 'assigned_to_other', assignedToName }` y la UI dice «Esta conversación la atiende Ana», sin enseñar el historial, con un botón **«Solicitar que te la transfieran»** (§ 8.1).
- **Solicitud de transferencia.** `POST /chats/:id/transfer-request` guarda `Conversation.transferRequest = { requestedBy, requestedAt }`; hay una sola pendiente por conversación, y una nueva reemplaza a la anterior. Avisa por SSE (`transfer_requested`) al agente que la atiende y a los supervisores y admins de la línea. Si el agente que la atiende, un supervisor o un admin la **acepta**, se asigna al solicitante; si la **rechaza**, se borra y el solicitante recibe el aviso. Se limpia sola cuando la conversación cambia de manos por cualquier otro camino. El agente puede pedirla aunque no vea la conversación: el endpoint solo comprueba que la línea sea suya.
- UI: pestañas «Mías / Sin asignar / Todas» en la bandeja y el menú de asignar en `ChatHeader`.

### Fase 5 — Después del MVP

Round-robin por línea, disponibilidad, «cerrar conversación», límite de contactos activos, cobro dentro de Wasmish, métricas por agente, notas internas y borrar los campos viejos de `User` (`tokenWhatsapp`, `phoneNumberId`, `waBusinessId`, `rol`) una vez pasado el periodo de vuelta atrás.

---

## 5. Migración sin romper al cliente de la API

- **Ampliar → migrar → contraer.** Cada fase solo **añade** campos y colecciones; lo viejo se borra en la Fase 5. El código viejo ignora los campos nuevos y, gracias a la **doble escritura** de la Fase 2, encuentra en `User` el token y el número al día. Así que volver a la imagen anterior funciona **mientras ninguna cuenta tenga dos líneas o dos usuarios**. Por eso `Account.limits` empieza en 1: multi-línea se enciende cuenta por cuenta, primero en una de prueba. Antes de encenderlo en una cuenta real, se ensaya la vuelta atrás en local: migrar, renovar el token, crear una cuenta nueva, arrancar la imagen anterior contra esa BD y comprobar que envía y recibe.
- **Scripts como los `backfill:*`**: idempotentes, con `--dry-run` que cuenta lo que haría. Se ejecutan dentro del contenedor de producción, después del `mongodump`.
- **Orden en cada despliegue con migración:**
  1. `mongodump`;
  2. desplegar la imagen nueva;
  3. `--dry-run` y revisar los conteos;
  4. migrar;
  5. comprobar que el cliente de la API sigue: llega un entrante, `POST /api/v1/templates/send` responde 200 en los logs y `/api/version` da la versión nueva.
  Todo con la skill `deploy` y cada comando confirmado.
- Antes de la Fase 0: comprobar en producción que **no hay `phoneNumberId` repetidos**. Si los hay, el índice único no se crea (Mongoose solo lo registra en el log).

## 6. Cómo probarlo

- **Puras, con test en `tests/`:** `describeWabaPhoneNumber`, `planAccountMigration`, `planLineMigration`, `legacyUserFields`, `resolveApiLine`, `can` / `lineScope` / `conversationScope`, `canReceive`, el reparto del worker por línea y, más adelante, `nextAgent`.
- **Meta, nunca de verdad:** los tests de aislamiento sustituyen el transporte de `whatsappApi` (Fase 0). Una llamada no prevista hace fallar el test. Con respuestas preparadas, se prueban también los caminos que pasan por Meta.
- **Aislamiento (`tests/isolation/`):** todo lo de hoy, más usuarios cuyo id no es el de la cuenta, un agente de A sin acceso a la línea A2 (404 en conversación, mensajes, media, envío y plantilla), un agente contra acciones de admin (403) y la API key con un `lineId` de otra cuenta (404).
- **Migración:** contra una **copia local** de un `mongodump` de producción, restaurada en el Mongo local; el `.env` nunca apunta a producción (regla 4). Una segunda pasada tiene que cambiar 0 documentos.
- **Webhook:** `npm run webhook:simulate` con dos `phone_number_id` (cada uno llega a su línea) y con uno desconocido (se ignora sin error).
- **Meta:** la app WasmishTest, con el número nuevo que Jonathan crea para las pruebas (§ 7.8). Ahí se comprueba también si repetir el Embedded Signup en el mismo WABA invalida el token anterior.
- **UI:** Playwright, como en las pruebas de navegador locales, con una sesión de owner y otra de agente.

---

## 7. Respuestas de Jonathan (2026-10-11)

1. **Un correo, una persona, una cuenta**, sea cual sea su rol. `User.email` sigue siendo único global.
2. **El agente ve las sin asignar y las suyas**, nunca las de sus compañeros.
3. **El agente ve y edita todos los contactos** de la cuenta.
4. **Invitación con enlace de un solo uso** para empezar (detalle en la Fase 3).
5. **Sin «cerrar» ni «resolver»** en el MVP; se verá después.
6. **API pública: las dos formas**, `lineId` o `from` (detalle en la Fase 2).
7. **Se cobra por líneas y por agentes**, como los proveedores parecidos (§ 3.5).
8. Jonathan puede crear **un número nuevo para las pruebas**. Los datos de producción que afectan a la migración los tiene Jonathan, fuera del repo: la Fase 1 los confirma con un `--dry-run` antes de migrar.
9. **El formulario de token manual** lo usa Jonathan para conectar los números de prueba. Se queda, con la comprobación de la Fase 0 y el mismo permiso que conectar líneas (owner y admin).

## 8. Segunda ronda de respuestas (2026-10-11)

1. **Escribir a un contacto que atiende otro agente:** las dos cosas. El aviso «Esta conversación la atiende Ana» y la opción **«Solicitar que te la transfieran»** (detalle en la Fase 4).
2. **El supervisor ve todas las conversaciones de sus líneas**, también las asignadas a otros.
3. **El cobro va fuera de Wasmish por ahora**; lo ideal es que vaya dentro, más adelante (§ 3.5).
4. **El límite de contactos activos se deja para después** del MVP.

No queda ninguna pregunta abierta.
