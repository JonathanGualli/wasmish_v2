# Exportar las plantillas a Excel

Spec del 2026-11-09. Sale del brainstorming de ese día con Jonathan (decisiones una por una). Sigue al [detalle de plantillas](2026-11-06-detalle-plantillas-design.md), que ya calcula el uso de **una** plantilla; esto lo calcula para todas y lo deja bajar en un `.xlsx`.

## 1. Qué problema resuelve

La tabla de Plantillas enseña cada plantilla en una línea, y su uso solo se ve abriéndolas una por una. **No hay forma de llevarse la lista** para revisarla, compartirla o ver de un vistazo cuáles se usan y cuáles no.

## 2. Qué se construye

- Un botón **«Descargar Excel»** en la cabecera de Plantillas que baja un `.xlsx` con **una fila por plantilla**: todos sus datos de Meta y su uso en Wasmish.
- Una ruta nueva, **`GET /api/templates/usage`**, con el uso de todas las plantillas de la lista en una sola agregación.

**Fuera:** exportar desde el detalle de una plantilla; exportar campañas; CSV; exportar por la API pública; elegir columnas o período.

## 3. Decisiones

Las de Jonathan en el brainstorming:

1. **Qué trae:** todas las plantillas, con sus datos y su uso (no solo los datos; no una sola plantilla).
2. **Cuáles:** **las que se ven** en la tabla con los filtros puestos (búsqueda, estado, categoría, «mostrar las borradas»). Sin filtros salen todas menos las borradas en Meta, igual que en pantalla.
3. **Enfoque:** el uso lo calcula el backend; el Excel lo arma el navegador. Los filtros siguen viviendo en un solo sitio (`filterTemplates`).
4. **Sin brief para Claude Design:** es un botón en una cabecera que ya existe, con las piezas que ya hay.

Las que tomó el agente, **para que Jonathan las revise**:

- **A. Sin permiso aparte:** lo baja cualquiera que ve la tabla. El uso es el que esa persona puede ver (`conversationScope`), igual que en el detalle.
- **B. La columna «Campañas» solo sale con `campaigns.manage`**, como la lista de campañas del detalle.
- **C. El uso no se guarda en caché:** se pide al pulsar, así las cifras son las de ese momento.
- **D. Las columnas y su orden** (§ 5) y **el nombre del archivo**, `plantillas-wasmish-AAAA-MM-DD.xlsx`.
- **E. Excel (`.xlsx`), no CSV:** un CSV en un Excel en español se abre con los acentos rotos o en una sola columna (espera `;`).

## 4. Cómo funciona

### 4.1 El uso de todas (`GET /api/templates/usage`)

Con `authRequired` y sin `requirePermission`. Las plantillas son **las mismas que devuelve `GET /templates` sin `lineId`**: `templateWabasFor(req.auth, undefined)` y `findUserTemplates`. No sincroniza: la página ya lo hizo al abrirse (`fresh=1`).

Las mismas reglas que el uso del detalle (spec del detalle § 4.3), para que la tabla y el detalle den **las mismas cifras**:

- un mensaje es de una plantilla si tiene su `templateId` **o**, sin `templateId`, su `templateName` (los anteriores al detalle);
- cuenta solo si su conversación es de la cuenta, está al alcance de la persona (`conversationScope`) y **es de una línea del WABA de la plantilla** (de cualquier estado: las de una línea desconectada cuentan).

**La agregación**, una sola sobre `Message`:

1. `$match`: salientes con `templateId` en los de la lista **o** sin `templateId` y con `templateName` en los nombres de la lista. Repite el `$type: 'string'` para usar los índices parciales `message_template_id` y `message_template_name`.
2. `$lookup` de la conversación con `let`/`pipeline`: la cuenta, `lineId` en las líneas de los WABA de la lista y `conversationScope(auth)` (con `$and`, como en el detalle, para que no se pisen los `lineId`). Se trae solo `lineId`.
3. `$group` por `{ templateId, templateName, lineId, status }`, con `count` y `lastAt` (`$max` de `timestamp`).

**A quién se suma cada grupo** lo decide una función pura nueva en `utils/template.usage.js`, **`attributeTemplateUsage(groups, templates, lineWabas)`** (`lineWabas`: `lineId → waBusinessId`):

- con `templateId`: a esa plantilla, si su línea es de su WABA;
- sin `templateId`: a **cada** plantilla con ese nombre en el WABA de la línea (dos idiomas con el mismo nombre suman juntos sus envíos viejos, como en el detalle).

Devuelve el uso de cada plantilla (`templateId → { sent, delivered, read, failed, lastSentAt }`): sus grupos pasan por **`summarizeTemplateUsage`**, la del detalle. Una plantilla sin envíos sale con ceros y `lastSentAt: null`.

**Las campañas** (solo con `campaigns.manage`): un `$group` sobre `Campaign` por `template.templateId`, con la cuenta y `conversationLineScope(auth)` (el filtro de `templateCampaignsFor`), y con `template.templateId` en los de la lista.

**Respuesta:**

```json
{
  "usage": { "<templateId>": { "sent": 0, "delivered": 0, "read": 0, "failed": 0, "lastSentAt": null } },
  "campaigns": { "<templateId>": 0 }
}
```

`campaigns` no llega sin `campaigns.manage`. **La ruta va antes que `/templates/:templateId`** en el router: si no, Express toma `usage` como un id.

### 4.2 El archivo (navegador)

Al pulsar «Descargar Excel»:

1. Pide `GET /templates/usage` con la llamada directa del servicio, sin React Query: el uso no se guarda en caché.
2. Carga `write-excel-file` con `import()` dinámico (como `read-excel-file` en Importar): no entra en el paquete de la página.
3. Arma las filas con una función pura nueva, **`templateExportRows(templates, usage, campaigns, lines)`** en `utils/templateExport.ts`, con las plantillas que se ven (`filterTemplates` con los filtros puestos), en el orden de la tabla.
4. Lo descarga con `downloadFile` (el `Blob`) y el nombre `plantillas-wasmish-AAAA-MM-DD.xlsx` (la fecha local).

Las palabras salen de **`templateDisplay.ts`**, las mismas que la pantalla: estado (`templateStatusWords`), calidad (`templateQualityWords`), categoría (`categoryLabel`), idioma (`languageName`), botones (`templateButtonDetails`), variables (`templateVariables`) y el motivo del rechazo (hoy dentro de `rejectionNotice`: se saca una `rejectionReasonWords(template)` que usen los dos). Lo que haga falta y viva dentro de un componente o de otra función se mueve a `templateDisplay.ts`, no se copia.

## 5. Las columnas

Una hoja, «Plantillas», con la fila de cabecera en negrita y congelada.

| Columna | Qué tiene | Tipo |
|---|---|---|
| Nombre | `name` | texto |
| Idioma | en palabras («Español (México)») | texto |
| Categoría | en palabras | texto |
| Categoría anterior | si Meta la cambió | texto |
| Estado | en palabras («Aprobada», «Rechazada»…) | texto |
| Calidad | en palabras | texto |
| Motivo del rechazo | en palabras, si la rechazó | texto |
| Borrada en Meta | `deletedInMetaAt` | fecha |
| Cabecera | Texto, Imagen, Vídeo, Documento o vacío | texto |
| Texto de la cabecera | si es de texto | texto |
| Archivo de la cabecera | el nombre del archivo subido, o «Falta» si la cabecera pide uno y no lo tiene | texto |
| Cuerpo | `bodyText` | texto |
| Pie | `footerText` | texto |
| Variables | una por línea: `{{1}} = Juan` | texto |
| Botones | uno por línea: tipo, texto y destino (URL, teléfono o código) | texto |
| Líneas | los nombres de las líneas conectadas de su WABA, separados por comas (lo de `TemplateLinesCell`) | texto |
| Envíos | `sent` | número |
| Entregados | `delivered` (incluye los leídos) | número |
| Leídos | `read` | número |
| Fallidos | `failed` | número |
| Último envío | `lastSentAt` | fecha |
| Campañas | cuántas la usaron (**solo con `campaigns.manage`**) | número |
| Última modificación en Meta | `metaUpdatedAt` | fecha |
| ID de Meta | `templateId` | texto |

Las cifras van como números y las fechas como fechas de Excel (con hora), para poder ordenar, filtrar y sumar. Un dato que falta va vacío, no «—».

## 6. La pantalla

- **«Descargar Excel»** (`CustomButton` `outline`, icono `FileSpreadsheet` de lucide) en las `actions` de `PageHeader`, a la izquierda de «Sincronizar». Lo ve todo el que ve la tabla (también sin `templates.manage`). En el teléfono, solo el icono, con `aria-label="Descargar Excel"`.
- **Deshabilitado** mientras carga la lista, con la lista en error o si con los filtros no queda ninguna.
- **Mientras prepara el archivo**, `isLoading` en el botón.
- **Si falla** (la ruta o la librería): el aviso de arriba, `notify({ kind: 'error', text: 'No se pudo preparar el Excel. Inténtalo de nuevo.' })`.
- Antes de tocarlo, la skill de marca.

## 7. Cómo se prueba

- **Pura** (`npm test`): `attributeTemplateUsage`: por `templateId`; uno viejo por nombre; el mismo nombre en otro WABA que **no** cuenta; un `templateId` cuya línea es de otro WABA que no cuenta; dos idiomas con el mismo nombre que suman los viejos; una plantilla sin envíos.
- **Aislamiento** (`npm run test:isolation`): la ruta no devuelve plantillas ni envíos de otra cuenta; un agente no cuenta los envíos de una línea fuera de su alcance ni de una conversación asignada a otro; sin `campaigns.manage` no llega `campaigns`; **las cifras de una plantilla coinciden con las de `GET /templates/:templateId`**; `/templates/usage` no cae en la ruta del detalle.
- **Frontend** (`npm run lint`, `npm run build`): sin runner de tests; `templateExportRows` se comprueba en el navegador.
- **En el navegador**, con el backend aparte y el Meta falso: bajar el archivo con y sin filtros, como owner y como agente, a 1440 y 390 px; leer el `.xlsx` bajado con `read-excel-file` para comprobar columnas, tipos y filas; el error con la ruta caída.

## 8. Cómo se entrega

1. **Spec y plan** (este spec y `docs/superpowers/plans/2026-11-09-exportar-plantillas.md`), con la revisión de Codex. Sin código.
2. **El código**: la ruta con sus tests y el botón con el Excel. En un PR si queda por debajo de unas 400 líneas; si no, primero el backend y después la UI.

Documentación en el mismo PR que el código: `api.md` (la fila de la ruta y su alcance en «Roles y permisos»), `whatsapp-envio.md` (§ Sincronizar plantillas, junto a «El detalle y el uso» y «La página del detalle»: el uso de todas y el Excel), `decisiones.md` y `estado.md`. `Backend/AGENTS.md` ya lista `utils/template.usage.js` entre los tests.
