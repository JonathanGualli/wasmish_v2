# Estado del proyecto

Qué está en producción, qué hay en curso, qué viene y qué cabos sueltos se conocen. Es el sitio donde un agente le deja el trabajo al otro: **se lee al empezar una sesión y se actualiza al empezar o terminar algo, y al desplegar.**

> El mapa de toda la documentación está en el [AGENTS.md](../AGENTS.md) de la raíz. Lo que Jonathan ya decidió, en [decisiones.md](decisiones.md).

## En producción

**Versión 1.0.10** (comprobado el 2026-10-11 con `curl https://wasmish.solventyc.com/api/version`). Lleva:

- Chat: ficha del contacto (notas, etiquetas, datos), enviar archivos (imagen, vídeo, audio, documento) y los no leídos que se ponen a cero al responder. Jonathan confirmó en producción que los archivos llegan a WhatsApp.
- Contactos con teléfono y BSUID, bajas de publicidad, cambio de número, etiquetas e importar desde CSV o Excel.
- Campañas, con archivo de cabecera por campaña.
- Ventana de 24 h, adjuntos entrantes, conversación nueva con plantilla, API pública con API key, Embedded Signup (App Review de Meta aprobado el 2026-08-31).

**Hay un cliente real usando la API pública** (`POST /api/v1/templates/send`), sobre todo para el OTP de su login: cualquier cambio en `processTemplateSending` o en ese endpoint le afecta. Revisar ese diff con más cuidado.

## En curso

Nada a medias en este momento (2026-10-11). La reorganización de la documentación y el flujo con CI, ramas y PRs ya está en `master`.

<!-- Formato de una entrada:
- **<qué>** — rama `<rama>`, PR #<n>, empezado el <fecha> por <Claude|Codex|Jonathan>.
  Hecho: … · Falta: … · Sin probar: …
-->

## Lo siguiente

- **Próximo módulo: un chatbot.** Jonathan aún no decidió de qué tipo. La propuesta sobre la mesa: empezar por respuestas automáticas (bienvenida, fuera de horario, palabras clave) como un motor de «respuestas» en el webhook, con traspaso a una persona (el bot se calla si alguien responde a mano) y la marca «Bot» en el chat; después, flujos con botones (requiere enviar mensajes interactivos) o IA. Antes de empezar: preguntar el tipo y qué problema concreto del cliente resuelve.
- El campo de archivo de cabecera al enviar una plantilla a **un solo contacto** (`SendTemplateDialog` y `NewConversationPanel`); hoy solo existe en las campañas.
- En la API pública: el campo `header`, la cabecera de texto con variable y las plantillas de carrusel. Toca al cliente de la API: con cuidado.
- Más adelante: programar campañas para una hora.
- Checks azules a Meta (`status: read`) como opción del usuario en Ajustes: Jonathan lo quiere, pero **no es prioridad**.

## Cabos sueltos conocidos

- **Adjuntos:** nadie limpia el volumen de archivos (`MEDIA_DIR`, también `outbound/` y `templates/`): se acumulan sin política de retención. Los mensajes anteriores al 2026-09-08 no tienen archivo, y el script para recuperar los que Meta aún guarda no existe. Jonathan decidió que las dos cosas pueden esperar.
- **Plantillas con cabecera de archivo:** ningún cliente tiene todavía. El primero que la cree tiene que subir el archivo en Plantillas (sin él, el envío da 400 antes de llegar a Meta).
- **Plantillas sincronizadas hace mucho:** si les falta `Template.buttons`, el diálogo de enviar plantilla no pide los valores de los botones. Se arregla pulsando *Sincronizar* en Plantillas.
- **Conversación nueva con plantilla:** cuatro detalles los decidió el agente y Jonathan no los confirmó. Si Meta rechaza el envío, la conversación queda creada con el mensaje fallido junto al borrador. «Esperando respuesta» conserva el botón «Enviar plantilla». El aviso de la cabecera es genérico. Y si se cambia de conversación antes de que termine el envío, al acabar lleva al chat nuevo.
- **Importar:** un contacto que solo tiene BSUID no se reconoce por teléfono al importar (se crea otro). La casilla de consentimiento empieza sin marcar y las tandas son de 200: decisiones del agente, a revisar. Sin probar a ojo: el aviso de más de 5000 al crear una campaña desde Importar.
- **Enviar texto o archivo con la ventana abierta y sin WhatsApp conectado** responde 500 («Cannot read properties of null») en vez de un 409 claro: `processMessageSending` llama a `decrypt` sin comprobar que haya token. Las plantillas sí lo comprueban. Encontrado con los tests de aislamiento; sin arreglar.
- **Bandeja de Chats:** un contacto sin ningún nombre sale con el teléfono como título y un dígito como avatar (`initials(title)` en `ConversationList`). Sin confirmar si sigue.
- **Código muerto** en `hooks/useSendMessage.ts` y `pages/private/DashboardPage`: «dejarlo por el momento». `Frontend/src/index.js` está vacío y se puede borrar.
- **Bundle del frontend:** 792 kB el 2026-10-11 y crece con cada módulo; candidato a cargar las páginas con `lazy`.
- `npm run version:bump` no toca los `package-lock.json`: el siguiente `npm install` deja un diff.
- Pregunta abierta: ¿hay lógica duplicada entre `processTemplateSending` y `processMessageSending`?
