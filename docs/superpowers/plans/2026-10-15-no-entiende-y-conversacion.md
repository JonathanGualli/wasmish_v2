# «Si no entiende» y probar como conversación: plan de implementación

> **Para agentes:** en Wasmish, el plan se ejecuta nativo, con rama, PR y revisión cruzada («Planes» en `AGENTS.md`). Los pasos llevan casillas (`- [ ]`).

**Objetivo:** que el bot responda una vez cuando no sabría qué decir, que no se repita en la ventana de «Cuándo se calla», y que «Probar» simule una conversación entera.

**Arquitectura:** todo sale de la función pura que ya decide (`decideAutoReply`), con un campo más en la configuración y otro en el estado de la conversación. La prueba simula la conversación en el backend, mensaje a mensaje, con esa misma función: no hay una segunda versión de las reglas.

**Stack:** Express 5, Mongoose 8, Zod 4 y `node:test`; React 19, TypeScript, Tailwind v4 y React Query.

**Spec:** `docs/superpowers/specs/2026-10-15-respuestas-automaticas-design.md`, § 10 (y § 4 a 6 para lo que ya existe).

## Global Constraints

- `fallback: { enabled: false, text: '' }` por defecto; texto de 1 a 800 caracteres, vacío solo si está apagado (como la bienvenida).
- El «no entiendo» sale **solo si no saldría nada más** (ni bienvenida, ni palabra clave, ni fuera de horario) y **solo con algo escrito** (`inboundMatchText` no vacío).
- **Una ventana para no repetirse: `handoffHours`.** Cada palabra clave y el «no entiendo», como mucho una vez por conversación cada `handoffHours`. `KEYWORD_COOLDOWN_MS` desaparece.
- `Conversation.bot.fallbackRepliedAt`: cuándo salió el último «no entiendo».
- La prueba: `POST /api/auto-replies/preview` `{ settings, messages }`, de 1 a 20 mensajes de 1 a 1.000 caracteres → `{ turns: [{ reply, parts, matchedRuleIndexes, outOfHours, fallback, skip }] }`. Contacto nuevo, todos los mensajes ahora, **sin freno de ráfagas ni pausa**.
- Textos de la interfaz en español; identificadores nuevos en inglés. Commits sin coautor.

## Review Focus

- **La tabla de Jonathan** (spec § 10): bienvenida, «no entiendo», nada, precio, nada. Es el test principal (Tareas 1 y 4).
- **Un cliente de vuelta que solo saluda** («hola», ya saludado hace menos de `returnAfterDays`): recibe el «no entiendo». El texto de ejemplo está escrito para que eso no suene raro.
- **De noche:** el primer mensaje recibe el fuera de horario; el segundo, sin palabra clave, recibe el «no entiendo» (el fuera de horario ya salió en ese cierre).
- **Una foto o un audio sin texto** de un contacto conocido no recibe nada.
- **Una configuración guardada antes de este cambio** (sin `fallback`): se lee con el «no entiendo» apagado, y un `PUT` sin `fallback` no falla.

---

## PR 4 · «Si no entiende» (rama `respuestas-automaticas-no-entiende`, con este plan como primer commit)

### Tarea 1: Decidir el «no entiendo» y la ventana de `handoffHours`

**Files:** Modify `Backend/src/utils/auto.reply.js`; Test `Backend/tests/auto.reply.test.js`.

**Interfaces:**
- `defaultAutoReplySettings()` añade `fallback: { enabled: false, text: '' }`.
- `decideAutoReply(...)` → `claims` pasa a `{ welcomed, outOfHoursKey, keywordRuleIds, fallback: boolean }`.
- `botStateUpdate(state, claims, now)` añade `'bot.fallbackRepliedAt': now` cuando `claims.fallback`.

- [ ] **Tests que fallan:**
  - `la tabla de Jonathan: bienvenida, no entiendo, nada, precio, nada`: cinco llamadas seguidas a `decideAutoReply`, aplicando entre una y otra lo que marcaría el envío aceptado (`welcomedAt`, `previousInboundAt` = el mensaje anterior, `keywordRepliedAt`, `fallbackRepliedAt`), con `handoffHours: 12`. Resultados: `[welcome.text]`, `[fallback.text]`, `skip 'no_match'`, `[precio.text]`, `skip 'no_match'`.
  - `el no entiendo no se suma a otra respuesta`: con bienvenida, con palabra clave y con fuera de horario, `parts` no lleva el texto del «no entiendo» y `claims.fallback` es `false`.
  - `de noche: fuera de horario y después no entiendo`.
  - `sin texto no hay no entiendo`: `{ type: 'image', text: 'Imagen', caption: null }` de un contacto ya saludado → `skip 'no_match'`.
  - `la misma palabra clave vuelve tras handoffHours`: con `handoffHours: 1`, el precio respondido hace 2 h vuelve a salir; hace 30 min, no. Se cambia el test `la misma regla no se repite en 24 h` (comentario: antes eran 24 h fijas).
  - `el no entiendo vuelve tras handoffHours`.
  - `botStateUpdate marca el no entiendo`.
- [ ] **Implementar:** el «no entiendo» va después del fuera de horario, solo si `parts` está vacío. La ventana de las palabras clave pasa a `settings.handoffHours * HOUR_MS`.
- [ ] **`cd Backend && npm test`**: todo en verde.
- [ ] **Commit** — `respuestas automáticas: «si no entiende» y una sola ventana para no repetirse`

### Tarea 2: Guardarlo y enviarlo

**Files:** Modify `Backend/src/models/auto.reply.settings.model.js`, `Backend/src/models/conversation.model.js` (`bot.fallbackRepliedAt: Date`), `Backend/src/schemas/auto.reply.schema.js`, `Backend/src/controllers/auto.reply.controller.js` (serializar; `previewAutoReply` añade `fallback: claims.fallback`), `docs/arquitectura/respuestas-automaticas.md`, `docs/arquitectura/api.md`; Test `Backend/tests/isolation/auto-replies.test.js`.

**Interfaces:** el esquema acepta `fallback: { enabled, text }` con `.default({ enabled: false, text: '' })` y el mismo «texto si está encendido» que la bienvenida. El `GET` lo devuelve siempre (una configuración vieja, apagado).

- [ ] **Tests que fallan:**
  - `guardar y leer el no entiendo`: `PUT` con `fallback` y `GET` lo devuelve; sin `fallback` en el cuerpo, 200 y apagado.
  - `un documento guardado antes del cambio se lee con el no entiendo apagado` (insertado sin el campo).
  - `encendido y vacío da 400`.
  - `el worker manda el no entiendo una sola vez`: un contacto ya saludado manda dos mensajes sin palabra clave, en dos webhooks; con `drain`, un solo envío a Meta con el texto del «no entiendo», y `fallbackRepliedAt` marcado.
- [ ] **Implementar.** El worker no cambia: aplica `botStateUpdate` con los `claims`.
- [ ] **`npm test` y `npm run test:isolation`**: en verde.
- [ ] **Commit** — `respuestas automáticas: el «no entiendo» en la configuración y en el envío`

### Tarea 3: El paso «Si no entiende»

**Files:** Modify `Frontend/src/models/autoReply.model.ts`, `Frontend/src/utils/autoReplyForm.ts`, `pages/private/AutoReplies/` (`AutoRepliesPage.tsx`, `StepBar.tsx`, `stepState.ts`, `ReviewStep.tsx`, `SilenceStep.tsx`, `TestPanel.tsx`, `useAutoReplyEditor.ts`); Create `pages/private/AutoReplies/FallbackStep.tsx`.

- **El paso,** entre «Palabras clave» y «Cuándo se calla» (`EDIT_STEPS` con `fallback`; el asistente pasa a 6 pasos). Tiene el aspecto de «Bienvenida»: interruptor en la cabecera (`SectionToggle`) y `ReplyTextField`. Debajo, una nota: sale solo cuando no saldría nada más, una vez cada N h por conversación, y nunca con fotos o audios sin texto. No hace falta un diseño nuevo de Claude Design (decisión de Jonathan).
- **El ejemplo** (spec § 10) en «Empezar con un ejemplo»; «desde cero», encendido y vacío, como los demás. `draftOf` lo apaga si queda vacío; `formIssues` lo marca («Escribe el mensaje, o apágalo.»).
- **Resumen** en la barra («Una vez cada 12 h por conversación») y su tarjeta en «Revisar y encender».
- **«Cuándo se calla»:** la frase de las palabras clave pasa a «Palabras clave y «no entiendo»: una vez por conversación en esas horas».
- **«Probar»:** el motivo «No entiende: respondió con el mensaje de no entiendo» cuando `fallback`.
- [ ] **Comprobar** con `npm run lint` y `npm run build`, y en Chrome: el asistente de 6 pasos, guardar, recargar, «Probar» con «me gusta el café con pan», en escritorio y en el teléfono.
- [ ] **Commit** — `respuestas automáticas: el paso «Si no entiende»`

---

## PR 5 · Probar como conversación (rama `respuestas-automaticas-conversacion`)

### Tarea 4: Simular una conversación

**Files:** Modify `Backend/src/utils/auto.reply.js`, `Backend/src/schemas/auto.reply.schema.js`, `Backend/src/controllers/auto.reply.controller.js`, `docs/arquitectura/api.md`, `docs/arquitectura/respuestas-automaticas.md`; Test `Backend/tests/auto.reply.test.js` y `Backend/tests/isolation/auto-replies.test.js`.

**Interfaces:**
- `simulateConversation({ settings, messages, now }) → turns: [{ parts, text, matchedRuleIndexes, outOfHours, fallback, skip }]`, en `utils/auto.reply.js`. Cada regla recibe como id su posición. Entre mensaje y mensaje, el estado avanza como tras un envío aceptado: `welcomedAt`, `previousInboundAt` (el mensaje anterior), `keywordRepliedAt`, `outOfHoursNotified` y `fallbackRepliedAt`. **Sin `recentReplies`**, así el freno no aplica. Todo con `now`.
- `autoReplyPreviewSchema`: `{ settings, messages: z.array(texto 1–1000).min(1).max(20) }`, sin `text`.
- `POST /preview` → `{ turns: [{ reply, parts, matchedRuleIndexes, outOfHours, fallback, skip }] }`, con `skip` `null` si respondió.

- [ ] **Tests que fallan:**
  - `simulateConversation reproduce la tabla de Jonathan`.
  - `simulateConversation no frena las ráfagas`: cinco mensajes con cinco reglas distintas, las cinco responden.
  - `simulateConversation marca lo mismo que el worker`: para unos `claims`, el estado siguiente coincide con lo que escribe `botStateUpdate` (sin el freno). Así la prueba no se desfasa del envío real.
  - Aislamiento: `probar una conversación responde turno a turno`; `más de 20 mensajes da 400`; el caso que ya existe de probar sin guardar pasa a `messages`.
- [ ] **Implementar.**
- [ ] **`npm test` y `npm run test:isolation`**.
- [ ] **Commit** — `respuestas automáticas: probar simula una conversación`

### Tarea 5: La conversación en «Probar»

**Files:** Modify `Frontend/src/models/autoReply.model.ts` (`AutoReplyPreviewTurn`), `Frontend/src/services/api.service.ts`, `Frontend/src/hooks/useAutoReplies.ts` (`usePreviewAutoReply(settings, messages, enabled)`), `pages/private/AutoReplies/TestPanel.tsx`, `docs/arquitectura/respuestas-automaticas.md`, `docs/arquitectura/frontend.md`.

- **Los mensajes del cliente** se guardan en el estado del panel. Cada envío añade uno, y la consulta lleva todos: al cambiar la configuración, la conversación se vuelve a simular entera (decisión de Jonathan).
- **El hilo** alterna burbujas: las del cliente y las del bot, con su hora y «Bot». Debajo de cada respuesta, una línea con el porqué («Bienvenida · Regla 2, «precio»»). Si no respondió, una nota centrada con el motivo, calculado en el frontend con los turnos anteriores:
  - «Ya respondió «precio» en esta conversación»: una regla coincide (`matchedKeyword`) pero no respondió, y respondió antes;
  - «El «no entiendo» ya salió»;
  - «Ninguna regla coincidió».
- **«Reiniciar conversación»** en la cabecera del panel. Al llegar a 20 mensajes, el campo se desactiva con «Reinicia para seguir probando».
- [ ] **Comprobar** con `lint` y `build`, y en Chrome: la tabla de Jonathan escrita en el panel; cambiar el texto de una regla a mitad y ver que la conversación se recalcula; «Reiniciar»; en el teléfono, en la hoja.
- [ ] **Commit** — `respuestas automáticas: «Probar» como una conversación`

## Al terminar

- **El PR de versión** (`version-1.0.23`) recoge los PRs 1 a 5, con `docs/estado.md` al día.
- **Al desplegar:** se reconstruyen `wasmish-api` y `wasmish-web`. No hace falta migración: un documento sin `fallback` se lee apagado.
