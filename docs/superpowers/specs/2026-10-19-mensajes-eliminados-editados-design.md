# Mensajes eliminados y editados (coexistencia)

Fecha: 2026-10-19. Diseño acordado con Jonathan en una sesión de Claude (preguntas y respuestas en § 9). La burbuja la implementa el agente con la skill de marca y los patrones del chat, sin pasar por Claude Design (decisión de Jonathan, § 9).

## 1. Qué problema resuelve

En una línea con coexistencia, cuando el contacto **borra** un mensaje, Wasmish muestra una burbuja nueva «Mensaje no compatible» (visto el 2026-10-19 en una conversación real). Meta avisa del borrado con un webhook `messages` de `type: "revoke"`; `describeInboundMessage` no conoce ese tipo, cae en el `default` y lo guarda como un entrante más: suma un no leído, manda un aviso push, mueve la ventana de 24 h y puede despertar al bot. Con una **edición** (`type: "edit"`) pasa lo mismo.

Los ecos (lo que el negocio borra o edita desde la app de WhatsApp Business) ya los ignora `ECHO_IGNORED_TYPES`: el spec de la coexistencia los dejó para otra versión (§ 2 y § 10 de [2026-10-16-coexistencia-design.md](2026-10-16-coexistencia-design.md)). Ignorarlos tampoco es lo correcto: el chat de Wasmish enseña algo que el contacto ya no ve.

## 2. Qué se construye

1. **Un mensaje borrado** (por el contacto o por el negocio desde la app) se ve en su sitio como «Mensaje eliminado», con un **ojito**: al pulsarlo se ve lo que decía (texto o archivo).
2. **Un mensaje editado** muestra el contenido nuevo con la marca «Editado»; el ojito despliega las versiones anteriores, cada una con su hora.
3. Ninguno de los dos crea una burbuja nueva, suma no leídos, avisa por push, toca la ventana de 24 h ni despierta al bot.

**Fuera de alcance:** los «Mensaje no compatible» que ya se guardaron por un borrado o una edición se quedan como están (no guardamos su `original_message_id`, no se pueden vincular). Desde el despliegue no nacen más.

## 3. Lo que dice Meta (fuentes oficiales)

Revisado el 2026-10-19 en la documentación de Meta para desarrolladores: las referencias de los webhooks [`revoke`](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/revoke/), [`edit`](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/edit/), [`unsupported`](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/unsupported/) y [`smb_message_echoes`](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_message_echoes).

- **Solo con la coexistencia:** los dos webhooks «are only available to WhatsApp Business app users (aka "Coexistence")». Una línea sin coexistencia no los recibe.
- **Borrado (entrante):** campo `messages`, `type: "revoke"`, con su propio `id` (el del evento) y `revoke: { original_message_id }`. Se puede borrar hasta dos días después de enviar.
- **Edición (entrante):** `type: "edit"`, con `edit: { original_message_id, message }`, donde `message` es un mensaje completo (`type`, `text` o `image` con `caption`, `id`, `mime_type`…). Solo se editan **textos y pies de archivo**, en los **15 minutos** siguientes al envío.
- **Ecos:** la misma forma dentro de `smb_message_echoes` (`type: "revoke"` con `revoke.original_message_id`; `type: "edit"` con `edit.original_message_id` y `edit.message`).
- Sin coexistencia, la página de `unsupported` lista `edit` como subtipo posible de un `type: "unsupported"` (código 131051). No trae `original_message_id`: ese caso sigue cayendo en «Mensaje no compatible», como hoy.
- El `timestamp` es la hora en que Meta disparó el webhook, no la del mensaje original.

## 4. Cómo funciona

### Leer el cambio (función pura)

`describeMessageChange(messageData)` en `utils/message.change.js` (nuevo, con su test). Devuelve `null` si no es un `revoke` ni un `edit` con `original_message_id`, y si no:

```js
{ kind: 'revoke' | 'edit', waMessageId, originalWaMessageId, timestamp, entrante }
```

- `entrante` solo en `edit`: lo que dice ahora, sacado con **`describeInboundMessage(edit.message)`**, que sigue siendo el único sitio que conoce las formas de Meta. De él se usan `text` y `caption` (una foto editada sin pie vuelve a «Imagen» en `text` y `null` en `caption`, como al recibirla).
- Un `edit` cuyo `edit.message` no se puede describir se trata como `null` (se loguea y no se aplica: mejor el texto viejo que uno vacío).
- La usan los dos caminos: `procesarEntrante` la llama **antes** de `describeInboundMessage` (un cambio nunca llega a crear un `Message`), y `procesarEco` también, así que `revoke` y `edit` salen de `ECHO_IGNORED_TYPES` (que queda vacía y se borra).

### Aplicar el cambio (servicio)

`applyMessageChange({ line, change, direction, contact })` en `services/message.change.service.js`. Busca el original por `waMessageId: change.originalWaMessageId` y **solo lo toca si**:

- su conversación es de **la cuenta y la línea** por la que llega el webhook (igual que un acuse: un número que pasó de una cuenta a otra no toca mensajes de la anterior);
- tiene la **misma dirección**: un `revoke` entrante solo afecta a un mensaje `inbound`, y uno de eco, a un `outbound`;
- en un entrante, la conversación es **del contacto que lo manda** (el que resuelve `describeInboundContact`; si el contacto no existe, no se crea: se descarta).

Si no encuentra el original (anterior a la conexión, ya borrado de la BD, o el cambio llegó antes que el mensaje), deja un aviso en el log **sin contenido** (`waMessageId`, `kind`) y sale.

**Borrado:** `updateOne({ _id, deletedAt: null }, { $set: { deletedAt: timestamp } })`. Un reintento de Meta no cambia nada. El `text`, el `caption` y el archivo **se conservan**: el ojito los enseña.

**Edición:** solo si el cambio es posterior al último aplicado, la misma regla «solo avanza» que los estados (`resolveStatusTransition`). Con el original ya leído (`actual`):

1. Si `actual.editedAt` existe y `timestamp <= actual.editedAt`, no se hace nada: es un reintento o una edición vieja que llegó tarde (se pierde de la historia; es aceptable).
2. Si no, un `updateOne` **condicionado a que `editedAt` siga valiendo lo leído** (`{ _id, editedAt: actual.editedAt }`): guarda `{ text: actual.text, caption: actual.caption, editedAt: actual.editedAt ?? actual.timestamp }` al final de `previousVersions` y pone el `text`, el `caption` y el `editedAt` nuevos. Si otra edición ganó entre la lectura y la escritura, no modifica nada y esta se pierde (dos ediciones del mismo mensaje en el mismo instante no ocurren en la práctica).

Si se editó el pie de una foto **no se vuelve a bajar el archivo**: `mediaFile` no se toca. Una edición de un mensaje ya eliminado se aplica igual (sigue mostrándose como eliminado).

**Lo que NO hace:** crear un `Message`, sumar `unreadCount`, mover `lastInboundAt`, mandar push, crear trabajo del bot ni `markHumanReply` (un borrado desde la app no es una respuesta).

**La bandeja:** si el mensaje cambiado es **el último de la conversación** (el más reciente por `timestamp`), `Conversation.lastMessage` pasa a «Mensaje eliminado» o al texto nuevo, y se emite `conversation_updated`. Si no es el último, la bandeja no cambia.

**Tiempo real:** un evento SSE nuevo, `message_updated`, con `{ id, conversationId, text, caption, deletedAt, editedAt, previousVersions }` y `meta = { lineId }` (llega a quien ve esa línea, igual que `message_status`). Solo se emite si el `updateOne` modificó algo.

### En el chat (frontend)

- **Eliminado** (`deletedAt`): la burbuja dice «Mensaje eliminado» (gris, cursiva, con la hora y el estado como siempre) y un botón con el ojo (lucide `Eye`, con `aria-label`). Al pulsarlo se ve el contenido original como antes (texto, foto, documento…) con la marca «Eliminado», y el botón pasa a `EyeOff` para ocultarlo.
- **Editado** (`editedAt`): el contenido nuevo y «Editado» junto a la hora. El ojo despliega debajo las versiones anteriores, de la más reciente a la más antigua, cada una con su hora.
- Si está eliminado y editado, manda «eliminado»; al pulsar el ojo se ve el último contenido y debajo sus versiones.
- Lo que está abierto es estado local de la burbuja: no se guarda ni se sincroniza entre pestañas.
- `useConversationMessages` aplica `message_updated` en su sitio en todas las páginas de la caché, como `message_status`. La bandeja ya escucha `conversation_updated`.
- Colores, tipografía e iconos según la skill de marca; nada de colores sueltos.

### Quién lo ve

Cualquiera que vea la conversación: no hay permiso nuevo. La lista de mensajes (`GET /api/chats/:id/messages`) devuelve los campos nuevos tal cual. La API pública no expone mensajes y no cambia.

## 5. Datos

`Message` gana tres campos, sin migración (los mensajes de antes quedan sin ellos):

- `deletedAt: Date | null` (default `null`): cuándo avisó Meta del borrado.
- `editedAt: Date | null` (default `null`): la hora de la última edición aplicada.
- `previousVersions: [{ text, caption, editedAt }]` (default `undefined`, como `templateParams`, para no guardar un array vacío en cada mensaje): lo que decía antes de cada edición, en orden de llegada. `editedAt` de cada versión es desde cuándo decía eso (el `timestamp` del mensaje para la primera).

Ningún índice nuevo: la búsqueda por `waMessageId` ya usa `waMessageId_busqueda`.

## 6. Aislamiento y seguridad

- El original se busca con su `waMessageId` **y** se comprueba la cuenta, la línea, la dirección y (en entrantes) el contacto. Un `original_message_id` de otra cuenta nunca se toca, y no se responde nada distinto: Meta recibe 200 igual.
- Los avisos del log no llevan texto ni teléfonos, como el resto del webhook.
- No hay endpoint nuevo: no hace falta caso en `tests/isolation/` por ruta, pero los casos de otra cuenta y otra línea van en el test del servicio (con Mongo en memoria, § 7).

## 7. Pruebas

- **Función pura** (`tests/message.change.test.js`): `revoke` y `edit` de texto y de foto con y sin pie, entrante y eco; sin `original_message_id`; `edit` sin `message`; un tipo normal devuelve `null`.
- **Servicio** (Mongo en memoria, junto a los de aislamiento): borrar, editar dos veces (dos versiones), reintento del mismo borrado y de la misma edición (no cambia nada), edición vieja que llega tarde (no pisa), original de **otra cuenta**, de **otra línea**, de **otra dirección** y de **otro contacto** (no se toca), original inexistente, y que `lastMessage` solo cambia si era el último.
- **Webhook:** un `revoke` entrante no crea `Message` ni sube `unreadCount`.
- **`webhook:simulate`** gana `--revoke <wamid>` y `--edit <wamid> "texto"` (entrante y eco) para probar en local sin Meta.
- **Navegador:** la burbuja eliminada, editada y las dos cosas, con el ojo abierto y cerrado, y que llegan en vivo por SSE.

## 8. Orden de trabajo

1. **PR del plan** (primer commit de la rama, revisado por Codex).
2. **PR del backend:** función pura, servicio, los dos caminos del webhook, `message_updated`, `webhook:simulate` y sus tests; `webhook-adjuntos.md` y `chat.md` (el evento).
3. **PR de la UI:** la burbuja, el handler de `message_updated` y `chat.md`.

Se despliegan juntos (el backend solo, sin la UI, mostraría el contenido nuevo de una edición pero no la marca, y un borrado no se notaría: no rompe nada, pero no vale la pena separarlos).

## 9. Preguntas y respuestas (2026-10-19)

- **¿Ignorar los borrados o marcarlos?** Marcarlos: «que en Wasmish salga como eliminado y un ojito, que al pulsar se lo pueda ver; y de paso también con los mensajes que se editan».
- **Editados:** el contenido nuevo con «Editado» y el ojito para ver las versiones anteriores.
- **Ecos:** también lo que el negocio borra o edita desde la app, igual.
- **Quién ve el ojito:** quien ve la conversación, sin permiso nuevo.
- **Diseño:** lo hace el agente con la skill de marca y los patrones del chat; Jonathan lo revisa con capturas en el PR.
- **Los «Mensaje no compatible» ya guardados:** se dejan.

**Cabo suelto aceptado:** si el bot tenía pendiente responder a un mensaje que luego se borra o se edita, responde igual (su espera es de segundos).
