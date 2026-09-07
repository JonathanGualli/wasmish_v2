# Ventana de 24 h de WhatsApp + envío de plantillas desde la UI

**Fecha:** 2026-08-31
**Estado:** diseño aprobado, pendiente de implementación

## El problema

WhatsApp solo permite enviar **texto libre** dentro de las 24 h siguientes al último
mensaje **del cliente**. Pasado ese plazo, únicamente plantillas aprobadas.

Hoy wasmish no conoce esa regla. El agente escribe, envía, Meta rechaza con el error
131047 y el mensaje queda en rojo. La UI muestra el motivo — `ChatThread.tsx` pinta
`errorCode` y `errorDetail` — pero en inglés, en la jerga de Meta y **después** de
haber escrito el mensaje. Nadie le explica que la alternativa es una plantilla.

## Decisiones tomadas

| Decisión | Elegido | Descartado |
|---|---|---|
| Al expirar la ventana | Bloquear el composer y ofrecer plantillas | Avisar dejando enviar; selector integrado en el chat |
| Dónde vive la validación | Solo la UI avisa; el backend no rechaza | 400 en `sendMessageController` |
| Conversaciones existentes | Script de backfill sobre la BD | Dejar que se llene solo; calcular al vuelo sin campo |
| Alcance del aviso | Dentro del chat, con tiempo restante | Solo abierto/cerrado; indicador en la lista |

**Por qué el backend no rechaza:** si el cálculo fallara, bloquearíamos envíos
legítimos. Con la UI avisando antes y el error de Meta explicando después, el riesgo
de que alguien no entienda qué pasó es bajo.

**Hallazgo que amplió el alcance:** `POST /v1/templates/send` es solo API pública con
API key. **Desde la app no se puede enviar una plantilla.** Bloquear el composer sin
ofrecer salida dejaría al agente sin poder hacer nada en ese chat — peor que hoy. Por
eso el envío de plantillas desde la UI entra en este proyecto.

## Arquitectura

### La regla vive en el backend, el frontend solo resta

`utils/whatsapp.window.js` expone `getWindowExpiry(lastInboundAt)`, que devuelve
`lastInboundAt + 24 h` o `null`. El backend envía **`windowExpiresAt` ya calculado**;
el frontend lo compara con `Date.now()`.

El "24" queda en un solo archivo testeado. Si Meta cambia la ventana, se toca un sitio.
La alternativa — mandar `lastInboundAt` crudo y calcular en el cliente — duplicaría la
regla en dos lenguajes.

Se envía un **instante**, no un booleano: un `isOpen` calculado en el servidor caduca
en cuanto pasa el tiempo, y una pestaña abierta desde ayer mostraría un estado falso.

### Dos puertas a la misma lógica de envío

`sendTemplateController` hoy mezcla autenticación por API key con el envío. Se extrae
el núcleo a `processTemplateSending({ user, conversation, templateName, ... })`,
siguiendo el patrón que ya existe con `processMessageSending`:

- `POST /api/v1/templates/send` (API key) — la de PractyCo, **sin cambios de comportamiento**
- `POST /api/chats/:id/template` (JWT) — la nueva, para la UI

Reutiliza `buildButtonComponents` y `renderTemplateBody`, ya cubiertos por 13 tests.

## Cambios por archivo

### Backend

| Archivo | Cambio |
|---|---|
| `models/conversation.model.js` | Campo `lastInboundAt: { type: Date, default: null }` |
| `controllers/webhook.controller.js` | Poner `lastInboundAt = timestamp` al crear y al actualizar la conversación en el inbound |
| `utils/whatsapp.window.js` | **Nuevo.** `getWindowExpiry(lastInboundAt)` |
| `controllers/chat.controller.js` | `listConversations` devuelve `windowExpiresAt` (`ChatThread` ya toma la conversación de ahí, así que `listMessages` no se toca) |
| `controllers/webhook.controller.js` | El payload SSE `message_created` de entrada incluye `windowExpiresAt`, para reabrir la ventana en vivo sin refetch |
| `controllers/template.controller.js` | Extraer `processTemplateSending`; `sendTemplateController` pasa a ser una envoltura |
| `controllers/chat.controller.js` | `sendConversationTemplateController` (JWT) |
| `routes/chat.routes.js` | `POST /chats/:id/template` con `authRequired` + schema Zod |
| `scripts/backfill-last-inbound.js` | **Nuevo.** Ver abajo |

### Frontend

| Archivo | Cambio |
|---|---|
| `models/conversation.mode.ts` | `windowExpiresAt?: string \| null` |
| `hooks/useConversationWindow.ts` | **Nuevo.** `setInterval` de 60 s; devuelve `{ isOpen, msRemaining }` |
| `components/Chat/ChatThread.tsx` | Los tres estados del composer |
| `components/Chat/SendTemplateDialog.tsx` | **Nuevo.** Selector, campos de parámetros, vista previa |
| `hooks/useSendTemplate.ts` | **Nuevo.** Mutation contra el endpoint JWT |
| `services/api.service.ts` | `sendTemplateService` |

## Migración de datos

`scripts/backfill-last-inbound.js` agrega por `conversationId` el `max(timestamp)` de
los mensajes con `direction: 'inbound'` y aplica un `bulkWrite`.

- **Idempotente**: se puede correr varias veces sin efectos distintos.
- **`--dry-run`**: imprime cuántas conversaciones actualizaría, sin escribir.
- Las conversaciones sin ningún mensaje entrante quedan en `null` → sin ventana; la UI
  las trata como cerradas (nunca hubo respuesta del cliente, así que es correcto).

Se corre **una vez** contra producción, después de desplegar el código que llena el
campo — en ese orden, para que no queden conversaciones nuevas sin backfill.

## Interfaz

Tres estados en el chat, con el `Callout` del sistema (ver skill `brand-guidelines`):

| Estado | Qué se ve |
|---|---|
| Quedan > 2 h | Nada. Composer normal. |
| Quedan ≤ 2 h | `Callout tone="warning"` sobre el composer: «Quedan `1h 40m` para responder con texto libre». Tiempo en `font-mono tabular-nums` |
| Expiró | El composer se reemplaza por `Callout tone="info"` + `CustomButton` «Enviar plantilla» |

En el estado bloqueado el botón de envío del composer desaparece, así que «Enviar
plantilla» queda como el **único menta sólido de la vista** — respeta la regla de los
dos verdes.

`SendTemplateDialog` sigue el patrón de `NewConversationDialog`: lista las plantillas
de `useTemplates`, genera los campos de los `{{n}}` a partir de la definición guardada
y muestra vista previa del texto final. Si la plantilla tiene botones con parámetro,
muestra también esos campos; el backend deduce el `sub_type` de `Template.buttons`.

## Errores

Los 400 que el backend ya devuelve — índice de botón inexistente, URL fija sin `{{1}}`
— se muestran **dentro del diálogo**, no en el modal global: el usuario tiene que poder
corregir el campo sin perder lo que escribió.

Un fallo de Meta al enviar la plantilla sigue el camino actual: `Message` con
`status: 'failed'` más `errorCode`/`errorDetail`, visible en el hilo.

## Tests

Nuevos, sobre `whatsapp.window.js` (`node --test`, como el resto):

- Ventana abierta con un inbound reciente
- Ventana expirada con un inbound de hace más de 24 h
- El límite exacto de 24 h
- `lastInboundAt` nulo → sin ventana

El endpoint nuevo se apoya en `buildButtonComponents` y `renderTemplateBody`, ya
cubiertos. No se añaden tests de integración: seguirían necesitando BD, que es una
decisión aparte.

## Las conversaciones nuevas

Una conversación creada desde `NewConversationDialog` no tiene ningún mensaje
entrante, así que `lastInboundAt` es `null` y la ventana está **cerrada**. Eso es
correcto según las reglas de Meta — a alguien que nunca te escribió solo se le puede
llegar con una plantilla — pero choca con el flujo actual, donde el diálogo pide un
texto libre.

Hoy ese envío ya falla contra Meta; el cambio es que ahora lo sabríamos antes.

**Decidido: el diálogo se deja como está.** El chat se crea y aparece bloqueado con el
botón de plantilla. No se toca un flujo que ya funciona en producción, y el agente
descubre la regla en el chat, que es donde va a estar trabajando. La alternativa
—que el diálogo ofreciera el selector de plantillas cuando el número no tiene
conversación previa— queda para más adelante si el patrón resulta molesto en el uso
diario.

## Fuera de alcance

- Indicador de ventana en la lista de conversaciones
- Traducir al español los códigos de error de Meta (131047, 132018, 470)
- Que el backend rechace envíos fuera de ventana
- Plantillas con contenido multimedia en la cabecera

## Riesgos

**El backfill toca la BD de producción.** Se ejecuta con `--dry-run` primero. Solo
escribe un campo nuevo que nada más lee todavía: si saliera mal, no rompe nada
existente.

**`processTemplateSending` toca el camino de PractyCo.** Es la extracción de una
función que ya funciona, sin cambio de comportamiento, pero corre en producción con un
cliente real. Revisar el diff con atención antes de desplegar.
