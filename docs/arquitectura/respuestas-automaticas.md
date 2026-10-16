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
  - [La marca «Bot» en el chat](#la-marca-bot-en-el-chat)

---

## Backend

### La configuración (`AutoReplySettings`, `auto.reply.controller.js`)

**Un documento por cuenta** (`AutoReplySettings`, índice único `auto_reply_settings_account_unique` sobre `userId`, que es la cuenta). Sin documento, la cuenta tiene la configuración por defecto (`defaultAutoReplySettings`): **todo apagado**, con un horario de ejemplo de lunes a viernes de 8:00 a 18:00. Ninguna cuenta responde sola sin que alguien lo encienda.

- `enabled`: el interruptor general.
- `timezone`: zona IANA, por defecto `America/Guayaquil`.
- `handoffHours`: cuántas horas se calla el bot tras una respuesta manual (1, 4, 12 o 24; 12 por defecto).
- `welcome`: `{ enabled, text, returnAfterDays }`. `returnAfterDays` es 7, 30, 90 o `null` (nunca volver a saludar); 30 por defecto.
- `outOfHours`: `{ enabled, text, schedule }`. `schedule` tiene los 7 días (`mon`…`sun`), cada uno `{ closed, ranges }` con hasta 2 tramos `{ start: 'HH:mm', end: 'HH:mm' }`.
- `keywordRules`: hasta 30 reglas `{ _id, enabled, keywords, text, lineIds }`, con 1–20 frases de hasta 60 caracteres. `lineIds` vacío = todas las líneas: la página todavía no lo ofrece, pero está para pasar a «cada regla elige sus líneas» sin migrar.

Cada texto, hasta 800 caracteres (`AUTO_REPLY_TEXT_MAX`): bienvenida + 3 palabras clave + fuera de horario caben en los 4.096 de WhatsApp. Una respuesta encendida necesita texto; una apagada puede quedar vacía.

**Las rutas** (`GET`/`PUT /api/auto-replies`, `POST /api/auto-replies/preview`) llevan `requirePermission('autoReplies.manage')`: **owner y admin**, porque la configuración afecta a todas las líneas. Su detalle está en [api.md § Endpoints](api.md#endpoints-completos).
- `PUT` reemplaza la configuración entera. Las reglas que traen `id` lo conservan y las nuevas estrenan uno: con él, cada conversación recuerda cuándo respondió esa regla. Un `lineIds` que no es de la cuenta da 404, como cualquier recurso ajeno, y dos reglas con el mismo `id` dan 400.
- **Probar** (`preview`) usa la configuración **del cuerpo, sin guardarla**, y responde como a un contacto nuevo, ahora y sin estado, así la bienvenida sale si está encendida. Devuelve las posiciones de las reglas que coincidieron (`matchedRuleIndexes`), porque una regla nueva todavía no tiene id. No envía nada.

### Decidir qué responder (`utils/auto.reply.js`)

`decideAutoReply` es pura: recibe la configuración, el estado del bot en la conversación, cuándo se saludó al contacto, el entrante, cuándo había escrito antes el contacto en la cuenta (`previousInboundAt`), la línea y la hora. Devuelve las partes y el texto unido, o el motivo para no responder:

- **No responde** (`skip`) con el interruptor apagado (`disabled`), con una persona atendiendo (`human`: no pasaron `handoffHours` desde la última respuesta manual), con el freno (`burst`: el bot ya respondió 3 veces en 10 minutos en esa conversación), ante una reacción (`ignored_type`) o si no aplica nada (`no_match`).
- **Las partes, en orden:**
  1. **Bienvenida**, si el contacto nunca había escrito a la cuenta o volvió tras `returnAfterDays`, y no se le saludó en ese plazo.
  2. **Palabras clave**, como mucho 3 textos distintos, en el orden de la lista, saltando las reglas apagadas, las de otra línea y las que respondieron en esa conversación en las últimas 24 horas.
  3. **Fuera de horario**, si está cerrado y ese tramo cerrado no se avisó ya.
- **Se unen con una línea en blanco**, en un solo mensaje: Meta cobra cada mensaje, también dentro de la ventana de 24 horas.
- **Las palabras clave** se buscan en lo que escribió el contacto (el texto, o el `caption` de un archivo; nunca la etiqueta «Imagen»), sin mayúsculas ni tildes y **por palabras completas** (`normalizeForMatch`, `matchesKeyword`): «precio» no encuentra «preciosa».
- **`claims`** es lo que se marca solo si Meta acepta el envío: si se saludó, la clave del tramo y las reglas que respondieron. `botStateUpdate` arma el `$set` de la conversación; la bienvenida se marca en el contacto.

### El horario (`utils/business.hours.js`)

`closedPeriodKey(schedule, timeZone, now)` da `null` si ahora está abierto o, si está cerrado, la **clave del tramo cerrado**: la fecha y hora locales del último cierre (`'2026-10-16T18:00'`). Así el aviso se manda una vez por tramo, aunque cruce la medianoche o el fin de semana: quien escribe el sábado por la tarde y el domingo recibe uno solo. La hora local sale de `Intl`, sin librerías. `scheduleIssue` valida el horario (hasta 2 tramos por día, sin solaparse, `end` hasta `'24:00'`) y `isValidTimeZone` la zona.

### La cola: el propio entrante (`Message.bot`)

Sin colección nueva ni Redis: **el trabajo vive en el `Message` entrante**. Si la cuenta tiene las respuestas encendidas, `procesarEntrante` lo crea con `bot: { status: 'waiting', active: true, previousInboundAt, runAfter }` en el mismo `Message.create` (`buildAutoReplyJob`, en `services/auto.reply.service.js`). Si el mensaje existe, existe su trabajo, y el índice único de `waMessageId` evita duplicarlo cuando Meta reintenta. `previousInboundAt` es el último entrante del contacto en **toda la cuenta**, leído antes de guardar la conversación: decide la bienvenida. Una reacción no deja trabajo. Si preparar el trabajo falla, el entrante se guarda igual, sin respuesta automática: `buildAutoReplyJob` nunca lanza.

Después de actualizar la conversación y emitir el SSE, pasa a `pending` y despierta al worker: así el bot nunca contesta antes de que el entrante se vea en el chat.

**Estados:** `waiting` → `pending` → `processing` → `done` (con `replyMessageId`) | `skipped` | `failed` | `uncertain` | `expired`. El motivo va en `skipReason`: el de `decideAutoReply`, `window_closed`, `line_unavailable`, `meta_<código>`, `interrupted` o `error`. Al terminar se quita `active`, así el índice de la cola (`auto_reply_queue`, `{ 'bot.status', 'bot.runAfter' }` parcial con `{ 'bot.active': true }`) solo guarda lo pendiente.

### El worker (`workers/auto.reply.worker.js`)

Corre dentro del proceso de la API, como el de campañas, y supone **una sola instancia**. Toma trabajos `pending` de forma atómica (`findOneAndUpdate` → `processing`, con un `leaseUntil` de 60 s), **hasta 5 a la vez**. Para cada uno:

1. **Caduca** (`expired`) si el entrante tiene más de 10 minutos: tras una caída, o un webhook que Meta entregó tarde, no salen bienvenidas viejas en masa.
2. **El candado del contacto** (`Contact.autoReply.lockUntil` + `lockToken`, condicional): un mensaje del contacto a la vez, aunque escriba por dos líneas. Si está ocupado, el trabajo vuelve a `pending` 2 s después (`busy`). Se suelta en un `finally`, solo si el token sigue siendo el suyo.
3. Con el candado puesto, **relee** la configuración, el contacto y la conversación. La ventana de 24 h se mira con el más reciente entre `lastInboundAt` y la hora del propio entrante: el entrante guardado ya prueba que está abierta.
4. `decideAutoReply` (con `welcomedAt` del contacto: la bienvenida es de la cuenta) y la línea (`findConversationLine`; desconectada → `failed`, sin llamar a Meta).
5. **Autoriza el envío de forma atómica** (`authorizeBotSend`): un `updateOne` condicional que solo pasa si nadie respondió a mano en las últimas `handoffHours`. Desde ahí el envío está en curso: solo pueden coincidir el bot y una persona durante lo que tarda Meta en responder.
6. Marca `sendStartedAt` y envía con `processMessageSending(..., origin: 'bot')`, el mismo camino que el chat: el mensaje se guarda y sale por SSE como cualquier otro. **No marca leída la conversación.**
7. **El resultado** (`autoReplyOutcome`, pura): enviado → `done` y se marcan los `claims` (`botStateUpdate` en la conversación y `welcomedAt` en el contacto); Meta lo rechazó → `failed`, el mensaje del bot queda fallido en el chat como uno manual, sin `claims`; un error **después** de `sendStartedAt` → `uncertain`. **Sin reintentos** en la v1: mejor una respuesta que falta que una repetida y cobrada dos veces.

**El barrido** (`recoverAutoReplyJobs`, al arrancar y cada 30 s):
- un `waiting` de más de 30 s (el webhook se cortó antes de marcarlo listo) repara con `$max` el `lastInboundAt` de la conversación y vuelve a `pending`;
- un `processing` vencido (al arrancar, todos) vuelve a `pending` si no llegó a enviar, o queda `uncertain` si ya había empezado.

**Al desplegar** (SIGTERM), `index.js` para los dos workers a la vez: este deja de tomar trabajos y espera los envíos en curso, como mucho 8 s (Docker da 10).

Cada trabajo terminado deja un log `Respuesta automática: { messageId, conversationId, status, reason, ageMs }`, **sin textos**. Si `ageMs` empieza a pasar de 10 s de forma sostenida, o aparecen `uncertain` fuera de los despliegues, es la señal para el siguiente nivel (spec, § 8).

### La pausa por respuesta manual (`markHumanReply`)

`markHumanReply(conversationId)` pone `Conversation.bot.humanRepliedAt` y nunca lanza. La llaman los controladores del chat **antes de enviar**, después de comprobar la propiedad y la línea:
- texto, archivo y plantilla en una conversación, sobre ella;
- texto a un número y conversación nueva con plantilla (rutas sin id), sobre la que ya exista de ese número en esa línea (`findConversationByNumber`), y otra vez después sobre la que quedó, por si el envío la creó.

Las campañas y la API pública **no** pausan al bot: `processTemplateSending` no se tocó.

---

## Frontend

### La marca «Bot» en el chat

`origin: { kind: 'bot' }` se pinta en la línea de la hora como «Campaña» y «API»: gris, con el icono `Bot`. A diferencia del autor de los mensajes manuales, que solo se ve en cuentas con equipo, **«Bot» se ve siempre**: hay que saber qué contestó la máquina (`MessageAuthor`, en `ChatThread.tsx`).
