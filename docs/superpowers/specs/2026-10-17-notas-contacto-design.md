# Notas del contacto con autor

Fecha: 2026-10-17. Diseño acordado con Jonathan en una sesión de Claude (preguntas y respuestas en § 9). La interfaz la diseña Claude Design a partir de [2026-10-17-notas-contacto-brief-ui.md](2026-10-17-notas-contacto-brief-ui.md). Es la Parte 2 de lo que Jonathan vio probando el equipo; la Parte 1, el tiempo real de contactos y etiquetas, es el PR #86.

## 1. Qué problema resuelve

Probando el equipo (un owner y dos agentes en la cuenta de prueba), Jonathan vio que:

- la nota que un agente escribe a un contacto no se sabe **quién** la escribió ni **cuándo**;
- las notas son **un solo texto** que se guarda solo mientras se escribe: si dos personas lo cambian, gana la última y la otra pierde lo suyo sin enterarse.

Wasmish vende como primer beneficio que «el equipo sabe qué se habló», y el plan que se ofrece incluye 3 usuarios. Las notas tienen que funcionar con varias personas.

## 2. Qué se construye

1. **Las notas pasan a ser una lista.** Cada nota tiene su texto, quién la escribió y cuándo, y si se editó. Se añaden sin tocar las de los demás.
2. **Editar y borrar:** cada persona, las suyas; **owner y admin, cualquiera** (por ejemplo, las de alguien que ya no está).
3. **La nota de hoy** de cada contacto pasa a ser la primera de su lista, **sin autor** (no se sabe quién la escribió).
4. **Importar:** la columna «Notas» crea una nota nueva, a nombre de quien importa y marcada como importada, salvo que el contacto ya tenga una con ese mismo texto.
5. **Formulario de Contactos:** «Notas» queda **solo al crear** (es la primera nota, a nombre de quien crea el contacto). Al editar desaparece: las notas se gestionan en la lista.
6. **En vivo:** cada cambio de una nota avisa con `contact_updated` (Parte 1), y las otras pantallas lo ven sin recargar.

**Fuera de alcance:** notas dentro del hilo del chat (notas internas por conversación), menciones (@Ana), adjuntos en las notas, buscar contactos por el texto de sus notas y exponer las notas en la API pública (hoy no tiene endpoints de contactos).

## 3. Datos

Colección nueva **`ContactNote`** (`models/contact.note.model.js`):

| Campo | Qué guarda |
|---|---|
| `userId` | La **cuenta**, como en todos los modelos (regla 1). |
| `contactId` | El contacto. |
| `text` | De 1 a 1000 caracteres, recortado (el límite de hoy). |
| `authorId` | La persona que la escribió (`User._id`); `null` en la nota que venía de antes. |
| `authorName` | Su nombre, **copiado al escribirla**, como `Message.sentByName`: la nota sigue diciendo quién la escribió aunque esa persona ya no esté. `null` sin autor. |
| `source` | `'manual'` (escrita en Wasmish, también la del formulario al crear), `'import'` o `'legacy'` (la nota que el contacto tenía antes de esta versión). |
| `createdAt` | Cuándo se escribió. En la `legacy`, la fecha de creación del contacto (la de la nota no se sabe). |
| `editedAt` | Cuándo se editó por última vez; `null` si nunca. |

Índices: `{ userId: 1, contactId: 1, createdAt: -1 }` (la lista de un contacto) y uno **único parcial** `{ contactId: 1 }` con `{ source: 'legacy' }`, para que la migración no cree dos notas `legacy` del mismo contacto aunque se corra dos veces a la vez.

**Por qué una colección y no una lista dentro del contacto:** dos personas que escriben a la vez nunca se pisan, editar o borrar toca un solo documento, el contacto no crece sin límite y no hay que transformar en el sitio un campo que hoy es texto (durante el despliegue convivirían las dos formas). Ver § 9.

`Contact.notes` (el texto de hoy) **no se borra en esta versión**: si hubiera que volver a la anterior, sus notas siguen ahí. Se deja de escribir y de devolver; se borrará en una versión posterior, con su propio paso.

## 4. API

Todas con sesión (`authRequired`); la API key no llega a ellas.

- **`GET /contacts/:id`** devuelve además `notes`, de la más nueva a la más vieja:
  ```
  notes: [{ id, text, author: { id, name } | null, source, createdAt, editedAt, canEdit }]
  ```
  `canEdit` lo calcula el backend (§ 5), para que la interfaz no adivine los permisos. Mientras la migración no haya pasado por ese contacto, si tiene `Contact.notes` y ninguna nota `legacy`, la lista incluye una nota `legacy` **leída al vuelo** de `Contact.notes` (con `id` `legacy` y `canEdit: false`): así la ficha no pierde nada entre que arranca la imagen nueva y termina el script, unos minutos. No se puede editar ni borrar hasta que el script la crea de verdad.
- **`GET /contacts`** (la lista) deja de devolver `notes`: no lo usa nadie y crecería con la lista.
- **`POST /contacts/:id/notes`** `{ text }` → 201 con la nota. A nombre de quien escribe (`req.auth.userId` y su nombre).
- **`PATCH /contacts/:id/notes/:noteId`** `{ text }` → 200 con la nota, `editedAt` al día.
- **`DELETE /contacts/:id/notes/:noteId`** → 204. Borrar la nota `legacy` también vacía `Contact.notes`: si no, la lectura al vuelo la haría reaparecer.
- **`DELETE /contacts/:id`** (un contacto sin conversación) borra también sus notas.
- **Errores:** un contacto o una nota de otra cuenta, o una nota que no es de ese contacto → **404** (regla 1). Editar o borrar una nota sin permiso → **403** `note_not_yours`. Más de **500 notas** en un contacto → **409** `notes_limit` (para que la ficha no crezca sin fin; nadie debería llegar).
- **`POST /contacts`** acepta `notes` (texto) como hoy: si viene, crea la primera nota (`source: 'manual'`) a nombre de quien crea el contacto.
- **`PATCH /contacts/:id`** deja de cambiar `notes`. Es para las pestañas abiertas durante el despliegue: si trae `notes` **igual** a `Contact.notes` (el formulario de editar viejo lo manda siempre, sin tocarlo), se ignora y el resto se guarda; si trae otro texto, **400** «Las notas cambiaron: recarga la página.» (`notes_moved`) y no se guarda nada. El cuadro de notas viejo conserva el texto cuando falla, así que nadie pierde lo escrito, y al recargar ve la lista.
- Cada `POST`, `PATCH` y `DELETE` de notas avisa con **`contact_updated { id }`** (`notifyContactChanged`, Parte 1): la ficha y el panel de Contactos de los demás se vuelven a pedir.

## 5. Reglas (funciones puras con test)

En `utils/contact.notes.js`:

- **`canEditNote(auth, note)`**: `true` si `note.authorId` es `auth.userId`, o si el rol de `auth` es `owner` o `admin`. Una nota sin autor (`legacy`) solo la editan owner y admin. La API key nunca (no llega, pero la regla lo dice).
- **`serializeNote(note, auth)`**: la forma de § 4, con `canEdit`.
- **`cleanNoteText(text)`**: recorta; vacío o de más de 1000 → inválido (el esquema Zod lo comprueba antes; la función, para importar).
- **`pickImportNote(text, existingTexts)`**: la nota del archivo, recortada, o `null` si está vacía o el contacto ya tiene una nota con ese mismo texto (comparando recortado, sin distinguir mayúsculas). Así reimportar el mismo archivo no duplica.

Los permisos van con la regla y no con `requirePermission`: dependen de la nota (de quién es), no solo del rol.

## 6. Importar y formulario

**Importar** (`contact.import.controller.js`, `utils/contact.import.js`):
- `notes` deja de ser un campo que «solo se rellena si está vacío»: sale de `fields` y del merge (`planImportRows`) y pasa a ser `note` de cada fila.
- `buildPlan` lee los textos de las notas que ya tienen esos contactos (una consulta por tanda) y decide con `pickImportNote`.
- `importContacts` crea las notas nuevas (`source: 'import'`, a nombre de quien importa) en un `insertMany` después de los contactos. Un contacto que solo gana una nota cuenta como **actualizado**.
- La muestra de la vista previa lo dice: «Se le añade una nota.» (hoy la nota se ignora en silencio si el contacto ya tenía una).
- `contacts_updated` ya avisa al terminar (Parte 1).

**Formulario de Contactos** (`ContactForm`): al crear, el campo «Notas» se queda (mismo límite); al editar, desaparece.

## 7. Interfaz

La diseña Claude Design con el brief [2026-10-17-notas-contacto-brief-ui.md](2026-10-17-notas-contacto-brief-ui.md). Dos sitios con la misma lista: la tarjeta «Notas» de la ficha del chat (que en el celular es pantalla completa) y el panel de un contacto en Contactos (donde hoy las notas son una fila de «Datos»). Se implementa siguiendo el diseño que devuelva.

Lo que la implementación tiene que cumplir pase lo que pase con el diseño:
- lo que se está escribiendo nunca se pierde: si guardar falla, el texto se queda con «Reintentar» (como hoy);
- una nota recién añadida se ve al momento (optimista), y si falla, se dice en esa nota;
- lo que llega de otra persona (`contact_updated`) no cierra ni borra una nota que se está editando.

## 8. Migración y despliegue

**`npm run migrate:notes`** (`scripts/migrate-notes.js`, como `migrate:lines`):
- Por cada contacto con `notes` no vacío y sin nota `legacy`, crea la nota `legacy` (texto recortado, sin autor, `createdAt` = `Contact.createdAt`). El índice único parcial impide duplicarla.
- `--dry-run`: dice qué haría, sin escribir. `--check`: cuántos contactos faltan por pasar, y sale con 1 si queda alguno (como `migrate:lines`).
- Se puede correr varias veces: la segunda no hace nada.

**Orden al desplegar:** `mongodump` → reconstruir y arrancar `wasmish-api` y `wasmish-web` → `migrate:notes` con la imagen nueva → `migrate:notes -- --check` sale con 0. **Sin parar la API**: entre el arranque y el script, `GET /contacts/:id` lee la nota vieja al vuelo (§ 4). Los índices se crean al arrancar.

**Volver atrás** a la versión anterior: seguro. `Contact.notes` sigue intacto; lo que se escribió con la versión nueva (notas nuevas, ediciones) no se ve en la vieja hasta volver a la nueva.

**Entre el PR del backend y el del frontend, `master` no se despliega** (el frontend de hoy espera `notes` como texto). La versión lleva los dos; `docs/estado.md` lo dice mientras tanto. La 1.0.26 (los arreglos ya unidos) se despliega antes de unir el backend de las notas.

## 9. Preguntas y respuestas (2026-10-17)

- **¿Lista con autor o un texto con «editado por»?** Lista con autor (decisión en `docs/decisiones.md`).
- **¿Quién edita y borra?** El autor las suyas; owner y admin, cualquiera. Una nota editada lo dice.
- **¿Columna «Notas» al importar?** Nota nueva a nombre de quien importa, marcada como importada, sin repetir una con el mismo texto.
- **¿Campo «Notas» del formulario?** Solo al crear.
- **¿La API pública ve las notas?** No aplica: no tiene endpoints de contactos.
- **¿Dónde se guardan?** Colección propia (enfoque A). Se descartaron la lista dentro del contacto (B: transformar el campo en el sitio, ediciones a la vez delicadas, el contacto crece sin fin) y seguir con un texto con historial (C: no da autor por nota).
- **Decidido por Claude, para revisar:** el límite de 500 notas por contacto; el orden de la más nueva a la más vieja; la fecha de la nota `legacy` (la del contacto); que la lista de contactos deje de traer `notes`; el 400 para las pestañas viejas.

## 10. Pruebas

- **Funciones puras:** `canEditNote` (autor, otro agente, owner, admin, supervisor, nota `legacy`), `serializeNote`, `cleanNoteText`, `pickImportNote` (vacía, repetida con otro espaciado o mayúsculas, nueva).
- **Aislamiento** (`tests/isolation/`, endpoints nuevos con `:id` y `:noteId`): B no lee (la ficha no trae notas de A), no crea, edita ni borra notas de A (404); una nota de A no se edita por la URL de otro contacto de A (404); un agente de A no edita ni borra la nota del owner (403) y sí la suya; un admin sí la del agente; cada cambio llega por SSE al equipo de A y no a B.
- **Importar:** dos veces el mismo archivo crea las notas una sola vez; a nombre de quien importa.
- **Migración:** con contactos con y sin nota, dos pasadas crean una sola `legacy` por contacto; `--check` en 0 después; la lectura al vuelo antes de migrar.
- **Navegador:** dos sesiones (owner y agente) contra un backend aparte con una base desechable: añadir, editar y borrar; lo de una se ve en la otra; un agente no ve «Editar» en la nota del owner; el celular.

## 11. Orden de trabajo

1. **Spec, brief y plan** en la rama `notas-con-autor` (su PR, revisado por Codex). Jonathan le pasa el brief a Claude Design.
2. **Backend** con sus tests: modelo, endpoints, reglas, importar, `migrate:notes`, documentación (`contactos.md`, `api.md`, `pruebas-y-scripts.md`).
3. **Frontend**, con el diseño de Claude Design: la lista en la ficha y en Contactos, el formulario, importar. Probado en el navegador.
4. **Versión**, `estado.md` y desplegar con `/deploy`.
