# Coexistencia: conectar un número que sigue en la app de WhatsApp Business

Fecha: 2026-10-16. Diseño acordado con Jonathan en una sesión de Claude (preguntas y respuestas en § 9) y corregido tras la revisión de Codex (§ 10). La interfaz la diseña Claude Design a partir de [2026-10-16-coexistencia-brief-ui.md](2026-10-16-coexistencia-brief-ui.md).

## 1. Qué problema resuelve

Casi todo negocio que Wasmish quiere vender (centros de capacitación, imprentas) atiende hoy desde la **app de WhatsApp Business** en un celular. Para conectar ese número a Wasmish tiene que borrarlo de la app, y pierde ahí sus chats y la costumbre de responder desde el teléfono. Es la objeción más probable en cada demostración.

Meta permite desde el **11 de febrero de 2025** conectar a la Cloud API un número **sin sacarlo de la app** (lo llama *Coexistence*): el negocio sigue usando la app y Wasmish recibe también lo que se responde desde ella. Wasmish hoy no lo soporta.

## 2. Qué se construye

1. **Conectar un número de la app** desde Ajustes → Líneas: Wasmish pregunta antes si el número está en la app de WhatsApp Business y abre el flujo de Meta que toca (con el código que se escanea desde la app).
2. **Lo que se responde desde la app se ve en Wasmish**, en su conversación, marcado «Desde la app de WhatsApp»: textos, fotos, videos y documentos de los chats individuales (lo que Meta manda, § 3). Pausa al bot como una respuesta manual.
3. **Si Meta retira el acceso** (el celular estuvo inactivo, se desconectó desde la app, etc.), las líneas de ese WABA quedan desconectadas en Wasmish y Ajustes → Líneas dice por qué.

**Fuera de alcance** (para después): importar a Wasmish el historial de chats de la app (hasta 6 meses) y sus contactos. Meta lo permite, pero solo en las 24 h siguientes a conectar y una sola vez; es otra funcionalidad del tamaño de esta. Hasta entonces, los chats anteriores se quedan en la app. Tampoco se aplican, en esta versión, las ediciones ni las eliminaciones hechas desde la app (§ 4).

## 3. Lo que dice Meta (fuentes oficiales)

Revisado el 2026-10-16 en la documentación de Meta para desarrolladores: la [guía de la coexistencia](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/) («Onboard WhatsApp Business app users»), el [registro de cambios](https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog) y las referencias de los webhooks [`smb_message_echoes`](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_message_echoes) y [`account_update`](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/account_update). Las citas son textuales; lo que es interpretación nuestra lo dice. **Antes de escribir el plan se vuelven a abrir** (en la revisión de Codex, Meta respondió 429 y no las pudo leer).

**Requisitos y conexión** (guía):
- «The business customer must use WhatsApp Business app version 2.24.17 or higher»; «You must already be a Solution Partner or Tech Provider»; el Embedded Signup «with session logging».
- **Wasmish es *Tech Provider*** (comprobado por Jonathan en el panel el 2026-10-16): el negocio está verificado, la verificación de acceso lo aprobó como proveedor de tecnología, y `whatsapp_business_messaging` y `whatsapp_business_management` tienen acceso avanzado.
- La configuración del Embedded Signup tiene **productos elegidos** en el panel; según la [página de versiones](https://developers.facebook.com/docs/whatsapp/embedded-signup/versions), «Selecting the products will automatically set you to v4». El fin de la v2 (15 de octubre de 2026) no la afecta.
- Se lanza con `extras.featureType = "whatsapp_business_app_onboarding"` (registro de cambios, 29 de mayo de 2025: «`coexistence` is no longer a valid `extras.featureType` value, you must use `whatsapp_business_app_onboarding`»). El popup termina con el evento `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`.
- Registro: «skip the phone number registration step, as the number is already registered». Para confirmarlo, la guía indica consultar `is_on_biz_app` y `platform_type` del número: `true` y `CLOUD_API` dicen que se usa en las dos plataformas.
- Webhooks: suscribir la app a `history`, `smb_app_state_sync` y `smb_message_echoes`, además de los que ya tiene.
- Sincronizar es opcional: «You can also synchronize their contacts and messaging history (if permitted by the business)»; el plazo para pedirlo es de 24 h.

**Ecos** (referencia de `smb_message_echoes`):
- Llegan con `metadata.phone_number_id` y `message_echoes: [{ from, to, id, timestamp, type, <type>: {...} }]`.
- `type` es `text`, `image`, `video`, `document`, `edit` o `revoke`. **No hay reacciones; los audios no aparecen en la lista.**
- `to` es el **teléfono** del cliente («a WhatsApp user's phone number and ID may not always match»); no hay BSUID.
- `timestamp`: «Unix timestamp indicating when the webhook was triggered».
- Los envíos desde la app o desde un dispositivo vinculado generan ecos. Los grupos no se sincronizan (guía).

**Desconexión** (referencia de `account_update`):
- `PARTNER_REMOVED` es **del WABA**, no de un número («WABA has been unshared with a Solution Partner»). Trae `waba_info.waba_id` y, solo en coexistencia, `disconnection_info: { reason, initiated_by }`. **No trae `phone_number`.** En el ejemplo de Meta, `entry.id` **no coincide** con `waba_info.waba_id`.
- `reason`: `ACCOUNT_DISCONNECTED`, `BUSINESS_DOWNGRADE`, `CHANGE_NUMBER`, `COMPANION_INACTIVITY` (dispositivo vinculado inactivo unos 30 días), `PRIMARY_INACTIVITY` (el celular inactivo unos 14 días) o `USER_RE_REGISTERED`. `initiated_by`: `USER` o `SYSTEM`.
- También existen `ACCOUNT_OFFBOARDED` y `ACCOUNT_RECONNECTED`, sin `waba_info`: esta versión no los trata.

**Lo que pierde la app y el precio** (guía): se apagan las listas de difusión (las que había quedan de solo lectura), los mensajes temporales, «ver una vez» y la ubicación en tiempo real en los chats 1:1. «All companion clients are supported, except for WhatsApp for Windows and WhatsApp for WearOS». Velocidad fija de 20 mensajes por segundo. «messages sent by the business via the WhatsApp Business app will continue to be free»; esos mensajes **no abren** la ventana de 24 h de la API.

**Países:** la guía no excluye ninguno, y el registro de cambios fue sumando los que estaban fuera al lanzarla. Ecuador no aparece en ninguna restricción, **pero eso no garantiza que funcione**: lo confirma la prueba real.

## 4. Cómo funciona

### Conectar

- El frontend abre el mismo `FB.login` con la misma configuración. Lo único que cambia en `extras` es `featureType`: `"whatsapp_business_app_onboarding"` si el número está en la app, y `""` como hoy si no. `setup` y `sessionInfoVersion` se quedan como están (funcionan; quitarlos no aporta nada y no está probado).
- El listener de `useConnectWhatsapp` acepta `FINISH` y `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`. Qué evento cuenta lo decide `embeddedSignupFinish`, en `Frontend/src/utils/embeddedSignup.ts`.
- El backend usa **el mismo endpoint** (`POST /api/whatsapp/connect`) y los mismos pasos: canjear el código, comprobar que el número es del WABA, reclamar el WABA, suscribir la app y aplicar la conexión.
- **Si el número vive en la app lo dice Meta, no el navegador:** se consulta `is_on_biz_app` del número. Hoy `getWabaPhoneNumbers` pide `id,display_phone_number,verified_name,platform_type` a la lista del WABA; se añade `is_on_biz_app` a esos campos, y si la lista no lo devuelve, se pide al número (`GET /{phone-number-id}?fields=is_on_biz_app,platform_type`, que es como lo muestra la guía). `describeWabaPhoneNumber` lo devuelve como `onBusinessApp`. El plan lo deja fijado tras probarlo. **Con `onBusinessApp: true` nunca se llama a `/register`**, diga lo que diga `platform_type` (`needsRegistration` lo comprueba primero, con su test). Si el frontend dijo «está en la app» y Meta dice que no, se conecta como un número normal y queda un aviso en el log.
- La línea guarda `businessApp` con lo que dijo Meta. Se recalcula en cada conexión (renovar el token incluido), y al reconectar se borra `disconnectionReason`.

### Lo que se responde desde la app

- `handleWebhook` gana un bloque `value.message_echoes`, después de `messages`, con un `try/catch` por eco (regla 7). La línea sale de `metadata.phone_number_id` con `findInboundLine`, como los entrantes.
- **Una línea desconectada no recibe ecos:** `findInboundLine` solo encuentra líneas activas, así que un eco tardío de una línea ya desconectada se descarta. Es a propósito: esa línea ya no es de la cuenta a efectos de escribir.
- `procesarEco(inbound, echoData)`, hermana de `procesarEntrante`:
  1. **Filtro:** sin `id` o sin `to`, se descarta con un aviso. `edit` y `revoke` se ignoran en esta versión (solo un aviso en el log). Un tipo que `describeInboundMessage` no reconoce se guarda con su etiqueta de «no soportado», como los entrantes.
  2. **Idempotencia** por `waMessageId`: el `exists` previo ahorra la descarga; la garantía es el índice único, y un E11000 al guardar se trata como «ya guardado» y **sale sin efectos** (ni pausa, ni no leídos, ni SSE), como `procesarEntrante`.
  3. **El contacto** por el teléfono `to` (`resolveContact` con `{ phone }`); si no existe, se crea. **Limitación:** un contacto que en Wasmish solo tiene BSUID (sin teléfono) no se puede vincular con un eco, que solo trae el teléfono: se crearía otro. Es raro (personas con nombre de usuario que no escribieron en 30 días) y queda documentado.
  4. **La conversación** de ese contacto en esa línea; si no existe, se crea.
  5. **La pausa del bot va aquí, antes de descargar nada:** `markHumanReply(conversation)`. Un envío del bot ya autorizado (`authorizeBotSend`) no se puede cancelar, y un eco que Meta entrega tarde llega tarde: el bot se calla desde que se procesa el eco, no desde que se escribió en la app.
  6. **El contenido** con `describeInboundMessage` y el archivo con `descargarAdjunto`. Ningún mensaje se guarda con `text` vacío (regla 7). Si la descarga falla, el mensaje se guarda con su etiqueta y sin archivo, como un entrante.
  7. **El mensaje:** `direction: 'outbound'`, `sender: 'me'`, `origin: 'businessApp'`, `status: 'sent'`, sin `sentBy` (Meta no dice qué persona lo envió) y con `timestamp` = el de Meta (la hora del webhook, la mejor aproximación que da Meta).
  8. **La conversación, de forma monótona:** la última actividad solo avanza si el eco es más nuevo que la actual. `unreadCount` se pone en cero **solo si no llegó un entrante después** del eco (se compara con `lastInboundAt`): un eco atrasado no borra mensajes que nadie ha visto.
  9. **SSE**, a quien puede ver esa línea (`meta = { lineId }`): `message_created` con el mensaje y `conversation_updated` con el `unreadCount` resultante, porque la bandeja no baja el contador con un mensaje propio (`useConversations` lo conserva con `sender: 'me'`). **Sin aviso push:** lo escribió el propio negocio.
- **La ventana de 24 h no cambia:** sigue dependiendo solo de los entrantes, que es lo que dice Meta. Responder desde la app no habilita texto libre desde Wasmish fuera de la ventana.
- **Acuses:** si Meta los manda para esos mensajes, `procesarEstado` ya los aplica por `waMessageId`; si no, quedan como «enviado».
- `messageOrigin` reconoce `'businessApp'`; el chat lo enseña como «Desde la app de WhatsApp» (el eco puede venir del celular o de un dispositivo vinculado, como WhatsApp Web). En el hilo, un mensaje que llega por SSE se coloca según su `timestamp`, no siempre al final (PR del frontend).

### Si Meta retira el acceso

- `account_update` se trata **antes** del `if (!phoneNumberId) continue` actual, en su propio `try/catch`.
- `parsePartnerRemoved(change)` (pura, con test) devuelve `{ waBusinessId: value.waba_info.waba_id, reason, initiatedBy, at }` (con `at` = `entry.time`) o null si no es `PARTNER_REMOVED` o falta `waba_info.waba_id`. No usa `entry.id`.
- **Alcance: el WABA entero.** El servicio desconecta **todas las líneas activas** de ese `Waba` (en coexistencia, el WABA tiene el número de la app). Sin `disconnection_info`, el motivo queda `null` («Meta retiró el acceso»).
- **Dentro del candado de líneas, y revalidando dentro:** se vuelve a leer el `Waba` y sus líneas activas; una línea conectada **después** de `at` no se toca (una desconexión atrasada tras una reconexión). Un evento repetido no encuentra líneas activas y no hace nada. La desconexión usa la misma lógica que `disconnectLine` (la línea por defecto y la copia en `User`) y guarda `disconnectionReason`.
- **Si el candado está ocupado** (alguien conecta o desconecta en ese momento): se reintenta durante unos segundos; si sigue ocupado, el webhook responde **500** para que Meta reintente el lote. Reprocesar el lote es seguro: los mensajes son idempotentes por `waMessageId` y los acuses, monótonos. El plan fija los tiempos.
- Si no hay un `Waba` con ese id en ninguna cuenta, solo un aviso en el log.
- Las conversaciones de esas líneas quedan como las de cualquier línea desconectada: se leen, y escribir da 409 como hoy.
- **La pantalla se entera al pedir las líneas:** `serializeLine` devuelve `businessApp` y `disconnectionReason`. Sin evento SSE nuevo en esta versión: Ajustes → Líneas las vuelve a pedir al abrirse, y escribir en una conversación de esa línea da 409 con el mensaje de siempre.
- Una desconexión **manual** desde Wasmish deja `disconnectionReason` en `null`.

### En el panel de Meta (Jonathan)

- Suscribir los campos `smb_message_echoes`, `history` y `smb_app_state_sync`, y comprobar `account_update`. `history` y `smb_app_state_sync` no se usan en esta versión: el webhook los ignora sin error.
- En la configuración del Embedded Signup, añadir la conexión de cuentas de la app de WhatsApp Business, si el panel lo pide.

## 5. Datos

- `Line.businessApp: Boolean` (por defecto `false`).
- `Line.disconnectionReason: String | null`: el motivo de Meta tal cual (`PRIMARY_INACTIVITY`…); el frontend lo traduce a palabras.
- `Message.origin` admite `'businessApp'`.
- Sin migración: los documentos anteriores leen los valores por defecto.

## 6. Aislamiento y seguridad

- El webhook no tiene sesión: **la cuenta es la que resuelve el evento** (`findInboundLine` por `phone_number_id` para los ecos; el `Waba` por su id para `PARTNER_REMOVED`). Nada se busca fuera de esa cuenta.
- Tests de aislamiento (dos cuentas, varias líneas): un eco con el número de la cuenta B no crea ni cambia nada en la A, ni la A ve su mensaje, su archivo o su SSE; un `PARTNER_REMOVED` del WABA de B no desconecta líneas de A; un agente de la cuenta sin acceso a esa línea no recibe el SSE del eco (Fase 3, `canReceive`) ni puede leer el mensaje.
- La firma HMAC del webhook ya cubre los campos nuevos (es sobre el cuerpo entero). El token sigue sin salir del backend.

## 7. Pruebas

- **Backend, funciones puras con su test:** `describeWabaPhoneNumber` con `is_on_biz_app`; `needsRegistration` que nunca registra con `onBusinessApp`; leer un eco (texto, foto con pie, video, documento, `edit` y `revoke` ignorados, sin `id`, sin `to`); `parsePartnerRemoved` (con y sin `disconnection_info`, sin `waba_info`, otro evento); la decisión monótona de última actividad y no leídos.
- **Backend, con Mongo en memoria:** el eco idempotente (dos entregas a la vez: un solo mensaje, una sola pausa, un solo SSE); un eco atrasado tras un entrante; `PARTNER_REMOVED` repetido, atrasado tras una reconexión y con el candado ocupado; los casos de aislamiento de § 6.
- **Frontend, sin test** (no tiene): `embeddedSignupFinish` y la traducción de los motivos. Se comprueban en la prueba real.
- **Local sin Meta:** `npm run webhook:simulate` con `--echo` (un mensaje enviado desde la app) y `--partner-removed`.
- **Real, en producción,** con un número de Ecuador que esté en la app de WhatsApp Business (Jonathan tiene uno elegido; el número no va en este repo):
  1. Tener la app de WhatsApp Business (2.24.17 o más) con ese número y algunos chats.
  2. Conectarlo a la cuenta de prueba de Jonathan eligiendo «sí, está en la app» y escaneando el código.
  3. En los logs: no se llamó a `/register`; la línea quedó con `businessApp: true`.
  4. Escribirle desde otro número: llega a Wasmish **y** a la app.
  5. Responder desde la app (texto, una foto y una nota de voz): el texto y la foto salen en Wasmish como «Desde la app de WhatsApp»; anotar qué pasa con la nota de voz (Meta no la lista). El bot no contesta durante `handoffHours`.
  6. Responder desde Wasmish: llega al cliente y se ve en la app.
  7. Dejar pasar más de 24 h sin sincronizar nada: sigue conectado.
  8. Desconectarlo desde la app (Ajustes → Cuenta → Plataforma empresarial): Ajustes → Líneas lo dice con el motivo.

**Hasta que la prueba real salga bien, la página y el guion de ventas no prometen la coexistencia.**

## 8. Orden de trabajo

1. **El plan** (`docs/superpowers/plans/`), primer commit de la rama `coexistencia`, revisado por Codex. Antes, volver a abrir las referencias oficiales de § 3.
2. **PR del backend:** conectar con `is_on_biz_app`, ecos, `PARTNER_REMOVED`, los campos nuevos, `webhook:simulate` y los tests. Se puede desplegar solo: los ecos y `PARTNER_REMOVED` con `disconnection_info` solo llegan de números en coexistencia, y ninguno está conectado así; un `PARTNER_REMOVED` normal (un cliente que retira el acceso a su WABA) pasa a desconectar sus líneas, que es lo correcto.
3. **PR del frontend**, con el diseño de Claude Design: la pregunta antes de Facebook, el evento de la app, la marca «Desde la app de WhatsApp», el orden en el hilo y el motivo de la desconexión.
4. **Versión, despliegue y la prueba real.** Después, la página y el guion.

La documentación de `docs/arquitectura/` (webhook, chat, envío) se actualiza en el mismo PR que cambia cada comportamiento.

## 9. Preguntas y respuestas (2026-10-16)

- **¿Es oficial de Meta?** Sí: la guía, las referencias de webhooks y el registro de cambios de Meta para desarrolladores (§ 3). Jonathan pidió no afirmar nada sin fuente oficial; lo que venía de terceros y no se confirmó se descartó.
- **¿Qué entra en la primera versión?** Conectar y lo nuevo en los dos lados (con la desconexión). El historial y los contactos de la app, después.
- **¿Cómo elige el cliente?** Wasmish pregunta antes de abrir Facebook, con un diseño de Claude Design (brief aparte).
- **¿Qué número se usa para probar?** Uno de Jonathan, de la prueba de alta (el número va en su memoria privada, no aquí).
- **¿Cómo se guarda lo que se responde desde la app?** Como mensaje saliente, con sus archivos.
- **¿Antes de las demos?** Sí: es la objeción que más se espera, y rompe la congelación del producto a propósito (decisiones.md).

## 10. Revisión de Codex (2026-10-16) y qué cambió

Codex revisó la primera versión antes del plan. Lo que se cambió por su revisión:

- **El registro** ya no depende de `platform_type`: lo decide `is_on_biz_app` de Meta (alta).
- **`PARTNER_REMOVED`** se lee de la referencia oficial: es del WABA, trae `waba_info.waba_id` y no trae teléfono; se desconectan todas las líneas activas del WABA, revalidando dentro del candado, ignorando eventos repetidos o atrasados, y con 500 a Meta si el candado no se libera (alta, dos puntos).
- **La pausa del bot** va antes de descargar el archivo, y se documenta lo que no puede evitar (alta).
- **El contacto del eco:** Meta solo manda el teléfono; la limitación con los contactos de solo BSUID queda escrita (media).
- **Idempotencia:** el E11000 sale sin efectos; se prueban entregas simultáneas (media).
- **No leídos por SSE:** se emite `conversation_updated` además de `message_created` (media).
- **Orden:** última actividad y no leídos monótonos; el hilo coloca el eco por su hora (media).
- **Ediciones, eliminaciones y reacciones:** Meta no manda reacciones; `edit` y `revoke` se ignoran en esta versión (media).
- **Líneas desconectadas, aislamiento y permisos:** el descarte de ecos tardíos es explícito y los tests cubren dos cuentas, varias líneas y un agente sin acceso (media).
- **Contrato de líneas:** `serializeLine` devuelve los campos nuevos y se define cuándo se borra el motivo (media).
- **Fuentes:** se separa lo citado de lo interpretado, se corrige WearOS en el brief y se vuelven a abrir las referencias antes del plan (media).
- **El brief promete lo que hay:** chats individuales y los tipos que Meta manda; «Desde la app de WhatsApp» en vez de «Desde el celular»; la ventana de 24 h no cambia (media).
- **Lo público:** el número de prueba y el identificador de la configuración de Meta salen de este documento (baja).
- **`extras`:** no se quitan `setup` ni `sessionInfoVersion`; solo cambia `featureType`.
