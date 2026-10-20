# Mensajes eliminados y editados (coexistencia)

Fecha: 2026-10-19. Diseño acordado con Jonathan en una sesión de Claude (preguntas y respuestas en § 9) y corregido tras la revisión de Codex (§ 10). La burbuja la implementa el agente con la skill de marca y los patrones del chat, sin pasar por Claude Design (decisión de Jonathan, § 9).

## 1. Qué problema resuelve

En una línea con coexistencia, cuando el contacto **borra** un mensaje, Wasmish muestra una burbuja nueva «Mensaje no compatible» (visto el 2026-10-19 en una conversación real). Meta avisa del borrado con un webhook `messages` de `type: "revoke"`; `describeInboundMessage` no conoce ese tipo, cae en el `default` y lo guarda como un entrante más: suma un no leído, manda un aviso push, mueve la ventana de 24 h y puede despertar al bot. Con una **edición** (`type: "edit"`) pasa lo mismo.

Los ecos (lo que el negocio borra o edita desde la app de WhatsApp Business) ya los ignora `ECHO_IGNORED_TYPES`: el spec de la coexistencia los dejó para otra versión (§ 2 y § 10 de [2026-10-16-coexistencia-design.md](2026-10-16-coexistencia-design.md)). Ignorarlos tampoco es lo correcto: el chat de Wasmish enseña algo que el contacto ya no ve.

## 2. Qué se construye

1. **Un mensaje borrado** (por el contacto o por el negocio desde la app) se ve en su sitio como «Mensaje eliminado», con un **ojito**: al pulsarlo se ve lo que decía (texto o archivo).
2. **Un mensaje editado** muestra el contenido nuevo con la marca «Editado»; el ojito despliega las versiones anteriores, cada una con su hora.
3. Ninguno de los dos crea una burbuja nueva, suma no leídos, avisa por push, toca la ventana de 24 h, despierta al bot ni pausa al bot (`markHumanReply`).

**Fuera de alcance:** los «Mensaje no compatible» que ya se guardaron por un borrado o una edición se quedan como están (no guardamos su `original_message_id`, no se pueden vincular). Desde el despliegue no nacen más.

**Limitación aceptada** (§ 9): un borrado o una edición que llega **antes** que su mensaje original (por ejemplo, el contacto borra una foto en el medio segundo que tarda en descargarse) se descarta con un aviso en el log, y el original queda visible sin la marca.

## 3. Lo que dice Meta (fuentes oficiales)

Revisado el 2026-10-19 en la documentación de Meta para desarrolladores: las referencias de los webhooks [`revoke`](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/revoke/), [`edit`](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/edit/), [`unsupported`](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/unsupported/) y [`smb_message_echoes`](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_message_echoes). Vueltas a abrir el 2026-10-20, antes del plan (en la revisión de Codex, Meta había respondido 429): las formas de abajo cuadran.

- **Solo con la coexistencia:** los dos webhooks «are only available to WhatsApp Business app users (aka "Coexistence")». Una línea sin coexistencia no los recibe.
- **Borrado (entrante):** campo `messages`, `type: "revoke"`, con su propio `id` (el del evento) y `revoke: { original_message_id }`. Se puede borrar hasta dos días después de enviar.
- **Edición (entrante):** `type: "edit"`, con `edit: { original_message_id, message }`, donde `message` es un mensaje completo (`type`, `text` o `image` con `caption`, `id`, `mime_type`…). Solo se editan **textos y pies de archivo**, en los **15 minutos** siguientes al envío.
- **Ecos:** la misma forma dentro de `smb_message_echoes` (`type: "revoke"` con `revoke.original_message_id`; `type: "edit"` con `edit.original_message_id` y `edit.message`), con el destinatario en `to` / `to_user_id`.
- Sin coexistencia, la página de `unsupported` lista `edit` como subtipo posible de un `type: "unsupported"` (código 131051). No trae `original_message_id`: ese caso sigue cayendo en «Mensaje no compatible», como hoy.
- El `timestamp` es la hora en que Meta disparó el webhook, no la del mensaje original.
- En el ejemplo de Meta, `edit.message` trae `context: { id: "M0" }`, sin explicar. No es una respuesta citada: se ignora.

## 4. Cómo funciona

### Leer el cambio (función pura)

`utils/message.change.js` (nuevo, con su test):

- `isMessageChange(messageData)`: `true` si `type` es `revoke` o `edit`, **con cualquier contenido**. Es lo que decide el camino: un cambio **nunca** sigue hacia `describeInboundMessage` ni crea un `Message`, aunque venga mal formado.
- `describeMessageChange(messageData)`: lee un cambio ya identificado. Devuelve `null` si viene mal formado (sin `original_message_id`, o un `edit` cuyo contenido no es válido, abajo) y, si no:

```js
{ kind: 'revoke' | 'edit', waMessageId, originalWaMessageId, timestamp, content }
```

- `content`, solo en `edit`: `{ type, text, caption }` de lo que dice ahora. **Se valida antes** de describirlo, porque `describeInboundMessage` nunca devuelve vacío y convertiría un contenido roto en «Mensaje no compatible», que pisaría el texto bueno:
  - `edit.message.type === 'text'` con `text.body` no vacío → `{ type: 'text', text: body, caption: null }`;
  - `image`, `video` o `document` (los tipos con pie) → `{ type, caption }` con el pie limpio o `null`, y `text` = el pie o la etiqueta del tipo («Imagen»…), con las mismas reglas que al recibir (para eso se reutilizan `ETIQUETAS` y la limpieza de `inbound.message.js`, que sigue siendo el único sitio que conoce las formas de Meta);
  - cualquier otra cosa → el `edit` es mal formado (`null`).
- Al aplicar se exige además que `content.type` sea **el tipo del original** (un texto solo se edita con texto, una foto con una foto): si no, se descarta.
- Un cambio mal formado se descarta con un aviso en el log (`waMessageId`, `type`, sin contenido) y se sale.
- La usan los dos caminos: `procesarEntrante` la llama **lo primero** (antes del `Message.exists` de idempotencia y de `describeInboundMessage`), y `procesarEco` también, así que `revoke` y `edit` salen de `ECHO_IGNORED_TYPES` (que queda vacía y se borra).

### Aplicar el cambio (servicio)

`applyMessageChange({ line, change, direction, identity })` en `services/message.change.service.js`. Busca el original por `waMessageId: change.originalWaMessageId` y **solo lo toca si**:

- su conversación es de **la cuenta y la línea** por la que llega el webhook, con `conversationLineFilter(line)` (que también distingue por `phoneNumberId` cuando `lineId` es `null`): un número que pasó de una cuenta a otra no toca mensajes de la anterior;
- tiene la **misma dirección**: un cambio entrante solo afecta a un mensaje `inbound`, y uno de eco, a un `outbound`;
- la conversación es **del contacto del webhook**, en los dos caminos: en un entrante, quien lo manda (`describeInboundContact`); en un eco, el destinatario (`to` / `to_user_id`, leídos como en `describeEcho`). El contacto se **busca sin crearlo**, por BSUID primero y luego por teléfono, como `resolveContact`; si no existe o no es el de la conversación, se descarta. Un eco sin destinatario se descarta.

Si no encuentra el original (anterior a la conexión, ya borrado de la BD, o el cambio llegó antes que el mensaje: limitación aceptada, § 2), deja un aviso en el log **sin contenido** (`waMessageId`, `kind`) y sale.

**Borrado:** `updateOne({ _id, deletedAt: null }, { $set: { deletedAt: timestamp } })`. Un reintento de Meta no cambia nada. El `text`, el `caption` y el archivo **se conservan**: el ojito los enseña.

**Edición:** solo si el cambio es posterior al último aplicado, la misma regla «solo avanza» que los estados (`resolveStatusTransition`). Con el original leído (`actual`):

1. Si `actual.editedAt` existe y `timestamp <= actual.editedAt`, no se hace nada: es un reintento o una edición vieja que llegó tarde (se pierde de la historia; es aceptable).
2. Si no, un `updateOne` **condicionado a que `editedAt` siga valiendo lo leído** (`{ _id, editedAt: actual.editedAt }`): guarda `{ text: actual.text, caption: actual.caption, editedAt: actual.editedAt ?? actual.timestamp }` al final de `previousVersions` y pone el `text`, el `caption` y el `editedAt` nuevos.
3. Si el `updateOne` no modificó nada (otra entrega de una edición distinta escribió entre la lectura y la escritura), **se relee y se vuelve al paso 1**, con un tope de intentos (3) y un aviso en el log si se agota. Así una edición más nueva nunca se pierde porque su entrega se solapó con la de una más vieja.

Si se editó el pie de una foto **no se vuelve a bajar el archivo**: `mediaFile` no se toca. Una edición de un mensaje ya eliminado se aplica igual (sigue mostrándose como eliminado).

**Lo que NO hace:** crear un `Message`, sumar `unreadCount`, mover `lastInboundAt`, mandar push, crear trabajo del bot ni `markHumanReply` (un borrado desde la app no es una respuesta).

**La bandeja:** si el mensaje cambiado es **el último de la conversación** (el más reciente por `timestamp`), `Conversation.lastMessage` se recalcula **desde el estado final del mensaje**: si tiene `deletedAt`, «Mensaje eliminado» (aunque después llegue una edición); si no, su `text`. `lastMessageAt` no cambia. Se emite `conversation_updated` con `{ id, lastMessage }`. Si no es el último, la bandeja no cambia.

**Tiempo real:** un evento SSE nuevo, `message_updated`, con `{ id, conversationId, text, caption, deletedAt, editedAt, previousVersions }` y `meta = { lineId }` (llega a quien ve esa línea, igual que `message_status`). Solo se emite si el `updateOne` modificó algo.

### Lo que llega al navegador

- **`serializeMessage`** (`chat.controller.js`) es una lista explícita: se le añaden `deletedAt`, `editedAt` (ISO o `null`) y `previousVersions` (con sus `editedAt` en ISO; `[]` si no hay). Lo mismo el payload de `message_updated`, con el mismo formato, para que recargar la página dé exactamente lo que se vio en vivo.
- **`conversation_updated`** pasa a llevar campos opcionales: `{ id, unreadCount?, lastMessage? }`. El handler de `useConversations` copia **solo los que vengan** (hoy pone `unreadCount` siempre, y con `undefined` borraría el contador). Los emisores de hoy siguen mandando `unreadCount` como siempre.
- **`message_updated` se registra en toda la cadena SSE**: `createSSEConnection` (`api.service.ts`) añade sus listeners evento por evento, el provider (`sse.provider.tsx`) tiene su propio registro y despacho, y `SSEEventMap` (`sse.context.ts`) su tipo. Sin los tres, el evento no llega al hook.

### En el chat (frontend)

- **Eliminado** (`deletedAt`): la burbuja dice «Mensaje eliminado» (gris, cursiva, con la hora y el estado como siempre) y un botón con el ojo (lucide `Eye`, con `aria-label`). Al pulsarlo se ve el contenido original como antes (texto, foto, documento…) con la marca «Eliminado», y el botón pasa a `EyeOff` para ocultarlo.
- **Editado** (`editedAt`): el contenido nuevo y «Editado» junto a la hora. El ojo despliega debajo las versiones anteriores, de la más reciente a la más antigua, cada una con su hora.
- Si está eliminado y editado, manda «eliminado»; al pulsar el ojo se ve el último contenido y debajo sus versiones.
- Lo que está abierto es estado local de la burbuja: no se guarda ni se sincroniza entre pestañas.
- `useConversationMessages` aplica `message_updated` en su sitio en todas las páginas de la caché, como `message_status`.
- Colores, tipografía e iconos según la skill de marca; nada de colores sueltos.

### Quién lo ve

Cualquiera que vea la conversación: no hay permiso nuevo. La API pública no expone mensajes y no cambia.

## 5. Datos

`Message` gana tres campos, sin migración (los mensajes de antes quedan sin ellos):

- `deletedAt: Date | null` (default `null`): cuándo avisó Meta del borrado.
- `editedAt: Date | null` (default `null`): la hora de la última edición aplicada.
- `previousVersions: [{ text, caption, editedAt }]` (default `undefined`, como `templateParams`, para no guardar un array vacío en cada mensaje): lo que decía antes de cada edición, en orden de llegada. `editedAt` de cada versión es desde cuándo decía eso (el `timestamp` del mensaje para la primera).

Ningún índice nuevo: la búsqueda por `waMessageId` ya usa `waMessageId_busqueda`.

## 6. Aislamiento y seguridad

- El original se busca con su `waMessageId` **y** se comprueba la cuenta, la línea, la dirección y el contacto (remitente en un entrante, destinatario en un eco). Un `original_message_id` de otra cuenta, otra línea u otro contacto nunca se toca, y no se responde nada distinto: Meta recibe 200 igual.
- Los avisos del log no llevan texto ni teléfonos, como el resto del webhook.
- No hay endpoint nuevo: no hace falta caso en `tests/isolation/` por ruta, pero los casos de otra cuenta, otra línea y otro contacto van en el test del servicio (con Mongo en memoria, § 7).

## 7. Pruebas

- **Función pura** (`tests/message.change.test.js`): `isMessageChange` con `revoke`/`edit` bien y mal formados (siempre `true`) y con un tipo normal (`false`); `describeMessageChange` con `revoke` y `edit` de texto y de foto con y sin pie, entrante y eco; sin `original_message_id`; `edit` sin `message`, con `text` sin `body`, con un tipo sin pie (sticker, audio) o desconocido (todos `null`).
- **Servicio** (Mongo en memoria, junto a los de aislamiento): borrar; editar dos veces (dos versiones); reintento del mismo borrado y de la misma edición (no cambia nada); edición vieja que llega tarde (no pisa); dos ediciones con horas distintas cuya escritura se solapa, **en los dos órdenes** (gana la más nueva); edición con un tipo distinto del original (no se aplica); original de **otra cuenta**, de **otra línea**, de **otra dirección**, de **otro contacto** en un entrante y de **otro destinatario** en un eco (incluido un destinatario solo con BSUID), y eco sin destinatario (no se toca); original inexistente; `lastMessage` solo cambia si era el último, y queda en «Mensaje eliminado» en los dos órdenes (borrado→edición y edición→borrado).
- **Webhook**, en las dos direcciones: un `revoke` y un `edit` (bien y mal formados) no crean `Message`, no suben `unreadCount`, no mueven `lastInboundAt`, no crean trabajo del bot ni llaman a `markHumanReply`.
- **Lista de mensajes:** `GET /api/chats/:id/messages` devuelve `deletedAt`, `editedAt` y `previousVersions` de un mensaje cambiado.
- **`webhook:simulate`** gana `--revoke <wamid>` y `--edit <wamid> "texto"` (entrante y eco) para probar en local sin Meta.
- **Navegador:** la burbuja eliminada, editada y las dos cosas, con el ojo abierto y cerrado; que llegan en vivo por SSE (también la vista previa de la bandeja, con no leídos > 0, que no se pierden) y que tras recargar se ve exactamente lo mismo.

## 8. Orden de trabajo

1. **PR del plan** (primer commit de la rama, revisado por Codex).
2. **PR del backend:** función pura, servicio, los dos caminos del webhook, `serializeMessage`, `message_updated` y `conversation_updated` con `lastMessage`, `webhook:simulate` y sus tests; `webhook-adjuntos.md` y `chat.md` (los eventos).
3. **PR de la UI:** la cadena SSE del evento nuevo, el handler parcial de `conversation_updated`, la burbuja y `chat.md`.

Se despliegan juntos (el backend solo, sin la UI, mostraría el contenido nuevo de una edición pero no la marca, y un borrado no se notaría: no rompe nada, pero no vale la pena separarlos).

## 9. Preguntas y respuestas (2026-10-19)

- **¿Ignorar los borrados o marcarlos?** Marcarlos: «que en Wasmish salga como eliminado y un ojito, que al pulsar se lo pueda ver; y de paso también con los mensajes que se editan».
- **Editados:** el contenido nuevo con «Editado» y el ojito para ver las versiones anteriores.
- **Ecos:** también lo que el negocio borra o edita desde la app, igual.
- **Quién ve el ojito:** quien ve la conversación, sin permiso nuevo.
- **Diseño:** lo hace el agente con la skill de marca y los patrones del chat; Jonathan lo revisa con capturas en el PR.
- **Los «Mensaje no compatible» ya guardados:** se dejan.
- **Un cambio que llega antes que su original** (tras la revisión de Codex): se acepta como limitación, sin guardar cambios pendientes.

**Cabo suelto aceptado:** si el bot tenía pendiente responder a un mensaje que luego se borra o se edita, responde igual (su espera es de segundos).

## 10. Revisión de Codex (2026-10-19) y qué cambió

Codex revisó el spec contra el código (Meta le respondió 429: no pudo contrastar las formas del § 3). Ocho hallazgos, todos comprobados en el código:

1. **(Alta) Los ecos no comprobaban el destinatario:** un eco a A con el `original_message_id` de un saliente a B, en la misma cuenta y línea, habría tocado el de B. → El servicio exige que la conversación sea del destinatario del eco, buscado sin crearlo (§ 4).
2. **(Alta) Un `edit`/`revoke` mal formado volvía al camino de mensaje nuevo** (`null` no distinguía «no es un cambio» de «cambio roto»), y sin `ECHO_IGNORED_TYPES` un eco roto habría pausado al bot. → `isMessageChange` decide el camino y un cambio roto se descarta (§ 4).
3. **Una edición malformada podía pisar el texto con «Mensaje no compatible»**, porque `describeInboundMessage` nunca devuelve vacío. → Validación propia del contenido editado y mismo tipo que el original (§ 4).
4. **Un cambio que llega antes que el original se pierde.** → Jonathan lo acepta como limitación (§ 2 y § 9).
5. **El control de concurrencia perdía la edición más nueva** si su entrega se solapaba con la de una más vieja. → Releer y reevaluar si la escritura condicional falla (§ 4).
6. **`conversation_updated` no actualizaba la vista previa**: el handler solo copia `unreadCount`, y un payload sin él lo dejaría `undefined`. → Campos opcionales y handler parcial (§ 4).
7. **Una edición tras un borrado podía volver a enseñar el texto en la bandeja.** → La vista previa sale del estado final: eliminado manda (§ 4).
8. **Los campos nuevos no llegaban solos al navegador:** `serializeMessage` es una lista explícita y la cadena SSE registra cada evento por su nombre. → Los dos cambios, explícitos (§ 4).
