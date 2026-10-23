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
5. **El estado en Ajustes → Líneas:** cómo va el historial de cada línea (pedido, trayendo con el %, traído, no compartido, falló, no llegó nada) y «Reintentar» cuando se puede.

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

- **Dónde:** cuando la conexión de un número termina bien y la línea queda con `businessApp: true` (en el camino de `applyConnection` de `services/line.service.js`, **después** de soltar el candado de líneas). Un servicio nuevo, `services/history.sync.service.js`, con `requestHistorySync(line)`.
- **Qué hace:** con el token del WABA, llama a Meta dos veces desde `libs/whatsapp.js` (`requestSmbAppData({ token, phoneNumberId, syncType })`): primero `smb_app_state_sync`, después `history`. Guarda en la línea, en `Line.historySync`:
  - `status`: `requested`, `receiving`, `done`, `declined` o `failed`;
  - `requestedAt`, `contactsRequestId`, `historyRequestId`;
  - `progress` (el mayor visto), `lastChunkAt` y `historyComplete` (llegó un trozo con `progress: 100`);
  - `error`: `{ code, detail }` de Meta, si falló.
- **Si falla** cualquiera de los dos pedidos, la línea queda `failed` con el error, y la conexión **no** se deshace: el número funciona igual. Si los contactos funcionaron y el historial no, al reintentar solo se pide lo que falta.
- **Reintentar:** `POST /api/lines/:id/history-sync`, con `requirePermission('lines.manage')`, como las demás rutas de líneas. Responde 404 si la línea no es de la cuenta, y 409 si no es de la app, si ya está pedido (`requested`, `receiving`, `done` o `declined`) o si pasaron 24 h desde `connectedAt`. Lleva su caso en `tests/isolation/`.
- **Una línea reconectada** (otra vez el Embedded Signup) vuelve a pedirlo: Meta lo permite tras desconectar. `historySync` se reinicia en cada conexión.
- **Nunca se pide** por una línea que no es de la app, ni por las conectadas antes de este cambio.
- **«No llegó nada»** no es un estado guardado: la UI lo deduce de `requested` sin `lastChunkAt` y más de 24 h desde `requestedAt`.

## 5. Lo que llega por el webhook

- **El tamaño:** la ruta del webhook acepta cuerpos de hasta 20 MB (hoy, 100 KB, el valor por defecto de `express.json` en `app.js`). Solo esa ruta; la firma HMAC sobre el cuerpo crudo no cambia.
- **`history`**, en `handleWebhook`:
  - Un trozo con el error `2593109` pone la línea en `declined` y nada más.
  - Si no, cada `thread` se guarda tal cual como un documento de una colección nueva, `HistoryThread`: `{ userId (la cuenta), lineId, phoneNumberId, contactPhone, phase, chunkOrder, messages, status: 'pending', attempts: 0, createdAt }`. Un hilo de miles de mensajes cabe de sobra en los 16 MB de Mongo.
  - La línea pasa a `receiving` con `progress` = el mayor visto y `lastChunkAt` = ahora. Con `progress: 100` se pone `historyComplete`; el estado pasa a `done` cuando, además, no quedan hilos pendientes de esa línea (lo decide el worker, § 6).
  - Se responde 200 enseguida. Un error al guardar responde 500 al final del lote, para que Meta lo reentregue (como `account_update`).
- **El archivo de 14 días:** el webhook que trae el contenido de un mensaje del historial busca ese mensaje por su `waMessageId` (y por la clave del wamid, `wamidMessageKey`, como en el #121) **en la conversación de esa línea y ese contacto**, le pone su tipo, su texto (`caption`) y su archivo, y lo descarga con `descargarAdjunto`. Si el mensaje todavía no existe (el hilo sigue pendiente), el contenido se guarda en el `HistoryThread` y el worker lo aplica al crearlo. La forma exacta se confirma con Meta (§ 3).
- **`smb_app_state_sync`:** se aplica en el momento (es poco). Cada contacto de la agenda se guarda en una colección nueva, `AgendaEntry`: `{ userId (la cuenta), phone, fullName, firstName, removed, syncedAt }`, única por cuenta y teléfono. Un `add` lo crea o lo cambia; un `remove` lo marca `removed`. Si ese teléfono ya es un `Contact` de la cuenta, le pone `agendaName` (o lo vacía con `remove`). Una entrada más vieja que la guardada (`metadata.timestamp`) no la pisa.
- Un hilo o un contacto roto se salta con un aviso en el log (sin contenido) y el lote sigue (regla 7).

## 6. El worker del historial

Un worker nuevo, `workers/history.worker.js`, con el patrón de `auto.reply.worker.js` (arranca y se para en `index.js` con los otros dos).

1. Toma **un** `HistoryThread` pendiente (el más viejo), lo marca en proceso con una escritura condicionada y suma `attempts`.
2. **El contacto:** `resolveContact(cuenta, { phone: contactPhone }, { source: 'businessApp', … })`. Si no existía, nace con el `agendaName` de su `AgendaEntry` (si la hay).
3. **La conversación** de ese contacto en esa línea, creada si no existe, sin asignar a nadie (como un entrante).
4. **Cada mensaje**, en orden de `timestamp`:
   - **Dirección:** si `from` es el número del negocio (el `display_phone_number` de la línea), es saliente con `origin: 'businessApp'`; si no, entrante.
   - **Contenido:** `describeInboundMessage`, la misma función que los entrantes y los ecos (citas y reenvíos con `describeMessageContext`). `media_placeholder` se guarda con la etiqueta «Archivo: míralo en tu celular» (Meta no dice qué tipo era). Ningún mensaje queda con `text` vacío.
   - **Estado:** de `history_context.status` (`READ` y `PLAYED` → leído, `DELIVERED` → entregado, `SENT` y `PENDING` → enviado, `ERROR` → fallido sin código). Los entrantes, como cualquier entrante.
   - **Hora:** `timestamp` del mensaje.
   - **Marca:** `fromHistory: true` en el `Message` (no se ve; sirve para diagnosticar y para borrar lo importado a mano si hiciera falta).
   - **Sin duplicar:** si ya existe por `waMessageId` (índice único `waMessageId_unico`, que trata el E11000 como «ya guardado») o por la clave del wamid en esa conversación, se salta.
   - **Reacciones** del historial (si llegan): se pegan a su mensaje con `applyReaction` si lo encuentran; si no, se descartan. Nunca quedan como «Reaccionó con 👍» suelto.
5. **La conversación, al final:** `lastMessage` y `lastMessageAt` solo si lo traído es más nuevo que lo que tiene. **No** toca `unreadCount`, `lastInboundAt` (la ventana de 24 h), el bot ni su pausa, ni manda avisos push.
6. Marca el hilo `done` y, si la línea tiene `historyComplete` y ya no le quedan hilos pendientes, la línea pasa a `done`.
7. **SSE:** `history_sync` con `{ lineId, status, progress }` a la cuenta, como mucho cada pocos segundos (no uno por hilo), para que la bandeja y Ajustes se refresquen.

Si un hilo falla, vuelve a pendiente; al tercer intento queda `failed`, con el error en el log, y el worker sigue con el siguiente. Un reinicio del servidor a mitad de un hilo lo deja «en proceso»: al arrancar, los que llevan más de unos minutos así vuelven a pendiente (lo que ya se guardó no se duplica).

## 7. Los contactos y su nombre

- **`Contact.agendaName`**, campo nuevo: el nombre con el que el negocio lo tiene en la agenda del celular (`fullName`, o `firstName` si no hay). Lo escriben solo el webhook de la agenda y la creación del contacto. **Nunca** se toca `name`, que sigue siendo el que pone quien usa Wasmish.
- **El nombre que se enseña**, en `contactDisplayName` (backend) y en `utils/contactDisplay.ts` (frontend): `name` → `agendaName` → `profileName` → `@username` → teléfono.
- **La búsqueda** de Contactos y de la bandeja también encuentra por `agendaName` (`utils/contact.query.js`).
- **Quién entra a Contactos:** solo los que tienen chat. Los de la agenda sin conversación se quedan en `AgendaEntry`: no aparecen en Contactos, ni en campañas, ni en la API.
- **Un contacto que escribe después** (o se crea a mano, por la API o al importar): al crearse en `resolveContact`, busca su `AgendaEntry` por teléfono y toma su `agendaName`.
- **`source: 'businessApp'`**: los contactos que nacen del historial. En la UI, «De la app de WhatsApp Business».
- **El teléfono de la agenda** se normaliza como `Contact.phone` (solo dígitos, con código de país). Si no se puede normalizar, se descarta.
- **Una agenda por cuenta:** si la cuenta tiene dos líneas de la app, gana el último cambio de cualquiera de las dos.
- `serializeContact` devuelve `agendaName`; los demás endpoints no cambian.

## 8. Aislamiento y seguridad

- **Todo con la cuenta de la línea del webhook** (`findInboundLine`): un `HistoryThread`, una `AgendaEntry` o un `agendaName` nunca cruzan de cuenta. Los índices de las dos colecciones nuevas empiezan por `userId`.
- **El historial de una línea va a su conversación en esa línea**, aunque el contacto tenga otra en otra línea de la cuenta.
- **`POST /lines/:id/history-sync`:** 404 si la línea es de otra cuenta; solo quien puede gestionar líneas.
- **Los logs, sin contenido:** ni textos ni nombres de la agenda (bastan el `lineId`, la fase, el `chunk_order`, el número de hilos y mensajes, y el motivo).
- **Datos personales:** la agenda del celular entra a la base de Wasmish (también la de quien no tiene chat). Se dice en la explicación previa a conectar (brief) y se tiene en cuenta en Privacidad de la página pública.
- El token no sale del backend: los pedidos a Meta van por `libs/whatsapp.js`.

## 9. Pruebas

- **Unitarias** (`utils/`, funciones puras con su test): leer un trozo de `history` (hilos, fase, `chunk_order`, `progress`), el error `2593109`, la dirección de un mensaje, el estado desde `history_context.status`, el `media_placeholder`, leer un contacto de la agenda (`add`, `remove`, teléfono con y sin `+`, sin nombre), y el nombre que se enseña con `agendaName`.
- **De aislamiento y de servicio** (Mongo en memoria): el historial de una línea no cae en otra cuenta; la agenda de una cuenta no nombra a un contacto de otra; el reintento de otra cuenta da 404, y el de una línea fuera de plazo o ya pedida, 409; un trozo repetido no duplica mensajes; un mensaje que ya estaba (por el wamid o por su clave) no se duplica; nada de lo traído suma no leídos ni mueve `lastInboundAt`; un contacto que escribe después toma su `agendaName`; el `name` puesto en Wasmish no cambia con la agenda; un hilo que falla tres veces queda `failed` y el resto sigue; el archivo de 14 días que llega antes o después de su mensaje.
- **El webhook con un cuerpo grande** (más de 100 KB) se acepta y la firma se sigue comprobando.
- **`webhook:simulate`:** `history` (con `--threads`, `--messages` y `--phase`), `history --declined`, `history-media` y `agenda` (`--remove`).
- **Navegador:** Ajustes → Líneas con cada estado; la bandeja llenándose en vivo; los nombres de la agenda en la bandeja, la ficha y Contactos; en la computadora y en el teléfono emulado.
- **Con Meta de verdad**, con **el chip del botón de la página** (todavía sin conectar: es la única prueba posible sin desconectar un número). Conectarlo, compartir el historial desde la app y comprobar: que llegan los contactos y el historial, el orden, los estados, los archivos de 14 días y lo que § 3 deja abierto. Lo que salga distinto se corrige en este spec y en `docs/arquitectura/`.

## 10. Orden de trabajo

1. **Spec, brief y plan** (un PR de documentación; Codex revisa el plan).
2. **Backend del historial:** `requestSmbAppData`, `Line.historySync` y el pedido al conectar, el reintento, el límite del webhook, `HistoryThread`, el worker, los archivos de 14 días, el simulador, tests y documentación (`webhook-adjuntos.md`, `whatsapp-envio.md`, `api.md`, `chat.md`, `pruebas-y-scripts.md`, `Backend/AGENTS.md`).
3. **Backend de la agenda:** `AgendaEntry`, `agendaName`, el nombre que se enseña y la búsqueda, `resolveContact`, el simulador, tests y documentación (`contactos.md`).
4. **UI**, siguiendo el diseño de Claude Design.
5. **Versión** con los PRs 2 y 3 juntos (antes de que se conecte un cliente nuevo con la app: si no, su historial se pierde), y la prueba con Meta de § 9 tras desplegar. La UI puede ir en la versión siguiente: sin ella, el historial llega igual, pero no se ve su estado.

Cada PR de código lleva su revisión de Codex. Si el 2 pasa de unas 500 líneas, se parte (el pedido y el webhook; el worker).

## 11. Decisiones (2026-10-23)

- **Historial y contactos**, los dos: el historial solo trae teléfonos, y sin la agenda la bandeja sería una lista de números. (Descartado: solo el historial; solo los contactos.)
- **Se pide solo, al conectar**, con «Reintentar» si falla dentro de las 24 h: es de una sola vez y con plazo, y el negocio ya decidió en la app si comparte. (Descartado: un botón; preguntar al conectar.)
- **Los archivos de los últimos 14 días se descargan**, en el mismo PR que el historial: si un cliente se conecta entre dos PRs, sus archivos recientes no vuelven. Los más viejos, «Archivo: míralo en tu celular». (Descartado: solo el aviso; descargarlos en otro PR.)
- **Solo los contactos con chat entran a Contactos;** el resto de la agenda se guarda aparte y nombra a quien escriba después. (Descartado: toda la agenda con una etiqueta; solo completar a los que ya existen.)
- **El nombre de la agenda en un campo propio** que sigue al celular; se enseña el de Wasmish, luego el de la agenda, luego el de perfil. (Descartado: rellenar `name` una vez; que el celular pise `name`.)
- **En la interfaz, el estado en Ajustes → Líneas;** el chat no cambia (lo enviado desde el celular usa la marca que ya existe). (Descartado: un separador en el chat; nada en la interfaz.)
- **Guardar y procesar aparte** (`HistoryThread` y un worker): llega una sola vez y un despliegue a mitad no puede perderlo. (Descartado: procesar dentro del webhook; en memoria.)
- Lo decidió el agente, para revisar: lo traído no abre la ventana de 24 h ni se asigna; `fromHistory` en el mensaje; `source: 'businessApp'` para los contactos del historial; tres intentos por hilo; «No llegó historial» se deduce de las fechas (24 h sin trozos), sin un proceso aparte; una agenda por cuenta; la agenda y el `source` nuevo se ven en la ficha y en Contactos (brief, § 4).
