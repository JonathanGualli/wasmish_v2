# Wasmish

SaaS multi-cliente de WhatsApp Business (Solventyc): cada cliente conecta su número de WhatsApp con «login con Facebook» (Embedded Signup) y desde Wasmish chatea con sus contactos, los organiza con etiquetas, los importa, les envía plantillas y campañas, y usa una API pública con API key. Producción: `https://app.wasmish.com` (`GET /api/version` dice qué versión corre); `wasmish.solventyc.com` sigue sirviendo `/api` para el webhook de Meta y la API pública, y `wasmish.com` es para la página pública → [deploy/README.md § Dominios](deploy/README.md#dominios).

Este archivo es para **cualquier agente**: Claude Code lo importa desde `CLAUDE.md` y Codex lo lee directo. Es corto a propósito: las reglas que valen siempre y el **mapa** para consultar cada tema a fondo. Se escribe en español; los identificadores nuevos, en inglés.

## Comandos de desarrollo

Monorepo con cuatro workspaces independientes: `Backend/` y `Frontend/` (la app), `Site/` (la página pública `wasmish.com`) y `Video/` (el video para las ventas). Cada uno tiene su propio `package.json` y `node_modules`.

| | Backend (`Backend/`) | Frontend (`Frontend/`) | Página (`Site/`) | Video (`Video/`) |
|---|---|---|---|---|
| Stack | Express 5 + MongoDB (Mongoose) + Zod | React 19 + TypeScript + Vite + Tailwind v4 + React Query | React 19 + Vite + Tailwind v4, pre-renderizado | Remotion + React 19 + Tailwind v4 |
| Arrancar | `npm run dev` (puerto 3001) | `npm run dev` (puerto 5173, proxy de `/api` al 3001) | `npm run build && npm run preview` | `npm run dev` (Remotion Studio) |
| Comprobar | `npm test` y `npm run test:isolation` | `npm run lint` y `npm run build` | `npm run lint`, `npm run build` y `npm test` | `npm run lint` y `npm test` |

**Antes de tocar `Backend/`, leer [Backend/AGENTS.md](Backend/AGENTS.md); antes de tocar `Frontend/`, [Frontend/AGENTS.md](Frontend/AGENTS.md).** Claude Code los carga solo al trabajar en esa carpeta; Codex, si se arranca en la raíz, no.

## Reglas que no se rompen

1. **Cada cuenta ve solo lo suyo.** Toda consulta filtra por la cuenta de la sesión (`findOne({ _id, userId: req.auth.accountId })`: el campo `userId` de los modelos guarda la **cuenta**, no la persona; nunca `findById` a secas sobre algo del cliente, ni `req.auth.userId` como dueño), y un recurso ajeno responde **404, no 403**. Un endpoint nuevo con `:id`, o que reciba ids en el cuerpo, lleva su caso en `Backend/tests/isolation/` → [pruebas-y-scripts.md § Tests de aislamiento](docs/arquitectura/pruebas-y-scripts.md#tests-de-aislamiento).
2. **El token de WhatsApp nunca sale del backend**: va cifrado en la BD y las respuestas dicen `whatsappConnected`, no el token. Las API keys se guardan hasheadas → [api.md](docs/arquitectura/api.md).
3. **No tocar el webhook de Meta**: es único por app, y apuntarlo a ngrok deja a los clientes reales sin mensajes entrantes. Se prueba con `npm run webhook:simulate` → [pruebas-y-scripts.md](docs/arquitectura/pruebas-y-scripts.md).
4. **Nunca apuntar el `.env` local a la base de datos de producción.** Los scripts de prueba se niegan a correr si `MONGO_URI` no es local.
5. **`CAMPAIGN_DRY_RUN` está encendido fuera de producción**: apagarlo en local manda WhatsApps reales a los contactos de la BD → [campanas.md](docs/arquitectura/campanas.md).
6. **Texto libre solo dentro de la ventana de 24 h**; fuera, plantilla. El «24» vive solo en `utils/whatsapp.window.js` → [whatsapp-envio.md § Ventana de 24 h](docs/arquitectura/whatsapp-envio.md#ventana-de-24-h-de-whatsapp).
7. **El webhook no se cae**: firma HMAC sobre el cuerpo crudo, un mensaje roto no tumba el lote y ningún mensaje se guarda con `text` vacío → [webhook-adjuntos.md](docs/arquitectura/webhook-adjuntos.md).
8. **La lógica de negocio va en funciones puras con su test** (`Backend/src/utils/`); el test de un bug corregido lleva un comentario con la regresión que vigila.
9. **Antes de cualquier cambio visual, la skill de marca** (`.agents/skills/brand-guidelines/SKILL.md`). Ver «Diseño y marca» abajo.
10. **Commits sin coautor ni atribución** a ningún agente, tampoco en los PRs. Y nada de push directo a `master` (ver «Flujo con git»).
11. **La documentación se mantiene al día**: al cambiar un comportamiento, se corrige su sección en `docs/arquitectura/`; un tema nuevo entra en el mapa de abajo. Si un documento contradice el código, manda el código y se corrige el documento.

## Cómo trabajar en este proyecto

Jonathan es el único desarrollador. Lo que espera de cualquier agente:

- **Responder siempre en español.** Los identificadores nuevos van en inglés; los comentarios, los commits, los PRs y la documentación, en español. Lo que ya existe con nombre en español (`procesarEntrante`, `descargarAdjunto`) no se renombra sin que lo pida.
- **El agente escribe el código** (desde el 2026-10-14; antes, por defecto, guiaba y Jonathan escribía). El orden:
  1. **Primero le cuenta qué va a hacer**: el PR, los archivos, los pasos y las decisiones discutibles.
  2. **Lo escribe** en una rama, en commits pequeños, y lo prueba.
  3. **Abre el PR** y espera el CI.
  4. **Revisión cruzada** del otro agente (ver abajo): corrige lo que encuentre y responde punto por punto.
  5. **Jonathan revisa el PR y lo une.** El agente no lo une, salvo que él diga lo contrario.
- **Si pide que lo guíe** («guíame», «quiero escribirlo yo»), el agente explica qué hacer y por qué, paso a paso, sin editar. **Cada bloque de código va completo y ejecutable:** lo pega tal cual, y un comentario como `// ← sin tocar` o `/* …lo que ya tenías… */` en lugar del código borra lo que funcionaba sin que los tests lo detecten. Si es largo, se parte en pasos.
- **Código limpio y reutilizar** lo que ya hay antes de crear algo nuevo. Ninguna carpeta nueva sin preguntar (`Backend/src/services/` ya está aprobada).
- **Al terminar algo**, un resumen con lo reutilizado, lo nuevo y las decisiones que el agente tomó por su cuenta, para que las revise.
- **Probar de verdad antes de decir «hecho»** (tests, `tsc`, lint y, si toca la UI, el navegador: ver [pruebas-y-scripts.md](docs/arquitectura/pruebas-y-scripts.md)). Si algo no se pudo probar, decirlo.
- **Lo decidido no se vuelve a proponer**: está en [docs/decisiones.md](docs/decisiones.md).

## Claude y Codex: un solo sitio para cada cosa

Los dos agentes trabajan en este repo. Para que no se desfasen, cada cosa vive en **un solo sitio**, que los dos leen y escriben:

| Qué | Dónde | Cuándo se actualiza |
|---|---|---|
| Reglas e instrucciones | este `AGENTS.md` y el de cada carpeta | Al cambiar una regla. `CLAUDE.md` solo importa este archivo y lleva lo propio de Claude; **una regla nueva nunca va en `CLAUDE.md`** |
| Cómo funciona cada módulo | `docs/arquitectura/` | **En el mismo PR** que cambia el comportamiento |
| Decisiones de Jonathan | `docs/decisiones.md` | Cuando decide algo |
| Qué está en producción, qué falta y **qué hay en curso** | `docs/estado.md` | Al empezar o terminar un trabajo, y al desplegar |
| Skills | `.agents/skills/` | — |
| Lo privado (servidor, cuentas y datos de Meta, deuda de seguridad) | la memoria privada, **fuera de este repo**, que es público | Cada agente sabe dónde está por su configuración personal |

- **Al empezar una sesión:** `git pull` y leer «En curso» de `docs/estado.md`. Si el otro agente dejó algo a medias, sigue en su rama y su PR.
- **Al terminar:** si el trabajo queda a medias, «En curso» dice en qué rama está, qué falta y qué no se probó.
- **Nada del proyecto se guarda solo en la memoria de un agente**: si el otro lo necesitaría, va a estos documentos.
- El CI tiene un check de documentación: falla si un enlace se rompe, si un archivo de `docs/arquitectura/` no está en el mapa o si un `CLAUDE.md` deja de importar su `AGENTS.md`.

## Revisión cruzada

Todo PR que toque código lo revisa **el agente que no lo escribió**, en **una sola ronda**. Un PR que solo cambia documentación no la necesita.

1. **Revisar**, desde la rama del PR y con los criterios de [.github/revision-cruzada.md](.github/revision-cruzada.md):
   - si escribió Claude, revisa Codex: `codex exec -s read-only --ephemeral -o /tmp/revision.md "$(cat .github/revision-cruzada.md)"` (solo lectura: no puede tocar nada). `codex review --base master` no admite instrucciones propias; por eso `exec`;
   - si escribió Codex, revisa Claude, con `/code-review` o con el mismo prompt.
2. **Publicar** la revisión tal cual como comentario del PR, titulado «Revisión de Codex» o «Revisión de Claude».
3. **Responder** el autor punto por punto en otro comentario: *aceptado*, con el commit que lo arregla, o *rechazado*, con el motivo comprobado en el código.
4. **Sin segunda ronda**: Jonathan lee los dos comentarios y decide si se une.

## Planes

Para una funcionalidad de varios pasos: primero el diseño (skill `brainstorming`, que deja el spec en `docs/superpowers/specs/`) y después el plan (skill `writing-plans`, en `docs/superpowers/plans/`), **antes de escribir código**. En Wasmish:

- El plan es el **primer commit de la rama** de la funcionalidad, y **lo revisa el otro agente** antes de empezar a programar (una ronda, igual que el código).
- Se ejecuta siempre **nativo**: rama, PR y revisión cruzada. `writing-plans` remite a otras skills de superpowers que este proyecto no usa (`subagent-driven-development`, `executing-plans`, `using-git-worktrees`): esas referencias se ignoran.
- Un cambio pequeño y claro no necesita plan.

## Desplegar

Solo cuando Jonathan lo pide, con la skill `deploy` (`.agents/skills/deploy/SKILL.md`; en Claude Code, `/deploy`). **Ningún agente despliega por su cuenta**, y cada comando que toca el servidor se confirma uno por uno. Lo desplegado queda registrado con una **etiqueta de git `vX.Y.Z`** sobre el commit: el próximo despliegue parte de la última. La versión se sube en un PR (con `docs/estado.md` al día), nunca en el momento de desplegar.

## Diseño y marca

**La interfaz la diseña Claude Design**, una IA aparte que ya tiene la marca, los colores y las referencias. Ningún agente diseña pantallas por su cuenta: escribe un **brief** (qué tiene que poder hacer el usuario y qué información ve, no cómo se ve) en `docs/superpowers/specs/<fecha>-<tema>-brief-ui.md`, como los que ya hay, y Jonathan se lo pasa. Con el diseño que devuelve (suele quedar en `Design/*.html`), el agente implementa **siguiéndolo**.

**Antes de crear o modificar cualquier componente, página, o estilo, consultar el skill `/brand-guidelines`.**

Esto incluye: nuevos componentes React, modificaciones de clases Tailwind, elección de colores, diseño de páginas, variantes de botones/inputs, layouts, iconografía, o cualquier decisión visual. El skill contiene la paleta de tokens, reglas de componentes, y anti-patterns del proyecto.

Identidad vigente: **Manual de marca v1.0 · dirección 3b «Barra oscura»** — verde tinta (`#0B3B2E`) sobre blanco puro y grises fríos, con menta (`#6FE3AE`) como único acento. El verde de WhatsApp `#25D366` **ya no forma parte de la marca**.

Fuentes originales del manual: `Frontend/brand/wasmishbrand/*.dc.html` (canvas de Claude Design). **No mover esa carpeta a `Frontend/dist/`** — un `npm run build` la borra. `.interface-design/system.md` deriva del manual y cubre lo estructural.

## CI y git

**CI** (`.github/workflows/ci.yml`, GitHub Actions, 2026-10-11): en cada push a `master` y en cada PR, trabajos en paralelo con Node 22 (el de los Dockerfiles) y `npm ci`: Backend `npm test` + `npm run test:isolation` (con caché del binario de Mongo por versión), Frontend `npm run lint` + `npm run build` (que incluye `tsc -b`), Site `npm run lint` + `npm run build` + `npm test` (desde 2026-10-17), y Docs (enlaces y mapa). No usa secretos: los tests no tocan red y el build compila sin las `VITE_META_*`. **No despliega**, y **no se despliega un commit en rojo**.

**Flujo con git** (2026-10-11): a `master` **no se hace push directo**. Lo impide la regla `master` del repo (*Settings → Rules → Rulesets*): pide un PR, que los trabajos del CI estén en verde y prohíbe force push y borrar la rama; no pide aprobación (no se puede aprobar un PR propio). Cada funcionalidad va en **su rama**, con nombre simple (`chatbot-menu`, `fix-envio-sin-whatsapp`), en **commits pequeños** que tengan sentido solos, y entra por **un PR** que se revisa en GitHub. Si pasa de unas 400–500 líneas de código real, se parte: primero el backend con sus tests, después la UI. El repo solo admite **squash**: `master` queda con un commit por PR (con el título del PR) y la rama se borra al unir. `version:bump` va **dentro del PR**, como último commit. **Se despliega solo desde `master` unido y en verde**: antes de subir el código, `git switch master && git pull && git status` limpio, porque `git archive` sube el commit en el que estás (`HEAD`), no la rama unida. Claude crea ramas y PRs con `gh` (con la sesión de Jonathan) y nunca se pone de coautor.

## Mapa: dónde consultar cada tema

Cada archivo de `docs/arquitectura/` empieza con su índice. Las secciones son títulos `###`, así que `grep -n "^### " docs/arquitectura/*.md` las lista todas.

| Tema | Archivo | Qué hay (secciones y palabras para buscar) |
|---|---|---|
| Endpoints, autenticación, límites | [api.md](docs/arquitectura/api.md) | tabla completa de rutas; cookie JWT, API key, superadmin; login sin enumeración de correos; `authLimiter`, `publicApi*Limiter` |
| Enviar a WhatsApp | [whatsapp-envio.md](docs/arquitectura/whatsapp-envio.md) | `libs/whatsapp.js`, cifrado del token, Embedded Signup, API pública `/v1`, `buildButtonComponents` (sub_type), cabecera de plantillas (`TemplateMedia`, 132012), enviar archivos (`processMessageSending`), ventana de 24 h (`freeTextBlockReason`, 409), `processTemplateSending`, flujo saliente; pedir el historial de la app al conectar (`smb_app_data`, `requestSmbAppData`, `historySync`, `POST /lines/:id/history-sync`) |
| Lo que entra de Meta | [webhook-adjuntos.md](docs/arquitectura/webhook-adjuntos.md) | firma HMAC, estados monótonos (`resolveStatusTransition`), `describeInboundMessage`, tipos no soportados, adjuntos (`descargarAdjunto`, `MEDIA_DIR`), `GET /api/media/:id`, `caption` vs `text`, el historial de la app (`storeHistoryChunks`, `HistoryThread`, `HistoryMedia`, 20 MB solo en el webhook) |
| Contactos y etiquetas | [contactos.md](docs/arquitectura/contactos.md) | teléfono y BSUID, `resolveContact`, `mergeContactUpdates`, bajas de publicidad (131050, `user_preferences`), cambio de número (`user_id_update`), etiquetas (`tagKey`, 20 por contacto), importar (`planImportRows`, tandas); la agenda del celular (`smb_app_state_sync`, `AgendaEntry`, `agendaName`, `applyAgendaName`); la UI de Contactos, Importar y Etiquetas |
| Campañas | [campanas.md](docs/arquitectura/campanas.md) | destinatarios congelados, variables con reserva, worker y ritmo, pausas automáticas, reinicios (`interrupted`), estadísticas, `CAMPAIGN_DRY_RUN`; asistente, borrador en `localStorage`, detalle |
| Chat y tiempo real | [chat.md](docs/arquitectura/chat.md) | SSE y sus eventos, avisos push (`notifyInbound`, VAPID, `PushSubscription`), `unreadCount`, `useConversationMessages`, `useConversations`, ventana en la UI, conversación nueva, ficha del contacto, `SendTemplateDialog`, composer y archivos, `temporalId` |
| Frontend transversal | [frontend.md](docs/arquitectura/frontend.md) | `AuthProvider`, errores de WhatsApp en palabras (`whatsappErrors.ts`), la lista de hooks |
| Respuestas automáticas | [respuestas-automaticas.md](docs/arquitectura/respuestas-automaticas.md) | configuración por cuenta (`AutoReplySettings`, `autoReplies.manage`), `decideAutoReply`, palabras completas (`matchesKeyword`), horario y tramo cerrado (`closedPeriodKey`), probar sin guardar; la cola en el entrante (`Message.bot`), el worker, `uncertain`, la pausa (`markHumanReply`, `authorizeBotSend`), la marca «Bot» |
| Probar y mantener | [pruebas-y-scripts.md](docs/arquitectura/pruebas-y-scripts.md) | `webhook:simulate`, `seed:contacts`, las cuentas de demostración (`seed:demo`), backfills, `check:duplicates`, `version:bump`, tests de aislamiento |
| Reglas del backend | [Backend/AGENTS.md](Backend/AGENTS.md) | estructura, configuración, tests, índices de MongoDB |
| Reglas del frontend | [Frontend/AGENTS.md](Frontend/AGENTS.md) | providers, rutas, flujo de datos, caché de React Query, componentes compartidos |
| Estado del proyecto | [docs/estado.md](docs/estado.md) | versión en producción, trabajo en curso, lo siguiente, cabos sueltos conocidos |
| Decisiones de producto | [docs/decisiones.md](docs/decisiones.md) | lo que Jonathan decidió y por qué, con fecha |
| Diseños y briefs | `Design/*.html`, `docs/superpowers/specs/` | diseños exportados de Claude Design; briefs de UI y specs técnicas de cada módulo |
| Página pública | [pagina-publica.md](docs/arquitectura/pagina-publica.md) | `Site/`, pre-renderizado (`prerender.mjs`, `renderHead`), agregar un nicho, huecos (`<Pending>`, `data-pending`, `LAUNCHED`), vista previa en WhatsApp (`og:`), Cloudflare Pages, el DNS en Cloudflare, `hola@wasmish.com` |
| Video para las ventas | [video.md](docs/arquitectura/video.md) | `Video/` con Remotion, el storyboard en la memoria privada, `AppChat`, los cues (`sceneCues`, `localFrame`), animaciones CSS apagadas, `remotion still`, `render:whatsapp` |
| Producción | `deploy/README.md` y la skill `deploy` | compose, Traefik, despliegue con `git archive` paso a paso, etiquetas `vX.Y.Z`, volver a una versión anterior |

**Para buscar algo concreto:** `grep -rn "<palabra>" AGENTS.md Backend/AGENTS.md Frontend/AGENTS.md docs/`. El nombre de una función o un código de error de Meta (`131047`, `132012`…) suele llevar directo a su sección.
