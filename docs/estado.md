# Estado del proyecto

Qué está en producción, qué hay en curso, qué viene y qué cabos sueltos se conocen. Es el sitio donde un agente le deja el trabajo al otro: **se lee al empezar una sesión y se actualiza al empezar o terminar algo, y al desplegar.**

> El mapa de toda la documentación está en el [AGENTS.md](../AGENTS.md) de la raíz. Lo que Jonathan ya decidió, en [decisiones.md](decisiones.md).

## En producción

**Versión 1.0.15**, desplegada el 2026-10-13 (etiqueta `v1.0.15`; comprobar con `curl https://wasmish.solventyc.com/api/version`). Lleva:

- **Multi-línea · Fase 2c** (PRs #19 a #23, más los ajustes de la UI del #25): `Line` y `Waba` son la fuente de la conexión y `User` queda como copia de la línea por defecto; la API de líneas (`GET /lines`, renombrar, hacer por defecto, desconectar) y el límite `maxLines` del superadmin; Ajustes → Líneas; elegir y ver la línea en Chats, en las fichas, en Campañas y en Plantillas («Se envía desde»). Con `maxLines: 1` (todas las cuentas reales) se ve y funciona como la 1.0.14. Sin migración de datos: `migrate:lines -- --check` en 0 con la 1.0.14 en marcha y otra vez con la 1.0.15, con `mongodump` antes. Jonathan comprobó en vivo entrantes, respuestas, Ajustes y el cliente de la API (PractyCo). Antes se revisó en local con un cliente de prueba de cuatro líneas.
- **Multi-línea · Fase 2b** (PRs #13 a #16, en producción desde la 1.0.14): lo que entra y sale de WhatsApp va por su **línea**. El webhook encuentra la cuenta y la línea por el número, una conversación es de un contacto en una línea, los envíos salen con el número de la línea y el token de su `Waba`, las plantillas se buscan en el WABA de la línea, el worker reparte por línea y la API pública admite `lineId` o `from` (sin ellos, igual que antes). `User` sigue siendo la fuente de la conexión: si la proyección no cuadra, la reserva usa `User`. Responder en una conversación de un número que ya no está conectado da 409. Sin cambio visible con `maxLines: 1`. Se desplegó con `migrate:lines` corrido con la imagen nueva **antes de arrancarla** (cambió el índice de conversaciones y puso el WABA a las plantillas que no lo tenían), `--check` en 0 antes y después, y Jonathan comprobó en el navegador enviar, recibir, Contactos y Plantillas. Ensayado antes con una copia de producción: las cuentas envían y reciben por su línea sin usar la reserva.
- **Multi-línea · Fase 2a** (PR #9, en producción desde la 1.0.13): las colecciones `wabas` y `lines`, una proyección de la conexión que guarda el owner en `User` (que sigue siendo la fuente de verdad); conectar WhatsApp las sincroniza, y un WABA solo puede estar en una cuenta (409 si ya es de otra). Las conversaciones, campañas y plantillas nuevas guardan su línea y su WABA, pero todavía nada enruta por ellos. Sin cambio visible. Se migró con `migrate:lines` sin parar la API (plan de la Fase 2a, «Antes de desplegar»), y en producción `--check` salió con 0.
- **Multi-línea · Fase 1** (PR #8, en producción desde la 1.0.12): la cuenta (`Account`) separada del usuario, con el mismo `_id` que su owner; el backend toma al dueño de los datos de `req.auth.accountId`; el registro crea cuenta y owner e ignora `rol` y `status` del cuerpo; un usuario desactivado o sin cuenta recibe 401; el superadmin sale de `isSuperadmin`; la API key es de la cuenta. Sin cambio visible. **Despliegue con migración** (`migrate:accounts`), con la API vieja parada durante la última pasada: plan de la Fase 1, «Antes de desplegar».
- **Multi-línea · Fase 0** (PR #6, en producción desde la 1.0.11): un `phoneNumberId` solo puede estar en una cuenta (índice único `user_phoneNumberId_unique`) y, al conectarlo por el Embedded Signup o por el formulario manual, Meta tiene que listarlo en el WABA del token. Sin WhatsApp conectado, enviar texto o archivo da 409 y sincronizar plantillas 400, en vez de 500. Previo al despliegue: la consulta de `phoneNumberId` repetidos del plan, hecha por Jonathan el 2026-10-11 (`[]`).
- Chat: ficha del contacto (notas, etiquetas, datos), enviar archivos (imagen, vídeo, audio, documento) y los no leídos que se ponen a cero al responder. Jonathan confirmó en producción que los archivos llegan a WhatsApp.
- Contactos con teléfono y BSUID, bajas de publicidad, cambio de número, etiquetas e importar desde CSV o Excel.
- Campañas, con archivo de cabecera por campaña.
- Ventana de 24 h, adjuntos entrantes, conversación nueva con plantilla, API pública con API key, Embedded Signup (App Review de Meta aprobado el 2026-08-31).

**Hay un cliente real usando la API pública** (`POST /api/v1/templates/send`), sobre todo para el OTP de su login: cualquier cambio en `processTemplateSending` o en ese endpoint le afecta. Revisar ese diff con más cuidado.

## En curso

- **Desplegar la 1.0.16**, por Jonathan con `/deploy`, cuando él decida. La versión ya está subida; **aún no se despliega**. Lleva:
  - **Registrar el número en la Cloud API al conectarlo** (PRs #27 y #28): un número nuevo conectado por el Embedded Signup o el formulario manual se registra con un PIN de dos pasos, que se guarda cifrado (`Line.twoStepPin`, y `Waba.pendingTwoStepPins` mientras se registra). Sin esto, un número recién estrenado conecta pero no puede enviar (`133010`). Un número ya registrado (el del cliente de la API pública) no se toca.
  - `GET /api/lines/:id/pin`: el PIN de una línea. La UI para verlo espera el diseño (brief: `docs/superpowers/specs/2026-10-13-pin-linea-brief-ui.md`).

  **Antes de desplegar:** no hay migración de datos (los campos nuevos empiezan vacíos).
  1. `mongodump`.
  2. Compilar y `up` de la 1.0.16.
  3. Comprobar `GET /api/version`, los logs (sin «MODO DE PRUEBA» ni E11000) y un `POST /api/v1/templates/send` con 200.

  **Después de desplegar,** la prueba con el número nuevo de Jonathan en una cuenta de prueba de producción (plan del registro, «Al terminar»): conectarlo por el Embedded Signup, ver `/register` en los logs (si sale el aviso `platform_type inesperado`, Meta no manda `NOT_APPLICABLE` para un número nuevo y hay que ajustar `needsRegistration`), recibir y responder desde Wasmish, leer el PIN con `GET /lines/:id/pin`, y renovar el token (repetir el Embedded Signup con el mismo número) sin que se vuelva a registrar. Cierra el cabo suelto «Conectar WhatsApp sin probar contra Meta de verdad».

  **Volver atrás:** las imágenes `:1.0.15` ignoran los campos nuevos. Un número registrado mientras tanto sigue registrado en Meta.

<!-- Formato de una entrada:
- **<qué>** — rama `<rama>`, PR #<n>, empezado el <fecha> por <Claude|Codex|Jonathan>.
  Hecho: … · Falta: … · Sin probar: …
-->

## Lo siguiente

- **Multi-línea y multi-agente, fases 1 a 4** (diseño aprobado, sin preguntas abiertas: `docs/superpowers/specs/2026-10-11-multi-linea-multi-agente-design.md`). Fases 1, 2a y 2b en producción (la 2b, enrutar por línea, desde la 1.0.14). La **Fase 2c** está en producción desde la 1.0.15.
  - **Para encender varias líneas** (plan de la 2c, «Después de desplegar»):
    1. La prueba del token: ¿un token nuevo del Embedded Signup cubre todos los números del WABA? (spec § 2.2). Se puede hacer en producción con una cuenta de prueba. Jonathan ya tiene **un** número (2026-10-13, sin comprobar si sirve), que sirve para probar el registro y renovar el token; la prueba completa necesita **dos números en el mismo WABA**.
    2. El ensayo de la vuelta atrás con dos líneas en local.
    3. `maxLines: 2` en una cuenta de prueba desde el panel.
  - Sigue la **Fase 3**: equipo, roles y acceso por línea.
- **Próximo módulo: un chatbot.** Jonathan aún no decidió de qué tipo. La propuesta sobre la mesa: empezar por respuestas automáticas (bienvenida, fuera de horario, palabras clave) como un motor de «respuestas» en el webhook, con traspaso a una persona (el bot se calla si alguien responde a mano) y la marca «Bot» en el chat; después, flujos con botones (requiere enviar mensajes interactivos) o IA. Antes de empezar: preguntar el tipo y qué problema concreto del cliente resuelve.
- **La UI del PIN de dos pasos** en Ajustes → Líneas, cuando Claude Design devuelva el diseño del brief `docs/superpowers/specs/2026-10-13-pin-linea-brief-ui.md`.
- El campo de archivo de cabecera al enviar una plantilla a **un solo contacto** (`SendTemplateDialog` y `NewConversationPanel`); hoy solo existe en las campañas.
- En la API pública: el campo `header`, la cabecera de texto con variable y las plantillas de carrusel. Toca al cliente de la API: con cuidado.
- Más adelante: programar campañas para una hora.
- Checks azules a Meta (`status: read`) como opción del usuario en Ajustes: Jonathan lo quiere, pero **no es prioridad**.

## Cabos sueltos conocidos

- **Conectar WhatsApp sin probar contra Meta de verdad** (Fase 0, 1.0.11): los tests usan un Meta falso. Falta conectar el número de pruebas de WasmishTest por el Embedded Signup y por el formulario manual, y ver que un número de otro WABA da 400. Desde la 1.0.13 (Fase 2a), comprobar también que, al conectar, se crean su `Waba` y su `Line` (`migrate:lines -- --check` con 0). Se hará con el número de pruebas, junto con la comprobación del token de antes de la 2c. **El `.env` local está mezclado** (el backend con la app WasmishTest y el frontend con la de producción): para el Embedded Signup en local, los dos tienen que apuntar a WasmishTest, con un Config ID propio de esa app.
- **Adjuntos:** nadie limpia el volumen de archivos (`MEDIA_DIR`, también `outbound/` y `templates/`): se acumulan sin política de retención. Los mensajes anteriores al 2026-09-08 no tienen archivo, y el script para recuperar los que Meta aún guarda no existe. Jonathan decidió que las dos cosas pueden esperar.
- **Plantillas con cabecera de archivo:** ningún cliente tiene todavía. El primero que la cree tiene que subir el archivo en Plantillas (sin él, el envío da 400 antes de llegar a Meta).
- **Plantillas sincronizadas hace mucho:** si les falta `Template.buttons`, el diálogo de enviar plantilla no pide los valores de los botones. Se arregla pulsando *Sincronizar* en Plantillas.
- **Conversación nueva con plantilla:** cuatro detalles los decidió el agente y Jonathan no los confirmó. Si Meta rechaza el envío, la conversación queda creada con el mensaje fallido junto al borrador. «Esperando respuesta» conserva el botón «Enviar plantilla». El aviso de la cabecera es genérico. Y si se cambia de conversación antes de que termine el envío, al acabar lleva al chat nuevo.
- **Importar:** un contacto que solo tiene BSUID no se reconoce por teléfono al importar (se crea otro). La casilla de consentimiento empieza sin marcar y las tandas son de 200: decisiones del agente, a revisar. Sin probar a ojo: el aviso de más de 5000 al crear una campaña desde Importar.
- **Bandeja de Chats:** un contacto sin ningún nombre sale con el teléfono como título y un dígito como avatar (`initials(title)` en `ConversationList`). Sin confirmar si sigue.
- **Código muerto** en `hooks/useSendMessage.ts` y `pages/private/DashboardPage`: «dejarlo por el momento». `Frontend/src/index.js` está vacío y se puede borrar.
- **Bundle del frontend:** 792 kB el 2026-10-11 y crece con cada módulo; candidato a cargar las páginas con `lazy`.
- `npm run version:bump` no toca los `package-lock.json`: el siguiente `npm install` deja un diff.
- Pregunta abierta: ¿hay lógica duplicada entre `processTemplateSending` y `processMessageSending`?
