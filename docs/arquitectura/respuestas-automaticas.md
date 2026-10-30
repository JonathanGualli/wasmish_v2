# Respuestas automáticas (chatbot v1)

Las respuestas que Wasmish manda solo: bienvenida, fuera de horario y palabras clave. Cómo se configuran, cómo se decide qué responder y cómo salen sin perderse ni duplicarse.

> Parte de la documentación de Wasmish: el mapa de todos los temas está en el [AGENTS.md](../../AGENTS.md) de la raíz.
> Las decisiones de producto con fecha están en [decisiones.md](../decisiones.md). El diseño completo, con el porqué de cada cosa: [spec de respuestas automáticas](../superpowers/specs/2026-10-15-respuestas-automaticas-design.md).

## Contenido

- **Backend**
  - [La configuración (`AutoReplySettings`, `auto.reply.controller.js`)](#la-configuración-autoreplysettings-autoreplycontrollerjs)
  - [Decidir qué responder (`utils/auto.reply.js`)](#decidir-qué-responder-utilsautoreplyjs)
  - [El horario (`utils/business.hours.js`)](#el-horario-utilsbusinesshoursjs)
  - [La cola: el propio entrante (`Message.bot`)](#la-cola-el-propio-entrante-messagebot)
  - [El worker (`workers/auto.reply.worker.js`)](#el-worker-workersautoreplyworkerjs)
  - [La pausa por respuesta manual (`markHumanReply`)](#la-pausa-por-respuesta-manual-markhumanreply)
- **Frontend**
  - [La página (`pages/private/AutoReplies/`)](#la-página-pagesprivateautoreplies)
  - [La marca «Bot» en el chat](#la-marca-bot-en-el-chat)

---

## Backend

### La configuración (`AutoReplySettings`, `auto.reply.controller.js`)

**Un documento por cuenta** (`AutoReplySettings`, índice único `auto_reply_settings_account_unique` sobre `userId`, que es la cuenta). Sin documento, la cuenta tiene la configuración por defecto (`defaultAutoReplySettings`): **todo apagado**, con un horario de ejemplo de lunes a viernes de 8:00 a 18:00. Ninguna cuenta responde sola sin que alguien lo encienda.

- `enabled`: el interruptor general.
- `timezone`: zona IANA, por defecto `America/Guayaquil`.
- `handoffHours`: cuántas horas se calla el bot tras una respuesta manual (1, 4, 12 o 24; 12 por defecto). **Es también la ventana para no repetirse:** cada palabra clave y el «no entiendo» salen como mucho una vez por conversación en ese tiempo (desde el 2026-10-15; antes, 24 h fijas para las palabras clave).
- `welcome`: `{ enabled, text, returnAfterDays }`. `returnAfterDays` es 7, 30, 90 o `null` (nunca volver a saludar); 30 por defecto.
- `outOfHours`: `{ enabled, text, schedule }`. `schedule` tiene los 7 días (`mon`…`sun`), cada uno `{ closed, ranges }` con hasta 2 tramos `{ start: 'HH:mm', end: 'HH:mm' }`.
- `keywordRules`: hasta 30 reglas `{ _id, enabled, keywords, text, lineIds }`, con 1–20 frases de hasta 60 caracteres. `lineIds` vacío = todas las líneas: la página todavía no lo ofrece, pero está para pasar a «cada regla elige sus líneas» sin migrar.
- `fallback`: `{ enabled, text }`, «Si no entiende» (2026-10-15). Un documento guardado antes no lo tiene: se lee apagado, y el `PUT` lo acepta sin él.

Cada texto, hasta 800 caracteres (`AUTO_REPLY_TEXT_MAX`): bienvenida + 3 palabras clave + fuera de horario caben en los 4.096 de WhatsApp. Una respuesta encendida necesita texto; una apagada puede quedar vacía.

**Las rutas** (`GET`/`PUT /api/auto-replies`, `POST /api/auto-replies/preview`) llevan `requirePermission('autoReplies.manage')`: **owner y admin**, porque la configuración afecta a todas las líneas. Su detalle está en [api.md § Endpoints](api.md#endpoints-completos).
- `PUT` reemplaza la configuración entera. Las reglas que traen `id` lo conservan y las nuevas estrenan uno: con él, cada conversación recuerda cuándo respondió esa regla. Un `lineIds` que no es de la cuenta da 404, como cualquier recurso ajeno, y dos reglas con el mismo `id` dan 400.
- **Probar** (`preview`) usa la configuración **del cuerpo, sin guardarla**, y simula una conversación de un contacto nuevo (`simulateConversation`, desde el 2026-10-15): mensaje a mensaje, con `decideAutoReply` y `botStateUpdate`, los mismos del worker, así la prueba no se desfasa del envío. Fuerza el interruptor general (se prueba antes de encender), no aplica el freno de ráfagas (probando se escribe seguido) ni la pausa, y `previousInboundAt` avanza con cada mensaje. Cada regla va con su posición como id, porque una regla nueva todavía no tiene uno. Cada turno trae sus partes con su origen (`kind`) y lo que se calló por repetido. Lleva `previewLimiter`: 120 por minuto y cuenta (la página recalcula tras 1 s sin cambios, 60 por minuto como mucho, más los mensajes; un 429 no se reintenta solo). No envía nada. La forma de un solo mensaje (`text`), que siguió por las pestañas abiertas durante el despliegue de la 1.0.23, se quitó el 2026-10-30: hoy da 400.

### Decidir qué responder (`utils/auto.reply.js`)

`decideAutoReply` es pura: recibe la configuración, el estado del bot en la conversación, cuándo se saludó al contacto, el entrante, cuándo había escrito antes el contacto en la cuenta (`previousInboundAt`), la línea y la hora. Devuelve las partes y el texto unido, o el motivo para no responder:

- **No responde** (`skip`) con el interruptor apagado (`disabled`), con una persona atendiendo (`human`: no pasaron `handoffHours` desde la última respuesta manual), con el freno (`burst`: el bot ya respondió 3 veces en 10 minutos en esa conversación), ante una reacción (`ignored_type`) o si no aplica nada (`no_match`).
- **Las partes, en orden:**
  1. **Bienvenida**, si el contacto nunca había escrito a la cuenta o volvió tras `returnAfterDays`, y no se le saludó en ese plazo.
  2. **Palabras clave**, como mucho 3 textos distintos, en el orden de la lista, saltando las reglas apagadas, las de otra línea y las que respondieron en esa conversación en las últimas `handoffHours`.
  3. **Fuera de horario**, si está cerrado y ese tramo cerrado no se avisó ya.
  4. **«Si no entiende»** (`fallback`), solo si no saldría nada de lo anterior, el contacto escribió algo (texto o `caption`: una foto o un audio sin texto, no) y no salió ya en esa conversación en las últimas `handoffHours` (`Conversation.bot.fallbackRepliedAt`). Así, el primer mensaje de un contacto nuevo recibe la bienvenida, nunca el «no entiendo». El freno, la pausa y una reacción le ganan, como a todo lo demás.
- **Se unen con una línea en blanco**, en un solo mensaje: Meta cobra cada mensaje, también dentro de la ventana de 24 horas.
- **Las palabras clave** se buscan en lo que escribió el contacto (el texto, o el `caption` de un archivo; nunca la etiqueta «Imagen»), sin mayúsculas ni tildes y **por palabras completas** (`normalizeForMatch`, `matchesKeyword`): «precio» no encuentra «preciosa».
- **`claims`** es lo que se marca solo si Meta acepta el envío: si se saludó, la clave del tramo, las reglas que respondieron y si salió el «no entiendo». `botStateUpdate` arma el `$set` de la conversación; la bienvenida se marca en el contacto.
- **`explain`** dice qué salió y qué se calló por repetido (la bienvenida, cada regla con la frase que coincidió, las reglas calladas, el fuera de horario y el «no entiendo»), también en un `no_match`. Lo usa la prueba de la página.

### El horario (`utils/business.hours.js`)

`closedPeriodKey(schedule, timeZone, now)` da `null` si ahora está abierto o, si está cerrado, la **clave del tramo cerrado**: la fecha y hora locales del último cierre (`'2026-10-16T18:00'`). Así el aviso se manda una vez por tramo, aunque cruce la medianoche o el fin de semana: quien escribe el sábado por la tarde y el domingo recibe uno solo. La hora local sale de `Intl`, sin librerías. `scheduleIssue` valida el horario (hasta 2 tramos por día, sin solaparse, `end` hasta `'24:00'`) y `isValidTimeZone` la zona.

### La cola: el propio entrante (`Message.bot`)

Sin colección nueva ni Redis: **el trabajo vive en el `Message` entrante**. Si la cuenta tiene las respuestas encendidas, `procesarEntrante` lo crea con `bot: { status: 'waiting', active: true, previousInboundAt, runAfter }` en el mismo `Message.create` (`buildAutoReplyJob`, en `services/auto.reply.service.js`). Si el mensaje existe, existe su trabajo, y el índice único de `waMessageId` evita duplicarlo cuando Meta reintenta. `previousInboundAt` es el último entrante del contacto en **toda la cuenta**, leído antes de guardar la conversación: decide la bienvenida. Una reacción no deja trabajo. Si preparar el trabajo falla, el entrante se guarda igual, sin respuesta automática: `buildAutoReplyJob` nunca lanza.

Después de actualizar la conversación y emitir el SSE, pasa a `pending` y despierta al worker: así el bot nunca contesta antes de que el entrante se vea en el chat.

**Estados:** `waiting` → `pending` → `processing` → `done` (con `replyMessageId`) | `skipped` | `failed` | `uncertain` | `expired`. El motivo va en `skipReason`: el de `decideAutoReply`, `window_closed`, `line_unavailable`, `meta_<código>` (o `meta_no_response`, sin código), `interrupted` o `error`. Al terminar se quita `active`, así el índice de la cola (`auto_reply_queue`, `{ 'bot.status', 'bot.runAfter' }` parcial con `{ 'bot.active': true }`) solo guarda lo pendiente.

### El worker (`workers/auto.reply.worker.js`)

Corre dentro del proceso de la API, como el de campañas, y supone **una sola instancia**. Toma trabajos `pending` de forma atómica (`findOneAndUpdate` → `processing`, con un `leaseUntil` de 60 s y un `claimToken` nuevo), **hasta 5 a la vez**. Lo que solo puede hacer quien tiene el trabajo (empezar a enviar, cerrarlo, devolverlo a la cola) se escribe con su `claimToken` en el filtro: si el barrido se lo quitó porque tardó más del lease, ya no casa y la ejecución termina `lost`, sin enviar ni pisar el estado (revisión de Codex del PR #69). Para cada uno:

1. **Caduca** (`expired`) si el entrante tiene más de 10 minutos: tras una caída, o un webhook que Meta entregó tarde, no salen bienvenidas viejas en masa.
2. **El candado del contacto** (`Contact.autoReply.lockUntil` + `lockToken`, condicional): un mensaje del contacto a la vez, aunque escriba por dos líneas. Si está ocupado, el trabajo vuelve a `pending` 2 s después (`busy`). Se suelta en un `finally`, solo si el token sigue siendo el suyo.
3. Con el candado puesto, **relee** la configuración, el contacto y la conversación. La ventana de 24 h se mira con el más reciente entre `lastInboundAt` y la hora del propio entrante: el entrante guardado ya prueba que está abierta.
4. `decideAutoReply` (con `welcomedAt` del contacto: la bienvenida es de la cuenta) y la línea (`findConversationLine`; desconectada → `failed`, sin llamar a Meta).
5. **Autoriza el envío de forma atómica** (`authorizeBotSend`): un `updateOne` condicional que solo pasa si nadie respondió a mano en las últimas `handoffHours`. Desde ahí el envío está en curso: solo pueden coincidir el bot y una persona durante lo que tarda Meta en responder.
6. Marca `sendStartedAt` (`markSendStarted`, solo con su `claimToken`: el punto sin vuelta atrás) y envía con `processMessageSending(..., origin: 'bot')`, el mismo camino que el chat: el mensaje se guarda y sale por SSE como cualquier otro. **No marca leída la conversación.**
7. **El resultado** (`autoReplyOutcome`, pura): enviado → `done` y se marcan los `claims` (`botStateUpdate` en la conversación y `welcomedAt` en el contacto); Meta lo rechazó (con código) → `failed`, el mensaje del bot queda fallido en el chat como uno manual, sin `claims`; un fallo **sin código** de Meta (un timeout o un corte: `processMessageSending` también lo devuelve como `failed`) o un error **después** de `sendStartedAt` → `uncertain`, porque Meta pudo recibirlo. **Sin reintentos** en la v1: mejor una respuesta que falta que una repetida y cobrada dos veces.

**El barrido** (`recoverAutoReplyJobs`, al arrancar y cada 30 s):
- un `waiting` de más de 30 s (el webhook se cortó antes de marcarlo listo) repara con `$max` el `lastInboundAt` de la conversación y vuelve a `pending`;
- un `processing` vencido (al arrancar, todos) vuelve a `pending` si no llegó a enviar, o queda `uncertain` si ya había empezado.

**Al desplegar** (SIGTERM), `index.js` para los dos workers a la vez: este deja de tomar trabajos y espera la vuelta del bucle y los envíos en curso, con un único plazo de 8 s desde que empieza la parada (Docker da 10).

Cada trabajo terminado deja un log `Respuesta automática: { messageId, conversationId, status, reason, ageMs }`, **sin textos**. Si `ageMs` empieza a pasar de 10 s de forma sostenida, o aparecen `uncertain` fuera de los despliegues, es la señal para el siguiente nivel (spec, § 8).

### La pausa por respuesta manual (`markHumanReply`)

`markHumanReply(conversationId)` pone `Conversation.bot.humanRepliedAt` y nunca lanza. La llaman los controladores del chat **antes de enviar**, después de comprobar la propiedad y la línea:
- texto, archivo y plantilla en una conversación, sobre ella;
- texto a un número y conversación nueva con plantilla (rutas sin id), sobre la que ya exista de ese número en esa línea (`findConversationByNumber`), y otra vez después sobre la que quedó, por si el envío la creó.

Las campañas y la API pública **no** pausan al bot: `processTemplateSending` no se tocó.

**Lo respondido desde la app de WhatsApp Business** (coexistencia, 2026-10-16) también es una respuesta manual: `procesarEco` llama a `markHumanReply` en cuanto guarda el eco y antes de bajar su archivo ([webhook-adjuntos.md](webhook-adjuntos.md#lo-que-se-responde-desde-la-app-de-whatsapp-business-procesareco)). Un envío del bot ya autorizado no se cancela, y el bot se calla desde que se procesa el eco, no desde que se escribió en la app.

---

## Frontend

### La página (`pages/private/AutoReplies/`)

Diseño: `Design/Wasmish Respuestas automáticas v2.html` (por pasos y a lo ancho), con los estados que solo dibuja la v1 (`Design/Wasmish Respuestas automáticas.html`): la invitación, la carga, el error al cargar, el guardado y salir con cambios. Ruta `AutoRepliesPath` y entrada «Respuestas automáticas» en el menú, las dos solo con `autoReplies.manage`.

- **Tres modos** (`useAutoReplyEditor`):
  - **`intro`:** la cuenta nunca guardó (`configured: false` en el `GET`). La invitación ofrece «Empezar con un ejemplo» (una bienvenida sin nombre, porque la cuenta nace con el del dueño y un ejemplo sin editar tiene que seguir sirviendo, y horario de lunes a viernes con mediodía) o «desde cero»; las dos abren el asistente.
  - **`wizard`:** el asistente. Los cinco pasos en orden (bienvenida, fuera de horario, palabras clave, «Si no entiende» y cuándo se calla), con «Siguiente», que no avanza si el paso tiene errores, y al final «Revisar y encender», con el aviso del cobro de Meta. **«Terminar luego» guarda lo hecho apagado**, y la próxima vez la página abre en pestañas. Lo que quedó a medias se apaga (una respuesta sin texto, el fuera de horario sin días abiertos) y una regla sin frases se quita (`draftOf`), porque el backend no admite ninguna de las dos cosas; solo lo que no se arregla solo (un tramo mal escrito, un texto de más de 800) pide corregirse (revisión de Codex).
  - **`tabs`:** los mismos pasos como pestañas: cada uno dice qué tiene, y con un punto de color si está encendido (el texto, al pasar el ratón: con cinco pasos no cabe junto al título; los errores sí van con su texto).
- **«Si no entiende»** (`FallbackStep`) tiene el aspecto de la bienvenida, sin diseño propio de Claude Design (decisión de Jonathan): el texto, su interruptor y una nota con cuándo sale. Las frases que hablan de no repetirse («Ya respondida…», «Cuándo se calla», la revisión) dicen las horas de `handoffHours`.
- **Se guarda todo junto** (`PUT`), con «Guardar» y «Descartar». **Mientras se guarda no se edita** (un `<fieldset disabled>`): la respuesta reemplaza lo que hay en pantalla, con los ids de las reglas nuevas, y lo escrito durante la petición se perdía (revisión de Codex). Una recarga de la consulta que falla con datos ya en pantalla no desmonta el editor. **El interruptor general es la excepción:** se guarda con un toque sobre lo ya guardado (`setEnabledNow`), sin llevarse los demás cambios sin guardar. Encender pregunta antes, cada vez, con el aviso del cobro; apagar no pregunta.
- **Los errores se ven antes de llamar al backend**, junto a su campo, en el paso (la barra dice cuántos tiene cada uno) y en un aviso arriba. `utils/autoReplyForm.ts` repite las reglas del esquema y de `scheduleIssue`, pero por día y por hora, porque el backend da un solo mensaje para todo el horario. Al guardar con errores se abre el primer paso que tiene uno.
- **Las horas,** en un desplegable de 24 h en pasos de 15 minutos. El `<input type="time">` salía en 12 h según el idioma del navegador, con su reloj, y no cabía en la fila. Una hora guardada fuera de los cuartos se conserva.
- **Las palabras clave,** como fichas (Enter o coma). Una repetida, ignorando mayúsculas y tildes, no entra. **El orden se cambia con flechas**, sin arrastrar: no hace falta una librería nueva y funciona igual en el teléfono.
- **«Probar» es una conversación** (`TestPanel`, desde el 2026-10-15): cada mensaje se suma a los anteriores, y `usePreviewAutoReply(settings, messages)` le pide al backend la conversación entera (`simulateConversation`). Es una consulta: al cambiar la configuración, la conversación se vuelve a simular entera, tras 1 s sin cambios (decisión de Jonathan). Si falla, el aviso va al final de la conversación con «Reintentar». Cada respuesta lleva debajo de dónde salió cada parte («Bienvenida · Regla 2, «precio»»), y un mensaje sin respuesta, una nota con el motivo («ya respondió «precio» en esta conversación», «el «no entiendo» ya salió», «ninguna regla coincidió»). El frontend solo traduce lo que dice el backend, no vuelve a decidir nada. «Reiniciar» empieza de cero, y a los 20 mensajes el campo pide reiniciar. **Con errores marcados no prueba** («Corrige lo marcado para probar»): el backend valida la configuración entera. Cada mensaje, hasta 1.000 caracteres, como en el backend.
- **El diseño se reparte según el ancho de la tarjeta, no de la ventana** (*container queries* de Tailwind v4, `@container` y `@min-[…]:`): a 1024 px, con «Probar» al lado, el editor de reglas se aplastaba. Por debajo de 1024 px, «Probar» deja la columna y pasa a un botón que abre una hoja.
- **En el teléfono:** la lista de pasos con el interruptor general; cada paso, y cada regla, en su propia pantalla, bajo la barra móvil de siempre; «Probar» y «Guardar» fijos abajo (en el asistente, «Anterior» y «Siguiente»).
- **Salir con cambios** sin guardar pregunta «¿Salir sin guardar?». La app usa `BrowserRouter`, que no tiene `useBlocker`, así que el menú lateral pasa cada navegación por `NavigationGuardContext` (`components/Layout/`) y la página deja ahí su guardián con `useLeaveGuard`. Recargar o cerrar la pestaña lo pregunta el navegador (`beforeunload`). El botón «atrás» del navegador no pregunta.

### La marca «Bot» en el chat

`origin: { kind: 'bot' }` se pinta en la línea de la hora como «Campaña» y «API»: gris, con el icono `Bot`. A diferencia del autor de los mensajes manuales, que solo se ve en cuentas con equipo, **«Bot» se ve siempre**: hay que saber qué contestó la máquina (`MessageAuthor`, en `ChatThread.tsx`).
