# Pruebas locales, scripts y versión

Cómo probar sin tocar producción (webhook simulado, contactos de prueba), los tests de aislamiento, los scripts de mantenimiento y el cambio de versión.

> Parte de la documentación de Wasmish: el mapa de todos los temas está en el [AGENTS.md](../../AGENTS.md) de la raíz.
> Las decisiones de producto con fecha están en [decisiones.md](../decisiones.md).

## Contenido

- [Probar el webhook en local](#probar-el-webhook-en-local)
- [Probar las campañas en local](#probar-las-campañas-en-local)
- [Scripts de mantenimiento](#scripts-de-mantenimiento)
- [Versión de la app](#versión-de-la-app)
- [Tests de aislamiento](#tests-de-aislamiento)

---

### Probar el webhook en local

**Probar el webhook en local** — el webhook de Meta es **único por app**: apuntarlo a ngrok deja a los clientes reales sin mensajes entrantes, así que no se toca. En su lugar:
```bash
cd Backend && npm run webhook:simulate -- --list        # tipos disponibles
cd Backend && npm run webhook:simulate -- audio boton   # manda esos dos
cd Backend && npm run webhook:simulate -- --all
cd Backend && npm run webhook:simulate -- --clean       # borra la conversación de prueba
cd Backend && npm run webhook:simulate -- baja-marketing  # aviso de baja de publicidad (alta-marketing para volver)
cd Backend && npm run webhook:simulate -- cambio-numero --new-from 593000000001   # cambia de número y de BSUID
```
`scripts/simulate-webhook.js` firma el payload con `META_APP_SECRET` igual que Meta y se lo manda al backend local (que tiene que estar levantado). Como el SSE dispara igual, los mensajes **aparecen en vivo** en el chat del navegador. Las muestras de cada tipo están escritas a mano desde la documentación de Meta: si alguna no cuadra con la realidad, se corrige ahí **y** en `utils/inbound.message.js`.

### Probar las campañas en local

**Probar las campañas en local** — contactos de prueba con todos los casos (sin nombre, solo nombre de WhatsApp, sin teléfono, sin empresa, de baja, con ventana abierta o cerrada, sin conversación) y con etiquetas (VIP, ESTÁNDAR, Quito, Guayaquil, Cuenca, Mayorista…: ninguna, una, varias, y el número 7 con las 10):
```bash
cd Backend && npm run seed:contacts                 # crea 60 (o completa los que falten)
cd Backend && npm run seed:contacts -- --count 300
cd Backend && npm run seed:contacts -- --acks       # simula leídos, entregados y fallidos de las campañas a ellos
cd Backend && npm run seed:contacts -- --clean      # borra contactos, conversaciones, mensajes y campañas de prueba, y las etiquetas que queden sin usar
```
`scripts/seed-test-contacts.js` los reconoce por el teléfono `59300099xxxx` o el BSUID `EC.SEED.xxxx`, así que `--clean` nunca toca uno real, y **se niega a correr si `MONGO_URI` no es local** o si la BD conserva el índice viejo `userId_1_contactPhone_1` (con él, el envío a los contactos sin teléfono falla con E11000; se borra con `npm run backfill:contacts`). Con `CAMPAIGN_DRY_RUN` los mensajes se quedan en «Enviado» porque Meta no contesta: `--acks` manda los acuses por el webhook local, firmados como Meta, y el detalle del envío se mueve en vivo. Para elegirlos todos en Contactos, buscar `59300099`.

### Scripts de mantenimiento

**Scripts de mantenimiento** (Backend, se conectan a `MONGO_URI`):
```bash
cd Backend && npm run backfill:window -- --dry-run   # informa, no escribe
cd Backend && npm run backfill:window                # aplica
cd Backend && npm run check:duplicates               # informa duplicados por waMessageId
cd Backend && npm run check:duplicates -- --fix      # borra las copias, conserva la más antigua
cd Backend && npm run backfill:contacts -- --dry-run # informa, no escribe
cd Backend && npm run backfill:contacts              # aplica
```
`scripts/backfill-contacts.js` crea un `Contact` por cada conversación anterior a los contactos, la enlaza (`contactId`) y pasa su `contactName` al contacto; al final borra el índice viejo `userId_1_contactPhone_1`. Idempotente (solo toca las conversaciones sin `contactId`). **Ya corrido en producción** el 2026-10-01: 453 contactos, ninguna conversación sin enlazar.

`scripts/backfill-last-inbound.js` rellena `Conversation.lastInboundAt` en las conversaciones anteriores al campo, tomando el último `Message` entrante de cada una. Es idempotente y solo escribe si el valor falta o es más viejo, así que nunca pisa lo que el webhook haya puesto mientras corría.

`scripts/check-duplicate-messages.js` busca `Message` que compartan `waMessageId`. Hay que correrlo **antes de desplegar** en una BD que pueda traer duplicados: si los hay, Mongo no puede crear el índice único (E11000), Mongoose solo lo loguea y la app arranca **sin** la protección.

### Versión de la app

**Versión de la app** — se cambia en **un solo sitio**:
```bash
cd Backend && npm run version:bump 1.0.4    # o patch | minor | major
```
Escribe el campo `version` de los **dos** `package.json` a la vez (los lee y valida antes de tocar ninguno, para no dejarlos desparejados). De ahí sale todo lo demás y **no hay que tocar nada más**: `vite.config.ts` inyecta `pkg.version` como `__APP_VERSION__` al compilar y `src/config/version.ts` solo lo reexporta (nunca escribir un literal ahí); el Backend lee su propio `package.json` al arrancar (`APP_VERSION` en `config.js`) y lo publica en `GET /api/version`, que sirve para comprobar qué código corre en producción: `curl https://wasmish.solventyc.com/api/version`. La versión se ve en el pie del sidebar.

No se usa un archivo `VERSION` en la raíz del repo a propósito: el deploy sube `Backend/` y `Frontend/` por separado con `tar`, así que un archivo de la raíz nunca llegaría al servidor.

### Tests de aislamiento

**Tests de aislamiento** (`tests/isolation/`, 2026-10-11): que una cuenta no vea ni toque lo de otra, que hasta ahora dependía solo de que cada consulta llevara su `userId`. Levantan la app de verdad (`app.js`, sin `index.js`: sin worker ni puerto fijo) contra un **Mongo en memoria** (`mongodb-memory-server`, única dependencia de desarrollo) de la **misma versión que producción**, fijada en `config.mongodbMemoryServer.version` del `package.json` (8.0.28; si se actualiza el Mongo del servidor, cambiarla ahí). La primera vez descarga el binario a `~/.cache/mongodb-binaries`. `helpers.js` crea dos cuentas, A y B, con uno de cada cosa marcado `SECRETO-<cuenta>`, y cada test hace que B pida lo de A con tres comprobaciones: **404** (no 403), **la BD sin cambios** (un 404 después de escribir también pasaría el código) y un **control** en el que A sí llega con su propio id (sin él, una URL mal escrita también daría 404). `assertNoLeak` busca la marca, el teléfono y los ids de A en el texto de la respuesta. Cubren chat (lista, mensajes, texto, plantilla, archivo, `/media`), contactos y etiquetas (también los ids que llegan en el cuerpo: `tagIds`, selecciones, `add`), campañas (detalle, pausar/reanudar/cancelar, vista previa y creación con contactos, plantilla o cabecera ajenos), plantillas y sus archivos, API keys y el admin. Fuera: el webhook (su aislamiento va por `phoneNumberId`), la API pública `/v1` (llega a Meta) y el SSE. Nada llega a Meta: A no tiene WhatsApp conectado y la ventana de su conversación está cerrada, así que sus controles se frenan en el 409. Verificados quitando el filtro por cuenta en 10 sitios, uno a uno: todos fallan. Con `NODE_ENV=test`, `app.js` no monta `morgan`. **Un endpoint nuevo con `:id`, o que reciba ids en el cuerpo, lleva su caso aquí.**
