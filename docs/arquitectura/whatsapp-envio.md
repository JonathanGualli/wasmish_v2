# Enviar por WhatsApp

Todo lo que sale hacia Meta: cliente de la Graph API, Embedded Signup, API pública, plantillas (botones y cabecera), archivos, ventana de 24 h y el flujo de un mensaje saliente.

> Parte de la documentación de Wasmish: el mapa de todos los temas está en el [AGENTS.md](../../AGENTS.md) de la raíz.
> Las decisiones de producto con fecha están en [decisiones.md](../decisiones.md).

## Contenido

- [WhatsApp](#whatsapp)
- [Embedded Signup (objetivo central — SaaS multi-cliente)](#embedded-signup-objetivo-central--saas-multi-cliente)
- [API pública de plantillas (`sendTemplateController`)](#api-pública-de-plantillas-sendtemplatecontroller)
- [Botones de plantilla (`buildButtonComponents`)](#botones-de-plantilla-buildbuttoncomponents)
- [Cabecera de las plantillas (`utils/template.header.js`, `TemplateMedia`)](#cabecera-de-las-plantillas-utilstemplateheaderjs-templatemedia)
- [Enviar archivos desde el chat (`POST /api/chats/:id/media`, `sendMediaMessageController`)](#enviar-archivos-desde-el-chat-post-apichatsidmedia-sendmediamessagecontroller)
- [Ventana de 24 h de WhatsApp](#ventana-de-24-h-de-whatsapp)
- [El backend también frena el texto libre fuera de ventana](#el-backend-también-frena-el-texto-libre-fuera-de-ventana)
- [Plantilla desde el chat (`sendConversationTemplateController`)](#plantilla-desde-el-chat-sendconversationtemplatecontroller)
- [Flujo de mensaje saliente (`sendMessageController`)](#flujo-de-mensaje-saliente-sendmessagecontroller)

---

### WhatsApp

**WhatsApp:** `libs/whatsapp.js` llama a `graph.facebook.com/${META_GRAPH_VERSION}`. Cada user guarda `tokenWhatsapp`, `phoneNumberId`, `waBusinessId` en MongoDB. El token WA se **cifra** con AES-256-CBC (`utils/crypto.js`, key derivada de `TOKEN_SECRET`); **`decrypt` se llama en cada mensaje/plantilla saliente y sync**. El **IV se genera dentro de `encrypt()`**, uno nuevo por cifrado, y viaja como prefijo `iv:ciphertext` — no puede volver a nivel de módulo (eso reusaría el mismo IV en todo el proceso y, como todos los tokens de Meta empiezan por `EAA...`, los primeros bloques cifrados saldrían idénticos). Las **API keys** en cambio se **hashean** (SHA-256, `hashApiKey`) — irreversibles. El interceptor de `whatsappApi` preserva el error de Meta en `err.waErrorCode` / `err.waErrorDetail`.

### Embedded Signup (objetivo central — SaaS multi-cliente)

**Embedded Signup (objetivo central — SaaS multi-cliente):** que cada cliente conecte su WhatsApp con "login con Facebook". Frontend: `libs/facebookSdk.ts` (carga el SDK) + `useConnectWhatsapp` (popup con `config_id`, captura `code` + `phone_number_id` + `waba_id`) → `POST /api/whatsapp/connect`. App Review de Meta aprobado: clientes reales pueden conectarse en producción. En local el frontend se expone con **ngrok** (dominio fijo) y Vite proxya `/api` → `localhost:3001`.

### API pública de plantillas (`sendTemplateController`)

**API pública de plantillas (`sendTemplateController`):** autenticada por API key. Descifra el token WA del user, envía la plantilla a Meta (parámetros posicionales `["Juan"]` o nombrados `[{name,value}]`), persiste la conversación + `Message` (con `status`; si Meta rechaza, `status:'failed'` + error), y **emite `message_created` por SSE** para que aparezca en vivo en la UI del dueño.

### Botones de plantilla (`buildButtonComponents`)

**Botones de plantilla (`buildButtonComponents`):** el `sub_type` que espera Meta **se deduce de la definición guardada** (`Template.buttons`), no del `subType` que mande el cliente — ese campo quedó opcional, solo como respaldo si la plantilla nunca se sincronizó. Es necesario porque el mismo botón «Copiar código» se envía como `sub_type:'url'` + `{type:'text'}` en una plantilla `AUTHENTICATION` y como `sub_type:'copy_code'` + `{type:'coupon_code'}` en una de cupón, y por fuera son idénticos. Se rechaza con **400, antes de llamar a Meta**, el índice inexistente (Meta lo aceptaba y descartaba el parámetro en silencio) y el botón de URL fija sin `{{1}}` (Meta respondía 132018). `sendTemplateController` re-sincroniza la plantilla si el documento es anterior a este cambio, detectándolo por la ausencia de `parameterFormat`.

### Cabecera de las plantillas (`utils/template.header.js`, `TemplateMedia`)

**Cabecera de las plantillas (`utils/template.header.js`, `TemplateMedia`):** Meta aprueba el **formato** de la cabecera (imagen, vídeo, documento, texto), no su contenido: el archivo es un parámetro que va en **cada envío**, como las variables. La imagen de ejemplo de la plantilla solo sirve para la revisión; sin parámetro Meta responde **132012** («expected IMAGE, received UNKNOWN»), que es lo que pasaba antes (2026-10-04).
- La sincronización guarda `Template.header` (`{ format, text }` o `null`; **sin default**: `undefined` = sincronizada antes y se re-sincroniza, en `GET /templates` y en `processTemplateSending`).
- Cada plantilla con imagen/vídeo/documento tiene **su archivo guardado** (`Template.headerMedia` → `TemplateMedia`), que se sube en Plantillas, columna «Cabecera». En disco: `MEDIA_DIR/templates/<sha256>.<ext>` (dentro del volumen `media`). Topes: imagen JPG/PNG 5 MB, vídeo MP4/3GP 16 MB, documento PDF 16 MB (Meta admite 100, se baja a propósito). nginx admite 20 MB en `/api/`.
- **Subida a Meta perezosa:** `ensureMetaMediaId` (`services/template.media.service.js`) la sube al enviar la primera vez (`POST /{phone-number-id}/media`, multipart) y reutiliza el id hasta los 25 días o si cambia el número; dentro del `try` del envío, así un token caducado queda como cualquier rechazo. En modo de prueba no se sube nada. Subir en Plantillas no llama a Meta.
- `processTemplateSending` añade el componente `header` antes del cuerpo y guarda el archivo en el `Message` (`type`, `mediaFile`…), así el chat lo enseña con `/api/media/<id del mensaje>`. Sin archivo, o con un formato no soportado (texto **con variable**, ubicación), rechaza con **400 antes de Meta** (`templateHeaderIssue`); los selectores lo enseñan deshabilitado con el motivo y `validateCampaignMessage` lo exige.
- Una campaña **congela** `header` + `headerMedia` al crearse; cambiar o quitar la imagen después no le afecta (por eso un `TemplateMedia` nunca se borra). Si falta su archivo en disco se pausa solo (`pauseReason.code = 'template_header'`); el 132012 está en `CAMPAIGN_STOPPING_ERRORS`.
- **Archivo por campaña** (2026-10-04, diseño v2 el 2026-10-05): en el paso 2 del asistente, `HeaderMediaField` (`components/HeaderMediaField/`, sin dependencias del asistente: se adapta a su **contenedor** con `@container`, para reutilizarlo en el diálogo del chat) enseña el archivo de la plantilla («De la plantilla») y deja usar otro solo para esa campaña (`POST …/header-media/files`, que no toca la plantilla), también arrastrándolo. La subida la lleva `useHeaderMediaUpload`: valida tipo y peso antes (`headerFileIssue`, la misma que usa Plantillas), cuenta el progreso, se puede cancelar y bloquea «Siguiente» mientras dura. Si la plantilla no tiene ninguno se sube ahí: las plantillas con cabecera de archivo ya **no salen deshabilitadas** en el asistente (`bulkDisabledReason`), solo las de un formato que no se sabe enviar. El borrador guarda `headerMedia` (se borra al cambiar de plantilla) y la vista previa y la creación reciben `headerMediaId`: `withCampaignHeader` comprueba que es de la cuenta, del formato (`headerMediaMismatch`, puro) y que sigue en disco, y la campaña lo congela en lugar del de la plantilla. Con la casilla «Usar también como imagen de la plantilla» (`saveHeaderAsDefault`) pasa a ser el de la plantilla **al crear la campaña**. Sin archivo, el error de `validateCampaignMessage` es del campo `headerMedia`, no de `templateId`.
- **Pendiente:** el mismo campo al enviar a un solo contacto (diálogo del chat y conversación nueva), el campo `header` en la API pública, cabecera de texto con variable, y plantillas de carrusel (sin `HEADER`, con tarjetas: no se detectan y fallarían en Meta).

### Enviar archivos desde el chat (`POST /api/chats/:id/media`, `sendMediaMessageController`)

**Enviar archivos desde el chat (`POST /api/chats/:id/media`, `sendMediaMessageController`)** (2026-10-07): imagen (JPG/PNG, 5 MB), video (MP4/3GP), audio (MP3, M4A, AAC, OGG, AMR) y documento (PDF, Word, Excel, PowerPoint, TXT), 16 MB. Las reglas son puras, en `utils/outbound.media.js` (tipo, tamaño, la firma de bytes de `utils/file.signature.js` —compartida con la cabecera de las plantillas— y el texto del mensaje), y el frontend las replica en `utils/outboundMedia.ts` para avisar antes de subir. Una imagen de más de 5 MB va **como documento** si se pide (`X-Send-As`): llega sin comprimir. Es texto libre para WhatsApp: fuera de la ventana, 409 como el texto. El archivo se guarda **antes** de llamar a Meta (`saveByContentHash` → `MEDIA_DIR/outbound/<sha256>.<ext>`, el mismo volumen), así el chat lo enseña aunque Meta lo rechace. Va por **el mismo camino que el texto**: `processMessageSending` con `attachment` sube el archivo a Meta (`uploadMedia`) y lo envía por su id (`sendMediaMessage`), y el `Message` lleva los mismos campos que uno recibido (`type`, `mediaFile`, `caption`…), así `GET /api/media/:id` y `MessageMedia` lo sirven y pintan igual. Los audios no llevan texto (WhatsApp no se lo pone). `serializeMessage` es la forma única de un mensaje para la lista, la respuesta de un envío y su `message_created`. El archivo llega crudo por `readRawFile` (`middlewares/raw.file.middleware.js`, compartido con la cabecera de las plantillas).

### Ventana de 24 h de WhatsApp

**Ventana de 24 h de WhatsApp:** Meta solo entrega texto libre dentro de las 24 h siguientes al **último mensaje del contacto**; fuera de eso, solo plantillas aprobadas (si no, error 131047). El backend guarda `Conversation.lastInboundAt` y `utils/whatsapp.window.js` (`getWindowExpiry`, puro y testeado) es **el único sitio donde vive ese «24»**. Al frontend no se le manda un booleano — caducaría en cuanto pasa el tiempo — sino `windowExpiresAt` (ISO o `null` si el contacto nunca escribió), que la UI compara con su propio reloj. Lo publican `GET /api/chats`, el `message_created` de los entrantes y el `conversation_updated` de los entrantes no-texto.

### El backend también frena el texto libre fuera de ventana

**El backend también frena el texto libre fuera de ventana** (2026-10-04): `sendMessageController` mira `freeTextBlockReason` (puro, en `whatsapp.window.js`: `null`, `'closed'` o `'never'`) antes de llamar a Meta y responde **409** con el motivo, sin guardar ningún `Message`. La UI ya lo impedía; esto cubre lo que se cuele (otra pestaña, la ventana que se cierra mientras se escribe), y el front marca la burbuja optimista como fallida con ese texto. Sin conversación (un número nuevo) cuenta como `never`. Si a la conversación le falta `lastInboundAt` (anterior al campo, sin backfill), se busca su último `Message` entrante antes de bloquear. Las plantillas no pasan por aquí: abren la conversación.

### Plantilla desde el chat (`sendConversationTemplateController`)

**Plantilla desde el chat (`sendConversationTemplateController`):** la lógica de envío se extrajo de `sendTemplateController` a **`processTemplateSending`** (en `template.controller.js`), que no sabe nada de HTTP: los errores de negocio salen como `Error` con `statusCode` y quien la llama decide la respuesta. La usan la API pública y esta ruta. El destinatario **sale de la conversación**, no del body, y el `findOne({ _id: id, userId })` es la comprobación de propiedad — sin ese filtro cualquier sesión podría escribir en la conversación de otro. Envía la plantilla pero **no toca `lastInboundAt`**: enviar no reabre la ventana, solo un mensaje del contacto.

### Flujo de mensaje saliente (`sendMessageController`)

**Flujo de mensaje saliente (`sendMessageController`):**
1. Con `id` (params) busca la conversación con `findOne({ _id: id, userId })` — es la comprobación de propiedad; sin `id`, el destinatario es `destinationNumber` (body) y se reutiliza la conversación de su contacto si existe
2. Decripta `user.tokenWhatsapp` → llama Meta Cloud API con el destinatario del contacto (teléfono o BSUID)
3. `getSendingConversation` da la conversación (la crea con su contacto si no existía); se actualiza `lastMessage` y **`lastMessageAt`** — nunca `updatedAt`, que Mongoose pisa en el `save()` por `timestamps: true` y que además no es el campo por el que ordena `listConversations`. La conversación y el `Message` comparten un único `const now` para que el orden de la lista y el cursor de paginación estén en la misma escala
4. Persiste `Message` con `temporalId` (para UI optimista). Si Meta rechaza, guarda igual `status:'failed'` + `errorCode`/`errorDetail` (no se pierde)
5. Emite `message_created` via SSE; el POST responde el mensaje normalizado con `id` real (para que los `message_status` posteriores casen con el optimista del frontend)
