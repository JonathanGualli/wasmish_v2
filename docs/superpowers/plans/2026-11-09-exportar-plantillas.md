# Exportar las plantillas a Excel — Implementation Plan

> **Para quien lo ejecute:** en Wasmish los planes se ejecutan **nativo** (rama, PR, revisión cruzada; ver «Planes» en `AGENTS.md`). Las referencias de `writing-plans` a `subagent-driven-development` o `executing-plans` no aplican. Los pasos usan casillas (`- [ ]`).

**Goal:** Un botón «Descargar Excel» en Plantillas que baja un `.xlsx` con las plantillas que se ven, una fila por plantilla con sus datos de Meta y su uso en Wasmish.

**Architecture:**
- **Backend:** una función pura nueva, `attributeTemplateUsage` (`utils/template.usage.js`), reparte los grupos de una sola agregación entre las plantillas con las reglas del detalle; la ruta `GET /api/templates/usage` hace la agregación y la cuenta de campañas.
- **Frontend:** una función pura nueva, `templateExportRows` (`utils/templateExport.ts`), convierte plantillas + uso en las filas de `write-excel-file`; el botón de `TemplatesPage` pide el uso, carga la librería con `import()` y descarga el `Blob`.

**Tech Stack:** Express 5, Mongoose 8, `node:test`, `mongodb-memory-server`; React 19, TypeScript, Vite, `write-excel-file@4.1.1` (`write-excel-file/browser`).

**Spec:** `docs/superpowers/specs/2026-11-09-exportar-plantillas-design.md` (aprobado por Jonathan el 2026-11-09, con las decisiones A a E del agente).

## Global Constraints

- **Las mismas cifras que el detalle:** un mensaje cuenta si es saliente, tiene el `templateId` de la plantilla **o** no tiene `templateId` (`$exists: false`) y tiene su `templateName`; su conversación es de la cuenta, de una **línea del WABA de la plantilla** (de cualquier estado) y cumple `conversationScope(req.auth)`. Se resume con `summarizeTemplateUsage`.
- Los índices parciales se usan **repitiendo el `$type: 'string'`** en el `$match`, como en `templateUsageFor`.
- **Las plantillas de la ruta = las de `GET /templates` sin `lineId`:** `templateWabasFor(req.auth, undefined)` + `findUserTemplates`. La ruta **no sincroniza**.
- **`campaigns` solo con `can(req.auth, 'campaigns.manage')`**, filtrado con `conversationLineScope(req.auth)`.
- **La ruta `/templates/usage` va antes que `/templates/:templateId`** en `template.routes.js`.
- En una agregación Mongoose no convierte tipos: `userId` como `new mongoose.Types.ObjectId(accountId)`.
- **El archivo:** `plantillas-wasmish-AAAA-MM-DD.xlsx` (fecha local), una hoja `Plantillas`, cabecera en negrita y fija (`stickyRowsCount: 1`), las 24 columnas del spec § 5 **en ese orden y con esos nombres**; cifras como `Number`, fechas como `Date`; un dato que falta va vacío (`null`), nunca «—».
- **Las filas = `filterTemplates(templates, filters)`** con los filtros puestos, en el orden de la tabla.
- **Texto del error:** `No se pudo preparar el Excel. Inténtalo de nuevo.` (aviso de arriba, `kind: 'error'`).
- **Texto del botón:** `Descargar Excel`; icono `FileSpreadsheet` de lucide. En el teléfono se ve solo el icono y el texto queda para los lectores de pantalla (`max-sm:sr-only`): `CustomButton` no pasa `aria-label` al `<button>` (revisión de Codex del PR #197).
- Identificadores nuevos en inglés; textos al usuario, comentarios, commits y documentación, en español. Errores como `[{ message }]`. Commits sin coautor ni atribución.
- **Dos PRs:** 1) `exportar-plantillas`: el spec y este plan (revisión de Codex); 2) `exportar-plantillas-codigo`, desde `master` después de unir el 1: Tareas 1 a 4. Si el 2 pasa de unas 400 líneas de código real, se parte: Tareas 1 y 2 (backend) y después 3 y 4.
- Comprobar con `cd Backend && npm test && npm run test:isolation` y `cd Frontend && npm run lint && npm run build`; la UI, en el navegador a 1440 y 390 px.

## Review Focus

- **Una plantilla de un WABA y un mensaje viejo con su nombre en una línea de otro WABA de la cuenta:** no cuenta → test puro en la Tarea 1 y de aislamiento en la Tarea 2 (la cuenta X del test del detalle).
- **Un agente que exporta:** las cifras son solo las de su bandeja y no llega `campaigns` → test de aislamiento en la Tarea 2.
- **`/templates/usage` registrada después de `/templates/:templateId`:** respondería el 404 del detalle → test de aislamiento en la Tarea 2 (la forma de la respuesta).
- **Un texto de Meta que empieza por `=`, `+`, `-` o `@` (cuerpo, pie, botón):** Excel no debe tomarlo como fórmula → la Tarea 3 los escribe con `type: String` explícito (`write-excel-file` no crea fórmulas sin `type: 'Formula'`); se comprueba leyendo el archivo en la Tarea 4.
- **Sin ninguna plantilla visible** (filtros que no dejan nada) o la lista en error: el botón deshabilitado, no un Excel vacío → Tarea 4, en el navegador.

---

### Task 1: `attributeTemplateUsage` (puro)

**Files:**
- Modify: `Backend/src/utils/template.usage.js`
- Test: `Backend/tests/template.usage.test.js`

**Interfaces:**
- Consumes: `summarizeTemplateUsage(groups)` (ya existe).
- Produces: `attributeTemplateUsage(groups, templates, lineWabas) → { [templateId]: { sent, delivered, read, failed, lastSentAt } }`, con:
  - `groups`: `[{ templateId: string|null, templateName: string|null, lineId: string, status: string, count: number, lastAt: Date|null }]`;
  - `templates`: `[{ templateId, name, waBusinessId }]`;
  - `lineWabas`: `Map<string, string>` (`lineId` → `waBusinessId`).
  - Todas las plantillas de `templates` salen en el resultado, las sin envíos con ceros y `lastSentAt: null`.

- [ ] **Step 1: Write the failing tests** en `tests/template.usage.test.js` (plantillas `t1` `{ templateId: 'T1', name: 'promo', waBusinessId: 'W1' }`, `t1en` `{ templateId: 'T1EN', name: 'promo', waBusinessId: 'W1' }`, `t2` `{ templateId: 'T2', name: 'promo', waBusinessId: 'W2' }`, `t3` sin envíos; `lineWabas` = `L1 → W1`, `L2 → W2`):
  - `attributeTemplateUsage: por templateId, a su plantilla` — un grupo `{ templateId: 'T1', lineId: 'L1', status: 'read', count: 2 }` → `T1.sent === 2`, `T1.read === 2`; `T1EN.sent === 0`.
  - `attributeTemplateUsage: un templateId en una línea de otro WABA no cuenta` — `{ templateId: 'T1', lineId: 'L2', … }` → `T1.sent === 0`.
  - `attributeTemplateUsage: los viejos por nombre, solo en su WABA, y suman a cada idioma` — `{ templateId: null, templateName: 'promo', lineId: 'L1', status: 'sent', count: 3 }` → `T1.sent === 3`, `T1EN.sent === 3`, `T2.sent === 0`; el mismo en `L2` → solo `T2.sent === 3`.
  - `attributeTemplateUsage: una línea que no está en el mapa no cuenta` — `lineId: 'L9'` → todo en cero.
  - `attributeTemplateUsage: sin envíos, en cero` — `T3` deep-equal `{ sent: 0, delivered: 0, read: 0, failed: 0, lastSentAt: null }`.
  - `attributeTemplateUsage: el último envío es el más reciente de sus grupos` — dos grupos de `T1` con `lastAt` distintos → `T1.lastSentAt` el mayor.

- [ ] **Step 2: Run** `cd Backend && node --test tests/template.usage.test.js` — Expected: FAIL (`attributeTemplateUsage` no se exporta).

- [ ] **Step 3: Implement `attributeTemplateUsage`** en `utils/template.usage.js`: un índice `waBusinessId|name → templateIds` para los viejos y un `Set` de ids por `waBusinessId` para los nuevos; cada grupo se suma a las listas de sus plantillas y cada lista pasa por `summarizeTemplateUsage`. Comentario arriba con las reglas (las del detalle, spec § 4.1).

- [ ] **Step 4: Run** `cd Backend && npm test` — Expected: PASS, todos.

- [ ] **Step 5: Commit** — `git add Backend/src/utils/template.usage.js Backend/tests/template.usage.test.js && git commit -m "Plantillas: repartir el uso de todas entre sus plantillas (puro)"`

### Task 2: `GET /api/templates/usage`

**Files:**
- Modify: `Backend/src/controllers/template.controller.js` (junto a `templateUsageFor`)
- Modify: `Backend/src/routes/template.routes.js:16-19`
- Create: `Backend/tests/isolation/templates-usage.test.js`
- Modify: `docs/arquitectura/api.md` (la tabla de rutas, junto a `/api/templates/:templateId`, y «Roles y permisos», la frase de las plantillas)

**Interfaces:**
- Consumes: `attributeTemplateUsage` (Tarea 1), `templateWabasFor`, `findUserTemplates`, `conversationScope`, `conversationLineScope`, `can`.
- Produces: `getTemplatesUsageController(req, res)`; respuesta `200 { usage: { [templateId]: TemplateUsage }, campaigns?: { [templateId]: number } }` (`lastSentAt` en ISO). `campaigns` lleva todas las plantillas de la lista, con 0 las que no tienen campañas.

- [ ] **Step 1: Write the failing tests** en `tests/isolation/templates-usage.test.js`, sembrando como `templates-detail.test.js` (copiar sus ayudantes `conversationOn` y `sent`, con `seq` 41 a 44 para las cuentas A, B, G y X, y `phoneNumberId` propios `7751`…). Tests:
  - `GET /templates/usage: B no ve las plantillas ni los envíos de A` — `Object.keys(res.body.usage)` de B no incluye `a.templateId`.
  - `las cifras de cada plantilla son las del detalle` — para el owner de G, el agente de G y el owner de X: por cada `templateId` de `usage`, `deepEqual(usage[id], (await detail(account, id)).body.usage)`.
  - `el agente cuenta solo lo de su bandeja` — `usage[g.templateId]` del agente deep-equal `{ sent: 2, delivered: 2, read: 1, failed: 0, lastSentAt: '2026-11-02T10:00:00.000Z' }`.
  - `los viejos por nombre no se cuelan en el otro WABA` — en X: `usage[x.templateId].sent === 2`, `usage['tpl-x2-mismo-nombre'].sent === 1`.
  - `las campañas solo con campaigns.manage, y el supervisor solo las de sus líneas` — owner de G: `campaigns[g.templateId] === 3`; supervisor: `1`; agente: `'campaigns' in body === false`; `campaigns[g.imageTemplateId] === 0`.
  - `no la toma la ruta del detalle` — `res.status === 200` y `typeof res.body.usage === 'object'` (sin `template`).
  - `sin líneas, el uso en cero pero las campañas cuentan` — la cuenta A (de `seedAccount`, sin líneas ni WABA, con una campaña sembrada): `usage[a.templateId]` en ceros y `campaigns[a.templateId] === 1`, igual que su detalle. Revisión de Codex del PR #197: un «sin líneas, ceros» temprano se saltaba también las campañas.

- [ ] **Step 2: Run** `cd Backend && node --test tests/isolation/templates-usage.test.js` — Expected: FAIL (404: la toma `/templates/:templateId`).

- [ ] **Step 3: Implement `getTemplatesUsageController`** (spec § 4.1): las plantillas con `templateWabasFor(req.auth, undefined)` + `findUserTemplates`; el mapa `lineWabas` con `Waba.find({ accountId, waBusinessId: { $in } })` y `Line.find({ accountId, wabaId: { $in } }, { _id: 1, wabaId: 1 })`; la agregación de `templateUsageFor` con `$in` (`templateId: { $in: ids, $type: 'string' }` / `templateName: { $in: names, $type: 'string' }, templateId: { $exists: false }`), `lineId: { $in: lineIds }` en el `$lookup`, proyección de `lineId` y `$group` por `{ templateId, templateName, lineId: '$conversation.lineId', status }` (después de un `$unwind: '$conversation'`); con `campaigns.manage`, `Campaign.aggregate` con `$match` `{ userId: ObjectId, 'template.templateId': { $in: ids }, ...conversationLineScope(req.auth) }` y `$group` por `$template.templateId`. Sin plantillas, `{ usage: {} }` (y `campaigns: {}` con permiso) sin consultar nada; sin líneas, se salta **solo** la agregación de mensajes (uso en ceros), y las campañas se cuentan igual, como en el detalle. Errores como el detalle (`console.error` + 500 `[{ message }]`).

- [ ] **Step 4: Register** `router.get('/templates/usage', authRequired, getTemplatesUsageController);` justo después de `/templates/sync`, con el comentario de por qué va antes de `:templateId`.

- [ ] **Step 5: Run** `cd Backend && npm test && npm run test:isolation` — Expected: PASS, todos.

- [ ] **Step 6: Comprobar los índices** — con el Mongo local y la plantilla de prueba sembrada, `explain('executionStats')` de la agregación: usa `message_template_id` y `message_template_name`, sin `COLLSCAN` sobre `messages`.

- [ ] **Step 7: Docs** — `api.md`: una fila `GET /api/templates/usage` (JWT; qué devuelve, que son las de la lista sin `lineId`, que no sincroniza, `campaigns` con permiso) y, en «Roles y permisos», «el uso de todas» junto al detalle.

- [ ] **Step 8: Commit** — `git add Backend/src/controllers/template.controller.js Backend/src/routes/template.routes.js Backend/tests/isolation/templates-usage.test.js docs/arquitectura/api.md && git commit -m "Plantillas: el uso de todas en GET /templates/usage"`

### Task 3: Las filas del Excel (puro, frontend)

**Files:**
- Modify: `Frontend/package.json` (`write-excel-file` `^4.1.1`, con `npm install`)
- Modify: `Frontend/src/models/template.model.ts`
- Modify: `Frontend/src/utils/templateDisplay.ts` (`rejectionNotice`)
- Create: `Frontend/src/utils/templateExport.ts`

**Interfaces:**
- Produces:
  - `export interface TemplatesUsage { usage: Record<string, TemplateUsage>; campaigns?: Record<string, number> }` en `template.model.ts`.
  - `export const rejectionReasonWords = (template: Template): string | null` en `templateDisplay.ts`: el motivo en palabras (`REJECTION[code].reason`, con mayúscula inicial), el código tal cual si no se conoce, `null` sin rechazo. `rejectionNotice` la usa para su título.
  - `export const templateExportFileName = (now: Date): string` → `plantillas-wasmish-2026-11-09.xlsx` (fecha local).
  - `export const templateExportRows = (templates: Template[], data: TemplatesUsage, lines: Line[]): Row[]` (`Row` de `write-excel-file/browser`): la primera fila es la cabecera (`fontWeight: 'bold'`), una fila por plantilla en el orden recibido; la columna «Campañas» solo si `data.campaigns` existe.
  - `export const templateExportColumns = (withCampaigns: boolean): { width: number }[]` (anchos en caracteres; los de texto largo, 50, con `wrap: true` en sus celdas).

- [ ] **Step 1: Instalar** `cd Frontend && npm install write-excel-file@^4.1.1` y comprobar que `import('write-excel-file/browser')` compila (`npm run build`).

- [ ] **Step 2: Implement `rejectionReasonWords`** y cambiar `rejectionNotice` para que la use (sin cambiar sus textos).

- [ ] **Step 3: Implement `templateExportRows`** con las columnas del spec § 5, en ese orden. De dónde sale cada una: Idioma `languageName`; Categoría y Categoría anterior `categoryLabel` (vacía si no hay); Estado `templateStatusWords(t).label`; Calidad `templateQualityWords(t, { neverSent: usage.sent === 0 }).label` (vacía si es `—`); Motivo del rechazo `rejectionReasonWords`; Cabecera `headerMediaRule(t)?.title` o `Texto` con `header.format === 'TEXT'`; Archivo de la cabecera `headerMedia.filename` o `Falta` si `headerMediaRule(t)` y no hay `headerMedia`; Variables `templateVariables(t)` como `` `${key} = ${example ?? 'sin ejemplo'}` `` unidas con `\n`; Botones `templateButtonDetails` como `` `${type}: ${text}${dest ? ` → ${dest}${destVariable ?? ''}` : ''}` `` unidos con `\n`; Líneas `lines.filter(l => l.status === 'active' && l.waBusinessId === t.waBusinessId).map(lineLabel).join(', ')`; fechas con `new Date(iso)` y `format: 'dd/mm/yyyy hh:mm'`; cifras con `type: Number`. Todo texto con `type: String` explícito. Un dato que falta, `null`.

- [ ] **Step 4: Run** `cd Frontend && npm run lint && npm run build` — Expected: sin errores.

- [ ] **Step 5: Commit** — `git add Frontend/package.json Frontend/package-lock.json Frontend/src/models/template.model.ts Frontend/src/utils/templateDisplay.ts Frontend/src/utils/templateExport.ts && git commit -m "Plantillas: las filas del Excel (puro)"`

### Task 4: El botón «Descargar Excel»

**Files:**
- Modify: `Frontend/src/services/api.service.ts` (junto a `getTemplateDetailService`)
- Create: `Frontend/src/hooks/useTemplatesExport.ts`
- Modify: `Frontend/src/pages/private/Templates/TemplatesPage.tsx` (las `actions` de `PageHeader`)
- Modify: `docs/arquitectura/whatsapp-envio.md` (§ Sincronizar plantillas, tras «La página del detalle»), `docs/arquitectura/frontend.md` (la lista de hooks), `docs/estado.md`

**Interfaces:**
- Consumes: `TemplatesUsage`, `templateExportRows`, `templateExportColumns`, `templateExportFileName` (Tarea 3); `downloadFile` (`utils/download.ts`); `useNotice`; `useLines`.
- Produces:
  - `export const getTemplatesUsageService = async (): Promise<TemplatesUsage>` (`GET ${API_URL}/templates/usage`, `withCredentials`).
  - `export const useTemplatesExport = () => ({ exportTemplates: (templates: Template[]) => Promise<void>, isExporting: boolean })`: sin React Query (la llamada directa del servicio: el uso no se guarda, decisión C); carga `write-excel-file/browser` con `import()`, arma el `Blob` con `writeXlsxFile(rows, { columns, sheet: 'Plantillas', stickyRowsCount: 1 }).toBlob()` y lo baja con `downloadFile(blob, templateExportFileName(new Date()))`; si algo falla, el aviso de error de Global Constraints.

- [ ] **Step 1: Skill de marca** (`.agents/skills/brand-guidelines/SKILL.md`) antes de tocar la cabecera.

- [ ] **Step 2: Implement** el servicio, el hook y el botón: `CustomButton variant="outline"` con `isLoading={isExporting}`, a la izquierda de «Sincronizar», visible para todos (también sin `canManage`: la condición de `actions` lo incluye), deshabilitado con `isLoading || isError || visible.length === 0`; en el teléfono solo el icono, con el texto en `<span className="max-sm:sr-only">`. `exportTemplates(visible)`.

- [ ] **Step 3: Run** `cd Frontend && npm run lint && npm run build` — Expected: sin errores.

- [ ] **Step 4: En el navegador**, con el backend aparte y el Meta falso (guiones de `guiones/prueba-navegador/` de la memoria y el `seed.js` de plantillas `e2e-*`): bajar el archivo sin filtros, con búsqueda, con «mostrar las borradas» y con una categoría; como owner y como agente (sin «Campañas»); a 1440 y 390 px (a 390, el nombre accesible del botón sigue siendo «Descargar Excel»: `getByRole('button', { name: 'Descargar Excel' })` de Playwright); el botón deshabilitado con un filtro sin resultados; el aviso de error con la ruta caída. **Leer cada `.xlsx` bajado con `read-excel-file`** (Node) y comprobar: 24 columnas (23 como agente) con los nombres del spec, una fila por plantilla visible, las cifras = las del detalle, las fechas como fechas, un cuerpo que empiece por `=` sigue siendo texto.

- [ ] **Step 5: Docs** — `whatsapp-envio.md`: una viñeta «**Exportar a Excel**» (la ruta, `attributeTemplateUsage`, el botón, las columnas en una frase, el enlace al spec); `frontend.md`: `useTemplatesExport` en la lista de hooks; `estado.md`: «En curso» al día.

- [ ] **Step 6: Commit** — `git add Frontend/src/services/api.service.ts Frontend/src/hooks/useTemplatesExport.ts Frontend/src/pages/private/Templates/TemplatesPage.tsx docs/arquitectura/whatsapp-envio.md docs/arquitectura/frontend.md docs/estado.md && git commit -m "Plantillas: descargar las que se ven en Excel"`

## Al terminar

- PR `exportar-plantillas-codigo` con el CI en verde → revisión de Codex (`codex exec … < /dev/null`), publicarla y responderla punto por punto → Jonathan une.
- Sin migración ni variables: se despliega con lo siguiente que vaya a producción.
- `/graphify --update` en las dos máquinas.
