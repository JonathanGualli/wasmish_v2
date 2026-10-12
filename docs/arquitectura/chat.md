# Chat: tiempo real, bandeja e hilo

SSE y sus eventos, no leídos, y la UI del chat: hilo, bandeja, conversación nueva, ficha del contacto, plantillas y archivos.

> Parte de la documentación de Wasmish: el mapa de todos los temas está en el [AGENTS.md](../../AGENTS.md) de la raíz.
> Las decisiones de producto con fecha están en [decisiones.md](../decisiones.md).

## Contenido

- **Backend**
  - [SSE (`stream.controller.js`)](#sse-streamcontrollerjs)
  - [Eventos SSE y sus payloads](#eventos-sse-y-sus-payloads)
  - [`unreadCount`](#unreadcount)
- **Frontend**
  - [`useConversationMessages` — patrón crítico](#useconversationmessages--patrón-crítico)
  - [`useConversations` — reglas del handler de `message_created`](#useconversations--reglas-del-handler-de-message_created)
  - [Ventana de 24 h en la UI (`ChatThread`)](#ventana-de-24-h-en-la-ui-chatthread)
  - [Varias líneas en Chats](#varias-líneas-en-chats)
  - [Conversación nueva (`NewConversationPanel`)](#conversación-nueva-newconversationpanel)
  - [Ir de la ficha al chat (`ChatsNavigationState`)](#ir-de-la-ficha-al-chat-chatsnavigationstate)
  - [Ficha del contacto en el chat](#ficha-del-contacto-en-el-chat)
  - [`SendTemplateDialog` + `useSendTemplate`](#sendtemplatedialog--usesendtemplate)
  - [Enviar archivos en la UI (`components/Chat/Composer/`)](#enviar-archivos-en-la-ui-componentschatcomposer)
  - [Mensajes que no son texto](#mensajes-que-no-son-texto)
  - [`temporalId`](#temporalid)

---

## Backend

### SSE (`stream.controller.js`)

**SSE (`stream.controller.js`):** `clients` es un `Map<accountId, Set<Response>>`: desde la Fase 1 de multi-línea (2026-10-11) las conexiones se agrupan **por cuenta** (`stream.routes.js` usa `req.auth.accountId`). `sendToAccount(accountId, event, data)` escribe a todas las conexiones abiertas de la cuenta, sin filtro todavía: el filtro por línea y asignación (`canReceive`) llega con los permisos, en la Fase 3. Keep-alive cada 25 segundos.

### Eventos SSE y sus payloads

**Eventos SSE y sus payloads:**
- `message_created`: `{ id, conversationId, sender, text, timestamp, status, temporalId? }` — en los **inbound** (webhook) incluye además `type`, `unreadCount` (el valor real de la BD) y `windowExpiresAt`
- `message_status`: `{ id, conversationId, waMessageId, status, deliveredAt, readAt, failedAt, errorCode, errorDetail }`
- `conversation_updated`: `{ id, unreadCount }` — solo lo emite el reset de no leídos de `listMessages`
- `contact_updated`: `{ id, marketingOptOut, marketingOptOutAt }` en una baja o alta de publicidad; `{ id }` en un cambio de número. `useContacts` refresca la lista y la ficha, y `useConversations` la bandeja (el título y el teléfono salen del contacto)
- `campaign_progress`: la campaña serializada con `stats` — como mucho uno por segundo y campaña, y siempre en los cambios de estado
- `message_created` y `message_status` llevan `campaignId` si el mensaje salió de una campaña. Una campaña grande dispara cientos seguidos: la bandeja y Contactos los agrupan con `useThrottledInvalidate`

### `unreadCount`

**`unreadCount`:** se incrementa en cada mensaje inbound (webhook). Se resetea a 0 (`markConversationRead`, en `chat.controller.js`) en dos momentos: al **abrir** el chat (`GET /api/chats/:id/messages` **sin cursor**, `hasCursor === false`) y al **responder** desde él (texto o plantilla en `POST /api/chats/:id/…`, aunque Meta lo rechace). Lo que llega con el chat abierto **sigue sin leer** hasta entonces (decisión de Jonathan, 2026-10-07). La plantilla de «Conversación nueva» a un número que ya tenía chat no cuenta: ahí no se vieron sus mensajes. Paginar hacia atrás en el historial no es leer, y si reseteara siempre, un mensaje que llegue mientras el usuario hace scroll perdería su badge. El `updateOne` filtra por `unreadCount: { $gt: 0 }` y solo emite `conversation_updated` si `modifiedCount > 0`, para no inundar el SSE al reabrir chats ya leídos.

## Frontend

### `useConversationMessages` — patrón crítico

**`useConversationMessages` — patrón crítico:**
- `useInfiniteQuery` con cursor `?limit=50&before=<ISO timestamp>`
- El cursor `nextCursor` viene del backend como el `timestamp` del último mensaje de la página
- SSE `message_created`: si `temporalId` ya existe en el cache → **no agrega el mensaje** (deduplicación de UI optimista)
- SSE `message_status`: actualiza en-place el mensaje por `id` en todas las páginas del cache
- Se **suscribe** al `SSEProvider` global (ya no abre su propia conexión); filtra eventos por `conversationId`

### `useConversations` — reglas del handler de `message_created`

**`useConversations` — reglas del handler de `message_created`:**
- **Reordena**: tras el `map`, ordena por `updatedAt` desc para replicar en vivo el `lastMessageAt: -1` del backend. Sin eso, el chat con mensaje nuevo se queda hundido hasta el próximo refetch.
- **Enviar no es leer**: para `sender === 'me'` el `unreadCount` **no se toca** (`(c.unreadCount ?? 0)`, nunca `0`). El reset tiene un solo dueño: el evento `conversation_updated`.
- Para mensajes entrantes prefiere `payload.unreadCount` (el valor real de la BD, que el webhook ya manda) sobre el `+1` local, que queda de respaldo — así no se desincroniza con varias pestañas abiertas.
- `windowExpiresAt: payload.windowExpiresAt ?? c.windowExpiresAt` — un mensaje propio no trae el campo y **no debe** reabrir la ventana; el `??` conserva el que ya había.

### Ventana de 24 h en la UI (`ChatThread`)

**Ventana de 24 h en la UI (`ChatThread`):** `useConversationWindow(windowExpiresAt)` compara el ISO del backend con el reloj local y hace tick cada 60 s (recalcula al vuelo cuando `expiresAt` cambia, si no la UI quedaría hasta un minuto vieja). Tres estados del composer: normal, aviso naranja bajo el umbral de `WINDOW_WARNING_MS` (2 h), y bloqueado con el botón «Enviar plantilla». `windowBlocked = Boolean(conversation) && !isOpen`: mientras la lista carga no se sabe el estado real, y bloquear por defecto haría parpadear el aviso en cada carga.

### Varias líneas en Chats

**Varias líneas en Chats** (Fase 2c de multi-línea, 2026-10-12; diseño en `Design/Wasmish Líneas - Chats, campañas y ficha.html`, brief en `docs/superpowers/specs/2026-10-12-multi-linea-brief-ui.md` § Parte 2). **Con una sola línea, nada de esto aparece** y Chats se ve como antes. Dos reglas, en `useLines`:
- **`showLines`** (más de una línea, conectada o no): cada conversación dice de qué línea es. Así una cuenta que cambió de número distingue las conversaciones del número anterior.
- **`hasManyLines`** (más de una **conectada**): se elige por cuál enviar. Con una sola, se usa esa y no se pregunta.

Las piezas (`components/Line/`), que reutilizan `LineSwatch` y `lineLabel` de Ajustes:
- **`LineChip`**: el cuadrito de la línea y su etiqueta, y «desconectada» si lo está. Va junto a la hora en la bandeja, con la etiqueta corta (`shortLineLabel`: una línea que se llama por su número queda en «···1122»), y como pastilla con el número en la cabecera del chat (`variant="header"`; en móvil, la corta).
- **`LineSelect`**: «Enviar desde», con la línea por defecto puesta. Cada opción dice qué pasa con las plantillas si se elige, respecto a la elegida: «Misma cuenta que Ventas: mismas plantillas», «Otra cuenta de WhatsApp Business: otras plantillas» (o «se quitará la plantilla elegida» si ya hay una). La elegida dice cómo la ve el cliente («La ven como «Ferretería La Estrella»», su `verifiedName`): Wasmish no tiene el nombre del WABA, solo su ID. En móvil es una hoja inferior.
- **Sin saltos al cargar:** `useLines` guarda en `localStorage` cuántas líneas tenía la cuenta (`wasmish:line-count:<userId>`). Mientras cargan, si había varias (`linesPending`), el filtro y las etiquetas pintan un hueco gris de su tamaño.

Dónde:
- **Bandeja** (`ConversationList` + `LineFilter`): bajo la búsqueda, «Todas las líneas» o una, también las desconectadas («Números anteriores», solo consulta), cada una con sus no leídos. Filtra en el cliente (`GET /api/chats` ya trae todas con su `lineId`). Con una línea elegida, el contador de la cabecera es el de esa línea, y el filtro avisa de los «sin leer en otras». Un filtro cuya línea ya no está vuelve a «todas».
- **Campo de escribir** (`ChatComposer`): una conversación de una **línea desconectada** queda para consulta, con «Escribirle desde Ventas» (la línea por defecto). Ese botón abre la conversación nueva con el contacto ya puesto (`onStartConversation` → `ChatPage.startDraft`, que reemplaza el borrador como al llegar desde la ficha). No aparece si el contacto escribió sin compartir su teléfono. **Sin ninguna línea conectada**, el mismo estado lleva a Ajustes. Mientras las líneas no han cargado no se bloquea, igual que con la ventana. Con la ventana cerrada, el aviso dice de qué línea es («La ventana de 24 h se cerró en Soporte»).
- **Enviar plantilla** (`SendTemplateDialog`): no se elige línea, es la de la conversación. Solo se ofrecen las plantillas de su WABA (`useTemplateForm(initial, waBusinessId)` filtra por `Template.waBusinessId`) y, con varias líneas, la cabecera dice por cuál sale.
- **Conversación nueva** y **ficha**: en sus secciones, abajo.

### Conversación nueva (`NewConversationPanel`)

**Conversación nueva (`NewConversationPanel`):** no es un modal — ocupa el sitio del hilo, y la bandeja enseña una fila «Borrador» mientras exista. **El borrador sobrevive** a abrir otra conversación, cambiar de página o recargar: `ChatPage` lo guarda en `sessionStorage` (`utils/conversationDraft.ts`, clave con el id del usuario) y la fila lo vuelve a abrir. Solo se borra al pulsar *Descartar*, al enviarlo, al cerrar sesión (`clearAllDrafts` en `logOut`) o al cerrar la pestaña. Nunca va a la BD. `useTemplateForm` arranca con lo guardado y expone `selectedName` aparte de `selected`, porque mientras cargan las plantillas `selected` es `undefined` y guardar ese valor borraría la plantilla elegida. **Solo envía plantillas**: a un número que nunca escribió WhatsApp no le entrega texto libre (131047). Va a `POST /api/chats/template`, que llama a `processTemplateSending` con `destinationNumber` + `contactName`; si el número ya tiene conversación la reutiliza (índice único), y el panel lo avisa antes con «Abrirla». Si Meta rechaza, la conversación queda creada con el mensaje fallido — por eso `useStartConversation` invalida la bandeja también en el error.

**Con más de una línea conectada** (Fase 2c), lo primero de la cabecera es «Enviar desde» (`LineSelect`), y el borrador la guarda (`ConversationDraft.lineId`; `null` = la por defecto, y una que ya no está conectada también cae en la por defecto). Las plantillas son solo las del WABA de esa línea (con la cuenta en el `hint`: «3 de Ventas»), y el envío lleva su `lineId`. Pasar a una línea de otro WABA **quita la plantilla elegida** si allí no hay una con su nombre (`selectedExistsIn`), lo dice («Quitamos «aviso_pedido_listo». Es de otra cuenta…») y deja deshacerlo con «Volver a Ventas», que recupera la línea, la plantilla y lo rellenado. «Ya tienes una conversación» se mira **en la línea elegida** (una por número y línea): con varias, es un aviso con «Abrirla», y el botón pasa a «Enviar en su conversación». El panel conserva su forma de antes (número y nombre en la cabecera, plantilla abajo), aunque el diseño lo dibujaba en columna con un selector de contacto (decisión de Jonathan, 2026-10-12). Los mensajes con `templateName` se pintan en el hilo con «Plantilla · nombre» encima y sus botones debajo (`TemplateButtons`, de la definición sincronizada).

### Ir de la ficha al chat (`ChatsNavigationState`)

**Ir de la ficha al chat (`ChatsNavigationState`):** la ficha navega a `chats` con `state: { conversationId }` (abrir su conversación) o `state: { draft: { phone, name } }` (empezar una nueva, **reemplazando** el borrador que hubiera sin preguntar). `ChatPage` consume ese `state` una sola vez y lo borra del historial con `navigate(..., { replace: true, state: null })`; si se quedara, recargar la página volvería a pisar el borrador.

### Ficha del contacto en el chat

**Ficha del contacto en el chat** (2026-10-07, diseño en `Design/Wasmish Chat - Ficha y adjuntos.html`, brief en `docs/superpowers/specs/2026-10-07-chat-ficha-adjuntos-brief-ui.md`): `components/Chat/ContactSidebar/`. Se abre con «Ficha» en la cabecera (`ChatHeader`) o pulsando el nombre o el avatar. Desde 1280 px es una columna de 340 px junto al chat, que se abre a lo ancho; por debajo entra desde la derecha sobre la conversación, y en móvil ocupa la pantalla con «‹ Chat» (`Transition` de Headless UI con `data-[closed]`). Se abre **para una conversación** (`ChatPage` guarda de cuál): abrir otra, volver a la misma o volver a Chats desde otra página la deja cerrada (decisión de Jonathan, 2026-10-07). Al cambiar de chat se va sin animar (`key` por conversación), para no salir deslizándose con el contacto nuevo dentro. Esc cierra primero la ficha y luego la conversación, y no hace nada con un diálogo abierto (`aria-modal`): si no, cerrar el de plantilla también cerraba el chat y se perdía lo escrito. La conversación trae su `contactId` (`GET /api/chats`); una anterior a los contactos sin enlazar no tiene ficha.
- **Arriba, sobre verde profundo:** quién es (nombre, empresa, «nombre de WhatsApp», teléfono o @usuario), sus **etiquetas**, que se guardan al ponerlas o quitarlas (`ContactSidebarTags`: `TagSelector` sin `label` y con `createsOnPick`; `setTags` es optimista y vuelve atrás si falla), y la ventana en una línea (el aviso fuerte sigue abajo, en el campo de escribir). La ventana sale de la **conversación**, no del contacto, y cerrada dice desde cuándo: «Ventana cerrada · hace 2 días». **Con más de una línea** (`showLines`), la ventana es de cada número: `LineWindowList` pinta «Ventana de 24 h · por línea», una fila por conversación del contacto (`contact.conversations`, la más reciente primero) con su línea, abierta y lo que queda o cerrada y desde cuándo. La de la conversación abierta va resaltada, y tocar otra abre esa conversación con la ficha abierta.
- **Notas** (`ContactNotes`): el mismo `Contact.notes` de siempre (1000 caracteres), editable en el sitio y guardado solo con `useAutosave`: al pasar 1 s sin escribir y al salir del campo, nunca dos guardados a la vez, y al desmontarse (otra conversación, cerrar la ficha) termina de guardar. Si eso falla con la ficha ya fuera de la vista, el texto queda en `unsavedNotes` (memoria de la pestaña) y vuelve al campo al regresar (decisión de Jonathan). El error se enseña junto al campo con «Reintentar», nunca solo en el aviso global. Se monta una por contacto (`key`): lo que llega del servidor no pisa lo que se escribe (y el backend recorta espacios, así que comparar con él marcaría cambios que no hay).
- **Datos** (`ContactDataCard`): nombre, email y empresa se editan **juntos, con Guardar** (un nombre a medias cambiaría la bandeja letra a letra); el teléfono no. Origen, «Desde» (primer mensaje) y el anuncio (`ReferralCard`, compartida con `ContactPanel`).
- Cifras de enviados, recibidos y fallidos (de todas sus conversaciones: con varias, lo dice), y «Ver en Contactos» (su ficha completa). `useLiveContact` la vuelve a pedir solo con los mensajes de **su** conversación y su `contact_updated`.

### `SendTemplateDialog` + `useSendTemplate`

**`SendTemplateDialog` + `useSendTemplate`:** se abre también **con la ventana abierta**, desde el botón de plantilla del campo de escribir: una con botones o un recordatorio ya redactado. Lo escrito en el campo se queda ahí (`keepsDraft` lo avisa en el pie). **sin UI optimista** — el mensaje lo inserta el `message_created` del SSE; adelantarlo lo duplicaría, porque este envío no lleva `temporalId` con el que deduplicar. Los errores van al **aviso global** (igual que en `NewConversationPanel`, con el texto de `templateSendError`: si rechazó Meta, su código y detalle); el diálogo sigue abierto debajo, sin perder lo escrito. Ojo: el aviso vive en otro portal, así que para el `Dialog` de Headless UI pulsar su X es un «clic fuera» — `handleDialogClose` ignora el cierre mientras el aviso está visible. El diálogo deriva los campos del `bodyText` (`extractPlaceholders`) y **los valores de los botones** de `Template.buttons` (`buttonsNeedingValue`: OTP, `COPY_CODE` y URL con `{{ }}` — el mismo criterio que `buildButtonComponents` en el backend). Sin eso, cualquier plantilla `AUTHENTICATION` fallaba al enviarse desde el chat. Una plantilla sincronizada antes de que existiera `Template.buttons` no muestra esos campos: hay que pulsar *Sincronizar* en la página de Plantillas.

### Enviar archivos en la UI (`components/Chat/Composer/`)

**Enviar archivos en la UI (`components/Chat/Composer/`)** (2026-10-07, diseño en `Design/Wasmish Chat - Ficha y adjuntos.html`): el campo de escribir es `ChatComposer` (uno por conversación, `key`), con Adjuntar y Plantilla a la izquierda. El archivo se elige, se **suelta sobre toda la conversación** (`useWindowFileDrag` enseña dónde y evita que el navegador abra un archivo soltado fuera) o se **pega** con Ctrl+V (una captura pasa a llamarse «Captura de pantalla HH.MM.png»). Uno por envío: si llegan varios se prepara el primero y se explica (`useOutgoingAttachment`). `AttachmentPreview` enseña miniatura, formato y peso, deja escuchar un audio, y dice qué falla antes de subir (formato, peso), con «Enviar como documento» si es una imagen que así cabe. Con archivo, el texto es su pie (en los audios se desactiva). Si la ventana se cierra a mitad, el archivo y el texto se quedan, apagados, y solo se ofrece plantilla. En móvil, Adjuntar y Plantilla se ocultan mientras hay archivo.
- **Envío optimista** (`useSendMediaMessage`): el mensaje aparece al momento con el archivo desde el navegador (`Message.pending`, solo del front: `localUrl` y el progreso), la barra de progreso real y «Cancelar»; al 100 % dice «Enviando…» (ya está en el servidor: cancelar no lo pararía). Lo sustituye el que devuelve el servidor (la `key` de la burbuja es el `temporalId`, para que la imagen no se vuelva a montar). Si no llegó al servidor (sin respuesta o 5xx), «Reintentar» lo vuelve a mandar con el mismo archivo, o «Quitar» (`MessageUploadStatus`); si lo rechazó el servidor o WhatsApp, el «Fallido» de siempre. Reintentar tras un rechazo de WhatsApp **no** existe, a propósito (decisión de Jonathan: tampoco existe para los textos).
- Fuera: grabar notas de voz (el navegador graba en webm y WhatsApp no lo admite) y varios archivos en un envío.

### Mensajes que no son texto

**Mensajes que no son texto:** el backend ya manda el `text` resuelto (el caption, el nombre del archivo o una etiqueta), así que la bandeja no necesita saber nada — pinta `lastMessage` y ya. En el hilo, `MessageTypeIcon` le pone delante el icono de Lucide que corresponde al `type`, y devuelve `null` para `'text'`, que es casi todo el historial: la burbuja normal no cambia. Un `type` desconocido cae en el interrogante, nunca en un hueco. Cuando el mensaje trae archivo (`hasMedia`), `MessageMedia` lo pinta: `<img>` para imagen y sticker, `<video controls>`, `<audio controls>`, y una fila descargable para documentos. La URL es `/api/media/<id>` y es del **mismo origen** que la app (proxy de Vite en dev, nginx en prod), así que la cookie de sesión viaja sola y basta con ponerla en el `src` — sin `fetch` ni blobs. Debajo del archivo solo se pinta el `caption`, nunca la etiqueta.

### `temporalId`

**`temporalId`:** string generado en el frontend antes de enviar. El backend lo guarda en `Message.temporalId` y lo devuelve en `message_created` SSE. El frontend lo usa para evitar duplicados al recibir el evento de vuelta.
