# Notas del contacto con autor — plan de implementación

> En Wasmish los planes se ejecutan **nativos**: rama, PR y revisión cruzada (ver «Planes» en `AGENTS.md`). Los pasos usan casillas (`- [ ]`).

**Objetivo:** que las notas de un contacto sean una lista, cada una con su texto, autor y fecha, que el equipo añade, edita y borra sin pisarse.

**Arquitectura:** colección nueva `ContactNote` con sus rutas bajo `/contacts/:id/notes`; `GET /contacts/:id` devuelve la lista. Las reglas (permisos, forma, importar) van en `utils/contact.notes.js` con su test; la lectura y escritura, en `services/contact.note.service.js`. Cada cambio avisa con `contact_updated` (PR #86). La nota de hoy (`Contact.notes`) pasa a la lista con `migrate:notes` y, mientras tanto, se lee al vuelo.

**Stack:** Express 5 + Mongoose + Zod; `node:test` y los tests de aislamiento (Mongo en memoria). React 19 + React Query.

**Spec:** [docs/superpowers/specs/2026-10-17-notas-contacto-design.md](../specs/2026-10-17-notas-contacto-design.md). **Diseño:** el que devuelva Claude Design con el [brief](../specs/2026-10-17-notas-contacto-brief-ui.md) (PR 2).

**Antes de empezar:** el PR #86 (contactos en tiempo real) unido, porque esto usa `notifyContactChanged`; y la 1.0.26 desplegada, porque entre el PR 1 y el PR 2 `master` no se despliega.

## Restricciones globales

- `ContactNote.userId` es la **cuenta** (`req.auth.accountId`), como en todos los modelos. Ajeno → **404**; sin permiso sobre una nota de la cuenta → **403** `note_not_yours`.
- `text`: recortado, de 1 a **1000** caracteres. Como mucho **500** notas por contacto (**409** `notes_limit`).
- `source`: `'manual' | 'import' | 'legacy'`. Orden de la lista: `createdAt` de la más nueva a la más vieja.
- Editan y borran: el autor (`authorId === auth.userId`) y los roles `owner` y `admin`. Nadie más; la API key nunca.
- `authorName` se copia de `req.auth.name` al escribir; nunca se recalcula.
- `Contact.notes` **no se borra** en esta versión (solo se vacía al borrar su nota `legacy`).
- Cada `POST`, `PATCH` y `DELETE` de notas llama a `notifyContactChanged(accountId, contactId)`.
- Textos de error en español: «Las notas cambiaron: recarga la página.» (`notes_moved`), «Solo quien la escribió, el owner o un admin pueden cambiar esta nota.» (`note_not_yours`), «Este contacto ya tiene 500 notas.» (`notes_limit`).
- Comentarios, commits, PRs y textos en español; identificadores nuevos en inglés.

## Lo que más puede fallar sin que un test lo vea

1. **Borrar la nota `legacy` antes o después de migrar:** si `Contact.notes` sigue con texto, la lectura al vuelo la resucita → test en la tarea 2 («borrar la nota de antes no la hace reaparecer»).
2. **El formulario de editar de una pestaña vieja** manda `notes` siempre, sin tocarlas: no puede dejar de guardar el nombre o el email → test en la tarea 2 («PATCH con `notes` igual a la de hoy guarda el resto; con otro texto, 400 y nada guardado»).
3. **Una nota solo con espacios o saltos de línea:** 400, no una nota vacía → test en la tarea 2.
4. **Borrar un contacto sin conversación** deja sus notas huérfanas → test en la tarea 2.
5. **Un archivo con el mismo teléfono en dos filas y dos notas distintas:** gana la primera no vacía, como el resto de campos, y no se crean dos → test en la tarea 3.

---

## PR 1 · Backend (rama `notas-con-autor-backend`, desde `master` con el plan unido)

### Tarea 1: Las reglas de las notas (funciones puras)

**Archivos:**
- Crear: `Backend/src/utils/contact.notes.js`
- Test: `Backend/tests/contact.notes.test.js`

**Interfaces:**
- Produce: `NOTE_TEXT_MAX = 1000`, `NOTES_PER_CONTACT_MAX = 500`, `NOTE_SOURCES = ['manual', 'import', 'legacy']`.
- Produce: `canEditNote(auth, note)` → boolean. `note` con `authorId` (ObjectId, string o `null`) y `id`. `false` siempre para `id === 'legacy'` (la nota leída al vuelo) y para un `auth` sin `userId`.
- Produce: `serializeNote(note, auth)` → `{ id, text, author: { id, name } | null, source, createdAt, editedAt, canEdit }` (fechas ISO; `author` `null` si no hay `authorId`).
- Produce: `cleanNoteText(text)` → el texto recortado, o `null` si queda vacío o pasa de `NOTE_TEXT_MAX`.
- Produce: `pickImportNote(text, existingTexts)` → texto recortado o `null` (vacío, o ya existe uno igual comparando recortado y en minúsculas).
- Produce: `legacyNoteFrom(contact)` → la nota virtual `{ id: 'legacy', text, authorId: null, authorName: null, source: 'legacy', createdAt: contact.createdAt, editedAt: null }`, o `null` si `contact.notes` recortado está vacío.

- [ ] **Paso 1: Tests que fallan:**
  - `canEditNote`: el autor (agente) → `true`; otro agente → `false`; `supervisor` no autor → `false`; `owner` y `admin` no autores → `true`; nota con `authorId: null` y `source: 'legacy'` guardada: `owner` → `true`, agente → `false`; `id: 'legacy'` con `owner` → `false`; `authorId` como ObjectId y `auth.userId` como string iguales → `true`.
  - `serializeNote`: forma exacta con y sin autor; `canEdit` según `auth`.
  - `cleanNoteText`: `'  hola  '` → `'hola'`; `' \n '` → `null`; 1000 caracteres → igual; 1001 → `null`.
  - `pickImportNote`: `''` → `null`; `'Paga a 30 días'` con `['paga a 30 DÍAS ']` → `null`; con `[]` → el texto.
  - `legacyNoteFrom`: `{ notes: '  ' }` → `null`; `{ notes: 'x', createdAt }` → la nota con esa fecha.
- [ ] **Paso 2:** `cd Backend && node --test tests/contact.notes.test.js` → FALLA (no existe el módulo).
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** el mismo comando → PASA; `npm test` en verde.
- [ ] **Paso 5:** commit «Notas del contacto: las reglas (permisos, forma, importar)».

### Tarea 2: Modelo, servicio y rutas de las notas

**Archivos:**
- Crear: `Backend/src/models/contact.note.model.js`, `Backend/src/services/contact.note.service.js`, `Backend/src/controllers/contact.note.controller.js`, `Backend/src/schemas/contact.note.schema.js`
- Modificar: `Backend/src/routes/contact.routes.js`; `Backend/src/controllers/contact.controller.js` (`getContact`, `createContact`, `updateContact`, `deleteContact`, `serializeContact`, exportar `findOwnedContact`); `Backend/src/utils/contact.query.js` (`EDITABLE_FIELDS` sin `notes`)
- Modificar: `Backend/tests/isolation/helpers.js` (exportar `ContactNote`); `Backend/tests/contact.query.test.js` (`pickContactFields` ya no devuelve `notes`)
- Test: `Backend/tests/isolation/contact-notes.test.js`
- Docs: `docs/arquitectura/contactos.md` (sección nueva «Notas del contacto»), `docs/arquitectura/api.md` (rutas), `Backend/AGENTS.md` (índices)

**Interfaces:**
- Consume: tarea 1; `notifyContactChanged(accountId, contactId)` de `contact.controller.js` (PR #86).
- Produce: modelo `ContactNote` con los campos del spec § 3, `timestamps: { createdAt: true, updatedAt: false }` y `editedAt` aparte; índices `contact_notes_list` `{ userId: 1, contactId: 1, createdAt: -1 }` y `contact_note_legacy_unique` `{ contactId: 1 }` único parcial con `{ source: 'legacy' }`.
- Produce: `listContactNotes(contact, auth)` → notas serializadas, con la `legacy` virtual si `legacyNoteFrom(contact)` y no hay ninguna guardada con `source: 'legacy'`.
- Produce: `createContactNote({ accountId, contactId, text, author: { id, name }, source })` → el documento; lanza un error con `statusCode: 409` y `code: 'notes_limit'` si ya hay 500.
- Produce: rutas `POST /contacts/:id/notes`, `PATCH /contacts/:id/notes/:noteId`, `DELETE /contacts/:id/notes/:noteId` (`authRequired`, `validateSchema` con `{ text }` recortado de 1 a 1000; `:noteId` con `objectIdSchema`, así `legacy` da 404).
- Produce: `GET /contacts/:id` con `notes`; `GET /contacts` sin `notes`.

- [ ] **Paso 1: Tests de aislamiento que fallan** en `contact-notes.test.js` (cuentas A y B con `seedAccount`; un agente y un admin de A con `seedMember`):
  - `POST` como agente de A → 201 con `author.name` del agente, `source: 'manual'`, `canEdit: true`; aparece primera en `GET /contacts/:id` de A.
  - B: `GET /contacts/<de A>` 404; `POST`, `PATCH`, `DELETE` sobre un contacto o una nota de A → 404 y nada cambia.
  - La nota de un contacto de A por la URL de **otro** contacto de A → 404.
  - El agente edita la nota del owner → 403 `note_not_yours`; la borra → 403; edita la suya → 200 con `editedAt`; el admin borra la del agente → 204; el supervisor no edita la del agente → 403.
  - `text: '  \n '` → 400; 1001 caracteres → 400.
  - Con 500 notas sembradas, otra → 409 `notes_limit`.
  - **Pestaña vieja:** `PATCH /contacts/:id { name: 'Nuevo', notes: <igual a Contact.notes> }` → 200 y el nombre cambia; `{ name: 'Otro', notes: 'distinta' }` → 400 `notes_moved` y el nombre no cambia.
  - **Nota de antes:** un contacto con `Contact.notes: 'vieja'` y sin notas guardadas → `GET` trae una nota `id: 'legacy'`, sin autor, `canEdit: false`; `PATCH /contacts/:id/notes/legacy` → 400 (id no válido). Con una `legacy` guardada: el owner la borra → 204, `Contact.notes` queda `null` y el `GET` ya no trae ninguna (comentario: «Regresión que vigila: la lectura al vuelo resucitaba la nota borrada»).
  - `POST /contacts { phone, notes: 'primera' }` → la ficha trae esa nota a nombre de quien creó el contacto.
  - `DELETE /contacts/<suelto>` con una nota → 204 y `ContactNote` de ese contacto vacío.
  - Un `POST` de nota llega por SSE (`contact_updated` con el id) al agente de A y no a B (`openStream`).
- [ ] **Paso 2:** `cd Backend && node --test tests/isolation/contact-notes.test.js` → FALLA.
- [ ] **Paso 3: Implementar.** El controlador busca el contacto con `findOwnedContact(accountId, id)` y la nota con `findOne({ _id: noteId, userId: accountId, contactId })`; permisos con `canEditNote`; errores `[{ message, code }]`. `createContact` llama a `createContactNote` si `cleanNoteText(req.body.notes)`. `updateContact`: si `req.body.notes !== undefined` y `(cleanNoteText(req.body.notes) ?? null) !== (cleanNoteText(contact.notes) ?? null)` → 400 `notes_moved` antes de tocar nada. `deleteContact` borra también `ContactNote.deleteMany({ userId, contactId })`. Borrar una nota `source: 'legacy'` hace además `Contact.updateOne({ _id, userId }, { $set: { notes: null } })`.
- [ ] **Paso 4:** el comando del paso 2 → PASA; `npm test` y `npm run test:isolation` en verde.
- [ ] **Paso 5:** documentación: `contactos.md` (la sección nueva, con permisos, `legacy` y la pestaña vieja), `api.md` (las tres rutas y el `notes` de `GET /contacts/:id`), `Backend/AGENTS.md` (los dos índices).
- [ ] **Paso 6:** commit «Notas del contacto: modelo, rutas y permisos».

### Tarea 3: Importar crea notas

**Archivos:**
- Modificar: `Backend/src/utils/contact.import.js` (`cleanImportRow`, `mergeByPhone`, `planImportRows`, `pickImportSample`)
- Modificar: `Backend/src/controllers/contact.import.controller.js` (`loadExistingByPhone`, `importContacts`)
- Test: `Backend/tests/contact.import.test.js` y `Backend/tests/isolation/contacts.test.js`
- Docs: `docs/arquitectura/contactos.md` § Importar

**Interfaces:**
- Consume: `pickImportNote` (tarea 1), `ContactNote` (tarea 2).
- Produce: cada fila limpia y cada entrada del plan llevan `note: string | null` aparte de `fields` (que ya no tiene `notes`). `existingByPhone` lleva `noteTexts: string[]` (los textos de sus `ContactNote` y su `Contact.notes`). En `update`, `note` es `pickImportNote(entry.note, existing.noteTexts)`; `changed` cuenta también la nota. La muestra (`pickImportSample`) devuelve `note` de cada entrada.
- Produce: `importContacts` responde `updated` = contactos modificados por el upsert **o** que recibieron una nota (sin contar dos veces).

- [ ] **Paso 1: Tests puros que fallan** en `contact.import.test.js`:
  - una fila con `notes: ' Paga a 30 '` → `note: 'Paga a 30'` y `fields` sin `notes`; con más de 1000 → recortada y aviso (como hoy).
  - dos filas del mismo teléfono con notas `'A'` y `'B'` → `note: 'A'`.
  - existente con `noteTexts: ['a']` y fila `'A '` → `note: null` y `action: 'unchanged'`; con `noteTexts: []` → `note: 'A'` y `action: 'update'`.
- [ ] **Paso 2: Test de aislamiento que falla** en `isolation/contacts.test.js`: `POST /contacts/import` dos veces con la misma fila con nota → una sola `ContactNote` con `source: 'import'` y `authorName` de quien importa; el segundo resumen dice `unchanged: 1`.
- [ ] **Paso 3:** `node --test tests/contact.import.test.js && node --test tests/isolation/contacts.test.js` → FALLA.
- [ ] **Paso 4:** implementar. Las notas se crean con `ContactNote.insertMany` después de los upserts, con el `_id` de cada contacto por su teléfono (la consulta del final ya existe: añadirle `phone`).
- [ ] **Paso 5:** el comando del paso 3 → PASA; `npm test` y `npm run test:isolation` en verde.
- [ ] **Paso 6:** `contactos.md` § Importar: la nota ya no «se rellena si está vacía», crea una nota.
- [ ] **Paso 7:** commit «Importar: la columna Notas crea una nota firmada, sin repetir».

### Tarea 4: `migrate:notes`

**Archivos:**
- Crear: `Backend/src/services/note.migration.service.js`, `Backend/scripts/migrate-notes.js`
- Modificar: `Backend/package.json` (`"migrate:notes": "node scripts/migrate-notes.js"`)
- Test: `Backend/tests/isolation/migrate-notes.test.js`
- Docs: `docs/arquitectura/pruebas-y-scripts.md` (sección del script, como `migrate:lines`)

**Interfaces:**
- Produce: `runNoteMigration({ dryRun = false })` → `{ pending, migrated }`: `pending`, los contactos con `notes` no vacío sin nota `legacy` antes de empezar; `migrated`, las que creó. Cada una con `ContactNote.updateOne({ contactId, source: 'legacy' }, { $setOnInsert: { userId, text, authorId: null, authorName: null, createdAt: contact.createdAt, editedAt: null } }, { upsert: true })`. Usa `cleanNoteText` (más de 1000: se guarda recortada a 1000).
- Produce: el script con `--dry-run` y `--check` (sale con 1 si `pending > 0`), con la cabecera y el mismo manejo de `MONGO_URI` que `migrate-lines.js`.

- [ ] **Paso 1: Tests que fallan:** tres contactos (con nota, con `'  '`, sin nota) → `migrated: 1`; segunda pasada → `pending: 0, migrated: 0`; dos pasadas a la vez (`Promise.all`) → una sola `legacy`; `dryRun` no escribe; la nota creada no tiene autor y su `createdAt` es el del contacto.
- [ ] **Paso 2:** `node --test tests/isolation/migrate-notes.test.js` → FALLA.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** → PASA; `npm run test:isolation` en verde.
- [ ] **Paso 5:** `pruebas-y-scripts.md`; `docs/estado.md` → «En curso» (backend unido; `master` no se despliega hasta el PR 2).
- [ ] **Paso 6:** commit «Notas del contacto: migrate:notes».

**Al terminar el PR 1:** PR, CI, revisión de Codex, respuesta punto por punto; Jonathan lo une.

---

## PR 2 · Frontend (rama `notas-con-autor-frontend`, desde `master` con el backend unido y el diseño en `Design/`)

Los nombres de los componentes y los textos los fija el diseño de Claude Design; lo de abajo es lo que no depende de él.

### Tarea 5: Datos y mutaciones

**Archivos:**
- Modificar: `Frontend/src/models/contact.model.ts` (`ContactDetail.notes: ContactNote[]`; tipo `ContactNote` con la forma de la tarea 1; `ContactInput.notes` solo para crear), `Frontend/src/services/api.service.ts` (`createContactNoteService`, `updateContactNoteService`, `deleteContactNoteService`), `Frontend/src/hooks/useContacts.ts` (`useContactNoteMutations(contactId)`; quitar `saveNotes`)

**Interfaces:**
- Produce: `useContactNoteMutations(contactId)` → `{ add, edit, remove }` (React Query). `add` es optimista: inserta arriba una nota temporal (`id: 'temp-…'`, autor = la persona de la sesión) y la cambia por la del servidor; si falla, la nota temporal queda marcada como fallida con su texto para «Reintentar». `edit` y `remove` invalidan `['contacts', 'detail', contactId]` al terminar; `remove` revierte si falla.
- Produce: `noteErrorText(error)` en `Frontend/src/utils/contactNotes.ts`: el mensaje del backend para `note_not_yours`, `notes_limit` y `notes_moved`, y «No se pudo guardar. Revisa la conexión.» si no hubo respuesta.

- [ ] **Paso 1:** tipos, servicios y hook; `npm run lint` y `npm run build` (los usos de `contact.notes` como texto fallan en `tsc`: se arreglan en la tarea 6).
- [ ] **Paso 2:** commit junto con la tarea 6 (sin ella no compila).

### Tarea 6: La lista de notas en la ficha y en Contactos

**Archivos:**
- Crear: el componente de la lista (en `Frontend/src/components/Contact/`, compartido por los dos sitios), con el diseño.
- Modificar: `Frontend/src/components/Chat/ContactSidebar/ContactSidebar.tsx` (sustituye `ContactNotes`), `Frontend/src/pages/private/Contacts/ContactPanel.tsx` (quita la fila «Notas» de «Datos» y monta la lista)
- Borrar: `Frontend/src/components/Chat/ContactSidebar/ContactNotes.tsx` y `Frontend/src/hooks/useAutosave.ts` (solo lo usaba `ContactNotes`)

**Interfaces:**
- Consume: `useContactNoteMutations` (tarea 5); `notes` de `useLiveContact` / `useContact`.

- [ ] **Paso 1:** implementar siguiendo el diseño. Lo que tiene que cumplir pase lo que pase (spec § 7): lo escrito nunca se pierde si falla; lo que llega por `contact_updated` no cierra una nota que se está escribiendo o editando (el borrador vive en el estado del componente, no en la query); sin «Editar» ni «Borrar» si `canEdit` es `false`; borrar con `ConfirmDialog`.
- [ ] **Paso 2:** `npm run lint` y `npm run build` en verde.
- [ ] **Paso 3: Navegador**, con el método de [pruebas-y-scripts.md § Probar la UI en el navegador](../../arquitectura/pruebas-y-scripts.md#probar-la-ui-en-el-navegador) y un backend aparte con base desechable: owner y agente a la vez; añadir, editar, borrar; lo de una sesión aparece en la otra; el agente no ve «Editar» en la nota del owner; un fallo de red al añadir conserva el texto; la nota `legacy` (sembrada en `Contact.notes`) antes y después de `migrate:notes`; celular emulado.
- [ ] **Paso 4:** commit «Notas del contacto: la lista en la ficha y en Contactos».

### Tarea 7: Formulario, importar y documentación

**Archivos:**
- Modificar: `Frontend/src/pages/private/Contacts/ContactForm.tsx` (el campo «Notas» solo al crear), `Frontend/src/utils/contactImport.ts` (`sampleNote`: «Se le añade una nota.» si la entrada trae `note`), `Frontend/src/models/contactImport.model.ts` (`note` en la muestra; `notes` fuera de `ImportContactFields`)
- Docs: `docs/arquitectura/chat.md` (la ficha: la lista en lugar del cuadro; quitar lo de «dos personas en la ficha» del PR #86, que ya no aplica), `docs/arquitectura/contactos.md` (la UI), `docs/estado.md`

- [ ] **Paso 1:** implementar; `npm run lint` y `npm run build`.
- [ ] **Paso 2: Navegador:** crear un contacto con nota (sale a nombre de quien lo crea); editar un contacto no muestra «Notas»; importar un archivo con nota a un contacto existente dice «Se le añade una nota.».
- [ ] **Paso 3:** documentación y commit «Notas del contacto: formulario, importar y documentación».

**Al terminar el PR 2:** PR, CI, revisión de Codex, respuesta; Jonathan lo une.

---

## Después de los dos PRs (con Jonathan)

- PR de versión (`version-1.0.X`) con `estado.md` al día.
- Desplegar con `/deploy`: `mongodump` → reconstruir y arrancar `wasmish-api` y `wasmish-web` → `npm run migrate:notes` con la imagen nueva → `migrate:notes -- --check` sale con 0. Sin parar la API.
- Probar en producción con la cuenta de prueba y dos personas.
