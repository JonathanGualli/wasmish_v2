# Bot con menús (respuestas automáticas, versión 2)

Spec del 2026-11-05. Sale del brainstorming del 2026-11-04 con Jonathan (decisiones una por una) y amplía la [v1](2026-10-15-respuestas-automaticas-design.md), que sigue valiendo en todo lo que aquí no se cambia. Cómo funciona hoy el bot: [respuestas-automaticas.md](../../arquitectura/respuestas-automaticas.md).

## 1. Qué problema resuelve

El bot de la v1 solo contesta texto: el contacto tiene que adivinar qué palabra escribir («precio», «horario») y, si no acierta, recibe el «no entiendo». Los negocios a los que se vende quieren lo que ven en otros WhatsApp de empresa: **un menú con botones** («Precios», «Horarios», «Hablar con una persona») que lleva a otra respuesta, y que **pedir una persona** de verdad avise a alguien del equipo.

## 2. Qué se construye

- **Opciones en las respuestas.** Cualquier respuesta (la bienvenida, cada respuesta por palabras clave y el «si no entiende») puede llevar hasta **10 opciones**. Cada opción lleva a otra respuesta, al inicio o a «hablar con una persona». Encadenadas: se puede armar un menú de varios niveles.
- **Formato automático.** El negocio no elige botones o lista: hasta 3 opciones salen como **botones de respuesta**; de 4 a 10, como **lista** con el botón «Ver opciones».
- **«Hablar con una persona»**: el bot responde su texto, **se calla** en esa conversación, la **marca** en la bandeja y **avisa** al equipo (campanita y push). La marca se quita cuando alguien responde, o a mano.
- **Una pantalla nueva** para configurarlo, pensada como flujo y diseñada por Claude Design, que reemplaza a la de hoy en la misma ruta. Lo configurado en la v1 pasa solo.
- **En el chat**, el mensaje del bot se ve con sus opciones y el toque del contacto, como un mensaje que cita el menú.

**Fuera de esta versión** (quedan en la lista del spec v1 § 2): archivos en las respuestas, reglas por línea en la pantalla, feriados, pausa a mano, agrupar ráfagas, IA. Tampoco: asignar sola la conversación al pedir una persona, ni un tiempo máximo de espera.

## 3. Decisiones

Las de Jonathan en el brainstorming del 2026-11-04:

1. **Lo primero son los menús con botones**, antes que el resto de mejoras de la v1.
2. **Encadenados:** cualquier respuesta puede llevar opciones, y cada opción lleva a otra respuesta.
3. **«Hablar con una persona»: callarse, avisar y marcar** (la opción más completa).
4. **Un solo motor con una pantalla nueva**, no dos bots: dos bots responderían los dos al mismo mensaje. La página de hoy se reemplaza por una pensada como flujo; lo configurado pasa solo.
5. **Formato automático:** hasta 3 opciones, botones; de 4 a 10, lista.

Las que tomó el agente al escribir el spec, **para que Jonathan las revise**:

- **A. Si el texto no cabe en botones, sale como lista** (§ 4.4). Meta limita el cuerpo de los botones a 1024 caracteres y el de la lista a 4096. En el brainstorming se habló de partirlo en dos mensajes; con la lista sale **uno solo**, que Meta cobra una vez, y no hace falta decidir qué pasa si el primero sale y el segundo no.
- **B. Los títulos de las opciones de una respuesta no se pueden repetir** (400): Meta rechaza los botones con títulos iguales. Se comparan sin mayúsculas ni tildes.
- **C. Un toque de «persona» marca la conversación aunque el bot no conteste** (por la pausa o por el freno): el contacto pidió una persona y eso se avisa igual.
- **D. Tocar una respuesta cuenta como que esa respuesta salió**: si después el contacto escribe su palabra clave dentro de las horas de «Cuándo se calla», no se repite (como hoy).
- **E. «Volver al inicio» con la bienvenida apagada** se trata como un texto escrito (§ 4.3, toques viejos). La pantalla avisa al configurarlo.
- **F. El id de una respuesta nueva lo pone la página** (un ObjectId generado en el navegador), para poder apuntarle una opción antes de guardar. El backend ya conserva los ids que le llegan.
- **G. Una pestaña con la página de antes no puede borrar los menús** (§ 6): si guarda sin el campo nuevo `handoff` y la cuenta ya tiene opciones, el `PUT` da 409.

**El cobro de Meta, comprobado el 2026-11-05** ([precios de Meta](https://developers.facebook.com/docs/whatsapp/pricing)): desde el 2026-10-01, cada número tiene **1.000 mensajes de servicio gratis al mes** (los que no son plantilla, dentro de la ventana, también los interactivos) y Meta cobra desde el 1.001. La decisión del 2026-10-15 («Meta cobra cada mensaje, también dentro de la ventana») se precisa en `decisiones.md`; el «un solo mensaje» sigue valiendo, porque un negocio con movimiento pasa de los 1.000.

## 4. Cómo funciona

### 4.1 Qué se configura

`keywordRules` pasan a ser las **respuestas** (el nombre del campo no cambia en la BD ni en la API, para no migrar):

| Campo | Qué es | Límites |
|---|---|---|
| `name` | Cómo se llama en la pantalla («Precios») | Hasta 40 caracteres. Una guardada antes, sin nombre, se sirve como «Respuesta N» (su posición) |
| `keywords` | Las frases que la disparan | **Ahora opcionales**: de 0 a 20. Sin frases, solo se llega por una opción |
| `text` | Lo que responde | Hasta 800, como hoy |
| `options` | Sus opciones | Hasta 10, `{ title, target, ruleId }` |
| `enabled`, `lineIds` | Como hoy | — |

- **Una opción** es `{ title, target, ruleId }`: `title` de 1 a 20 caracteres (el límite de los botones; la lista admite 24, pero el formato se decide al enviar y la opción tiene que caber en los dos); `target` es `rule` (otra respuesta, `ruleId`), `start` (volver al inicio) o `person` (hablar con una persona).
- **La bienvenida y el «si no entiende» también llevan `options`.** El fuera de horario **no**: se suma al texto de otra respuesta.
- **`handoff: { text }`**, uno por cuenta: lo que responde el bot al pedir una persona. Por defecto, «Enseguida te atiende alguien del equipo».
- **Hasta 50 respuestas** (hoy 30): un menú de varios niveles necesita más.
- **Validación** (400):
  - una opción a una respuesta que no está en la misma configuración (`ruleId` desconocido) da «Esa respuesta no existe»;
  - títulos repetidos en una misma respuesta (decisión B);
  - una opción `person` con `handoff.text` vacío.
- **No bloquea, avisa la pantalla:** una respuesta a la que no se llega (sin frases y sin ninguna opción que apunte a ella, o apagada con opciones que le apuntan) y un «volver al inicio» con la bienvenida apagada.
- **Sin migración:** los campos nuevos tienen valor por defecto (`options: []`, `name: ''`, `handoff.text` el de por defecto), y la configuración guardada en la v1 **se completa al leerla**, porque los defaults del modelo no se aplican a una lectura con `.lean()` (revisión de Codex del plan). Lo guardado en la v1 funciona igual.

### 4.2 Qué se envía

Un mensaje del bot sigue siendo **un solo mensaje**, ahora con **un solo juego de opciones**:

- **Por un texto escrito**, las partes son las de la v1 (bienvenida, hasta 3 respuestas por palabra clave, fuera de horario, «no entiendo»). Las opciones son las de **la primera respuesta por palabra clave que tenga**; si ninguna tiene, las de la bienvenida (si salió); si no, las del «no entiendo» (si salió).
- **Por un toque** (§ 4.3), la respuesta tocada (su texto y sus opciones), más el fuera de horario si toca.
- **Sin opciones**, sale como hoy: un texto.

### 4.3 El toque

El `id` de cada opción dice adónde lleva, así el toque se resuelve sin buscar el mensaje del menú:

| Destino | `id` que va a Meta |
|---|---|
| Otra respuesta | `wasmish:r:<ruleId>` |
| Volver al inicio | `wasmish:start` |
| Hablar con una persona | `wasmish:person` |

(Meta admite hasta 256 caracteres en los botones y 200 en las filas de la lista.) En el brainstorming los dos últimos se nombraron `wasmish:inicio` y `wasmish:persona`; van en inglés por la regla de los identificadores.

**El webhook** guarda el toque como hoy (`type: 'interactive'`, `text` = el título) y además su `id`, en `Message.choiceId` (`describirInteractivo`, en `utils/inbound.message.js`, lee `button_reply.id` o `list_reply.id`). Meta manda en `context.id` el mensaje del menú, así que el toque ya queda **citándolo** (`replyTo`), sin código nuevo.

**Qué responde cada toque** (`decideAutoReply` recibe el `choiceId`):

- **A otra respuesta:** su texto y sus opciones. **Siempre responde**: no lo calla la ventana de no repetirse (el contacto lo pidió). Marca la respuesta como salida (decisión D).
- **Al inicio:** el texto y las opciones de la bienvenida, **sin marcar el saludo** (`welcomedAt` no cambia).
- **A una persona:** § 4.5.
- **Lo que sí lo calla:** el interruptor general, la pausa por respuesta manual (`humanRepliedAt`), la marca de «pide una persona» y el freno de ráfagas, como a todo lo demás.
- **El fuera de horario** se suma si está cerrado, una vez por tramo, como hoy.
- **Un toque nunca saluda** ni dispara el «no entiendo».
- **Un toque viejo** (la respuesta ya no existe, está apagada o es de otra línea; «al inicio» con la bienvenida apagada; un `id` que no es de Wasmish) **se trata como un texto escrito con su título**: busca palabras clave, y si no, el «no entiendo». Para eso, `inboundMatchText` usa el texto de un `interactive` (hoy solo el de un `text` o el `caption`).

Los botones de una **plantilla** (`type: 'button'`) no cambian: siguen sin disparar palabras clave.

### 4.4 Botones o lista (`buildInteractivePayload`)

Una función pura arma el `interactive` de Meta a partir del texto y las opciones:

- **Hasta 3 opciones y el cuerpo en 1024 caracteres:** `type: 'button'`, cada opción un `reply` con su `id` y su `title`.
- **De 4 a 10 opciones, o el cuerpo de más de 1024 (decisión A):** `type: 'list'`, con el botón «Ver opciones» y una sola sección sin título, una fila por opción.
- El cuerpo nunca pasa de 4096: el texto unido más largo posible (bienvenida + 3 respuestas + fuera de horario, de 800 cada una, con sus separadores) da 4008.

El envío entra en `libs/whatsapp.js` como `sendInteractiveMessage`, y `processMessageSending` recibe `options`: con opciones envía el interactivo; sin ellas, el texto de siempre. **El mensaje del bot se guarda como texto** (`type: 'text'`) con `Message.options: [{ id, title }]` y `Message.optionsFormat: 'buttons' | 'list'`: así la bandeja, la vista previa, las citas y la ventana lo tratan como hoy, y solo el chat pinta las opciones.

La cola, el worker, el candado del contacto, `authorizeBotSend`, la marca «Bot» y la política sin reintentos **no cambian**. Las campañas y la API pública, tampoco.

### 4.5 «Hablar con una persona»

**Al tocarlo** (con el bot encendido, decisión C):

1. **La marca:** `Conversation.handoffRequest = { at, messageId }` (el toque), con una escritura condicional: sin marca puesta (un segundo toque no repite nada) y **sin una respuesta del equipo posterior al toque** (si alguien respondió mientras el bot decidía, ya lo atendieron: revisión de Codex del plan).
2. **El aviso**, solo si la marca es nueva: un aviso `handoff` en la campanita (`NOTIFICATION_TYPES`) y un push «<contacto> pide hablar con una persona», a los mismos que reciben el push de un entrante (`pushRecipientIds`: quien la atiende si está asignada, si no todos los que ven la línea). Quién lo recibe se vuelve a comprobar justo antes de emitirlo: si entre medias alguien perdió la línea o la conversación se asignó a otro, su aviso se borra sin llegarle. Y `conversation_updated` con `handoffRequest` por SSE, para la bandeja.
3. **La respuesta:** el texto de `handoff`, más el fuera de horario si está cerrado. Sin opciones. Si el bot está callado (pausa o freno), no responde, pero la marca y el aviso salen igual.

**Mientras la conversación está marcada, el bot se calla** sin límite de horas: palabras clave, «no entiendo», toques y fuera de horario (`decideAutoReply` devuelve `skip: 'handoff'`).

**La marca se quita:**
- **cuando alguien del equipo responde**: en `markHumanReply`, que ya llaman todos los envíos manuales y el eco de la app de WhatsApp Business. Desde ahí rige la pausa de siempre (`handoffHours`);
- **a mano**, con «Quitar» en el chat: `DELETE /api/chats/:id/handoff-request`. Lo puede hacer quien ve la conversación; si no la ve, 404, también si la atiende un compañero (sin el 409 `assigned_to_other` de los envíos). El bot vuelve a responder enseguida.

En los dos casos sale `conversation_updated` con `handoffRequest: null`. Los avisos de la campanita se quedan (caducan solos a los 30 días).

## 5. Datos

| Modelo | Cambio |
|---|---|
| `AutoReplySettings` | `keywordRules[].name`, `keywordRules[].options`, `welcome.options`, `fallback.options`, `handoff.text`. `keywords` puede quedar vacío |
| `Message` | `choiceId` (el toque entrante); `options` y `optionsFormat` (el saliente del bot). Sin default: los mensajes de siempre no los guardan |
| `Conversation` | `handoffRequest: { at, messageId } \| null` |
| `Notification` | el tipo `handoff` |

Sin índices nuevos: la marca se lee con la conversación y la bandeja ya la trae entera.

## 6. API

- `GET /api/auto-replies` devuelve los campos nuevos (los nombres que faltan, como «Respuesta N»).
- `PUT /api/auto-replies` los acepta y valida (§ 4.1). **Decisión G:** sin `handoff` en el cuerpo y con opciones guardadas, 409 «La página de respuestas automáticas cambió: recárgala», comprobado en la misma escritura (atómico: un menú guardado entre medias tampoco se pisa). Sin opciones guardadas, lo acepta como hoy (se guarda con los valores por defecto).
- `POST /api/auto-replies/preview`: cada mensaje de la conversación puede ser un texto o un toque, `{ optionId }`. Cada turno trae además las `options` de la respuesta y su formato. Un toque de «persona» en la prueba responde el texto de `handoff` y la simulación sigue marcada (el bot callado), como en una conversación de verdad.
- `GET /api/chats` y `conversation_updated`: `handoffRequest: { at } | null`.
- `GET /api/chats/:id/messages` y `message_created`: `choiceId` en el toque y `options` + `optionsFormat` en el mensaje del bot.
- `DELETE /api/chats/:id/handoff-request` (§ 4.5): 204; 404 si no se ve la conversación (también la de un compañero).

## 7. La pantalla y el chat (los diseña Claude Design)

El brief de UI va aparte (PR 4, § 9) y dice qué tiene que poder hacer la persona, no cómo se ve:

- **La pantalla** (misma ruta, mismo permiso `autoReplies.manage`): ver el flujo (de la bienvenida a cada respuesta y adónde lleva cada opción); crear una respuesta nueva al elegir el destino de una opción («+ Nueva respuesta»); ver las respuestas a las que no se llega; «Probar» con las opciones tocables; y lo de hoy: el horario, el «no entiendo», «Cuándo se calla», el texto de «hablar con una persona», el interruptor general y el asistente de la primera vez.
- **En el chat:** el mensaje del bot con sus opciones (no se pueden tocar), el toque del contacto como un mensaje que cita el menú, con una marca de que tocó una opción; y en la cabecera, «Pide una persona» con «Quitar».
- **En la bandeja:** la marca de «pide una persona».

## 8. Cómo se prueba

- **Puras** (`Backend/tests/`):
  - los ids de las opciones (armar y leer `wasmish:…`, uno ajeno);
  - `decideAutoReply` con toques: a una respuesta (aunque haya salido hace poco), al inicio (sin saludo), a una persona, viejos (como texto), callados por la marca, la pausa y el freno; las opciones del mensaje combinado;
  - `buildInteractivePayload`: 3 y 4 opciones, cuerpo de 1024 y de 1025;
  - la validación: destino desconocido, títulos repetidos, `person` sin texto, 11 opciones, 51 respuestas;
  - `inboundMatchText` de un `interactive` y `describeInboundMessage` con su `id`;
  - la simulación con toques.
- **Aislamiento** (`Backend/tests/isolation/`): quitar la marca de una conversación ajena da 404; el aviso `handoff` solo llega a quien ve la línea (y solo a quien la atiende, si está asignada).
- **`webhook:simulate`** con toques (`button_reply` y `list_reply`), contra el backend local con el Meta falso.
- **Con Meta de verdad**, en la cuenta de prueba de Jonathan: un menú de botones y uno de lista, tocar cada uno desde un celular, pedir una persona (la marca, la campanita y el push), responder y ver que se quita. Ver que el cuerpo largo sale como lista.

## 9. Cómo se entrega

| PR | Qué | Visible |
|---|---|---|
| 1 | Este spec y el plan (revisión de Codex) | — |
| 2 | Backend: opciones, toques, envío interactivo, `preview` | No: sin la pantalla nadie puede poner opciones |
| 3 | Backend: «hablar con una persona» (marca, avisos, `DELETE`, `markHumanReply`) | No |
| 4 | Brief de UI para Claude Design | — |
| 5 | UI: la pantalla, el chat y la bandeja (si pasa de unas 500 líneas, se parte) | Sí |

Los PRs 2 y 3 se pueden desplegar antes de la UI sin cambiar nada de lo que ven los clientes. La documentación (`respuestas-automaticas.md`, `chat.md`, `api.md`, `webhook-adjuntos.md`) se corrige en el PR que cambia cada cosa.
