# Estado del proyecto

Qué está en producción, qué hay en curso, qué viene y qué cabos sueltos se conocen. Es el sitio donde un agente le deja el trabajo al otro: **se lee al empezar una sesión y se actualiza al empezar o terminar algo, y al desplegar.**

> El mapa de toda la documentación está en el [AGENTS.md](../AGENTS.md) de la raíz. Lo que Jonathan ya decidió, en [decisiones.md](decisiones.md).

## En producción

**Versión 1.0.20**, desplegada el 2026-10-15 (etiqueta `v1.0.20`; comprobar con `curl https://wasmish.solventyc.com/api/version`). Lleva:

- **Pulido de la app móvil** (PRs #55 y #56, solo frontend; sin migración. Se reconstruyen `wasmish-web` y `wasmish-api`, esta solo para que `/api/version` diga 1.0.20):
  - Si activar los avisos falla, el aviso dice si es del navegador o de Wasmish; en Brave, qué ajuste encender (#55). Sin probar en un Brave de verdad.
  - En el teléfono: el menú ya no se abre y se cierra solo al recargar, la etiqueta del menú ya no se queda en el borde tras elegir una opción, y un nombre de archivo largo ya no saca de la pantalla el botón de quitarlo (#56). Probado en Chrome emulando un Android, no en un teléfono.
- **Wasmish en el celular: app instalable y avisos push** (en producción desde la 1.0.19, desplegada la noche del 2026-10-14, hora de Ecuador; PRs #41 a #50, cada uno con su revisión de Codex; plan `docs/superpowers/plans/2026-10-14-app-movil.md`, diseño `Design/Wasmish Móvil - App instalable y avisos.html`):
  - **Avisos push:** una suscripción por dispositivo (`PushSubscription`) y un aviso por cada mensaje que la persona puede ver, aunque la app esté cerrada. El webhook no lo espera. Tocar el aviso abre la conversación.
  - **La app instalable:** manifest, íconos menta y service worker sin caché.
  - **Ajustes → «Este dispositivo»:** activar o apagar los avisos con todos sus estados, «Instalar Wasmish» y la guía de iPhone.
  - **En Chats:** la invitación en la bandeja del celular, la hoja «Último paso» del iPhone y el aviso del login en la app instalada.
  - **Chats en el teléfono:** bandeja, hilo, teclado, zonas seguras, «atrás» de Android, la ficha, la plantilla como hoja y la conversación nueva como pantalla.
  - **Despliegue:** con las claves VAPID de producción en `api.env` (generadas una vez y **no se cambian**: cambiarlas obliga a todos a volver a activar los avisos). Sin migración: la colección nueva crea su índice al arrancar. Reconstruye `wasmish-api` y `wasmish-web` (cambió `nginx.conf`).
  - **Probado en Chrome emulando teléfonos.** Al desplegar: `/api/version` 1.0.19, logs limpios, el manifest como `application/manifest+json` y `sw.js` con `no-cache`. En local por ngrok no se pudo probar instalar: ngrok gratis pone su página de aviso delante del manifest.
  - **Probado en producción el 2026-10-15** en el Android de Jonathan (Chrome) y en un iPhone (Safari, añadida a la pantalla de inicio): se instala en los dos y los avisos llegan, también con la **misma cuenta abierta en los dos a la vez** (un aviso a cada dispositivo). Jonathan la dio por buena en general; el teclado, «atrás» y el toque en el aviso no se repasaron uno por uno.
    - En la compu, con **Brave**, activar los avisos da «No pudimos activarlos»: Brave trae apagado el servicio de push de Google (ver «Cabos sueltos»).

- **Multi-línea · Fase 3: equipo, roles y acceso por línea** (PRs #33 a #37, cada uno con su revisión de Codex): permisos por rol (`requirePermission`, 403) y acceso por línea (`conversationScope`, 404), el tiempo real filtrado por línea y permiso (`canReceive`), el equipo y las invitaciones (`/api/team`, `/api/invitations/:token`, `maxUsers`), quién envió cada mensaje (`Message.sentBy` y `origin`), Ajustes → Equipo, la página de aceptar la invitación y la columna de usuarios del superadmin. Plan: `docs/superpowers/plans/2026-10-14-multi-linea-fase-3.md`. Con un solo usuario por cuenta (todas las reales) se ve y funciona como antes. Sin migración de datos: `mongodump` antes, y los logs sin «MODO DE PRUEBA» ni E11000. Jonathan lo comprobó en el navegador; queda por ver en los logs un `POST /api/v1/templates/send` con 200 del cliente real. **No subir `maxUsers` en una cuenta real** hasta el ensayo de la vuelta atrás con dos usuarios (ver «Lo siguiente»).
- **Esperar a `/register` hasta 60 s** al conectar un número nuevo (#30, de la 1.0.17, que no llegó a desplegarse sola), con el candado de líneas de 90 s mientras tanto. En la 1.0.16, la primera conexión de un número nuevo daba 502 porque Meta tarda más de 10 s.
- **La UI del PIN de dos pasos** en «Detalles» de cada línea (#31, también de la 1.0.17): oculto, «Mostrar», copiar, «Ocultar», «Sin PIN guardado» y errores con «Reintentar». `GET /lines` dice `hasTwoStepPin`. Y «Reintentar» en el aviso rojo de `phone_number_registration_failed` al conectar.
- **Registrar el número en la Cloud API al conectarlo** (PRs #27 y #28, en producción desde la 1.0.16): un número nuevo conectado por el Embedded Signup o el formulario manual se registra con un PIN de dos pasos, que se guarda cifrado (`Line.twoStepPin`, y `Waba.pendingTwoStepPins` mientras se registra), y `GET /api/lines/:id/pin` lo devuelve. Un número ya registrado (el del cliente real) no se toca. **Probado en producción** el 2026-10-14 con un número real de Jonathan en una cuenta de prueba: un número nuevo llega con `platform_type: 'NOT_APPLICABLE'` (lo que suponía el plan), recibe y responde, renovar el token funciona, y el PIN se guardó. `/register` tardó más de 10 s las dos veces: la primera conexión dio 502 y la segunda recuperó el PIN apuntado (arreglado en el #30, en la 1.0.18).
- **Multi-línea · Fase 2c** (PRs #19 a #23, más los ajustes de la UI del #25, en producción desde la 1.0.15): `Line` y `Waba` son la fuente de la conexión y `User` queda como copia de la línea por defecto; la API de líneas (`GET /lines`, renombrar, hacer por defecto, desconectar) y el límite `maxLines` del superadmin; Ajustes → Líneas; elegir y ver la línea en Chats, en las fichas, en Campañas y en Plantillas («Se envía desde»). Con `maxLines: 1` (todas las cuentas reales) se ve y funciona como la 1.0.14. Sin migración de datos: `migrate:lines -- --check` en 0 con la 1.0.14 en marcha y otra vez con la 1.0.15, con `mongodump` antes. Jonathan comprobó en vivo entrantes, respuestas, Ajustes y el cliente de la API (PractyCo). Antes se revisó en local con un cliente de prueba de cuatro líneas.
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

Nada en curso.

<!-- Formato de una entrada:
- **<qué>** — rama `<rama>`, PR #<n>, empezado el <fecha> por <Claude|Codex|Jonathan>.
  Hecho: … · Falta: … · Sin probar: …
-->

## Lo siguiente

- **Avisar al cliente real** de que ya puede usar Wasmish en el celular, con los avisos.
- **Multi-línea y multi-agente, fases 1 a 4** (diseño aprobado, sin preguntas abiertas: `docs/superpowers/specs/2026-10-11-multi-linea-multi-agente-design.md`). Fases 1, 2a y 2b en producción (la 2b, enrutar por línea, desde la 1.0.14). La **Fase 2c** está en producción desde la 1.0.15.
  - **Para encender varias líneas** (plan de la 2c, «Después de desplegar»):
    1. La prueba del token: ¿un token nuevo del Embedded Signup cubre todos los números del WABA? (spec § 2.2). Se puede hacer en producción con la cuenta de prueba de Jonathan (`maxLines: 2`), pero necesita **dos números en el mismo WABA**: hoy tiene uno conectado. Una cuenta con dos líneas de WABA distintos ya se probó el 2026-10-14.
    2. El ensayo de la vuelta atrás con dos líneas en local.
    3. `maxLines: 2` en una cuenta de prueba desde el panel.
  - La **Fase 3** (equipo, roles y acceso por línea) está en producción desde la 1.0.18. **Para encender equipos en una cuenta real** (subir su `maxUsers`): antes, el ensayo de la vuelta atrás con dos usuarios (plan de la Fase 3, «Al terminar»), porque con una imagen anterior a la Fase 3 el agente vería y haría todo; y se enciende primero en la cuenta de prueba de Jonathan. Volver atrás a las imágenes `:1.0.16` solo es seguro mientras ninguna cuenta tenga más de un usuario.
  - Sigue la **Fase 4**: asignar conversaciones («Mías / Sin asignar / Todas») y transferirlas.
- **Próximo módulo: un chatbot.** Jonathan aún no decidió de qué tipo. La propuesta sobre la mesa: empezar por respuestas automáticas (bienvenida, fuera de horario, palabras clave) como un motor de «respuestas» en el webhook, con traspaso a una persona (el bot se calla si alguien responde a mano) y la marca «Bot» en el chat; después, flujos con botones (requiere enviar mensajes interactivos) o IA. Antes de empezar: preguntar el tipo y qué problema concreto del cliente resuelve.
- El campo de archivo de cabecera al enviar una plantilla a **un solo contacto** (`SendTemplateDialog` y `NewConversationPanel`); hoy solo existe en las campañas.
- En la API pública: el campo `header`, la cabecera de texto con variable y las plantillas de carrusel. Toca al cliente de la API: con cuidado.
- Más adelante: programar campañas para una hora.
- Checks azules a Meta (`status: read`) como opción del usuario en Ajustes: Jonathan lo quiere, pero **no es prioridad**.

## Cabos sueltos conocidos

- **Avisos push en Brave:** Brave trae apagado «Usar los servicios de Google para la mensajería push» (`brave://settings/privacy`), y sin eso la suscripción falla en el navegador antes de llegar al backend. Desde el PR `fix-push-error-navegador`, Wasmish lo dice y explica el ajuste (antes culpaba a la conexión). Sin comprobar: que activándolo funcione, y que Brave en Android tenga ese ajuste.

- **Archivos de cabecera y líneas (Fase 3):** `GET /templates/media/:id` solo comprueba la cuenta, no la línea: alguien de la cuenta que conozca el id de una cabecera de una plantilla de otro WABA puede descargarla. Los archivos (`TemplateMedia`) no son de ninguna línea ni WABA (una campaña puede usar cualquiera, y se suben antes de elegir) y su contenido es lo que la cuenta manda a sus clientes. Atarlos a un WABA es un cambio de modelo aparte, si Jonathan lo quiere (revisión de Codex del PR #34).
- **Conectar WhatsApp contra Meta de verdad:** el Embedded Signup se probó en producción el 2026-10-14 (conectar, registrar, renovar el token, crear su `Waba` y su `Line`). Falta el formulario manual contra Meta y ver que un número de otro WABA da 400. **El `.env` local está mezclado** (el backend con la app WasmishTest y el frontend con la de producción): para el Embedded Signup en local, los dos tienen que apuntar a WasmishTest, con un Config ID propio de esa app.
- **Adjuntos:** nadie limpia el volumen de archivos (`MEDIA_DIR`, también `outbound/` y `templates/`): se acumulan sin política de retención. Los mensajes anteriores al 2026-09-08 no tienen archivo, y el script para recuperar los que Meta aún guarda no existe. Jonathan decidió que las dos cosas pueden esperar.
- **Plantillas con cabecera de archivo:** ningún cliente tiene todavía. El primero que la cree tiene que subir el archivo en Plantillas (sin él, el envío da 400 antes de llegar a Meta).
- **Plantillas sincronizadas hace mucho:** si les falta `Template.buttons`, el diálogo de enviar plantilla no pide los valores de los botones. Se arregla pulsando *Sincronizar* en Plantillas.
- **Conversación nueva con plantilla:** cuatro detalles los decidió el agente y Jonathan no los confirmó. Si Meta rechaza el envío, la conversación queda creada con el mensaje fallido junto al borrador. «Esperando respuesta» conserva el botón «Enviar plantilla». El aviso de la cabecera es genérico. Y si se cambia de conversación antes de que termine el envío, al acabar lleva al chat nuevo.
- **Importar:** un contacto que solo tiene BSUID no se reconoce por teléfono al importar (se crea otro). La casilla de consentimiento empieza sin marcar y las tandas son de 200: decisiones del agente, a revisar. Sin probar a ojo: el aviso de más de 5000 al crear una campaña desde Importar.
- **Pulir la UI** (Jonathan lo vio el 2026-10-14; juntar estos arreglos en una rama, p. ej. `pulir-ui`): el texto de `CustomButton` queda caído cuando su contenedor es más bajo que 42 px (11 + 20 + 11 de `py-[11px]` y `text-sm`): ~4 px en `h-[34px]` (popover de límites del superadmin), ~3 px en `h-9`, ~1 px en `h-10`. Arreglo propuesto: `flex items-center justify-center` en el `<button>` de `components/Button/Button.tsx`. Sin aplicar ni probar.
- **Bandeja de Chats:** un contacto sin ningún nombre sale con el teléfono como título y un dígito como avatar (`initials(title)` en `ConversationList`). Sin confirmar si sigue.
- **Código muerto** en `hooks/useSendMessage.ts` y `pages/private/DashboardPage`: «dejarlo por el momento». `Frontend/src/index.js` está vacío y se puede borrar.
- **Bundle del frontend:** 792 kB el 2026-10-11 y crece con cada módulo; candidato a cargar las páginas con `lazy`.
- `npm run version:bump` no toca los `package-lock.json`: el siguiente `npm install` deja un diff.
- Pregunta abierta: ¿hay lógica duplicada entre `processTemplateSending` y `processMessageSending`?
