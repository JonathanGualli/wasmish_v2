# Coexistencia: conectar un número que sigue en la app de WhatsApp Business

Fecha: 2026-10-16. Diseño acordado con Jonathan en una sesión de Claude (preguntas y respuestas en § 9). Lo revisa Codex antes de escribir el plan. La interfaz la diseña Claude Design a partir de [2026-10-16-coexistencia-brief-ui.md](2026-10-16-coexistencia-brief-ui.md).

## 1. Qué problema resuelve

Casi todo negocio que Wasmish quiere vender (centros de capacitación, imprentas) atiende hoy desde la **app de WhatsApp Business** en un celular. Para conectar ese número a Wasmish tiene que borrarlo de la app, y pierde ahí sus chats y la costumbre de responder desde el teléfono. Es la objeción más probable en cada demostración.

Meta permite desde el **11 de febrero de 2025** conectar a la Cloud API un número **sin sacarlo de la app** (lo llama *Coexistence*): el negocio sigue usando la app y lo nuevo se ve en los dos lados. Wasmish hoy no lo soporta.

## 2. Qué se construye

1. **Conectar un número de la app** desde Ajustes → Líneas: Wasmish pregunta antes si el número está en la app de WhatsApp Business y abre el flujo de Meta que toca (con el QR que se escanea desde la app).
2. **Lo que se responde desde el celular se ve en Wasmish**, en su conversación, con sus fotos y documentos, marcado «Desde el celular». Pausa al bot como una respuesta manual.
3. **Si Meta desconecta el número** (porque el celular estuvo inactivo, se desconectó desde la app, etc.), la línea queda desconectada en Wasmish y Ajustes → Líneas dice por qué.

**Fuera de alcance** (para después): importar a Wasmish el historial de chats de la app (hasta 6 meses) y sus contactos. Meta lo permite, pero solo en las 24 h siguientes a conectar y una sola vez; es otra funcionalidad del tamaño de esta. Hasta entonces, los chats anteriores se quedan en la app.

## 3. Lo que dice Meta (fuentes oficiales)

Citas de la [guía oficial](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/) y del [registro de cambios](https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog) de Meta para desarrolladores, revisadas el 2026-10-16:

- **Requisitos:** «The business customer must use WhatsApp Business app version 2.24.17 or higher»; «You must already be a Solution Partner or Tech Provider»; el Embedded Signup «with session logging». **Wasmish cumple lo de *Tech Provider*** (comprobado por Jonathan el 2026-10-16): el negocio de la app está verificado desde el 4 de marzo de 2026, la verificación de acceso lo aprobó como proveedor de tecnología, y `whatsapp_business_messaging` y `whatsapp_business_management` tienen acceso avanzado. La configuración del Embedded Signup de Wasmish ya es **v4** (tiene productos elegidos; comprobado en el panel el 2026-10-16), así que el fin de la v2 (15 de octubre de 2026) no la afecta.
- **Cómo se lanza:** `extras.featureType = "whatsapp_business_app_onboarding"` (desde el 29 de mayo de 2025). El popup termina con el evento `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`, no con `FINISH`.
- **Registro:** «skip the phone number registration step, as the number is already registered».
- **Webhooks:** hay que suscribir la app a `history`, `smb_app_state_sync` y `smb_message_echoes`. Lo que el negocio envía desde la app llega en `smb_message_echoes`: `message_echoes: [{ from, to, id, timestamp, type, <type>: {...} }]`.
- **Sincronizar es opcional:** «You can also synchronize their contacts and messaging history (if permitted by the business)», con 24 h de plazo.
- **Desconexión:** `account_update` con `event: "PARTNER_REMOVED"`, `phone_number` y `disconnection_info` (`reason`, `initiated_by`); el WABA va en `entry.id`. Motivos: `ACCOUNT_DISCONNECTED`, `BUSINESS_DOWNGRADE`, `CHANGE_NUMBER`, `COMPANION_INACTIVITY` (dispositivo vinculado inactivo unos 30 días), `PRIMARY_INACTIVITY` (el celular inactivo unos 14 días) y `USER_RE_REGISTERED`.
- **Lo que pierde la app:** se apagan las listas de difusión (las que había quedan de solo lectura), los mensajes temporales, «ver una vez» y la ubicación en tiempo real en los chats 1:1; los grupos no se sincronizan. Dispositivos vinculados: «All companion clients are supported, except for WhatsApp for Windows and WhatsApp for WearOS».
- **Precio:** «messages sent by the business via the WhatsApp Business app will continue to be free». Los mensajes desde la app **no abren** la ventana de 24 h de la API.
- **Velocidad:** «a fixed throughput of 20 mps», de sobra para Wasmish.
- **Países:** la guía no excluye ninguno; el registro de cambios fue sumando los que estaban fuera al lanzarla. Ecuador no aparece en ninguna restricción.

## 4. Cómo funciona

### Conectar

- El frontend abre el mismo `FB.login` con la misma configuración. Si el número está en la app, `extras = { featureType: "whatsapp_business_app_onboarding" }`; si no, `extras = {}`. Se quitan los `sessionInfoVersion` y `featureType: ""` de v2/v3, que en v4 se ignoran.
- El listener de `useConnectWhatsapp` acepta `FINISH` y `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`. Qué evento cuenta lo decide una función pura (`embeddedSignupFinish`, en `Frontend/src/utils/embeddedSignup.ts`).
- El backend usa **el mismo endpoint** (`POST /api/whatsapp/connect` del Embedded Signup) y los mismos pasos: canjear el código, comprobar que el número es del WABA, reclamar el WABA, suscribir la app y aplicar la conexión. **El registro se salta solo:** `needsRegistration` solo registra con `platform_type: NOT_APPLICABLE`, y un número de la app llega como `CLOUD_API`. Se confirma en la prueba real; si llegara otra cosa, el plan lo trata.
- El frontend manda además `businessApp: true` cuando el evento fue el de la app, y la línea lo guarda (`Line.businessApp`). Sirve para que Ajustes → Líneas lo diga y para explicar una desconexión. Al renovar el token de una línea por el flujo normal, se conserva.

### Lo que se responde desde el celular

- `handleWebhook` gana un bloque `value.message_echoes`, después de `messages`, con un `try/catch` por eco (regla 7: un eco roto no tumba el lote).
- `procesarEco(inbound, echoData)`, hermana de `procesarEntrante`:
  1. **Idempotencia** por `waMessageId`, antes de descargar nada (como los entrantes).
  2. **El contacto** por el número `to` (`resolveContact`); si no existe, se crea, como cuando alguien escribe por primera vez. Un eco sin `to` se descarta con un aviso en el log.
  3. **La conversación** de ese contacto en esa línea; si no existe, se crea.
  4. **El contenido** con `describeInboundMessage` (texto, foto con pie, documento, audio…) y el archivo con `descargarAdjunto`. Ningún mensaje se guarda con `text` vacío (regla 7): uno sin texto lleva su etiqueta, como los entrantes.
  5. **El mensaje:** `direction: 'outbound'`, `sender: 'me'`, `origin: 'phone'`, `status: 'sent'`, sin `sentBy` (Meta no dice qué persona lo envió) y con el `timestamp` de Meta.
  6. **Después:** la última actividad de la conversación, `unreadCount` en cero (como al responder desde el chat), `markHumanReply` (el bot se calla `handoffHours`) y el mismo evento SSE que un mensaje enviado, a quien puede ver esa línea. **Sin aviso push:** lo escribió el propio negocio.
- **La ventana de 24 h no cambia:** sigue dependiendo solo de los entrantes, que es lo que dice Meta.
- **Acuses:** si Meta los manda para esos mensajes, `procesarEstado` ya los aplica por `waMessageId`; si no, quedan como «enviado».
- `messageOrigin` reconoce `'phone'`, y el chat lo enseña como «Desde el celular».

### Si Meta desconecta el número

- `account_update` llega con el WABA en `entry.id` y **sin** `metadata.phone_number_id`: hoy el bucle lo salta (`if (!phoneNumberId) continue`). Se trata **antes** de ese `continue`, en su propio `try/catch`.
- `parsePartnerRemoved(entry, change)` (pura) devuelve `{ waBusinessId, phoneNumber, reason, initiatedBy }` o null.
- El servicio busca la línea **activa** cuyo `Waba` es ese y cuyo número visible coincide (normalizando los dígitos), y la desconecta con la misma lógica que `disconnectLine` (con el candado de líneas, la línea por defecto y la copia en `User`). Guarda `disconnectionReason` y `disconnectedAt`. Si no encuentra la línea, solo un aviso en el log.
- Las conversaciones de esa línea quedan como las de cualquier línea desconectada: se leen, y escribir da 409 como hoy.

### En el panel de Meta (Jonathan)

- Suscribir los campos `smb_message_echoes`, `history` y `smb_app_state_sync`, y comprobar `account_update`. `history` y `smb_app_state_sync` no se usan en esta versión: el webhook los ignora sin error.
- En la configuración del Embedded Signup (`1556100009265518`), añadir la conexión de cuentas de la app de WhatsApp Business, si el panel lo pide.

## 5. Datos

- `Line.businessApp: Boolean` (por defecto `false`).
- `Line.disconnectionReason: String | null`: el motivo de Meta tal cual (`PRIMARY_INACTIVITY`…); el frontend lo traduce a palabras. Se borra al reconectar.
- `Message.origin` admite `'phone'`.
- Sin migración: los documentos anteriores leen los valores por defecto.

## 6. Aislamiento y seguridad

- Un eco o una desconexión solo toca la cuenta dueña de la línea que encuentra `findInboundLine` (por `phone_number_id`) o de la línea activa de ese WABA y número. Un test de aislamiento comprueba que un eco con el número de otra cuenta, o un `PARTNER_REMOVED` de un WABA ajeno, no cambia nada de esta.
- La firma HMAC del webhook ya cubre los campos nuevos (es sobre el cuerpo entero).
- El token sigue sin salir del backend.

## 7. Pruebas

- **Funciones puras del backend con su test** (`Backend/tests/`): leer un eco (`describeInboundMessage` aplicado a un eco: texto, foto con pie, documento, un tipo no soportado) y `parsePartnerRemoved`.
- **En el frontend, sin test** (el frontend no tiene tests): `embeddedSignupFinish` en `Frontend/src/utils/embeddedSignup.ts` y la traducción de los motivos de desconexión. Se comprueban en la prueba real.
- **Aislamiento:** los casos de § 6.
- **Local sin Meta:** `npm run webhook:simulate` con `--echo` (un mensaje enviado desde la app) y `--partner-removed`.
- **Real, en producción, con el chip 0984152777** (el de la prueba de alta, que primero hay que activar en la app de WhatsApp Business):
  1. Instalarlo en la app de WhatsApp Business (2.24.17 o más) y escribir algunos chats.
  2. Conectarlo a la cuenta de prueba de Jonathan eligiendo «sí, está en la app» y escaneando el QR.
  3. Ver en los logs que no se llamó a `/register` y que la línea quedó `businessApp: true`.
  4. Escribirle desde otro número: llega a Wasmish **y** a la app.
  5. Responder desde la app (texto y una foto): sale en Wasmish como «Desde el celular», con la foto, y el bot no contesta durante `handoffHours`.
  6. Responder desde Wasmish: llega al cliente y se ve en la app.
  7. Dejar pasar más de 24 h sin sincronizar nada: sigue conectado.
  8. Desconectarlo desde la app (Ajustes → Cuenta → Plataforma empresarial): Ajustes → Líneas lo dice con el motivo.

**Hasta que la prueba real salga bien, la página y el guion de ventas no prometen la coexistencia.**

## 8. Orden de trabajo

1. **El plan** (`docs/superpowers/plans/`), primer commit de la rama `coexistencia`, revisado por Codex.
2. **PR del backend:** ecos, `PARTNER_REMOVED`, los campos nuevos, `webhook:simulate` y los tests. Se puede desplegar solo: sin líneas `businessApp`, nada cambia.
3. **PR del frontend**, con el diseño de Claude Design: la pregunta antes de Facebook, el evento de la app, `businessApp`, la marca «Desde el celular» y el motivo de la desconexión.
4. **Versión, despliegue y la prueba real.** Después, la página y el guion.

La documentación de `docs/arquitectura/` (webhook, chat, envío) se actualiza en el mismo PR que cambia cada comportamiento.

## 9. Preguntas y respuestas (2026-10-16)

- **¿Es oficial de Meta?** Sí: la guía de Meta para desarrolladores y su registro de cambios (§ 3). Jonathan pidió no afirmar nada sin fuente oficial; lo que venía de terceros y no se confirmó se descartó.
- **¿Qué entra en la primera versión?** Conectar y lo nuevo en los dos lados (con la desconexión). El historial y los contactos de la app, después.
- **¿Cómo elige el cliente?** Wasmish pregunta antes de abrir Facebook, con un diseño de Claude Design (brief aparte).
- **¿Qué número se usa para probar?** El chip de la prueba de alta, 0984152777.
- **¿Cómo se guarda lo que se responde desde el celular?** Como mensaje saliente, con sus archivos.
- **¿Antes de las demos?** Sí: es la objeción que más se espera, y rompe la congelación del producto a propósito (decisiones.md).
