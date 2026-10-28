# Spec: los avisos de la asignación

Fecha: 2026-10-28. Brief: `docs/superpowers/specs/2026-10-28-avisos-asignacion-brief-ui.md`. Diseño de Claude Design: `Design/Wasmish Chats - Avisos de la asignación.html` (pantallas 5a, 6a, 6b, 7a, 7b, m1, m2, m3). Completa la Fase 4 de multi-agente (asignar conversaciones, en producción desde la 1.0.33).

## 1. Qué resuelve

En la prueba de la 1.0.33 en producción (2026-10-28) todo funcionó, pero:

1. El aviso flotante del hilo (abajo al centro) no convence.
2. La respuesta a una solicitud de transferencia sale en el aviso global, que se va a los 5 s: si nadie lo mira, se pierde.
3. Asignar una conversación no avisa a nadie.
4. No queda historia de quién tuvo la conversación.

## 2. Decisiones (Jonathan, 2026-10-28)

- Avisos que **se quedan hasta que se ven** (la campanita), y «te asignaron» / «te la pasaron» también **por push** (ya en `decisiones.md`).
- Cada cambio de manos queda **en el hilo como evento, no como mensaje** (ya en `decisiones.md`).
- El agente **sigue pudiendo pasar las suyas** a un compañero (ya en `decisiones.md`).
- El aviso de arriba nuevo, **con color según el tipo** (error rojo, aviso verde tinta, nuevo menta), y **en toda la app**, no solo en la asignación, en un PR aparte.
- Los avisos de la campanita **se borran solos a los 30 días**. La historia del hilo se guarda siempre.
- La historia va en **una colección propia que llega con cada página de mensajes** (camino A), no en un endpoint aparte ni como mensajes.

## 3. Datos

### 3.1 `ConversationEvent` (la historia, nueva)

| Campo | Qué |
|---|---|
| `userId` | La **cuenta** (como en todos los modelos) |
| `conversationId` | La conversación |
| `type` | `take`, `assign`, `release`, `request`, `pass`, `reject`, `revoked` |
| `actorId` | Quién lo hizo. `null` en `revoked` |
| `targetId` | A quién: el asignado (`assign`), el solicitante (`pass`, `reject`), quien perdió el acceso (`revoked`). `null` en `take`, `release` y `request` |
| `at` | **Cuándo ocurrió el cambio**: la fecha que llevó la escritura ganadora (`assignedAt`, `transferRequest.requestedAt`, la de la respuesta o la de soltar), no la de guardar el evento |

Índice `conversation_event_list` `{ conversationId: 1, at: 1, _id: 1 }`. Sin caducidad. El orden es `at` y, a igual `at`, `_id`. Los nombres no se guardan: se leen con `populate` al servirlos (una persona renombrada sale con el nombre de hoy).

Por qué `at` y no la hora de guardar (revisión de Codex del spec, 5): A asigna a Luis y se queda esperando `confirmAssignee`; B reasigna a Marta (su escritura exige el dueño que dejó A, así que es posterior) y guarda su evento antes. Con la hora de guardar, el hilo contaría «a Marta» y después «a Luis». La escritura de B siempre lleva una fecha posterior a la de A, porque solo gana leyendo lo que A ya escribió.

### 3.2 `Notification` (la campanita, nueva)

| Campo | Qué |
|---|---|
| `userId` | La cuenta |
| `recipientId` | A quién le llega |
| `type` | `assigned`, `passed`, `rejected`, `requested` |
| `actorId` | Quién lo hizo |
| `conversationId` | La conversación |
| `requestId` | Solo en `requested`: el `transferRequest.id` de la solicitud |
| `resolution` | Solo en `requested`, cuando se resuelve: `{ status: 'passed' \| 'rejected' \| 'gone', by: userId \| null, at }`; `null` mientras está pendiente |
| `seenAt` | `null` hasta que la ve |
| `createdAt` | Cuándo |

Índices: `notification_inbox` `{ recipientId: 1, createdAt: -1 }` (la lista y el contador); `notification_request` `{ conversationId: 1, requestId: 1 }` **parcial** con `requestId: { $type: 'objectId' }` (resolver los de una solicitud); `notification_ttl` `{ createdAt: 1 }` con `expireAfterSeconds` de 30 días.

## 4. Dónde se escribe

Todo en `services/assignment.service.js`, el único sitio que cambia `assignedTo`. Lo nuevo va en un servicio aparte (`services/assignment.history.service.js`: escribir eventos, crear y resolver avisos, emitir sus SSE), que `assignment.service.js` llama. Las reglas puras (quién recibe un `requested`, el tramo de eventos de una página, el texto del push) van en `utils/` con su test.

| Camino | Evento | Aviso | Push |
|---|---|---|---|
| `acquireConversation` gana una sin asignar (responder, «Tomar», `claimNewConversation`) | `take`, actor = quien la toma | — | — |
| `assignConversation` a uno mismo | `take` | — | — |
| `assignConversation` a otra persona | `assign`, actor → target | `assigned` al target | ✅ al target |
| `assignConversation` a nadie | `release` | — | — |
| `requestTransfer` | `request`, actor = quien la pide | `requested` a quien la atiende y a quienes pueden responderla (owner y admin; supervisor con esa línea), **menos al que la pide** y solo a personas activas | — |
| `answerTransfer` aceptada | `pass`, actor → solicitante | `passed` al solicitante | ✅ al solicitante |
| `answerTransfer` rechazada | `reject`, actor → solicitante | `rejected` al solicitante | — |
| `releaseAssignments` (quitar el acceso) | `revoked` en cada conversación soltada, target = esa persona | — | — |

**Resolver una solicitud.** Lo que de verdad dice si una solicitud sigue pendiente es la conversación: `transferRequest.id === requestId`, leído **al servir** el aviso (§ 5.2). `resolution` solo añade **cómo terminó**, para la nota: `passed` o `rejected` con quién al aceptar o rechazar; `gone` cuando la solicitud desaparece por otro camino. Asignarla **al solicitante** desde el menú cuenta como `passed`, con quien asignó. Así, si la escritura de `resolution` se pierde en una carrera, el aviso sale como «Ya no está pendiente» y sin botones, nunca pendiente de más (revisión de Codex del spec, 2).

**Toda escritura que quita o reemplaza `transferRequest` lee la que quitó** (`findOneAndUpdate` con `new: false`, o el `requestId` que ya tenía en mano) **y, si su escritura ganó, resuelve sus avisos** (solo los que aún tengan `resolution: null`). Son todas las de hoy (revisión de Codex del spec, 4):

| Dónde | Resolución |
|---|---|
| `assignConversation` (a quien sea) | `passed` si el target es el solicitante; si no, `gone` |
| `answerTransfer` aceptada / rechazada | `passed` / `rejected` |
| `answerTransfer`, el solicitante ya no es válido | `gone` |
| `confirmAssignee` deshace una asignación | `gone` (la que borró al deshacer) |
| `confirmRequester` borra la recién pedida | `gone` |
| `requestTransfer` reemplaza una anterior | `gone` la anterior |
| `releaseAssignments` (las dos escrituras) | `gone` |

`acquireConversation` no quita ninguna: solo gana una conversación sin asignar, y una sin asignar no puede tener solicitud.

**Crear los avisos de una solicitud** (revisión de Codex del spec, 2): `requestTransfer` publica la solicitud, la confirma (`confirmRequester`) y después crea los avisos. Entre una cosa y otra pueden aceptarla, rechazarla o reemplazarla, y su resolución no encontraría avisos que resolver. Por eso, después de crearlos, relee la conversación: si su solicitud ya no es esta, los marca `gone` (solo los que sigan con `resolution: null`) y no emite `notification_created`. Y aunque esa relectura llegara tarde, el aviso no sale pendiente: `pending` se calcula al servirlo.

**Orden y carreras:**
- El evento y los avisos se escriben **después** de que la asignación quedó confirmada (`confirmAssignee` / `confirmRequester` devolvieron `true`). Si se deshace, no se escribe nada; la vuelta atrás de `confirmAssignee` tampoco deja evento (caso de milisegundos, documentado), pero sí resuelve la solicitud que borró.
- `releaseAssignments` suelta **conversación por conversación** con una escritura condicional (`findOneAndUpdate({ _id, assignedTo: member, ...filtro }, …, { new: false })`), en tandas en paralelo, y escribe `revoked` solo para las que devolvieron documento: así sabe cuáles soltó ella y no inventa un `revoked` en una que otro movió entretanto (revisión de Codex del spec, 3). Lo mismo para las solicitudes que pidió esa persona. Quitar el acceso es raro y puede tocar cientos: el aviso SSE sigue siendo uno solo, `conversations_updated`, y los eventos van con `insertMany`.
- Escribir eventos o avisos, emitir sus SSE y mandar el push **nunca hacen fallar la asignación**: van en `try/catch` con un `console.error` sin datos del cliente, como `sendConversationEvent`.

**Cuentas de una persona:** los eventos se guardan igual (son pocos y la historia queda completa si llega una segunda persona). En una cuenta de una persona no hay a quién asignar ni quién pida, así que no nacen avisos.

## 5. Lectura

### 5.1 Los eventos, con los mensajes

`GET /chats/:id/messages` (ya pagina hacia atrás por `timestamp`, con `before` y `nextCursor`) devuelve además `events`: los de esa conversación dentro del tramo de la página.
- Límite de arriba: `before` si viene; sin él, ninguno (la primera página trae también los eventos más nuevos que el último mensaje).
- Límite de abajo: el `timestamp` del mensaje más viejo de la página si hay `nextCursor`; si no hay más páginas, ninguno (trae también los anteriores al primer mensaje).
- Tramo cerrado abajo y abierto arriba (`at >= abajo`, `< arriba`), igual que los mensajes, para que un evento no salga en dos páginas.
- **Como mucho 100 eventos por página** (revisión de Codex del spec, 9): una conversación con pocos mensajes y muchos cambios de manos no trae toda su historia de golpe. Se piden los 101 más nuevos del tramo; si hay más de 100, la página **se acorta**: su límite de abajo pasa a ser la fecha `T` del evento 100, solo lleva los mensajes y los eventos con fecha `>= T` (los eventos con exactamente `T` van todos, aunque pasen de 100: son pocos) y `nextCursor` pasa a ser `T`. La página siguiente (`before = T`) trae lo anterior sin repetir nada, con la misma regla.

La regla del tramo y del recorte es una función pura (`utils/conversation.events.js`, `pageWindow`) con test: la primera página, una intermedia, la última, mensajes y eventos de la misma hora, y el recorte por los 100. Cada evento: `{ id, type, actor: { id, name } | null, target: { id, name } | null, timestamp }`. La conversación ya se busca con `findOwnConversation` (cuenta, líneas y asignación): quien no la ve recibe 404 y ningún evento.

### 5.2 Los avisos

- `GET /api/notifications?before=<fecha>`: los de quien mira (`{ userId: cuenta, recipientId: req.auth.userId }`), **30 por página**, del más nuevo al más viejo (`createdAt` y `_id`), con `nextCursor` y `unseenCount` **de todos**, no solo de la página. El panel carga los anteriores al llegar al final: con más de 30 sin ver, ninguno queda fuera de alcance (revisión de Codex del spec, 6). Solo con sesión (`authRequired`); una API key no es una persona.
- Cada aviso: `{ id, type, actor: { id, name }, conversation: { id, title, lineId, assignedTo: { id, name } | null, canOpen }, request: { requestId, pending, canAnswer } | null, resolution: { status, by: { id, name } | null } | null, seen, createdAt }`.
  - `canOpen`: si la conversación entra **ahora** en el `conversationScope` de quien mira.
  - `request.pending`: si la solicitud de la conversación sigue siendo esa (`transferRequest.id === requestId`), leído al servirlo. `canAnswer`: **`canOpen` y pendiente y `canReassign(auth, assignedTo)`**. `canReassign` no mira la línea: un supervisor que perdió la línea no puede responder (revisión de Codex del spec, 7).
  - `title`: el nombre del contacto, como la bandeja. Una conversación borrada sale con `conversation: null` (el aviso se pinta sin abrir).
- `POST /api/notifications/seen` con `{ ids: [...] }` o `{ all: true }` (Zod): marca `seenAt` solo en los de quien mira (un id ajeno no cambia nada y no se distingue de uno inexistente). Devuelve `{ unseenCount }`.

## 6. Tiempo real

| Evento SSE | A quién | Payload |
|---|---|---|
| `conversation_event` | Quien ve la conversación ahora (`sendConversationEvent`) | `{ conversationId, event }` (como en § 5.1) |
| `notification_created` | El destinatario (`sendToUser`) | `{ notification, unseenCount }` |
| `notification_updated` | Cada destinatario de un `requested` que se resolvió | `{ notification }` |
| `notifications_seen` | Quien marcó (sus otras pestañas y dispositivos) | `{ unseenCount }` |

El aviso se serializa con el `auth` del destinatario (su `User` leído de la BD: rol, líneas, estado), para que `canOpen` y `canAnswer` sean los suyos. `transfer_answered` se queda (lo usan la ficha y «Conversación nueva» para su estado), pero ya no abre el aviso global.

## 7. Push

`notifyAssignment({ accountId, conversationId, recipientId, actorName, kind })` en `services/push.service.js`, junto a `notifyInbound`, sin esperarla y sin lanzar nunca:
- Solo a las suscripciones de `recipientId`, con **la misma regla que el push de un entrante** (revisión de Codex del spec, 1): `pushRecipientIds([recipient], accountId, meta)`, que exige que esté activo, que sea de la cuenta y que **tenga la línea** (`sessionAuthFor` + `canReceive`), y además que `meta.assignedTo` sea él. `meta` es `currentConversationMeta`, leído lo último, como en `notifyInbound`. Hace falta la línea, no solo la asignación: `updateMember` guarda el acceso nuevo **antes** de soltar sus conversaciones, y en ese hueco alguien sigue asignado sin tener ya la línea.
- Título: el del entrante (el contacto, y la línea si la cuenta tiene más de una). Cuerpo: «Carla te asignó esta conversación.» (`assigned`) o «Ana te pasó esta conversación.» (`passed`), con el nombre de pila. La misma `url` y `conversationId`: el service worker ya abre esa conversación.
- El texto lo arma una función pura de `utils/push.js` (`buildAssignmentPush`) con test.
- Nunca a quien se la asignó a sí mismo (eso es `take`, que no avisa).

## 8. Frontend

### 8.1 El aviso de arriba (PR 1, toda la app)

- `notify({ kind: 'error' | 'info' | 'new', text, action?: { label, onClick } })` con un hook `useNotice()`. Reemplaza `setContent` + `setState` en las ~20 pantallas que lo usan; ninguna pasa ya JSX.
- Como el diseño (7a): arriba a la derecha, icono a la izquierda, texto, la acción y la ✕. Rojo `#b4321f` (error), verde tinta (info), menta (nuevo). Se va a los 5 s, **no mientras el puntero está encima**, y uno a la vez (el nuevo reemplaza al anterior). Esc lo cierra. En el celular, a lo ancho con margen de 16 px.
- Lo que hoy pasa contenido rico (por ejemplo, el resultado de `BulkTagDialog` o los avisos del login) queda como texto de una o dos frases; el plan lista cada pantalla con su tipo.

### 8.2 La historia en el hilo (PR 3)

- `useConversationMessages` guarda los `events` de cada página y el hilo los intercala con los mensajes por hora; a la misma hora, el evento va antes.
- Cada evento es una línea centrada sin burbuja (6a): mini avatar de quien lo hizo (menta si fuiste tú; en `revoked`, la casilla punteada de «Sin asignar»), el texto y la hora.
- El texto según quien mira es una función pura de `utils/assignment.ts` (`eventText(event, viewerId)`), con los textos del catálogo 6b. El frontend no tiene tests: se comprueba en el navegador con los siete tipos.
- `conversation_event` lo añade al hilo abierto, **sin repetir**: el hilo deduplica por `event.id` entre páginas y SSE. Si llega mientras se está pidiendo la primera página (o recargando el hilo), se hace lo mismo que hoy con `message_updated` en esa carrera (`useConversationMessages`): se cancela esa petición y se vuelve a pedir, para que una respuesta leída antes del evento no lo borre al llegar después (revisión de Codex del spec, 8).
- **Con una sola persona (`hasTeam` falso), el hilo no enseña eventos.**
- **Se quitan:** el aviso flotante del hilo (`toast` de `ChatThread`) y la barra `AssignmentNotice`.
  - El error de una reacción y el de ir a un mensaje muy antiguo pasan a `notify({ kind: 'error' })` con su texto de hoy.
  - «La conversación cambió de manos. Vuelve a intentarlo.», «La solicitud cambió. Revísala de nuevo.» y «Tu mensaje no se envió: la conversación cambió de manos…» pasan a `notify({ kind: 'info' })`.
  - Las confirmaciones de asignar, soltar, tomar, pasar y rechazar desaparecen: las dice el hilo.
  - La pantalla de la conversación perdida (`LostConversation`) se queda.

### 8.3 La campanita (PR 4)

- `useNotifications()`: la lista (React Query) y los cuatro eventos SSE; la lista se vuelve a pedir al abrir la campanita, y con `conversation_assigned` / `conversation_revoked` / `conversations_updated` (cambia `canOpen`).
- **Computadora:** el botón en el bloque de abajo del `Sidebar`, sobre la foto, con el número de sin ver (5a). El panel sale desde ahí: «Avisos», «N sin ver», «Marcar todos como vistos», la lista (carga los anteriores al llegar al final) y su estado vacío («No tienes avisos»).
- **Celular:** el botón en la barra de arriba (la de `PrivateLayout` y la propia de Chats), con su número (m1); al tocarlo, los avisos a pantalla completa con volver (m2).
- Cada aviso: quién, qué, el contacto, su línea y la hora; sin ver con fondo menta claro y punto. Tocarlo lo marca visto y abre la conversación si `canOpen`; si no, en gris con la nota («Ahora la atiende Pedro. Ya no la puedes abrir.»). Un `requested` pendiente con `canAnswer` lleva **Rechazar** y **Pasársela a X**, con los endpoints de hoy; resuelto, la nota de cómo terminó.
- `notification_created` con Wasmish abierta: `notify({ kind: 'new', text: 'Carla te asignó la conversación con Diego Paredes.', action: { label: 'Abrir' } })`, y queda en la campanita.
- **Con una sola persona, la campanita no aparece.**

## 9. Pruebas

- **Puras (Backend, `node:test`):** quién recibe un `requested` (`requestRecipients`: activos, con la línea, sin el solicitante, el que la atiende siempre); el tramo y el recorte de una página (`pageWindow`, con los casos de § 5.1); el texto del push (`buildAssignmentPush`).
- **Aislamiento (`tests/isolation/`):**
  - `GET /notifications` y `POST /notifications/seen` solo tocan los de quien mira: otra persona de la cuenta y otra cuenta, nada. Con más de 30 avisos, la segunda página trae los anteriores y `unseenCount` cuenta todos.
  - Los eventos salen con los mensajes solo si ves la conversación; un agente que la perdió recibe 404 y ningún evento. Una conversación con pocos mensajes y más de 100 eventos se recorre entera por páginas, sin repetir ni perder ninguno.
  - Cada camino de § 4 escribe su evento y sus avisos, y ninguno si `confirmAssignee` la deshace.
  - Cada fila de la tabla de resoluciones de § 4 resuelve los avisos de la solicitud que quitó; y una solicitud aceptada mientras `requestTransfer` aún no creó sus avisos no deja ninguno pendiente (la escritura intercalada, con el patrón de pausar una escritura de los tests de la Fase 4).
  - Dos reasignaciones cuyas confirmaciones terminan en orden inverso quedan en el hilo en el orden de sus escrituras.
  - `releaseAssignments` con una conversación que otro movió entre leer y soltar: sin `revoked` en esa.
  - `canAnswer` es falso para un supervisor que perdió la línea.
  - El push de asignar va solo al destinatario; no sale si ya no es suya ni si le quitaron la línea antes de soltarla.
  - `conversation_event` no le llega al agente que la perdió.
- **Navegador:** cuenta con equipo (owner, supervisor y dos agentes), a 1280 px y a 390 px: cada camino de § 4 visto desde dos personas; la campanita; el aviso de arriba en las pantallas migradas. Y una cuenta de una persona: sin campanita ni eventos.

## 10. Los PRs

| PR | Qué | Toca |
|---|---|---|
| 0 | Este spec y el plan | Docs |
| 1 | El aviso de arriba nuevo en toda la app (§ 8.1) | Frontend |
| 2 | Eventos, avisos, endpoints, SSE y push, con sus tests (§ 3 a § 7) | Backend |
| 3 | La historia en el hilo; se quitan el aviso flotante y la barra «te pasó» (§ 8.2) | Frontend |
| 4 | La campanita y el aviso «nuevo» (§ 8.3) | Frontend |

Cada uno con su revisión cruzada y la documentación en el mismo PR: `chat.md` (eventos SSE, la historia, la campanita, el push), `api.md` (los endpoints), `frontend.md` (`notify`), `Backend/AGENTS.md` (los índices). Van en la 1.0.34.

## 11. Despliegue y vuelta atrás

Sin migración, scripts ni variables nuevas. La api crea al arrancar las dos colecciones y sus índices. Volver a la 1.0.33 es seguro: no lee las colecciones nuevas (los avisos de 30 días caducan solos) y su frontend ignora `events`.

## 12. Lo que no entra

- Avisos de otras cosas (campañas, líneas): la campanita podrá crecer, pero ahora solo lleva la asignación.
- Elegir qué avisos recibir, notas internas al transferir, cerrar conversaciones, repartir automáticamente, métricas por agente.
- Historia de lo anterior a este despliegue.
