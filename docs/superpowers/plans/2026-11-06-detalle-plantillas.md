# Detalle de plantillas — Implementation Plan

> **Para quien lo ejecute:** en Wasmish los planes se ejecutan **nativo** (rama, PR, revisión cruzada; ver «Planes» en `AGENTS.md`). Las referencias de `writing-plans` a `subagent-driven-development` o `executing-plans` no aplican. Los pasos usan casillas (`- [ ]`).

**Goal:** Que cada plantilla se pueda abrir y ver entera, con sus datos de Meta y su uso en Wasmish, y que la sincronización traiga todas las plantillas, el pie y lo borrado en Meta.

**Architecture:**
- **Puro** (`utils/`): `utils/template.sync.js` (de Meta a los campos de `Template`, qué falta tras un sync, el cursor de la siguiente página, si toca sincronizar) y `utils/template.usage.js` (el resumen del uso).
- **Sincronización:** `getTemplates` pagina y pide `fields`; `syncTemplatesForWaba` recorre las páginas, guarda los campos nuevos, marca o desmarca las borradas y pone `Waba.templatesSyncedAt`. `GET /templates?fresh=1` sincroniza si pasaron más de 10 minutos.
- **Detalle:** `GET /api/templates/:templateId` con el uso agregado desde `Message` (dos índices parciales nuevos) cruzado con la conversación y su línea.
- **La UI** sigue el diseño de Claude Design, que se pide con el brief (Tarea 5).

**Tech Stack:** Express 5, Mongoose 8, `node:test`, `mongodb-memory-server`; React 19, TypeScript, React Query, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-11-06-detalle-plantillas-design.md` (aprobado por Jonathan el 2026-11-06, con las decisiones A a F del agente).

## Global Constraints

- **Campos que se piden a Meta** (spec § 4.1): `id,name,language,status,category,components,parameter_format,quality_score,rejected_reason,previous_category,sub_category,last_updated_time`. Si la Tarea 1 descubre que Meta no acepta alguno, se quita de la lista y del spec, y el campo de `Template` se queda en `null`.
- **Página de Meta:** `limit` **100**; **tope de 20 páginas**. Llegar al tope = sync incompleto.
- **Sincronizar al abrir:** más de **10 minutos** (`TEMPLATE_SYNC_MAX_AGE_MS = 10 * 60 * 1000`) desde `Waba.templatesSyncedAt`, o `null`.
- **Solo un sync completo** (todas las páginas, sin error) marca borradas y pone `templatesSyncedAt`.
- **Una plantilla con `deletedInMetaAt` no se envía** (ni chat, ni API, ni selectores de campaña); sigue en `GET /templates` con el campo, para la lista.
- **Uso:** `delivered` cuenta `delivered` **y** `read`; `read`, solo `read`; `failed`, `failed`; `sent`, todos los salientes de la plantilla. Solo las conversaciones de `conversationScope(req.auth)`. `campaigns` solo con `can(auth, 'campaigns.manage')`.
- **Sin migración:** campos nuevos sin default en `Template` y `Message` (como `header`: `undefined` = sincronizada antes), salvo `deletedInMetaAt` y `Waba.templatesSyncedAt`, que van con `default: null`.
- Los índices parciales nuevos se usan **repitiendo el predicado** en la consulta (como `waMessageId_busqueda`): `templateId: { $eq: id, $type: 'string' }`.
- Identificadores nuevos en inglés; textos al usuario, comentarios, commits y documentación, en español. Errores como `[{ message }]`. Commits sin coautor ni atribución.
- **Cinco PRs** (spec § 9), cada uno con su rama desde `master` después de unir el anterior:
  1. `detalle-plantillas`: el spec y este plan (revisión de Codex);
  2. `plantillas-sync`: Tareas 1 a 3;
  3. `plantillas-detalle`: Tarea 4;
  4. `plantillas-brief`: Tarea 5 (solo documentación: sin revisión cruzada);
  5. `plantillas-ui`: Tarea 6 (partida si pasa de unas 500 líneas).
- Comprobar con `cd Backend && npm test && npm run test:isolation`; con frontend, también `cd Frontend && npm run lint && npm run build` y, con UI, el navegador (1440, 800 y 390 px).

## Review Focus

- **Meta falla en la página 2 de 3:** se guardan las de la página 1, ninguna se marca como borrada y `templatesSyncedAt` no cambia → test de aislamiento en la Tarea 2.
- **Una plantilla borrada en Meta vuelve a aparecer** (se recreó con el mismo id o fue un fallo de Meta): pierde la marca y se puede enviar → test en la Tarea 2.
- **Dos WABA en la cuenta, y el sync de uno marca borradas:** las del otro WABA no se tocan → test de aislamiento en la Tarea 2.
- **Un agente con una línea abre una plantilla del WABA de otra línea suya que no tiene:** 404, no el uso de otra línea → test de aislamiento en la Tarea 4.
- **Dos plantillas con el mismo nombre en dos WABA** y mensajes viejos sin `templateId`: cada una cuenta solo los de las líneas de su WABA → test de aislamiento en la Tarea 4.

---

### Task 1: De Meta a `Template`, la paginación y las borradas, en puro (PR 2, rama `plantillas-sync`)

**Files:**
- Create: `Backend/src/utils/template.sync.js`, `Backend/tests/template.sync.test.js`

**Interfaces:**
- Produces:
  - `TEMPLATE_FIELDS` (el texto de `fields` de Global Constraints), `TEMPLATES_PAGE_LIMIT = 100`, `TEMPLATES_MAX_PAGES = 20`, `TEMPLATE_SYNC_MAX_AGE_MS = 600000`.
  - `toTemplateFields(tpl) → { name, category, status, language, bodyText, buttons, parameterFormat, header, footerText, bodyExamples, headerExample, qualityScore, rejectedReason, previousCategory, subCategory, metaUpdatedAt }`. `header` con `extractTemplateHeader` (ya existe en `utils/template.header.js`); `bodyText` y `buttons` como hoy en `syncTemplatesForWaba`.
  - `nextTemplatesCursor(body, pagesRead) → { after: string } | { done: true, complete: boolean }`. `pagesRead` cuenta la página recién leída.
  - `templatesMissingFromSync(storedIds: string[], fetchedIds: string[]) → string[]`.
  - `isTemplateSyncStale(syncedAt: Date | null, now: Date) → boolean`.

- [ ] **Step 1: Tests de `toTemplateFields`** con plantillas como las devuelve Meta:
  - con pie: `components: [{ type: 'BODY', text: 'Hola {{1}}', example: { body_text: [['Ana']] } }, { type: 'FOOTER', text: 'Responde BAJA' }]` → `footerText: 'Responde BAJA'`, `bodyExamples: [{ key: '1', example: 'Ana' }]`;
  - con nombre: `example: { body_text_named_params: [{ param_name: 'first_name', example: 'Ana' }] }` → `bodyExamples: [{ key: 'first_name', example: 'Ana' }]`;
  - cabecera de texto con variable: `{ type: 'HEADER', format: 'TEXT', text: 'Pedido {{1}}', example: { header_text: ['123'] } }` → `headerExample: '123'` (con nombre, `header_text_named_params[0].example`);
  - sin pie ni ejemplos → `footerText: null`, `bodyExamples: []`, `headerExample: null`;
  - `quality_score: { score: 'GREEN' }` → `qualityScore: 'GREEN'`; sin él → `null`;
  - `rejected_reason: 'INVALID_FORMAT'` → `rejectedReason: 'INVALID_FORMAT'`; `'NONE'` → `null`;
  - `last_updated_time: '2026-11-01T10:00:00+0000'` → `metaUpdatedAt` es un `Date` de esa hora; ausente o inválido → `null`;
  - `previous_category`, `sub_category` → `previousCategory`, `subCategory`, o `null`.

- [ ] **Step 2: Tests de `nextTemplatesCursor`**: con `paging.next` y `paging.cursors.after: 'X'` → `{ after: 'X' }`; sin `paging.next` → `{ done: true, complete: true }`; con `next` y `pagesRead === TEMPLATES_MAX_PAGES` → `{ done: true, complete: false }`; con `next` pero sin `after` → `{ done: true, complete: false }`.

- [ ] **Step 3: Tests de `templatesMissingFromSync` e `isTemplateSyncStale`**: `(['a','b','c'], ['b'])` → `['a','c']`; `([], [...])` → `[]`. `isTemplateSyncStale(null, now)` → `true`; hace 9 min → `false`; hace 11 min → `true`.

- [ ] **Step 4: Correr y ver que fallan.** `cd Backend && node --test tests/template.sync.test.js` → FAIL (no existe el módulo).

- [ ] **Step 5: Implementar `utils/template.sync.js`.** `rejected_reason` de Meta vale `'NONE'` en las no rechazadas: se guarda `null`.

- [ ] **Step 6: Correr.** `npm test` → PASS. Añadir `utils/template.sync.js` a la lista de tests de `Backend/AGENTS.md`.

- [ ] **Step 7: Commit** «Plantillas: de Meta a Template, paginación y borradas, en puro».

### Task 2: La sincronización completa (PR 2)

**Files:**
- Modify: `Backend/src/libs/whatsapp.js` (`getTemplates`), `Backend/src/controllers/template.controller.js` (`syncTemplatesForWaba`, `getTemplatesController`, `templateWabasFor`), `Backend/src/models/template.model.js`, `Backend/src/models/waba.model.js`, `Backend/src/services/line.service.js` (`findAccountWabas`)
- Test: `Backend/tests/isolation/templates.test.js`

**Interfaces:**
- Consumes: todo lo de la Tarea 1.
- Produces:
  - `getTemplates({ token, waBusinessId, after = null })`: `params: { fields: TEMPLATE_FIELDS, limit: TEMPLATES_PAGE_LIMIT, ...(after && { after }) }`.
  - `syncTemplatesForWaba(waba) → number` (como hoy, el total procesado); recorre las páginas con `nextTemplatesCursor`.
  - `Template`: `footerText`, `bodyExamples`, `headerExample`, `qualityScore`, `rejectedReason`, `previousCategory`, `subCategory`, `metaUpdatedAt` (sin default), `deletedInMetaAt` (`Date`, `default: null`).
  - `Waba.templatesSyncedAt` (`Date`, `default: null`).
  - `findAccountWabas` y `templateWabasFor` devuelven también `templatesSyncedAt`.

- [ ] **Step 1: Comprobar los campos con Meta de verdad.** Pedir a Jonathan un token nuevo de «API Setup» de WasmishTest (dura 24 h; los locales caducaron el 2026-11-06), y, con él y el WABA de prueba en variables del shell (`$TEST_WABA_ID`; los dos valores, nunca en el repo ni en el log), pedir `GET https://graph.facebook.com/$META_GRAPH_VERSION/$TEST_WABA_ID/message_templates?fields=<TEMPLATE_FIELDS>&limit=2` y la página siguiente con su `after` (solo lectura). Anotar en el spec § 4.1 qué campos vienen y la forma de `quality_score`. Si un campo da error, quitarlo de `TEMPLATE_FIELDS`.

- [ ] **Step 2: Tests de aislamiento** en `templates.test.js` (Meta falso con `onMeta`, respondiendo según `config.params.after`):
  - `'el sync recorre las páginas'`: dos páginas (la 1 con `paging: { next: 'x', cursors: { after: 'p2' } }`) → las plantillas de las dos en la BD, `getTemplates` llamado con `fields` y `limit: 100`.
  - `'el sync guarda el pie y lo nuevo'`: `footerText`, `qualityScore` y `rejectedReason` en la BD.
  - `'una que ya no llega se marca, y vuelve si reaparece'`: sync sin la plantilla sembrada → `deletedInMetaAt` puesto; otro sync con ella → `null`.
  - `'Meta falla en la página 2: no se marca nada'` (Review Focus 1): la 2 responde `status: 500` → las de la página 1 guardadas, ninguna marcada, `templatesSyncedAt` sin cambiar.
  - `'el sync de un WABA no marca las del otro'` (Review Focus 3): con la cuenta `W` de dos WABA, sync de `waba-W` vacío → `tpl-w2` sin marca.
  - `'GET /templates?fresh=1 sincroniza si pasaron 10 minutos'`: `templatesSyncedAt` de hace 11 min → llama a Meta; de hace 1 min → no llama (`metaCalls` sin `/message_templates`). Sin `fresh` → no llama.

- [ ] **Step 3: Correr y ver que fallan.** `npm run test:isolation` → FAIL en los nuevos.

- [ ] **Step 4: Implementar.**
  - `syncTemplatesForWaba`: por cada página, el `bulkWrite` de hoy con `toTemplateFields(tpl)` y `deletedInMetaAt: null` en el `$set`. Si una página lanza, se relanza **después** de lo ya guardado (como hoy, el llamador decide); no se marca nada. Si el recorrido termina `complete`, `updateMany({ userId: accountId, waBusinessId, templateId: { $in: missing }, deletedInMetaAt: null }, { $set: { deletedInMetaAt: new Date() } })` y `Waba.updateOne({ accountId, waBusinessId }, { $set: { templatesSyncedAt: new Date() } })`. Si llega al tope, `console.warn` con el WABA (sin datos del cliente).
  - `getTemplatesController`: con `req.query.fresh === '1'`, los WABA sincronizables con `isTemplateSyncStale(waba.templatesSyncedAt, new Date())` se suman a los que ya se sincronizan por `outdated`. Mismo `try/catch` que hoy.
  - Comentario en `waba.model.js`: `templatesSyncedAt` no es de la conexión; lo escribe el sync, no `line.service.js`.

- [ ] **Step 5: Correr.** `npm test && npm run test:isolation` → PASS (revisar los tests de sync que ya existían: ahora sus plantillas sembradas que no devuelve el Meta falso quedan marcadas; si alguno lo nota, ajustar el falso para devolverlas).

- [ ] **Step 6: Documentar** en `docs/arquitectura/whatsapp-envio.md` una sección nueva `### Sincronizar plantillas (syncTemplatesForWaba)`: páginas, campos, borradas, `fresh`; añadirla al índice del archivo y a la fila de `AGENTS.md` del mapa.

- [ ] **Step 7: Commit** «Plantillas: el sync trae todas las páginas, el pie y las borradas».

### Task 3: Las borradas no se envían, y cada envío guarda su plantilla (PR 2)

**Files:**
- Modify: `Backend/src/controllers/template.controller.js` (`processTemplateSending`), `Backend/src/models/message.model.js`, `Frontend/src/models/template.model.ts`, `Frontend/src/hooks/useTemplateForm.ts`, `Frontend/src/pages/private/Campaigns/NewCampaign/useCampaignWizard.ts`
- Create: `Frontend/src/utils/templateStatus.ts`
- Test: `Backend/tests/isolation/templates.test.js`

**Interfaces:**
- Produces:
  - `Message.templateId` (`String`, sin default).
  - Frontend: `Template` con los campos nuevos de la Tarea 2 (fechas como `string | null`); `isSendableTemplate(t: Template) → boolean` = `status === 'APPROVED' && !t.deletedInMetaAt`.

- [ ] **Step 1: Tests de aislamiento:**
  - `'una plantilla borrada en Meta no se envía'`: `deletedInMetaAt` puesto y el Meta falso del sync de último momento sin ella → `POST /chats/template` responde 404 («no existe»), y ningún `POST /messages` a Meta.
  - `'una borrada no se envía aunque el sync falle'` (revisión de Codex del plan, 1): `deletedInMetaAt` puesto y el sync de último momento con `status: 500` → 404 por `POST /chats/template` **y** por `POST /v1/templates/send`, y ningún `POST /messages` a Meta. Regresión que vigila: con solo `deletedInMetaAt: null` en `findTemplate`, la marcada no se encuentra, el sync falla, `syncOk = false` y se envía igual.
  - `'una borrada que volvió a Meta se envía'`: marcada, y el sync de último momento la trae → sale.
  - `'el envío guarda el templateId'`: enviar desde el chat → `Message.templateId === templateId`.

- [ ] **Step 2: Correr y ver que fallan.**

- [ ] **Step 3: Implementar.** `findTemplate` sigue encontrando también las marcadas (así se distingue una **borrada** de una **desconocida**). Si la encontrada tiene `deletedInMetaAt`, se fuerza el sync de último momento y se vuelve a buscar: si sigue marcada, **o si el sync falla**, 404 como una que no existe (de una marcada sí se sabe que Meta la borró; el «dejar que Meta decida» de hoy solo vale para una desconocida). En `recordOutboundMessage`, `fields.templateId: template?.templateId ?? undefined` (con la plantilla copiada de una campaña también existe `templateId`). En el frontend, `useTemplateForm` y `useCampaignWizard` filtran con `isSendableTemplate` en vez de `status === 'APPROVED'`.

- [ ] **Step 4: Correr** backend (`npm test && npm run test:isolation`) y frontend (`npm run lint && npm run build`) → PASS.

- [ ] **Step 5: Documentar** en `whatsapp-envio.md` (§ API pública de plantillas y el nuevo de sincronizar): lo borrado no se envía; `Message.templateId`.

- [ ] **Step 6: Commit** «Plantillas: las borradas no se envían y el mensaje guarda su templateId». **Abrir el PR 2** con revisión de Codex.

### Task 4: El detalle y el uso (PR 3, rama `plantillas-detalle`)

**Files:**
- Create: `Backend/src/utils/template.usage.js`, `Backend/tests/template.usage.test.js`
- Modify: `Backend/src/controllers/template.controller.js` (nuevo `getTemplateDetailController`), `Backend/src/routes/template.routes.js`, `Backend/src/models/message.model.js` (índices), `Frontend/src/services/api.service.ts`, `Frontend/src/models/template.model.ts`
- Test: `Backend/tests/isolation/templates.test.js`

**Interfaces:**
- Consumes: `isTemplateSyncStale`, `syncTemplatesForWaba` (Tarea 2); `conversationScope`, `can` (`utils/permissions.js`); `templateWabasFor` (en el controlador).
- Produces:
  - `summarizeTemplateUsage(groups: { status: string, count: number, lastAt: Date | null }[]) → { sent, delivered, read, failed, lastSentAt }`.
  - `GET /templates/:templateId[?fresh=1]` (`authRequired`) → `{ template, usage, campaigns? }`; `campaigns: [{ id, name, status, createdAt }]`, las más recientes primero.
  - Índices `message_template_id` `{ templateId: 1 }` y `message_template_name` `{ templateName: 1 }`, parciales con `$type: 'string'`.
  - Frontend: `getTemplateDetailService(templateId: string, { fresh }: { fresh?: boolean }) → Promise<TemplateDetail>`, con `TemplateDetail`, `TemplateUsage` y `TemplateCampaign` en `template.model.ts`.

- [ ] **Step 1: Tests de `summarizeTemplateUsage`**: `[{ status: 'sent', count: 2 }, { status: 'delivered', count: 3 }, { status: 'read', count: 4 }, { status: 'failed', count: 1 }]` → `{ sent: 10, delivered: 7, read: 4, failed: 1 }` y `lastSentAt` el mayor `lastAt`; `[]` → todo en 0 y `lastSentAt: null`.

- [ ] **Step 2: Tests de aislamiento:**
  - `'GET /templates/:templateId: B no ve una de A'` → 404.
  - `'el uso cuenta solo lo que la persona ve'` (Review Focus 4): cuenta con dos líneas del mismo WABA, un agente con una sola y una conversación asignada a otro → el agente cuenta solo los de su línea y sin asignar o suyos; el owner, todos.
  - `'mensajes viejos por nombre, dentro del WABA'` (Review Focus 5): cuenta `W`, mensajes sin `templateId` con el mismo `templateName` en una conversación de cada línea → cada plantilla cuenta solo los suyos; un mensaje con `templateId` de otra plantilla del mismo nombre no cuenta.
  - `'campaigns solo con campaigns.manage'`: el owner recibe `campaigns` con la campaña sembrada; el agente no recibe la clave.
  - `'una plantilla de un WABA fuera de su alcance da 404'`: agente sin la línea del WABA → 404.

- [ ] **Step 3: Correr y ver que fallan.**

- [ ] **Step 4: Implementar.**
  - El controlador: `Template.findOne({ templateId, userId: accountId })`; con `templateWabasFor(req.auth)` distinto de `null`, si su `waBusinessId` no está en la lista → 404 («La plantilla no existe en tu cuenta.», el texto de hoy). Con `fresh=1` y su WABA caducado, `syncTemplatesForWaba` en `try/catch` y se vuelve a leer.
  - Las líneas del WABA: `Line.distinct('_id', { accountId, wabaId })` de **cualquier** estado (los envíos de una línea desconectada cuentan).
  - La agregación: `$match` de salientes con `$or: [{ templateId: { $eq: id, $type: 'string' } }, { templateName: { $eq: name, $type: 'string' }, templateId: { $exists: false } }]`; `$lookup` a `conversations` con `let`/`pipeline` filtrando `_id`, `userId: accountId`, y un `$and` entre `lineId: { $in: lineasDelWaba }` y `conversationScope(req.auth)` (las dos ponen `lineId`: sin `$and`, una pisaría a la otra); quitar los que no cruzan; `$group` por `status` con `count` y `lastAt: { $max: '$timestamp' }`; después `summarizeTemplateUsage`.
  - `campaigns`: `Campaign.find({ userId: accountId, 'template.templateId': templateId })`, `name status createdAt`, orden `createdAt: -1`, solo con `can(req.auth, 'campaigns.manage')`.
  - La ruta va **después** de `/templates/sync` en `template.routes.js` (si no, `sync` se tomaría por un `:templateId`).

- [ ] **Step 5: Correr.** `npm test && npm run test:isolation` → PASS; frontend `npm run lint && npm run build`.

- [ ] **Step 6: Documentar**: la ruta en `docs/arquitectura/api.md`; el uso en la sección de sincronizar de `whatsapp-envio.md`; los dos índices en `Backend/AGENTS.md`.

- [ ] **Step 7: Commit** «Plantillas: el detalle con su uso». **Abrir el PR 3** con revisión de Codex.

### Task 5: El brief de UI (PR 4, rama `plantillas-brief`)

**Files:**
- Create: `docs/superpowers/specs/2026-11-06-detalle-plantillas-brief-ui.md`

- [ ] **Step 1: Escribir el brief** con el § 7 del spec, como los briefs que ya hay (qué hace y ve el usuario, no cómo se ve): la tabla (abrir, categoría, filtro de borradas escondidas por defecto), el detalle (todo lo del § 7), los avisos (borrada, rechazada con el motivo en palabras, en pausa, calidad baja), los estados (cargando, 404 también desde una campaña, sin envíos), el agente (sin campañas, uso de lo suyo), el pie en las vistas previas, y teléfono y escritorio. Con los motivos de rechazo y las calidades de Meta que haya que poner en palabras (la lista sale de la Tarea 2, Step 1).
- [ ] **Step 2: PR solo de documentación** (sin revisión cruzada). Jonathan se lo pasa a Claude Design.

### Task 6: La pantalla (PR 5, rama `plantillas-ui`)

Se detalla en este plan **cuando llegue el diseño** (como las Tareas 8 a 10 del bot con menús): primer commit de la rama = el diseño en `Design/` y los pasos de esta tarea. Lo que ya se sabe:

- La ruta `templates/:templateId` en `PrivateRouter.tsx` y `routes.models.ts`; «Ver plantilla» en `CampaignDetailPage.tsx` con `campaign.template.templateId`.
- Un hook `useTemplateDetail(templateId)` con React Query (`['template', templateId]`), que pide `fresh: true`.
- La página Plantillas, al montarse, pide la lista con `fresh=1` una vez (`queryClient.fetchQuery` con la clave `['templates']`), sin que los selectores del chat y las campañas lo hagan.
- `TemplateBubble` aprende el pie (`template.footerText`), en todas las vistas previas.
- Reutilizar `TemplateBubble`, `TemplateButtons`, `TemplateHeaderCell`, `TemplateLinesCell`, `CategoryPill`, `PageShell`/`PageHeader`, `Callout` y `DataTable`.
- Navegador a 1440, 800 y 390 px, con una plantilla de cada formato de cabecera, una rechazada, una borrada y una sin envíos; como owner y como agente.

## Al terminar

- Desplegar los PRs 2 y 3 cuando Jonathan diga (sin migración ni variables; la api crea los dos índices al arrancar). **Después del despliegue:** mirar en el log y en la BD que el primer sync trajo todas las plantillas de cada cuenta y que ninguna quedó marcada como borrada por error (`Template.countDocuments({ deletedInMetaAt: { $ne: null } })` antes y después).
- Con la UI: prueba en producción con la cuenta de prueba de Jonathan.

## Decisiones del plan (para revisar)

- **El detalle no devuelve las líneas** (cambio al spec § 6): el navegador ya las calcula con `TemplateLinesCell`.
- **El detalle con `fresh=1` sincroniza solo el WABA de esa plantilla**, no todos.
- **Una campaña ya creada sigue enviando una plantilla borrada en Meta** (usa su copia, `resolvedTemplate`): Meta la rechazará y la campaña la cuenta como fallida, como cualquier error de Meta. Pausarla sola es otro cambio.
- **`rejected_reason: 'NONE'` se guarda como `null`.**
- **Los envíos de una línea ya desconectada del WABA cuentan** en el uso.
