# Respuestas automáticas (chatbot, versión 1)

Fecha: 2026-10-15. Diseño acordado con Jonathan en una sesión de Claude (preguntas y respuestas en § 9), con la arquitectura revisada por Codex antes de escribir el plan (§ 8).

## 1. Qué problema resuelve

Un negocio que pone publicidad en WhatsApp recibe muchos mensajes, y casi todos preguntan lo mismo: cuánto cuesta, dónde están, qué horario tienen, si hay más modelos. Hoy alguien los contesta uno por uno copiando y pegando textos ya escritos, y de noche o en fin de semana nadie contesta.

Además, «¿tiene respuestas automáticas?» es lo primero que compara un prospecto con los proveedores parecidos. Hoy la respuesta es no.

## 2. Qué se construye

**Respuestas automáticas de texto** con tres reglas, configurables por cada cuenta:

1. **Bienvenida:** cuando escribe alguien que nunca había escrito a la cuenta, o que vuelve tras un tiempo sin escribir (7, 30 o 90 días, o nunca; por defecto 30).
2. **Fuera de horario:** si escriben con el negocio cerrado. El horario es de hasta **dos tramos por día** (para quien cierra al mediodía), cada día puede estar cerrado, y la zona horaria es de la cuenta (por defecto `America/Guayaquil`). Se avisa **una vez por tramo cerrado**, no a cada mensaje.
3. **Palabras clave:** reglas «si el mensaje dice alguna de estas frases, responder este texto». Sin mayúsculas ni tildes, por palabras completas.

Además:

- **Si un mensaje dispara varias reglas, todo sale en un solo mensaje**, en este orden: bienvenida, palabras clave (hasta 3) y fuera de horario, separadas por una línea en blanco.
- **Traspaso a una persona:** si alguien del equipo responde a mano en una conversación, el bot no habla en ella durante N horas (1, 4, 12 o 24; por defecto 12).
- **La marca «Bot»** en el chat, en los mensajes que envió el bot.
- **Una página «Respuestas automáticas»** para encenderlas, escribir los textos, el horario y las reglas, y **probar** qué respondería a un mensaje antes de guardar.

**Fuera de alcance** (mejoras para después, en este orden aproximado): elegir «un mensaje por regla» en vez de uno combinado; adjuntar fotos o archivos a una respuesta; esperar unos segundos para contestar de una vez a una ráfaga; reglas por línea (el modelo ya lo admite, § 5); días especiales y feriados; pausar el bot a mano desde el chat; menús con botones; IA.

## 3. Decisiones

- **De la cuenta, no de cada línea** (opción A). Hoy ninguna cuenta real tiene más de una línea. Cada regla de palabra clave guarda `lineIds` (vacío = todas): pasar a «cada regla elige sus líneas» (opción C) no necesita migrar nada.
- **Solo texto** en la primera versión.
- **Todo junto en un solo mensaje.** Según varias fuentes (no la página oficial de Meta), desde el 2026-10-01 Meta cobra también las respuestas dentro de la ventana de 24 h, con unos 1.000 mensajes gratis al mes por número. Un mensaje combinado gasta uno del cupo; tres sueltos, tres. La lógica devuelve las partes por separado: la opción «un mensaje por regla» será casi gratis de añadir.
- **Cada texto, hasta 800 caracteres.** Bienvenida + 3 palabras clave + fuera de horario caben en los 4.096 de WhatsApp.
- **Palabras completas:** «precio» encuentra «cuál es el precio?», pero no «preciosa». Quien escribe las reglas pone las variantes («precio», «precios», «cuánto»). El recuadro de prueba de la página lo hace fácil.
- **Lo que cuenta como respuesta manual:** un texto, un archivo o una plantilla enviados **por una persona desde el chat**. Las campañas y la API no callan al bot.
- **Apagado por defecto.** Ninguna cuenta empieza a responder sola sin que alguien lo encienda.
- **Lo configuran el owner y los admins** (`autoReplies.manage`): afecta a todas las líneas de la cuenta.

## 4. Cómo funciona

### 4.1 La decisión (función pura)

`decideAutoReply` (`Backend/src/utils/auto.reply.js`, con sus tests) recibe la configuración, el estado del bot en la conversación, el mensaje entrante, `previousInboundAt` (cuándo había escrito antes ese contacto en toda la cuenta), la línea y la hora. Devuelve `{ parts, claims }`, o `{ skip: '<motivo>' }`.

**No responde nunca** (y dice por qué):
- `disabled`: el interruptor general está apagado.
- `human`: no pasaron `handoffHours` desde `bot.humanRepliedAt`.
- `burst`: el bot ya respondió **3 veces en los últimos 10 minutos** en esa conversación (el freno anti-bucle, por si al otro lado hay otro bot).
- `ignored_type`: el mensaje es una reacción (`reaction`). Los `system` ni siquiera se guardan.
- `no_match`: ninguna regla aplica.

**Las reglas**, en el orden en que se arma el mensaje:
- **Bienvenida:** si `previousInboundAt` es null o más viejo que `returnAfterDays` (con `returnAfterDays: null`, solo si es null), **y** `Contact.autoReply.welcomedAt` (del contacto, en toda la cuenta) es null o igual de viejo. Vale para cualquier tipo de mensaje (un audio, un sticker).
- **Palabras clave:** sobre el texto que escribió el contacto: el cuerpo de un `text` o el `caption` de un adjunto. Nunca la etiqueta automática («Imagen»). Se normaliza (minúsculas, sin tildes, la puntuación como espacio, espacios repetidos como uno) y una frase coincide si sus palabras aparecen **seguidas y completas**. Se recorren las reglas encendidas en el orden de la lista, que apliquen a la línea (`lineIds` vacío o con ella), saltando las que respondieron en esa conversación en las **últimas 24 h** (`bot.keywordRepliedAt`). Como mucho 3; si dos tienen el mismo texto, sale una vez.
- **Fuera de horario:** con la zona horaria de la cuenta (`Intl`, sin librerías), se mira si ahora cae en algún tramo abierto. Si está cerrado, la **clave del tramo cerrado** es el último cierre (fecha y hora locales, `'2026-10-15T18:00'`), buscado hasta 7 días atrás. Si esa clave ya está en `bot.outOfHoursNotified`, no se repite. Un tramo cerrado puede cruzar la medianoche y el fin de semana: el aviso del viernes a las 19:00 vale hasta el lunes a las 8:00.

`claims` dice qué marcar en el contacto y en la conversación **si Meta acepta el envío**: `welcomedAt`, la clave del tramo y los ids de las reglas que respondieron. Si el envío falla, nada se marca y el siguiente mensaje lo vuelve a intentar.

### 4.2 La cola: el propio mensaje entrante

Sin colección nueva ni Redis: el trabajo vive en el `Message` entrante (`Message.bot`).

1. **Al guardar el entrante** (`procesarEntrante`), si la cuenta tiene las respuestas encendidas, el mensaje nace con `bot: { status: 'waiting', active: true, previousInboundAt, runAfter }`. Va en el mismo `Message.create`: si el mensaje existe, existe su trabajo, y el índice único de `waMessageId` evita duplicarlo cuando Meta reintenta el webhook.
2. **Después de actualizar la conversación y emitir el SSE**, pasa a `pending` y despierta al worker. Así el bot nunca contesta antes de que el entrante se vea en el chat.
3. **El worker** (`workers/auto.reply.worker.js`, dentro del proceso de la API, como el de campañas) toma trabajos `pending` de forma atómica (`findOneAndUpdate` → `processing`, con `leaseUntil`), **hasta 5 a la vez**, y para cada uno:
   - toma el **candado del contacto** (`Contact.autoReply.lockUntil`, condicional, con un token propio). Si está ocupado, devuelve el trabajo a `pending` 2 s después. Así dos mensajes seguidos del mismo contacto, aunque lleguen por dos líneas, se evalúan uno detrás de otro y no salen dos bienvenidas;
   - **caduca** (`expired`) si el entrante tiene más de **10 minutos**: tras una caída, o un webhook que Meta entregó tarde, no salen bienvenidas viejas en masa;
   - relee la configuración, el contacto y la conversación, comprueba la **ventana de 24 h** (con el más reciente entre `lastInboundAt` y la hora del propio entrante: el entrante guardado ya prueba que la ventana está abierta) y la **línea** (`findConversationLine`; desconectada → `failed`), y llama a `decideAutoReply`;
   - si hay texto, **autoriza el envío de forma atómica**: un `updateOne` condicional sobre la conversación que solo pasa si `humanRepliedAt` sigue fuera del plazo de traspaso. Si una persona respondió mientras el bot decidía, no pasa y el trabajo termina `skipped` (`human`). Desde ahí el envío está en curso y ya no se puede retirar: es el único momento en que el bot y una persona pueden coincidir, lo que tarda Meta en responder;
   - marca `bot.sendStartedAt` y envía con `processMessageSending(..., origin: 'bot')`, el mismo camino que el chat. El mensaje del bot se guarda y sale por SSE como cualquier otro. **No marca leída la conversación**;
   - el resultado se clasifica así (`autoReplyOutcome`, función pura):

     | Lo que pasó | Estado | ¿Marca los `claims`? |
     |---|---|---|
     | `processMessageSending` devuelve `status: 'sent'` | `done`, con `replyMessageId` | Sí |
     | Devuelve `status: 'failed'` con `errorCode` (Meta lo rechazó; el mensaje queda fallido en el chat, como uno manual) | `failed` | No |
     | Devuelve `status: 'failed'` **sin** `errorCode` (un timeout o un corte: Meta pudo recibirlo; revisión de Codex del PR #69) | `uncertain` | No |
     | Lanza **antes** de `sendStartedAt` (la línea, la configuración) | `failed` | No |
     | Lanza **después** de `sendStartedAt` (p. ej., Meta lo aceptó y falló guardar) | `uncertain` | No |

     **Sin reintentos** en la v1 (§ 8);
   - suelta el candado y quita `active`.
4. **El barrido** (al arrancar y cada 30 s) recupera lo que quedó a medias:
   - `waiting` con más de 30 s → `pending` (el proceso murió entre guardar el entrante y marcarlo listo). Antes, repara lo que se pueda repetir sin daño en la conversación: `$max` de `lastInboundAt` con la hora del entrante. El contador de no leídos y el SSE de ese entrante no se rehacen (es el cabo suelto que ya existe, § 8);
   - `processing` con el `leaseUntil` vencido (o cualquiera, al arrancar: hay una sola instancia) → `pending` si no llegó a enviar, o **`uncertain` si ya había empezado a enviar** (`sendStartedAt`). Un `uncertain` **no se reintenta**: mejor una respuesta que falta que una repetida y cobrada dos veces.
5. **Al desplegar** (SIGTERM), el worker deja de tomar trabajos y espera los envíos en curso (hasta 8 s, dentro de los 10 que da Docker) a la vez que el de campañas.

**Estados del trabajo:** `waiting` → `pending` → `processing` → `done` | `skipped` (con `skipReason`) | `failed` | `uncertain` | `expired`. Los cuatro finales quitan `active`, así el índice de la cola solo guarda lo pendiente.

### 4.3 La pausa por respuesta manual

`markHumanReply(conversationId)` (`services/auto.reply.service.js`) pone `Conversation.bot.humanRepliedAt = ahora`. La llaman los controladores del chat **antes de enviar**, después de comprobar la propiedad y el acceso a la línea:
- con conversación (texto, archivo y plantilla en una conversación), sobre ella;
- sin id (texto a un número, conversación nueva con plantilla), sobre **la conversación que ya exista** de ese número en esa línea (`findConversationByNumber`): no traer id no quiere decir que no exista;
- y, en esas dos rutas sin id, otra vez **después** sobre la conversación que quedó, por si se creó con el envío.

El worker autoriza su envío de forma atómica contra `humanRepliedAt` (§ 4.2, paso 3).

## 5. Datos

**`AutoReplySettings`** (colección nueva, un documento por cuenta, índice único `{ userId }`; sin documento = valores por defecto, apagado):

| Campo | Qué es |
|---|---|
| `userId` | La cuenta |
| `enabled` | Interruptor general (`false`) |
| `timezone` | Zona IANA (`'America/Guayaquil'`) |
| `handoffHours` | 1, 4, 12 o 24 (12) |
| `welcome` | `{ enabled, text, returnAfterDays }`; `returnAfterDays` 7, 30, 90 o `null` (30) |
| `outOfHours` | `{ enabled, text, schedule }`; `schedule` = 7 días (`mon`…`sun`), cada uno `{ closed, ranges: [{ start: 'HH:mm', end: 'HH:mm' }] }`, hasta 2 tramos, sin solaparse, `start < end` (`end` admite `'24:00'`). Encendido exige al menos un día abierto |
| `keywordRules` | Hasta 30: `{ _id, enabled, keywords: [1–20 frases de 1–60 caracteres], text, lineIds: [] }` |

Cada `text`: 1–800 caracteres (vacío permitido solo si su regla está apagada).

**`Conversation.bot`:** `humanRepliedAt`, `outOfHoursNotified` (la clave del último tramo avisado), `keywordRepliedAt` (mapa id de regla → fecha), `recentReplies` (las fechas de las últimas 3 respuestas, para el freno).

**`Contact.autoReply`:** `welcomedAt` (la bienvenida es de la cuenta, no de cada línea) y `lockUntil` + `lockToken` (el candado: una evaluación a la vez por contacto).

**`Message.bot`** (solo en entrantes de cuentas con el bot encendido): `status`, `active`, `previousInboundAt`, `runAfter`, `leaseUntil`, `attempts`, `sendStartedAt`, `replyMessageId`, `skipReason`. Índice de la cola: `{ 'bot.status': 1, 'bot.runAfter': 1 }`, parcial con `{ 'bot.active': true }`.

**`Message.origin`** admite `'bot'`; `messageOrigin` lo devuelve como `{ kind: 'bot' }` y el chat pinta «Bot».

## 6. API

Todas con `authRequired` y `requirePermission('autoReplies.manage')` (owner y admin):

- `GET /api/auto-replies` → la configuración de la cuenta (o la de por defecto).
- `PUT /api/auto-replies` → la reemplaza entera (Zod). Los `_id` de las reglas se conservan si vienen; las nuevas reciben uno.
- `POST /api/auto-replies/preview` `{ settings, text }` → `{ parts, reply, matchedRuleIndexes, outOfHours }`: qué respondería **con esa configuración sin guardar**, ahora, a un contacto nuevo sin estado previo. `matchedRuleIndexes` son posiciones en la lista enviada: una regla nueva todavía no tiene id. No envía nada.

## 7. Cómo se prueba

- **Tests puros** de `utils/auto.reply.js`: normalizar, coincidir por palabras completas («preciosa» no es «precio»), el horario (dentro, fuera, el mediodía, de viernes a lunes, un día cerrado, otra zona horaria), la clave del tramo, la bienvenida (nunca escribió, volvió a los 31 días, `null`), el orden y el tope de 3, el texto repetido, el freno y la pausa.
- **Tests de aislamiento** (`tests/isolation/auto-replies.test.js`): la configuración de A no la ve ni la cambia B; un agente recibe 403; un entrante de A responde con las reglas de A; el bot no habla con una persona atendiendo; dos entrantes a la vez del mismo contacto, también por dos líneas, dan **una** bienvenida; una persona que responde mientras el bot decide lo calla; una reacción no dispara nada; un trabajo `processing` con `sendStartedAt` queda `uncertain` al arrancar; uno de más de 10 minutos caduca; una regla de A nunca responde a un contacto de B.
- **En local**, con `webhook:simulate` y el número de prueba de Meta (nunca moviendo el webhook de producción).
- **En producción**, primero en la cuenta de prueba de Jonathan, encendiendo la bienvenida y una palabra clave.

## 8. Arquitectura: por qué así (compendio del 2026-10-15)

Jonathan pidió que funcione igual con 1 que con 100 clientes, sin perder ni duplicar, pero sin construir lo mejor de lo mejor. Se compararon cuatro caminos, con búsquedas en internet y una revisión de Codex sobre este código:

| Camino | Problema | Costo relativo |
|---|---|---|
| En línea, sin esperar (`void`) | Pierde respuestas en cada despliegue con tráfico (el apagado corta con `process.exit`) y, sin candado, dos bienvenidas en una ráfaga | 1× |
| Con una espera de 5 s para agrupar ráfagas | Lo mismo, con más tiempo expuesto a un reinicio | 1,5× |
| **Cola en el propio entrante + worker en la API (elegido)** | Una respuesta puede faltar si la API muere justo mientras Meta la recibe (`uncertain`) | ~2–2,5× |
| Outbox completo, o Redis/BullMQ | Más piezas que operar; protege de casos rarísimos a esta escala | 3–4× o más |

**Lo que queda para después**, y la señal para hacerlo:
- **Reintentar** los rechazos de Meta por ritmo (`130429`, `131056`). Con el freno del bot es casi imposible llegar a ellos, y cada intento fallido quedaría como un mensaje fallido en el chat.
- **Guardar el intento antes de llamar a Meta** (cambia `processMessageSending`, del que dependen el chat y la API del cliente real) para conciliar los `uncertain`. Si los logs muestran `uncertain` fuera de los despliegues.
- **Métricas.** Por ahora, un log con la antigüedad de lo pendiente. Si lo pendiente espera más de 10 s de forma sostenida, se mira separar el worker o Redis. Llegar a 100 cuentas no basta por sí solo.

Codex encontró además tres problemas que **ya existen** y no son del bot. Van a «Cabos sueltos» de `docs/estado.md`: un fallo de Mongo en mitad del webhook pierde el entrante aunque Meta reciba 200; dos entrantes a la vez pueden pisarse `unreadCount`; un acuse de Meta que llega antes de guardar el saliente se descarta.

## 9. Preguntas y respuestas (2026-10-15)

- **¿Qué problema se prioriza?** Los tres por igual: lo que importa es poder decir «sí, tiene respuestas automáticas». Es el caso típico de quien vende con publicidad.
- **¿Qué lleva una respuesta?** Solo texto. Las fotos, después.
- **¿De la cuenta o de cada línea?** De la cuenta, pensando en pasar a «cada regla elige sus líneas».
- **¿Cuándo se calla el bot?** N horas desde la última respuesta manual, N configurable (12 por defecto).
- **¿Varias reglas a la vez?** Un solo mensaje. A Jonathan le gustaría que el cliente pudiera elegir, sabiendo lo que gasta: queda como la primera mejora.
- **¿Cuándo la bienvenida?** La primera vez y al volver tras 7, 30 o 90 días (o nunca), por cuenta.
- **¿Horario?** Hasta dos tramos por día; quien no cierra al mediodía pone uno.
- **¿Arquitectura?** La cola en el entrante con worker (§ 8), «bien como para ser la versión 1».
- **Datos y motor:** aprobados tal como se presentaron, con dos cambios que hizo el agente al escribir el plan y que Jonathan revisa ahí: el freno pasó de «una respuesta cada 2 minutos» a «3 en 10 minutos» (con 2 minutos, el «cuánto está?» que llega 20 s después del «hola» se quedaba sin respuesta), y sin reintentos en la v1 (§ 8).
- **Revisión de Codex del plan** (una ronda): candado y bienvenida por contacto en vez de por conversación; autorización atómica del envío contra la pausa; la pausa sobre la conversación que ya exista en las rutas sin id; la ventana con la hora del propio entrante; la tabla de resultados; la marca «Bot» también sin equipo. Sus nueve puntos y las respuestas, en el PR.

## 10. Ampliación: «Si no entiende» y probar como conversación (2026-10-15)

Jonathan lo pidió probando la página ya unida (PR #70). Decisiones suyas, en el chat:

**«Si no entiende»: una respuesta nueva, `fallback: { enabled, text }`** en la configuración, apagada por defecto. Es para cuando el bot no sabría qué decir. El texto lo escribe el cliente (las reglas no tienen nombre, así que el bot no puede listar sus temas solo). El ejemplo: «Perdona, no te entendí. Puedo ayudarte con precios, ubicación y envíos: pregúntame por eso. Si es otra cosa, en un momento te responde alguien del equipo.».
- **Solo si no saldría nada más:** ni bienvenida, ni palabra clave, ni fuera de horario. El primer mensaje de un contacto nuevo recibe la bienvenida, nunca el «no entiendo».
- **Solo con algo escrito** (el texto o el `caption`): una foto o un audio sin texto no lo reciben.
- **Una vez por conversación** en la ventana de abajo (`Conversation.bot.fallbackRepliedAt`).

El ejemplo de Jonathan, con la bienvenida encendida:

| # | Escribe | Responde |
|---|---|---|
| 1 | «me gusta el café con pan» | la bienvenida |
| 2 | «me gusta el café con pan» | «no entiendo» |
| 3 | «me gusta el café con pan» | nada |
| 4 | «cuál es el precio» | el precio |
| 5 | «cuál es el precio» | nada |

**Una sola ventana para no repetirse: las horas de «Cuándo se calla»** (`handoffHours`). Cada palabra clave y el «no entiendo» salen como mucho una vez por conversación cada `handoffHours`. Antes, las palabras clave usaban 24 h fijas (`KEYWORD_COOLDOWN_MS`, que desaparece). Con 12 h, quien pregunta el precio a las 9:00 y otra vez a las 22:00 recibe la respuesta las dos veces.

**«Probar» es una conversación.** Cada mensaje se suma a los anteriores, y «Reiniciar conversación» empieza de cero. `POST /api/auto-replies/preview` pasa a recibir `{ settings, messages: [..] }` (de 1 a 20 mensajes, cada uno de hasta 1.000 caracteres) y simula la conversación de un contacto nuevo, mensaje a mensaje, con la misma lógica del bot (`decideAutoReply` y lo que marcaría tras cada envío aceptado). Así no hay una segunda versión de las reglas.
- **Lo que se simula:** la bienvenida una vez; cada palabra clave y el «no entiendo», una vez; el fuera de horario, una vez por cierre. Todos los mensajes van a la misma hora: la de ahora.
- **Lo que no:** el freno de ráfagas (probando se escriben muchos mensajes seguidos, y desde el cuarto parecería roto) y la pausa por respuesta manual (en la prueba no responde ninguna persona).
- **Al cambiar la configuración, la conversación se vuelve a simular entera** con lo nuevo: los mensajes del cliente se quedan y las respuestas se recalculan.
- **Cada respuesta dice por qué:** qué partes salieron y qué regla coincidió y con qué frase; si no respondió, el motivo («ya respondió esto en la conversación», «ninguna regla coincidió»).
