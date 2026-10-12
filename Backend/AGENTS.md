# Backend

Para cualquier agente que trabaje en `Backend/`. Las reglas generales y el mapa de toda la documentación están en el [AGENTS.md de la raíz](../AGENTS.md).

### Backend (`Backend/src/`)

Express 5 app. Entry: `index.js` → `app.js`. Patrón: `routes/` → `controllers/` → `models/` (Mongoose). Cuerpos de request validados con **Zod** via `middlewares/validator.middleware.js` — los errores se devuelven como array de `issues` con status 400. Rutas protegidas usan `middlewares/validate.token.middleware.js` (`authRequired`), que lee un JWT de una cookie httpOnly llamada `token`.

**Configuración (`.env` en `Backend/`, cargado con `dotenv`):** `MONGO_URI`, `TOKEN_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`, `META_GRAPH_VERSION`. `config.js` y `db.js` leen de `process.env` — ya **no** hay secretos hardcodeados. `.env` está en `.gitignore`.

**MongoDB:** conecta a `process.env.MONGO_URI` (por defecto `mongodb://127.0.0.1:27017/wasmish`).

## Reglas del backend

- **Una ruta nueva** sigue `routes/` → `controllers/` → `models/`, con el cuerpo validado por un esquema Zod (`validateSchema`) y los errores como array `[{ message }]`.
- **Propiedad:** el controlador busca con la cuenta de la sesión (`{ _id, userId: req.auth.accountId }`) y responde 404 si no es suya. `authRequired` y `validateApiKey` dejan `req.auth` ([api.md § Autenticación](../docs/arquitectura/api.md#autenticación--dos-vías)); `req.user` ya no existe. La conexión de WhatsApp la guarda el owner de la cuenta (`findAccountOwner`, solo para conectar) hasta la Fase 2c; **para enviar**, `findSendingLine` / `findConversationLine` (`services/line.service.js`), y lo que entra, `findInboundLine`. Su caso va en `tests/isolation/` (cómo: [pruebas-y-scripts.md § Tests de aislamiento](../docs/arquitectura/pruebas-y-scripts.md#tests-de-aislamiento)).
- **Lo que no sabe de HTTP** va en `utils/` (puro, con test en `tests/`) o en `services/` (con BD). Los controladores no repiten esa lógica.
- **Un solo camino por envío:** `processMessageSending` (texto y archivos) y `processTemplateSending` (plantillas, también las campañas y la API pública). No se escribe otro → [whatsapp-envio.md](../docs/arquitectura/whatsapp-envio.md).
- **A Meta solo se llama desde `libs/whatsapp.js`**, que deja el error de Meta en `err.waErrorCode` / `err.waErrorDetail`. Los tests nunca llaman a Meta.
- **Tiempo real:** `sendToAccount(accountId, evento, datos)`, a todas las pestañas abiertas de la cuenta; los eventos y sus payloads están en [chat.md § Eventos SSE](../docs/arquitectura/chat.md#eventos-sse-y-sus-payloads).
- **Índices únicos** sobre un campo que puede ser `null`: parciales con `$type`, no `sparse` (ver abajo).

## Comandos y tests

**Backend** (Express 5 + MongoDB, port 3001):
```bash
cd Backend && npm run dev      # node --watch (solo src/, package.json y .env)
```

**Tests** (solo Backend, `node:test` nativo):
```bash
cd Backend && npm test         # node --test "tests/*.test.js" — funciones puras
cd Backend && npm run test:watch
cd Backend && npm run test:isolation   # aislamiento entre cuentas, con Mongo en memoria
```
Cubren **funciones puras**, sin BD ni red: `utils/crypto.js`, `utils/message.status.js`, `utils/whatsapp.window.js`, `utils/inbound.message.js`, `utils/media.storage.js`, `utils/contact.identity.js`, `utils/contact.query.js`, `utils/marketing.preference.js`, `utils/campaign.message.js`, `utils/campaign.status.js`, `utils/template.header.js`, `utils/contact.tags.js`, `utils/contact.import.js`, `utils/outbound.media.js` (con las firmas de `utils/file.signature.js`), `utils/whatsapp.line.js`, `utils/account.js`, `utils/line.js` y las de plantillas de `template.controller.js` (`buildButtonComponents`, `renderTemplateBody`). Cada test que corresponde a un bug ya corregido lleva un comentario explicando la regresión que vigila — verificados reintroduciendo el bug a propósito y comprobando que fallan. El Frontend no tiene tests.

Los tests fijan `process.env` **antes** de un `await import(...)` dinámico, porque `crypto.js` y el middleware de firma leen la config al importarse; con un `import` estático la variable llegaría tarde.

Más scripts (webhook simulado, contactos de prueba, backfills, duplicados, versión): [pruebas-y-scripts.md](../docs/arquitectura/pruebas-y-scripts.md).

## Índices de MongoDB

**Índices MongoDB relevantes:**
- `Conversation`: `conversation_line_contact_unique` = `{ userId: 1, lineId: 1, contactId: 1 }` único **parcial** (`contactId` y `lineId` con `$type: 'objectId'`) — una conversación por contacto y línea (Fase 2b); parcial para que las anteriores a los contactos o a las líneas no choquen entre sí. Las que nacen **sin** línea (la reserva, si la proyección falló) las cubre `conversation_contact_number_without_line_unique` = `{ userId: 1, contactId: 1, phoneNumberId: 1 }` parcial con `lineId: { $type: 'null' }`: una por contacto y **número** (con otras claves que el viejo: Mongo no admite dos índices con las mismas). El anterior, `conversation_contact_unique` (`{ userId, contactId }`), lo borra `migrate:lines`. Más `contactId_1` simple, para el `$lookup` de la lista de contactos (que va con `let`/`pipeline` para filtrar también por la cuenta: desde Mongo 5.0 usa el índice). El viejo `userId_1_contactPhone_1` ya **no existe** (lo borra `backfill:contacts`): un contacto puede no tener teléfono.
- `Contact`: `contact_phone_unique` `{ userId, phone }` y `contact_waUserId_unique` `{ userId, waUserId }`, únicos **parciales** por `$type: 'string'` — el mismo motivo que `waMessageId_unico`: los dos campos pueden ser `null`
- `User`: `user_phoneNumberId_unique` (un número, una cuenta; parcial por `$type: 'string'`) y `user_account_owner_unique` `{ accountId: 1 }`, único **parcial** con `{ role: 'owner' }`: un owner por cuenta
- `Waba`: `waba_waBusinessId_unique` (un WABA, una cuenta). `Line`: `line_phoneNumberId_active_unique` `{ phoneNumberId }` único **parcial** con `{ status: 'active' }` (un número activo en una sola cuenta; uno anterior puede quedar desconectado en otra, con su historial) y `line_account_phone_unique` `{ accountId, phoneNumberId }` (una línea por número en la cuenta). En la Fase 2a son una proyección de `User` (`syncLinesFromOwner`, en `services/line.service.js`)
- `Message`: `{ conversationId: 1, timestamp: 1 }`
- `Message`: `campaignId_status` `{ campaignId: 1, status: 1 }`, normal (ni parcial ni sparse, ver el comentario en el modelo) — las estadísticas de una campaña
- `CampaignRecipient`: `{ campaignId, contactId }` único y `{ campaignId, status, _id }` (la cola y los conteos). `Campaign`: `{ userId, createdAt: -1 }` y `{ status, createdAt }` (el worker)
- `Message`: **dos** índices sobre `waMessageId`, y hacen falta los dos. `waMessageId_unico` es único **parcial** (`$type: 'string'`, no `sparse`: los fallidos se guardan con `null` explícito y dos `null` chocarían) — frena el duplicado cuando Meta reintenta un webhook; `procesarEntrante` trata el E11000 como «ya guardado» y sale sin emitir SSE. `waMessageId_busqueda` es el normal: Mongo no usa el parcial para `{ waMessageId: 'wamid.x' }` y cada acuse de recibo haría un escaneo completo.

## Dónde está el detalle

| Tema | Archivo |
|---|---|
| Endpoints, autenticación, rate limiting | [api.md](../docs/arquitectura/api.md) |
| Envíos a Meta, plantillas, archivos, ventana de 24 h | [whatsapp-envio.md](../docs/arquitectura/whatsapp-envio.md) |
| Webhook entrante y adjuntos | [webhook-adjuntos.md](../docs/arquitectura/webhook-adjuntos.md) |
| Contactos, etiquetas, importar | [contactos.md](../docs/arquitectura/contactos.md) |
| Campañas y su worker | [campanas.md](../docs/arquitectura/campanas.md) |
| SSE y no leídos | [chat.md](../docs/arquitectura/chat.md) |
| Probar en local y mantenimiento | [pruebas-y-scripts.md](../docs/arquitectura/pruebas-y-scripts.md) |
