# Detalle de plantillas

Spec del 2026-11-06. Sale del brainstorming de ese día con Jonathan (decisiones una por una). Cómo funcionan hoy las plantillas: [whatsapp-envio.md](../../arquitectura/whatsapp-envio.md#cabecera-de-las-plantillas-utilstemplateheaderjs-templatemedia).

## 1. Qué problema resuelve

La página Plantillas es una tabla: nombre, ID, el cuerpo cortado a una línea, la cabecera, el idioma y el estado. **No se puede abrir una plantilla y verla entera**: ni cómo le llega al contacto, ni sus botones, ni su categoría (que ya se guarda), ni por qué Meta la rechazó, ni si se está usando.

Al revisarlo salieron, además, tres fallos de la sincronización con Meta (`syncTemplatesForWaba` en `controllers/template.controller.js` y `getTemplates` en `libs/whatsapp.js`):

1. **No pagina.** Solo trae la primera página de `GET /{waba}/message_templates`: una cuenta con más plantillas que las de esa página no ve las demás, ni en la tabla ni al enviar.
2. **Lo borrado en Meta se queda.** El sync solo hace upsert: una plantilla borrada en Meta sigue en Wasmish con su último estado.
3. **Se pierde parte de la plantilla.** Del pie (`FOOTER`), los ejemplos de las variables, la calidad y el motivo del rechazo no se guarda nada. El pie tampoco sale en las vistas previas.

## 2. Qué se construye

- **Un detalle de cada plantilla**, en su propia dirección (`/templates/:templateId`): cómo la ve el contacto (cabecera, cuerpo, pie y botones), todos sus datos de Meta, desde qué líneas se envía, su archivo de cabecera y **su uso en Wasmish** (envíos con su desglose, el último envío y las campañas que la usaron).
- Se abre **desde la tabla de Plantillas y desde el detalle de una campaña** («Ver plantilla»).
- **La sincronización trae todo**: todas las páginas, los campos que faltan y las plantillas borradas en Meta (que se marcan, no se borran).
- **Se sincroniza sola** al abrir Plantillas o un detalle, si la última vez fue hace más de 10 minutos.
- **El pie sale en todas las vistas previas** de plantilla.

**Fuera:** crear o editar plantillas desde Wasmish; elegir un período para el uso; los avisos de Meta por webhook (`message_template_status_update` y la calidad); abrir el detalle desde un mensaje del chat.

## 3. Decisiones

Las de Jonathan en el brainstorming:

1. **Alcance:** ver la plantilla completa **y su uso**, arreglando de paso la paginación y el pie (no crear ni editar, no solo lo que ya se guarda).
2. **El uso, con desglose:** envíos totales, entregados, leídos y fallidos, el último envío y las campañas que la usaron (no solo el total; sin período).
3. **Una plantilla borrada en Meta se marca «Borrada en Meta»**: no se ofrece para enviar, pero sigue en la lista (filtrable) con su detalle y su uso, porque los mensajes y las campañas viejos la nombran.
4. **Se mantiene al día sincronizando al abrir** (más de 10 minutos desde la última), sin los avisos de Meta por webhook. El botón «Sincronizar» se queda.
5. **Se abre desde Plantillas y desde el detalle de una campaña**, con su propia dirección.
6. **Enfoque: un endpoint propio** con el uso calculado al momento, no contadores que mantenga el webhook ni todo dentro de `GET /templates`.

Las que tomó el agente, **para que Jonathan las revise**:

- **A. Cada mensaje enviado con plantilla guarda desde ahora su `templateId`.** Los viejos solo tienen `templateName` y se cuentan por nombre dentro del WABA (§ 4.3): dos plantillas con el mismo nombre en idiomas distintos suman juntas sus envíos viejos.
- **B. El uso cuenta solo las conversaciones que la persona puede ver** (`conversationScope`, el mismo filtro que la bandeja): un agente ve el uso en sus líneas y sus conversaciones. Las campañas solo le llegan a quien tiene `campaigns.manage`.
- **C. Solo se marca como borrada si el sync trajo todas las páginas sin error.** Si una vuelve a aparecer en Meta, pierde la marca.
- **D. La sincronización al abrir la hace el backend, para cualquier rol**, como ya hace hoy `GET /templates` cuando faltan datos. El botón «Sincronizar» sigue pidiendo `templates.manage`.
- **E. Sincronizar al abrir solo en la página Plantillas y en el detalle** (`?fresh=1`): los selectores del chat, las campañas y la conversación nueva siguen leyendo de la BD, sin esperar a Meta.
- **F. El pie no se suma al texto guardado del mensaje en el chat**: sale en las vistas previas, no en `Message.text`.

## 4. Cómo funciona

### 4.1 La sincronización (`syncTemplatesForWaba`)

- **Paginación.** `getTemplates` en `libs/whatsapp.js` pide una página (`limit`, `after`) y la sincronización sigue `paging.cursors.after` mientras haya `paging.next`. Con un **tope de 20 páginas** para que una respuesta rara de Meta no la deje dando vueltas; si se llega al tope, cuenta como incompleta (no marca borradas) y lo dice el log.
- **Campos explícitos** con `fields`: `id`, `name`, `language`, `status`, `category`, `components`, `parameter_format`, `quality_score`, `rejected_reason`, `previous_category`, `sub_category`, `last_updated_time`. **Comprobar en el plan, con el token de WasmishTest, que Meta acepta cada uno**: un campo que no reconoce tumba la llamada entera. La referencia del nodo ([WhatsAppBusinessHSM](https://developers.facebook.com/docs/graph-api/reference/whats-app-business-hsm/)) los lista, pero no dice cuáles vienen sin pedirlos.
- **Una función pura**, `toTemplateFields(tpl)` en `utils/` (con su test), pasa la plantilla de Meta a los campos de `Template`: lo de hoy (cuerpo, botones, `parameterFormat`, cabecera con `extractTemplateHeader`) y lo nuevo (§ 5).
- **Las borradas.** Otra función pura, `templatesMissingFromSync(storedIds, fetchedIds)`, dice qué plantillas del WABA en la BD no llegaron. Si el sync fue completo, se marcan con `deletedInMetaAt` (solo las que no la tenían); las que llegaron se desmarcan (`deletedInMetaAt: null`). Se compara solo dentro de la cuenta y el WABA sincronizados.
- **Cuándo se sincronizó.** El WABA guarda `templatesSyncedAt` al terminar un sync completo. Es el único campo de `Waba` que no escribe `services/line.service.js`: no es de la conexión, y se escribe con un `updateOne({ accountId, waBusinessId }, { $set })` desde el sync.

### 4.2 Sincronizar al abrir (`GET /templates?fresh=1`)

`getTemplatesController` ya sincroniza cuando faltan datos (cabecera o WABA). Con `fresh=1`, además, sincroniza los WABA cuyo `templatesSyncedAt` sea `null` o de hace más de **10 minutos** (una constante con nombre). Igual que hoy: si Meta falla, se escribe en el log y se responde con lo que hay en la BD. La lista no depende de Meta. Lo piden la página Plantillas y el detalle; nadie más.

### 4.3 El uso (`GET /api/templates/:templateId`)

**Envíos:** los mensajes salientes de la plantilla en las conversaciones que la persona puede ver:

- de la plantilla: `templateId` igual al suyo, **o** sin `templateId` y con su `templateName` (los anteriores a este cambio);
- en una conversación de la cuenta, con `conversationScope(req.auth)`, y **de una línea de su WABA** (así otra plantilla con el mismo nombre en otro WABA no cuenta).

Se agregan por `status` y una función pura, `summarizeTemplateUsage`, devuelve `{ sent, delivered, read, failed, lastSentAt }`: `sent` es el total; `delivered` cuenta los entregados **y** los leídos; `read`, los leídos; `failed`, los fallidos.

**Campañas** (solo con `campaigns.manage`): las de la cuenta con `template.templateId` igual al suyo, con nombre, estado y fecha de creación, las más recientes primero.

**Índices nuevos en `Message`**, parciales para que los mensajes que no son de plantilla no ocupen nada: `message_template_id` `{ templateId: 1 }` con `templateId: { $type: 'string' }` y `message_template_name` `{ templateName: 1 }` con `templateName: { $type: 'string' }`. La agregación empieza por ellos y después cruza con la conversación (`$lookup` con `pipeline`, filtrando también por la cuenta).

### 4.4 Los envíos

- **`processTemplateSending` guarda `templateId`** en el mensaje (los tres caminos pasan por ahí: chat, API pública y campañas).
- **Una plantilla con `deletedInMetaAt` no se envía**: `processTemplateSending` la trata como no encontrada (el sync de último momento la puede desmarcar si volvió). En el frontend, los selectores (`useTemplateForm`, `useCampaignWizard`) ya filtran por `APPROVED` y además dejan fuera las borradas.

## 5. Datos

**`Template`**, campos nuevos (sin migración: se rellenan en el siguiente sync):

| Campo | Qué es |
|---|---|
| `footerText` | El texto del pie, o `null` |
| `bodyExamples` | Los ejemplos de las variables del cuerpo que se mandaron a Meta: posicionales (`body_text`) o con nombre (`body_text_named_params`), en una forma común `[{ key, example }]` |
| `headerExample` | El ejemplo de la cabecera de texto con variable, si tiene |
| `qualityScore` | `GREEN`, `YELLOW`, `RED`, `UNKNOWN` o `null` |
| `rejectedReason` | El motivo que da Meta (por ejemplo `INVALID_FORMAT`), o `null` |
| `previousCategory`, `subCategory` | Los de Meta, o `null` |
| `metaUpdatedAt` | `last_updated_time` de Meta |
| `deletedInMetaAt` | Cuándo dejó de llegar en un sync completo, o `null` |

**`Waba.templatesSyncedAt`**: el último sync completo de sus plantillas.

**`Message.templateId`**: el ID de Meta de la plantilla con que se envió, desde este cambio.

## 6. API

- `GET /api/templates?fresh=1` (§ 4.2). Cada plantilla lleva también los campos nuevos.
- `GET /api/templates/:templateId[?fresh=1]` con `authRequired`: `{ template, usage, campaigns? }`. Busca con `{ templateId, userId: accountId }` y, si no es de la cuenta o su WABA no está al alcance de la persona, **404**. Con `fresh=1` sincroniza antes su WABA si toca (§ 4.2). Las líneas desde las que se envía no van en la respuesta: el navegador ya las sabe (`TemplateLinesCell`, con `useLines`).
- Caso en `tests/isolation/`: plantilla de otra cuenta 404; un agente no cuenta los envíos de una línea fuera de su alcance ni de una conversación asignada a otro; sin `campaigns.manage` no llega `campaigns`.

## 7. La pantalla (la diseña Claude Design)

El agente escribe el brief (`docs/superpowers/specs/2026-11-06-detalle-plantillas-brief-ui.md`): qué puede hacer y ver el usuario, no cómo se ve.

- **La tabla:** abrir una plantilla; ver su categoría; filtrar las borradas en Meta (escondidas por defecto) y, si Claude Design lo ve bien, por estado o categoría.
- **El detalle:** la plantilla como la ve el contacto (cabecera, cuerpo con los ejemplos o con las variables marcadas, pie, botones); nombre, ID, idioma, categoría (y la anterior, si Meta la cambió), estado, calidad, motivo del rechazo en palabras, última modificación en Meta; cada botón con su destino (URL, teléfono, código); las variables con sus ejemplos; las líneas desde las que se envía; el archivo de cabecera (lo de hoy, `TemplateHeaderCell`); el uso; las campañas.
- **Avisos:** borrada en Meta, rechazada (con el motivo), en pausa, calidad baja.
- **Estados:** cargando, no existe (404, también desde una campaña: «Esta plantilla ya no está en tu cuenta») y sin envíos.
- **El pie en `TemplateBubble`**, en todas las vistas previas.

## 8. Cómo se prueba

- **Puras** (`npm test`): `toTemplateFields` con plantillas reales de Meta (con y sin pie, ejemplos posicionales y con nombre, cabecera de texto con variable, botones de cada tipo); `templatesMissingFromSync`; el recorrido de los cursores (una función pura que diga la siguiente página o el fin, y el tope); `summarizeTemplateUsage`.
- **Aislamiento** (`npm run test:isolation`): § 6.
- **Con Meta de verdad**, con el token de WasmishTest: los `fields` aceptados y la paginación (con un `limit` bajo, para forzar varias páginas).
- **En el navegador**: la tabla, el detalle y el enlace desde una campaña, a 1440, 800 y 390 px.
- **En producción, después de desplegar**: un sync real que traiga todas las plantillas y no marque ninguna como borrada por error (comparar el número de plantillas antes y después).

## 9. Cómo se entrega

1. **Spec y plan** (este spec y `docs/superpowers/plans/2026-11-06-detalle-plantillas.md`), con la revisión de Codex. Sin código.
2. **Backend: la sincronización** (§ 4.1, 4.2, 4.4 y los datos de § 5): paginación, campos, borradas, sincronizar al abrir, `templateId` en los mensajes. Con sus tests.
3. **Backend: el detalle y el uso** (§ 4.3 y § 6), con el índice y el caso de aislamiento.
4. **El brief de UI** para Claude Design.
5. **La pantalla**, siguiendo el diseño (partida si pasa de unas 500 líneas).

Los 2 y 3 se pueden desplegar antes de la pantalla sin cambiar nada visible, salvo que las borradas dejan de ofrecerse. Documentación en el mismo PR que cada cambio: `whatsapp-envio.md` (sincronizar plantillas, el detalle), `api.md` (la ruta), `Backend/AGENTS.md` (los índices), `decisiones.md` y `estado.md`.
