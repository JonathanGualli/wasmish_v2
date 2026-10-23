# Historial y contactos de la app de WhatsApp Business

Fecha: 2026-10-23. Diseño acordado con Jonathan en una sesión de Claude (decisiones en § 11). La interfaz la diseña Claude Design con el brief [2026-10-23-historial-coexistencia-brief-ui.md](2026-10-23-historial-coexistencia-brief-ui.md); este spec dice qué hace, no cómo se ve.

## 1. Qué problema resuelve

Desde la 1.0.25, un negocio puede conectar a Wasmish el número que sigue usando en la app de WhatsApp Business (la coexistencia, spec [2026-10-16-coexistencia-design.md](2026-10-16-coexistencia-design.md)). Pero lo que había antes de conectar **se queda en el celular**: la bandeja de Wasmish empieza vacía, el equipo no ve qué se habló con cada cliente y los contactos aparecen como números sueltos o con su nombre de perfil, no con el que el negocio les tiene guardado. El spec de la coexistencia lo dejó fuera de alcance («importar el historial de chats de la app y sus contactos»).

Meta lo permite, pero **solo en las 24 h siguientes a conectar y una sola vez** (§ 3): si Wasmish no lo pide a tiempo, el negocio tiene que desconectar el número y volver a conectarlo para recuperarlo.

## 2. Qué se construye

1. **Pedirlo solo, al conectar.** Al terminar de conectar un número con la app, Wasmish pide a Meta los contactos y el historial. Si el pedido falla, se puede reintentar desde Ajustes → Líneas mientras no pasen las 24 h.
2. **El historial en la bandeja.** Los chats individuales de los últimos 6 meses aparecen como conversaciones de esa línea, con sus mensajes en los dos sentidos. Lo enviado desde el celular lleva la marca «Desde la app de WhatsApp» que ya existe. No suman no leídos, ni avisan, ni tocan al bot, ni abren la ventana de 24 h (§ 6).
3. **Los archivos recientes.** Las fotos, videos y documentos de los últimos 14 días se descargan y se ven en el chat; los más viejos quedan como «Archivo: míralo en tu celular».
4. **El nombre de la agenda.** Los contactos del celular dan nombre a los contactos de Wasmish que tienen chat (los del historial y los que escriban después). Lo que el negocio cambie en la agenda llega a Wasmish; lo que el equipo escribió en Wasmish nunca se pisa.
5. **El estado en Ajustes → Líneas:** cómo va el historial de cada línea (pedido, trayendo con el %, traído, traído con algunos chats que fallaron, no compartido, falló, no llegó nada) y «Reintentar» cuando se puede.

**Fuera de alcance:**
- Las líneas conectadas **antes** de este cambio (pasaron sus 24 h): para traer su historial hay que desconectarlas y volver a conectarlas. No se hace por ellas nada automático.
- Los **grupos**: Meta no los manda.
- Los contactos de la agenda **sin chat** no entran a Contactos (§ 7).
- Un separador en el chat entre lo traído y lo que llegó por Wasmish.
- Borrar lo importado desde la interfaz. Si hiciera falta, `fromHistory` (§ 5) permite hacerlo a mano.

## 3. Lo que dice Meta (fuentes oficiales)

Revisado el 2026-10-23 en la documentación de Meta para desarrolladores: la [guía de la coexistencia](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/) («Onboard WhatsApp Business app users») y la [referencia del webhook `history`](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/history). Las citas son textuales; lo que es interpretación nuestra lo dice. **Antes de escribir el plan se vuelven a abrir**, junto con la referencia de `smb_app_state_sync` y el [registro de cambios](https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog).

**El plazo y el pedido** (guía):
- «After you onboard the business customer, you have 24 hours to synchronize their contacts and messaging history». «You can only perform this step once»: para repetirlo, el negocio tiene que desconectarse y volver a hacer el Embedded Signup.
- El negocio decide en la app: «Tap the Confirm button in the app to give the business the option to share their chat history with you».
- Contactos: `POST /<BUSINESS_PHONE_NUMBER_ID>/smb_app_data` con `{ "messaging_product": "whatsapp", "sync_type": "smb_app_state_sync" }`. Historial: el mismo endpoint con `"sync_type": "history"`. La respuesta trae `request_id` («Store the `request_id` value in case you need to contact support»). La guía pide primero los contactos y después el historial.
- La respuesta del historial «only indicates successful acceptance of the request»: no dice si el negocio compartió.
- «Onboarding and synchronization can take several minutes».

**El historial** (guía y referencia de `history`):
- Campo `history`; `value` con `metadata.phone_number_id` y `history: [{ metadata: { phase, chunk_order, progress }, threads: [{ id, messages: [...] }] }]`.
- `threads[].id` es el teléfono del contacto. Cada mensaje trae `from` (el negocio o el contacto: así se sabe la dirección), `id`, `timestamp` («when the recipient's device received the message»), `type` con su objeto, y `history_context.status` (`DELIVERED`, `ERROR`, `PENDING`, `PLAYED`, `READ` o `SENT`). `to` solo en los ecos.
- Cubre los mensajes «within 180 days of the time when the business was onboarded», sin grupos.
- `phase`: 0 = del día 0 al 1, 1 = del 1 al 90, 2 = del 90 al 180. `progress` de 0 a 100: «A value of `100` indicates that synchronization is complete». Los trozos «may not be delivered sequentially»: se ordenan por `chunk_order`. Una fase sin chats no manda nada.
- Un webhook puede traer miles de mensajes: la referencia recomienda guardarlo primero y procesarlo aparte.
- Los archivos llegan con `type: "media_placeholder"` y sin contenido. Para los de los últimos 14 días («two weeks» en otro sitio) llega después **otro** webhook con el contenido y el id del archivo (el ejemplo es un `image` con `caption`, `mime_type`, `sha256` e `id`).
- Si el negocio no compartió: un trozo con `errors: [{ code: 2593109, title: "History sync is turned off by the business from the WhatsApp Business App", error_data: { details } }]`.
- La referencia no dice nada de reentregas ni duplicados.

**La agenda** (guía):
- Campo `smb_app_state_sync`; `value.state_sync: [{ type: "contact", contact: { full_name, first_name, phone_number }, action, metadata: { timestamp } }]`. `action`: `add` («the business added or edited a contact») o `remove`.
- «Future additions or changes to the business's WhatsApp contacts will trigger a corresponding smb_app_state_sync webhook»: sigue llegando después de la sincronización inicial.

**Lo que hay que comprobar con Meta de verdad** (§ 9), porque la documentación no lo deja claro: en qué campo y forma llega el webhook del archivo de 14 días (si es `history` u otro, y si trae el mismo `id` que el placeholder), si una reacción o un `context` aparecen en el historial, y el formato de `phone_number` de la agenda (con o sin `+`).

## 4. Pedirlo al conectar

- **El estado vive en la línea**, en `Line.historySync`, ligado a **una conexión concreta** (`connectionAt` = el `connectedAt` de esa conexión):
  - `status`: `pending` (hay que pedirlo), `requesting` (un proceso lo está pidiendo), `requested` (Meta lo aceptó o el resultado quedó incierto), `receiving`, `done`, `partial`, `declined` o `failed`;
  - por cada pedido (`contacts` y `history`): `state` (`pending`, `requesting`, `accepted`, `uncertain` o `rejected`), `requestId`, `claimedAt` y `error` (`{ code, detail }` de Meta);
  - `progress` (el mayor visto), `firstChunkAt`, `lastChunkAt`, `historyComplete` (llegó un trozo con `progress: 100`) y `failedThreads`.
- **Se marca en la misma escritura de la conexión.** En `applyConnection` (`services/line.service.js`, dentro del candado), una conexión **nueva** (`add`, `replace`, o reactivar una línea desconectada: las que ponen `connectedAt`) con `businessApp: true` deja `historySync` en `pending` con sus dos pedidos `pending`. Una **renovación** (`plan.action === 'renew'`, que conserva `connectedAt`) **no** toca `historySync`: no es una conexión nueva y Meta no da otra sincronización. Así, si el proceso cae justo después de conectar, el pedido sigue anotado.
- **Quién lo pide:** el worker del historial (§ 6) busca líneas con un pedido `pending` dentro de las 24 h de `connectionAt` y **reclama** cada pedido con una escritura condicionada (`pending` → `requesting`, con `claimedAt`): dos procesos, o un reintento y el worker, nunca piden lo mismo dos veces. Después de conectar se le da un empujón para que no espere a su siguiente vuelta. Pide primero los contactos y después el historial, desde `libs/whatsapp.js` (`requestSmbAppData({ token, phoneNumberId, syncType })`).
- **El resultado de cada pedido:**
  - Meta responde con `request_id` → `accepted`.
  - Meta responde con un error suyo (`err.waErrorCode`) → `rejected`, con el error. Se puede reintentar (abajo).
  - **Sin respuesta** (timeout, red, el proceso cae con el pedido en `requesting`) → `uncertain`: Meta pudo haberlo aceptado, y repetirlo podría gastar la única vez o dar error. **No se repite solo.** Al arrancar, un pedido que quedó en `requesting` pasa a `uncertain`.
  - La línea queda `requested` si el historial está `accepted` o `uncertain`, y `failed` si está `rejected`. Si después llegan trozos, pasa a `receiving` igual.
- **La conexión nunca se deshace** porque falle el pedido: el número funciona igual.
- **Reintentar:** `POST /api/lines/:id/history-sync`, con `requirePermission('lines.manage')`, como las demás rutas de líneas. Vuelve a `pending` los pedidos `rejected` y también los `uncertain` si pasaron 30 minutos sin ningún trozo (si el proceso murió antes de llamar a Meta, es la única salida; si Meta ya lo había aceptado, en el peor caso responde con un error y queda `rejected`), y le da el empujón al worker. Responde 404 si la línea no es de la cuenta, y 409 si no es de la app, si no hay nada que reintentar o si pasaron 24 h desde `connectionAt`. La UI ofrece «Reintentar» en esos mismos casos. Lleva su caso en `tests/isolation/`.
- **Nunca se pide** por una línea que no es de la app, ni por las conectadas antes de este cambio (no tienen `historySync`).
- **«No llegó nada»** no es un estado guardado: la UI lo deduce de `requested` sin `firstChunkAt` y más de 24 h desde `connectionAt`.

## 5. Lo que llega por el webhook

- **El tamaño:** la ruta del webhook acepta cuerpos de hasta 20 MB (hoy, 100 KB, el valor por defecto de `express.json` en `app.js`). Solo esa ruta; la firma HMAC sobre el cuerpo crudo no cambia.
- **`history`**, en `handleWebhook`, solo para una línea con `historySync` de la conexión actual (si no, se registra en el log y se ignora):
  - Un trozo con el error `2593109` pone la línea en `declined` y nada más.
  - Si no, cada `thread` se parte en **piezas** de como mucho 500 mensajes y un tamaño acotado (muy por debajo de los 16 MB por documento de Mongo: un hilo entero puede pasarlos, revisión de Codex) y cada pieza se guarda en una colección nueva, `HistoryThread`: `{ userId (la cuenta), lineId, connectionAt, contactPhone, phase, chunkOrder, part, messages, status: 'pending', attempts: 0 }`, con un índice único `{ lineId, connectionAt, phase, chunkOrder, contactPhone, part }`: una reentrega de Meta choca y no crea otra pieza.
  - La línea pasa a `receiving`, con `progress` = el mayor visto, `firstChunkAt` y `lastChunkAt`. Con `progress: 100` se pone `historyComplete`.
  - Se responde 200 enseguida. Un error al guardar responde 500 al final del lote, para que Meta lo reentregue (como `account_update`).
- **El archivo de 14 días:** el webhook que trae el contenido de un mensaje del historial lo guarda en una colección propia, `HistoryMedia` (`{ userId, lineId, connectionAt, contactPhone, waMessageKey, waMessageId, content, applied: false }`, única por línea, conexión y `waMessageKey`), y **después** busca el mensaje (§ 6, identidad). Si ya existe, le aplica el contenido (tipo, `caption`) y lo descarga con `descargarAdjunto`, y marca `applied`. El worker hace lo mismo al revés: **después** de crear un mensaje, busca su `HistoryMedia` pendiente. Como cada lado escribe antes de buscar al otro, uno de los dos siempre lo encuentra, llegue el archivo antes que el hilo, durante o después. La forma exacta del webhook se confirma con Meta (§ 3).
- **`smb_app_state_sync`:** cada contacto de la agenda se guarda en una colección nueva, `AgendaEntry`: `{ userId (la cuenta), phone, fullName, firstName, removed, syncedAt }`, única por cuenta y teléfono. Un `add` lo crea o lo cambia; un `remove` lo marca `removed`. Solo si `metadata.timestamp` es más nuevo que el `syncedAt` guardado (escritura condicionada). **Después** se proyecta al contacto (§ 7).
- **Lo roto y lo que falla, distinto:** un hilo, un mensaje o un contacto **mal formado** (sin teléfono, sin `id`) se salta con un aviso en el log (sin contenido) y el lote sigue (regla 7). Un **fallo al guardar** (la BD) no se descarta: 500 al final del lote para que Meta lo reentregue.

## 6. El worker del historial

Un worker nuevo, `workers/history.worker.js`, con el patrón de `auto.reply.worker.js` (arranca y se para en `index.js` con los otros dos). Una sola instancia, como hoy. Cada vuelta: primero los pedidos pendientes (§ 4), después una pieza de historial.

**Identidad de un mensaje (para todos los caminos).** Un campo nuevo, `Message.waMessageKey` = `wamidMessageKey(waMessageId)`, con un índice único **parcial** `{ conversationId, waMessageKey }` (`$type: 'string'`). Lo escriben los entrantes, los ecos, los envíos desde Wasmish y el historial. Así, un mensaje que llega por dos caminos con dos wamid de la misma clave (el historial y un eco en vivo, el caso del #121) choca en el índice en vez de duplicarse, aunque los dos lleguen a la vez: el E11000 se trata como «ya guardado», igual que hoy con `waMessageId_unico`. Si `wamidMessageKey` da `null` (un wamid con otra forma), queda solo `waMessageId_unico`, como hoy. Los mensajes viejos no tienen el campo y no se rellenan: para ellos, el historial busca además por la clave en esa conversación, **sin el límite de 30 días** de `findWebhookTarget`.

**Una pieza:**

1. La reclama con una escritura condicionada (`pending` → `processing`, con `claimedAt` y `attempts + 1`).
2. **El contacto:** `resolveContact(cuenta, { phone: contactPhone }, { source: 'businessApp' })`, que le pone el nombre de la agenda (§ 7).
3. **La conversación** de ese contacto en esa línea, creada si no existe, sin asignar a nadie (como un entrante).
4. **Cada mensaje**, en orden de `timestamp`:
   - **Dirección:** si `from` es el número del negocio (el `displayPhoneNumber` de la línea), es saliente con `origin: 'businessApp'`; si no, entrante.
   - **Contenido:** `describeInboundMessage`, la misma función que los entrantes y los ecos (citas y reenvíos con `describeMessageContext`). `media_placeholder` se guarda con la etiqueta «Archivo: míralo en tu celular» (Meta no dice qué tipo era). Ningún mensaje queda con `text` vacío.
   - **Estado:** de `history_context.status` (`READ` y `PLAYED` → leído, `DELIVERED` → entregado, `SENT` y `PENDING` → enviado, `ERROR` → fallido sin código). Los entrantes, como cualquier entrante.
   - **Hora:** `timestamp` del mensaje. **Marca:** `fromHistory: true` (no se ve; sirve para diagnosticar y para borrar lo importado a mano).
   - **Sin duplicar:** por la identidad de arriba.
   - **Su archivo:** después de crearlo, busca su `HistoryMedia` (§ 5).
   - **Reacciones** del historial (si llegan): se pegan a su mensaje con `applyReaction` si lo encuentran; si no, se descartan. Nunca quedan como «Reaccionó con 👍» suelto.
5. **La conversación:** la vista previa (`lastMessage`, `lastMessageAt`) se pone con el último mensaje de la pieza, en **una escritura condicionada** como la del eco (`webhook.controller.js`): si la conversación no tiene vista previa (`lastMessage` vacío: una recién creada nace con `lastMessageAt` = ahora) o si lo traído es más nuevo. Así una conversación nueva queda ordenada por su último mensaje real, y un mensaje en vivo que llegue entre medio no se pisa. **No** toca `unreadCount`, `lastInboundAt` (la ventana de 24 h), el bot ni su pausa, ni manda avisos push.
6. Marca la pieza `done`.

**Si una pieza falla**, vuelve a `pending`; al tercer intento queda `failed`, con el error en el log, se suma a `failedThreads` de la línea y el worker sigue. **Al arrancar**, todas las piezas en `processing` vuelven a `pending` (una sola instancia: si están así, el proceso anterior murió con ellas), y cada vuelta devuelve también las que lleven más de unos minutos en `processing`. Lo ya guardado no se duplica.

**Cuándo termina** (revisión de Codex: los trozos llegan desordenados y el de `progress: 100` puede llegar antes que otros). La línea pasa a:
- `done` si tiene `historyComplete`, ninguna pieza `pending` ni `processing`, `failedThreads` = 0, y pasaron **10 minutos** desde `lastChunkAt` sin trozos nuevos;
- `partial` con lo mismo pero `failedThreads` > 0 (la UI dice cuántos chats no se pudieron traer);
- si llega un trozo después, vuelve a `receiving`.

«Terminado» habla **solo de los chats**: la agenda no tiene señal de fin (sigue llegando para siempre) y los archivos de 14 días pueden llegar después.

**SSE:** `history_sync` con `{ lineId, status, progress }` a la cuenta (con `permission: 'lines.manage'` para Ajustes), como mucho cada pocos segundos, y `conversation_updated` agrupado para que la bandeja se refresque.

## 7. Los contactos y su nombre

- **`Contact.agendaName`**, campo nuevo: el nombre con el que el negocio lo tiene en la agenda del celular (`fullName`, o `firstName` si no hay), con `agendaSyncedAt` (el `syncedAt` de la entrada que lo puso). **Nunca** se toca `name`, que sigue siendo el que pone quien usa Wasmish.
- **Una sola operación lo escribe**, `applyAgendaName(cuenta, phone)` (en un servicio, con su test): lee la `AgendaEntry` y la copia al `Contact` de ese teléfono con una escritura condicionada a `agendaSyncedAt` menor (una entrada vieja nunca pisa una nueva; `removed` lo vacía). Es idempotente y la llaman:
  - el webhook de la agenda, **después** de guardar la entrada;
  - **todo camino que crea un contacto**, después de crearlo: `resolveContact` (entrantes, ecos, historial, API), el alta manual (`createContact`, que usa `Contact.create`) y la importación (`contact.import.controller.js`, con `bulkWrite`: para los teléfonos de la tanda que tengan `AgendaEntry`).
  - Como cada lado escribe antes de llamar a `applyAgendaName`, una agenda que llega mientras se crea el contacto nunca se pierde: uno de los dos la aplica.
  - Si `applyAgendaName` falla en el webhook, 500 para que Meta lo reentregue; si falla al crear un contacto, se registra y el contacto se crea igual (el siguiente cambio de la agenda lo arregla).
- **El nombre que se enseña**, en `contactDisplayName` (backend) y en `utils/contactDisplay.ts` (frontend): `name` → `agendaName` → `profileName` → `@username` → teléfono.
- **La búsqueda** de Contactos y de la bandeja también encuentra por `agendaName` (`utils/contact.query.js`).
- **Quién entra a Contactos:** solo los que tienen chat. Los de la agenda sin conversación se quedan en `AgendaEntry`: no aparecen en Contactos, ni en campañas, ni en la API.
- **`source: 'businessApp'`**: los contactos que nacen del historial. En la UI, «De la app de WhatsApp Business».
- **El teléfono de la agenda** se normaliza como `Contact.phone` (solo dígitos, con código de país). Si no se puede normalizar, se descarta.
- **Una agenda por cuenta:** si la cuenta tiene dos líneas de la app, gana el cambio más nuevo de cualquiera de las dos.
- `serializeContact` devuelve `agendaName`; los demás endpoints no cambian.

## 8. Aislamiento y seguridad

- **Todo con la cuenta de la línea del webhook** (`findInboundLine`): un `HistoryThread`, un `HistoryMedia`, una `AgendaEntry` o un `agendaName` nunca cruzan de cuenta. Los índices de las colecciones nuevas empiezan por `userId` o por `lineId` (que es de una sola cuenta).
- **El historial de una línea va a su conversación en esa línea**, aunque el contacto tenga otra en otra línea de la cuenta.
- **`POST /lines/:id/history-sync`:** 404 si la línea es de otra cuenta; solo quien puede gestionar líneas.
- **Los logs, sin contenido:** ni textos ni nombres de la agenda (bastan el `lineId`, la fase, el `chunk_order`, el número de hilos y mensajes, y el motivo).
- **Datos personales:** la agenda del celular entra a la base de Wasmish (también la de quien no tiene chat). Se dice en la explicación previa a conectar (brief) y se tiene en cuenta en Privacidad de la página pública.
- El token no sale del backend: los pedidos a Meta van por `libs/whatsapp.js`.

## 9. Pruebas

- **Unitarias** (`utils/`, funciones puras con su test): leer un trozo de `history` (hilos, fase, `chunk_order`, `progress`), partir un hilo en piezas (por número de mensajes y por tamaño), el error `2593109`, la dirección de un mensaje, el estado desde `history_context.status`, el `media_placeholder`, leer un contacto de la agenda (`add`, `remove`, teléfono con y sin `+`, sin nombre), el nombre que se enseña con `agendaName`, qué conexión pide la sincronización (`add`, `replace`, reactivar sí; `renew` no) y cuándo termina (`done`, `partial`, `receiving`).
- **De aislamiento y de servicio** (Mongo en memoria):
  - el historial de una línea no cae en otra cuenta; la agenda de una cuenta no nombra a un contacto de otra; el reintento de otra cuenta da 404, y el de una línea fuera de plazo o sin pedidos `rejected`, 409;
  - el pedido: dos reclamaciones a la vez piden una sola vez; un timeout deja `uncertain` y no se repite; un `requesting` al arrancar pasa a `uncertain`; renovar el token no reinicia `historySync`;
  - un trozo repetido no crea otra pieza ni duplica mensajes; el historial y un eco con otro wamid de la misma clave, a la vez, dejan un solo mensaje (`waMessageKey`); un mensaje viejo sin `waMessageKey` (más de 30 días) no se duplica;
  - una conversación nueva queda con la vista previa y la fecha de su último mensaje real; un entrante en vivo que llega a la mitad no se pisa; nada de lo traído suma no leídos ni mueve `lastInboundAt`;
  - el archivo de 14 días que llega antes del hilo, durante y después;
  - una pieza que falla tres veces deja la línea en `partial`; una pieza en `processing` al arrancar se retoma; un trozo con `progress: 100` antes que otros no da `done`;
  - la agenda que llega mientras se crea el contacto (por los dos órdenes); un contacto creado a mano, por la API o al importar toma su `agendaName`; un `remove` lo vacía; una entrada vieja no pisa una nueva; el `name` puesto en Wasmish no cambia con la agenda; un fallo al guardar la agenda responde 500.
- **El webhook con un cuerpo grande** (más de 100 KB y un hilo de más de 16 MB) se acepta, la firma se sigue comprobando y el hilo se guarda en piezas.
- **`webhook:simulate`:** `history` (con `--threads`, `--messages` y `--phase`), `history --declined`, `history-media` y `agenda` (`--remove`).
- **Navegador:** Ajustes → Líneas con cada estado; la bandeja llenándose en vivo; los nombres de la agenda en la bandeja, la ficha y Contactos; en la computadora y en el teléfono emulado.
- **Con Meta de verdad**, con **el chip del botón de la página** (todavía sin conectar: es la única prueba posible sin desconectar un número). Conectarlo, compartir el historial desde la app y comprobar: que llegan los contactos y el historial, el orden, los estados, los archivos de 14 días y lo que § 3 deja abierto. Lo que salga distinto se corrige en este spec y en `docs/arquitectura/`.

## 10. Orden de trabajo

1. **Spec, brief y plan** (un PR de documentación; Codex revisa el plan).
2. **Recibir sin pedir nada:** `Message.waMessageKey` y su índice en todos los caminos, el límite del webhook, `Line.historySync`, `HistoryThread` en piezas, `HistoryMedia`, el simulador, tests y documentación. Sin el pedido automático, en producción no llega nada: es seguro desplegarlo solo.
3. **Procesar:** el worker del historial (piezas, identidad, vista previa, archivos, recuperación al arrancar, cuándo termina, SSE), tests y documentación.
4. **La agenda:** `AgendaEntry`, `agendaName`, `applyAgendaName` en los tres caminos que crean contactos, el nombre que se enseña y la búsqueda, tests y documentación (`contactos.md`).
5. **Encender el pedido:** marcarlo al conectar, reclamarlo en el worker, `requestSmbAppData`, el reintento y su ruta, tests y documentación. Va **último**, cuando los dos receptores y los archivos ya existen (revisión de Codex).
6. **UI**, siguiendo el diseño de Claude Design.
7. **Versión** con los PRs 2 a 5 juntos (antes de que se conecte un cliente nuevo con la app: si no, su historial se pierde), y la prueba con Meta de § 9 tras desplegar. La UI puede ir en la versión siguiente: sin ella, el historial llega igual, pero no se ve su estado.

Documentación que se toca por el camino: `webhook-adjuntos.md`, `whatsapp-envio.md`, `api.md`, `chat.md`, `contactos.md`, `pruebas-y-scripts.md` y `Backend/AGENTS.md` (índices nuevos). Cada PR de código lleva su revisión de Codex.

## 11. Decisiones (2026-10-23)

- **Historial y contactos**, los dos: el historial solo trae teléfonos, y sin la agenda la bandeja sería una lista de números. (Descartado: solo el historial; solo los contactos.)
- **Se pide solo, al conectar**, con «Reintentar» si falla dentro de las 24 h: es de una sola vez y con plazo, y el negocio ya decidió en la app si comparte. (Descartado: un botón; preguntar al conectar.)
- **Los archivos de los últimos 14 días se descargan**, en el mismo PR que el historial: si un cliente se conecta entre dos PRs, sus archivos recientes no vuelven. Los más viejos, «Archivo: míralo en tu celular». (Descartado: solo el aviso; descargarlos en otro PR.)
- **Solo los contactos con chat entran a Contactos;** el resto de la agenda se guarda aparte y nombra a quien escriba después. (Descartado: toda la agenda con una etiqueta; solo completar a los que ya existen.)
- **El nombre de la agenda en un campo propio** que sigue al celular; se enseña el de Wasmish, luego el de la agenda, luego el de perfil. (Descartado: rellenar `name` una vez; que el celular pise `name`.)
- **En la interfaz, el estado en Ajustes → Líneas;** el chat no cambia (lo enviado desde el celular usa la marca que ya existe). (Descartado: un separador en el chat; nada en la interfaz.)
- **Guardar y procesar aparte** (`HistoryThread` y un worker): llega una sola vez y un despliegue a mitad no puede perderlo. (Descartado: procesar dentro del webhook; en memoria.)
- Lo decidió el agente, para revisar: lo traído no abre la ventana de 24 h ni se asigna; `fromHistory` en el mensaje; `source: 'businessApp'` para los contactos del historial; tres intentos por pieza; «No llegó historial» se deduce de las fechas (24 h sin trozos), sin un proceso aparte; una agenda por cuenta; la agenda y el `source` nuevo se ven en la ficha y en Contactos (brief, § 4).
- **Tras la revisión de Codex del spec** (PR #123), también del agente: la identidad compartida `waMessageKey` con índice único por conversación; `HistoryMedia` y la agenda se reconcilian escribiendo antes de buscar al otro lado; el pedido se marca en la escritura de la conexión y se reclama, con `uncertain` sin repetir; renovar el token no vuelve a pedir; los hilos se guardan en piezas; `done` pide 10 minutos sin trozos y ninguna pieza fallida (si no, `partial`); al arrancar se retoman todas las piezas en proceso; el pedido automático se enciende en el último PR de backend.
