# Campañas

Envíos masivos de plantillas: destinatarios, mensaje por contacto, worker, estadísticas, modo de prueba, y la UI (asistente, borrador, detalle).

> Parte de la documentación de Wasmish: el mapa de todos los temas está en el [AGENTS.md](../../AGENTS.md) de la raíz.
> Las decisiones de producto con fecha están en [decisiones.md](../decisiones.md).

## Contenido

- **Backend**
  - [Campañas (`Campaign`, `campaign.controller.js`, `workers/campaign.worker.js`)](#campañas-campaign-campaigncontrollerjs-workerscampaignworkerjs)
- **Frontend**
  - [Borrador de campaña (`utils/campaignDraft.ts`)](#borrador-de-campaña-utilscampaigndraftts)
  - [Campañas en la UI (`pages/private/Campaigns/`)](#campañas-en-la-ui-pagesprivatecampaigns)

---

## Backend

### Campañas (`Campaign`, `campaign.controller.js`, `workers/campaign.worker.js`)

**Campañas (`Campaign`, `campaign.controller.js`, `workers/campaign.worker.js`):** una plantilla a muchos contactos, personalizada por contacto.
- **Línea** (Fase 2b de multi-línea, 2026-10-12): la campaña nace con la línea por la que saldrá (`findSendingLine`: la que llegue en `lineId` desde la Fase 2c o, sin ella, la por defecto; 404 si es de otra cuenta) y el worker la envía por ella. La plantilla tiene que ser del WABA de esa línea (400 si no). Una campaña anterior a las líneas (`lineId: null`) sale por la del número conectado. Si su línea ya no está conectada, la campaña se pausa con `whatsapp_disconnected`.
- **Destinatarios** (`recipients`): `{ mode:'ids', contactIds }` o `{ mode:'query', search, filter, excludeIds }` («todos los que coinciden»), que repite **exactamente** la consulta de la lista de Contactos (`contactSelectionStages`, compartida con `listContacts`). Tope `CAMPAIGN_MAX_RECIPIENTS` (5000). La lista se **congela** al crear: un `CampaignRecipient` por contacto, índice único `{campaignId, contactId}` (un repetido se envía una vez).
- **El mensaje** (`utils/campaign.message.js`, puro): cada variable del cuerpo y cada botón que pide valor (cupón, URL con `{{ }}`) tiene `source` = `fixed` (texto para todos) o un campo del contacto (`name`, `firstName`, `company`, `phone`, `email`) con **reserva obligatoria**, porque Meta rechaza un parámetro vacío y cualquier dato puede faltar. `cleanValue` quita saltos de línea, tabuladores y espacios repetidos (Meta rechaza el parámetro). `validateCampaignMessage` exige plantilla `APPROVED` y categoría `MARKETING`/`UTILITY`: las de autenticación no van en masivo. La campaña guarda una **copia** de la plantilla: lo que se envía es lo que se revisó.
- **Bajas:** la baja es solo de publicidad, así que `excludeOptedOut` **solo cuenta con plantillas de marketing** (`shouldExcludeOptedOut`, en `utils/campaign.status.js`): con una de utilidad se les envía igual, y sin plantilla (paso 1) no se excluye a nadie. La campaña guarda el valor ya resuelto. En la UI el aviso y la casilla «Excluirlos» salen en el **paso 2**, solo al elegir una de marketing, y **empiezan marcados** (decisión de Jonathan, 2026-10-04); desmarcarla los envía y queda el rechazo 131050 registrado. `recipientSkipReason` se mira al crear y **otra vez antes de enviar**.
- **El worker** corre en el proceso de la API (`index.js` lo arranca tras conectar a Mongo) y usa `CampaignRecipient` como cola: pasa un `pending` a `sending` con `findOneAndUpdate` atómico y llama a `processTemplateSending` con `contact`, la plantilla ya resuelta y `campaignId`. Una campaña activa **por línea** (`pickCampaignPerLine`, puro, en `utils/campaign.status.js`; una sin `lineId` cuenta como la línea por defecto de su cuenta), un envío por campaña y vuelta, `CAMPAIGN_RATE_PER_SECOND` (10) sumando todas. Estados: `queued → sending → completed`, más `paused`/`cancelled`. Se **pausa solo** ante un error de cuenta o de plantilla (`CAMPAIGN_STOPPING_ERRORS`: token caducado, cuenta bloqueada, plantilla pausada…, y el 409 de WhatsApp desconectado), con `pauseReason`; ante un 130429 frena 10 s. No hay reintentos: un mensaje por destinatario.
- **Reinicios:** al arrancar, un destinatario en `sending` pasa a **`interrupted`** y no se reintenta (no se sabe si Meta lo recibió; mejor uno sin enviar que uno repetido). `SIGTERM`/`SIGINT` dejan terminar el envío en curso. Supone **una sola instancia** de la API.
- **Estadísticas** (`buildCampaignStats`, pura, en `utils/campaign.status.js`; la usa `services/campaign.service.js`): la cola (`CampaignRecipient.status`) más los `Message` con `campaignId`, que el webhook va moviendo a entregado/leído/fallido. `done` = se creó su Message; `failed` en el destinatario = error antes de Meta, sin Message.
- **Modo de prueba `CAMPAIGN_DRY_RUN`:** no llama a Meta (`fakeTemplateSend`) y simula el 131050 de un dado de baja con plantilla de marketing. **Encendido por defecto fuera de producción**: en local una campaña de verdad mandaría WhatsApps reales a los contactos de la BD. El Dockerfile fija `NODE_ENV=production`, que lo apaga en el servidor. Cada campaña guarda `Campaign.dryRun` al crearse y el worker no llama a Meta si el flag **o** el campo están encendidos: lo creado como prueba nunca sale de verdad aunque el servidor arranque después sin el modo. La vista previa devuelve `dryRun` y la UI lo avisa en el paso 3, en el detalle y con la píldora «Prueba». Ojo: en modo de prueba **no se comprueba el token de WhatsApp** — un token caducado no hace fallar nada.

## Frontend

### Borrador de campaña (`utils/campaignDraft.ts`)

**Borrador de campaña (`utils/campaignDraft.ts`):** uno por usuario, en **`localStorage`** (no `sessionStorage` como el de Chats: una campaña se prepara con calma y se retoma otro día), con la selección de destinatarios, el paso, la plantilla, las variables, el archivo de la cabecera elegido para la campaña y el nombre. Se borra al enviarlo, al descartarlo o al **cerrar sesión** (`clearAllCampaignDrafts` en `logOut`), para no dejar la lista en un equipo compartido. `selectedCount` guarda cuántos había: con «todos los que coinciden» la búsqueda se repite al reanudar y el número puede cambiar (el paso 1 lo avisa). `useCampaignDraft` lo carga con el id del usuario; `useNewCampaign` (recibe ese mismo store, para que descartarlo se vea en toda la página) pregunta con `DraftConflictDialog` antes de empezar otro.

### Campañas en la UI (`pages/private/Campaigns/`)

**Campañas en la UI (`pages/private/Campaigns/`):**
- **Selección en Contactos** (`useContactSelection`): `ids` (los marcados, sobreviven a cambiar de página o de filtro) o `query` («todos los que coinciden», menos los desmarcados). Esta va atada a la búsqueda y al filtro: cambiarlos pide confirmación y la reinicia. `DataTable` acepta `selection` (casillas, cabecera parcial y banner); la barra flotante es `SelectionBar`.
- **Contactos en modo campaña** (`ContactsNavigationState.campaignPick`): `new` desde «Nueva campaña» y `edit` desde «Cambiar selección» del paso 1 (parte de la selección del borrador y vuelve con «Volver a la campaña»). Sin modo, «Enviar plantilla» crea el borrador. Elegir destinatarios se ve como el **paso 1 de la campaña**, no como otra sección: la cabecera es la del asistente (`WizardHeader`, compartida con `NewCampaignPage`), el sidebar marca «Campañas» (lo lee del `state` de la navegación), y la `SelectionBar` se ve desde el principio con la pista «Marca los contactos…» y «Continuar» deshabilitado (`emptyHint`). La primera vez, en modo `new`, sale una explicación de tres pasos; se recuerda en `localStorage` (`hasSeenPickIntro`, fuera del prefijo de los borradores: cerrar sesión no la vuelve a mostrar). En móvil la tabla no tiene cabecera, así que `DataTable` pone encima de las tarjetas la fila «Seleccionar esta página».
- **Asistente** (`NewCampaign/`, estado en `useCampaignWizard`): página, no modal, con el pie fijo. Todo vive en el borrador y se guarda en cada cambio. La validación es la de la vista previa del backend (la misma que al crear); los errores de campo se enseñan tras pulsar «Siguiente», y mientras la vista previa no está al día (`isUpdating`) no se avanza. Las plantillas de autenticación salen deshabilitadas con su motivo.
- **Detalle** (`Detail/`): progreso, cifras acumuladas, embudo enviados→leídos, motivos de fallo (`useCampaignFailures`) y destinatarios filtrables por estado. En el paso 1, «Ver los N» despliega la lista en el sitio (sin ventana), con buscador y scroll infinito (`useOnVisible`). Los filtros usan conteos **exclusivos** (`recipientStateCounts`): las estadísticas son acumuladas (un leído también cuenta como entregado). Los textos de estados viven en `utils/campaignDisplay.ts`; los de los errores de WhatsApp, en `utils/whatsappErrors.ts`, que comparten campañas y chat.
- **Fuera por ahora:** el aviso del límite diario de mensajes de WhatsApp (no hay forma fiable de leerlo; se decidió quitarlo hasta tenerla).
