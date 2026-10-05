# Etiquetas e Importar contactos — diseño técnico

Fecha: 2026-10-05. Brief de UI: `2026-10-05-etiquetas-importar-brief-ui.md`.

## Decisiones (con Jonathan)

- Formatos: **CSV y Excel (.xlsx)**, leídos en el navegador. `.xls` no.
- Números sin código de país: **país por defecto** elegido al importar (Ecuador).
- Contacto que ya existe: **completar lo que falta** (solo campos vacíos; etiquetas solo se añaden). Nunca se toca la baja de publicidad.
- Etiquetas: lista propia por cuenta, creadas al vuelo, sin colores, 0..20 por contacto. Sirven para **segmentar campañas**.
- Varias etiquetas en un filtro: **alguna de ellas** (`$in`).
- Arquitectura: **opción A** — el navegador lee y empareja, el backend valida en una vista previa sin escribir y luego importa en tandas con la misma lógica.
- Plantilla `.xlsx` descargable (archivo fijo en `Frontend/public/`), con la columna Teléfono en formato texto.
- Consentimiento obligatorio al importar. Nombre + Apellido se juntan.

## Parte 1 · Etiquetas

**Modelo.** `Tag { userId, name, key }`, único `{ userId, key }`. `key` = nombre en minúsculas, sin tildes, espacios colapsados (`tagKey`, puro). `Contact.tags: [ObjectId]`, índice `{ userId, tags }`. Ids y no texto: renombrar o borrar es una escritura.

**Puro** (`utils/contact.tags.js`): `cleanTagName`, `tagKey`, `splitTagCell` (celda «VIP, Quito; Norte» → nombres únicos por `key`), `TAG_NAME_MAX = 30`, `MAX_TAGS_PER_CONTACT = 20`.

**API.**
- `GET /tags` → `{ tags: [{ id, name, contactCount }] }`, por nombre.
- `POST /tags { name }` → la existente con esa `key` (200) o una nueva (201). Así el selector crea al vuelo sin duplicar.
- `PATCH /tags/:id { name }` → 409 si choca con otra. `DELETE /tags/:id` → la quita de todos (`$pull`) y la borra.
- Contactos: `tagIds: string[]` en `POST`/`PATCH /contacts` (ids de la cuenta; uno ajeno → 400) y en la respuesta. Los nombres los resuelve el front con `GET /tags` (los necesita igual para el filtro y el selector).
- `POST /contacts/tags { selection, add, remove }` → `{ matched, modified, overLimit }`. `selection` = el mismo formato que los destinatarios de una campaña (`ids` o `query` con exclusiones), esquema compartido `contactSelectionSchema`. Un update de pipeline: `(tags − remove) ∪ add`, solo donde el resultado cabe en 20; los que no caben se cuentan en `overLimit`.

**Filtro.** `buildContactMatch({ userId, search, filter, tagIds })` (puro, en `contact.query.js`) arma el `$match` que usa `contactSelectionStages`. `GET /contacts?tags=id,id`; `recipients.query.tagIds` en campañas. La campaña congela la lista al crearse.

## Parte 2 · Importar

**Puro** (`utils/contact.import.js`, tests con los casos malos):
- `normalizeImportPhone(raw, country)` con `libphonenumber-js` → dígitos con código de país o `{ error }` («tiene 6 dígitos», «no es un número»). Acepta `+593…`, `00593…`, `0991…`, espacios, guiones, paréntesis y números que Excel guardó como número.
- `cleanImportRow(row, { country, extraTags })` → `{ phone, name (nombre + apellido), email, company, notes, tagNames, errors, warnings }`. Solo el teléfono es error; email inválido o texto demasiado largo es aviso (se descarta o recorta el campo).
- `planImportRows(rows, existingByPhone)` → por fila `create | update | unchanged | duplicate | error`, con los cambios de cada `update` (solo campos vacíos, etiquetas añadidas). Los repetidos en el archivo se juntan: gana el primer valor no vacío.

**API.**
- `POST /contacts/import/preview { rows, country, extraTagNames }` — todas las filas (≤ 10 000), límite JSON propio de 3 MB. No escribe. Devuelve conteos, errores y avisos por fila (número de fila del Excel), cuántos existentes están de baja de publicidad y una muestra.
- `POST /contacts/import { rows, country, extraTagNames, consent: true }` — tandas de ≤ 500. Crea las etiquetas que falten, carga los existentes con un `$in`, aplica el plan con `bulkWrite` (`ordered: false`); un E11000 (un webhook creó el número a la vez) se reintenta como completar. Devuelve conteos y los `contactIds` de la tanda (para «Crear campaña con estos»).
- `Contact.source` gana `'import'`.

**Front.** `papaparse` (CSV, detecta `;`, relee en Windows-1252 si el UTF-8 no es válido) y `read-excel-file` (.xlsx, hoja «Contactos» o la primera), cargados con `import()` solo en la página de importar. `guessColumnMapping` por sinónimos. Descarga de las filas con error en CSV, con `'` delante de las celdas que empiezan por `= + - @`.

**Límite conocido.** Un contacto que solo tiene BSUID no se reconoce por teléfono: se crea otro.

## Orden

1. Etiquetas, backend (modelo, API, filtro, campañas, tests).
2. Importar, backend (normalización, plan, endpoints, fixtures, tests).
3. UI de ambas, cuando llegue el diseño.
