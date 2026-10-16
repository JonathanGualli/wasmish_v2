# Respuestas automáticas (chatbot v1)

Las respuestas que Wasmish manda solo: bienvenida, fuera de horario y palabras clave. Cómo se configuran, cómo se decide qué responder y, cuando esté el envío, cómo salen.

> Parte de la documentación de Wasmish: el mapa de todos los temas está en el [AGENTS.md](../../AGENTS.md) de la raíz.
> Las decisiones de producto con fecha están en [decisiones.md](../decisiones.md). El diseño completo, con el porqué de cada cosa: [spec de respuestas automáticas](../superpowers/specs/2026-10-15-respuestas-automaticas-design.md).

## Contenido

- **Backend**
  - [La configuración (`AutoReplySettings`, `auto.reply.controller.js`)](#la-configuración-autoreplysettings-autoreplycontrollerjs)
  - [Decidir qué responder (`utils/auto.reply.js`)](#decidir-qué-responder-utilsautoreplyjs)
  - [El horario (`utils/business.hours.js`)](#el-horario-utilsbusinesshoursjs)

---

## Backend

### La configuración (`AutoReplySettings`, `auto.reply.controller.js`)

**Un documento por cuenta** (`AutoReplySettings`, índice único `auto_reply_settings_account_unique` sobre `userId`, que es la cuenta). Sin documento, la cuenta tiene la configuración por defecto (`defaultAutoReplySettings`): **todo apagado**, con un horario de ejemplo de lunes a viernes de 8:00 a 18:00. Ninguna cuenta responde sola sin que alguien lo encienda.

- `enabled`: el interruptor general.
- `timezone`: zona IANA, por defecto `America/Guayaquil`.
- `handoffHours`: cuántas horas se calla el bot tras una respuesta manual (1, 4, 12 o 24; 12 por defecto).
- `welcome`: `{ enabled, text, returnAfterDays }`. `returnAfterDays` es 7, 30, 90 o `null` (nunca volver a saludar); 30 por defecto.
- `outOfHours`: `{ enabled, text, schedule }`. `schedule` tiene los 7 días (`mon`…`sun`), cada uno `{ closed, ranges }` con hasta 2 tramos `{ start: 'HH:mm', end: 'HH:mm' }`.
- `keywordRules`: hasta 30 reglas `{ _id, enabled, keywords, text, lineIds }`, con 1–20 frases de hasta 60 caracteres. `lineIds` vacío = todas las líneas: la página todavía no lo ofrece, pero está para pasar a «cada regla elige sus líneas» sin migrar.

Cada texto, hasta 800 caracteres (`AUTO_REPLY_TEXT_MAX`): bienvenida + 3 palabras clave + fuera de horario caben en los 4.096 de WhatsApp. Una respuesta encendida necesita texto; una apagada puede quedar vacía.

**Las rutas** (`GET`/`PUT /api/auto-replies`, `POST /api/auto-replies/preview`) llevan `requirePermission('autoReplies.manage')`: **owner y admin**, porque la configuración afecta a todas las líneas. Su detalle está en [api.md § Endpoints](api.md#endpoints-completos).
- `PUT` reemplaza la configuración entera. Las reglas que traen `id` lo conservan y las nuevas estrenan uno: con él, cada conversación recuerda cuándo respondió esa regla. Un `lineIds` que no es de la cuenta da 400.
- **Probar** (`preview`) usa la configuración **del cuerpo, sin guardarla**, y responde como a un contacto nuevo, ahora y sin estado, así la bienvenida sale si está encendida. Devuelve las posiciones de las reglas que coincidieron (`matchedRuleIndexes`), porque una regla nueva todavía no tiene id. No envía nada.

### Decidir qué responder (`utils/auto.reply.js`)

`decideAutoReply` es pura: recibe la configuración, el estado del bot en la conversación, cuándo se saludó al contacto, el entrante, cuándo había escrito antes el contacto en la cuenta (`previousInboundAt`), la línea y la hora. Devuelve las partes y el texto unido, o el motivo para no responder:

- **No responde** (`skip`) con el interruptor apagado (`disabled`), con una persona atendiendo (`human`: no pasaron `handoffHours` desde la última respuesta manual), con el freno (`burst`: el bot ya respondió 3 veces en 10 minutos en esa conversación), ante una reacción (`ignored_type`) o si no aplica nada (`no_match`).
- **Las partes, en orden:**
  1. **Bienvenida**, si el contacto nunca había escrito a la cuenta o volvió tras `returnAfterDays`, y no se le saludó en ese plazo.
  2. **Palabras clave**, como mucho 3 textos distintos, en el orden de la lista, saltando las reglas apagadas, las de otra línea y las que respondieron en esa conversación en las últimas 24 horas.
  3. **Fuera de horario**, si está cerrado y ese tramo cerrado no se avisó ya.
- **Se unen con una línea en blanco**, en un solo mensaje: Meta cobra cada mensaje, también dentro de la ventana de 24 horas.
- **Las palabras clave** se buscan en lo que escribió el contacto (el texto, o el `caption` de un archivo; nunca la etiqueta «Imagen»), sin mayúsculas ni tildes y **por palabras completas** (`normalizeForMatch`, `matchesKeyword`): «precio» no encuentra «preciosa».
- **`claims`** es lo que se marca solo si Meta acepta el envío: si se saludó, la clave del tramo y las reglas que respondieron. `botStateUpdate` arma el `$set` de la conversación; la bienvenida se marca en el contacto.

### El horario (`utils/business.hours.js`)

`closedPeriodKey(schedule, timeZone, now)` da `null` si ahora está abierto o, si está cerrado, la **clave del tramo cerrado**: la fecha y hora locales del último cierre (`'2026-10-16T18:00'`). Así el aviso se manda una vez por tramo, aunque cruce la medianoche o el fin de semana: quien escribe el sábado por la tarde y el domingo recibe uno solo. La hora local sale de `Intl`, sin librerías. `scheduleIssue` valida el horario (hasta 2 tramos por día, sin solaparse, `end` hasta `'24:00'`) y `isValidTimeZone` la zona.
