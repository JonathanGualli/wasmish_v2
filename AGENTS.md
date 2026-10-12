# Wasmish

SaaS multi-cliente de WhatsApp Business (Solventyc): cada cliente conecta su número de WhatsApp con «login con Facebook» (Embedded Signup) y desde Wasmish chatea con sus contactos, los organiza con etiquetas, los importa, les envía plantillas y campañas, y usa una API pública con API key. Producción: `https://wasmish.solventyc.com` (`GET /api/version` dice qué versión corre).

Este archivo es para **cualquier agente**: Claude Code lo importa desde `CLAUDE.md` y Codex lo lee directo. Es corto a propósito: las reglas que valen siempre y el **mapa** para consultar cada tema a fondo. Se escribe en español; los identificadores nuevos, en inglés.

## Comandos de desarrollo

Monorepo con dos workspaces independientes: `Backend/` y `Frontend/`. Cada uno tiene su propio `package.json` y `node_modules`.

| | Backend (`Backend/`) | Frontend (`Frontend/`) |
|---|---|---|
| Stack | Express 5 + MongoDB (Mongoose) + Zod | React 19 + TypeScript + Vite + Tailwind v4 + React Query |
| Arrancar | `npm run dev` (puerto 3001) | `npm run dev` (puerto 5173, proxy de `/api` al 3001) |
| Comprobar | `npm test` y `npm run test:isolation` | `npm run lint` y `npm run build` |

**Antes de tocar `Backend/`, leer [Backend/AGENTS.md](Backend/AGENTS.md); antes de tocar `Frontend/`, [Frontend/AGENTS.md](Frontend/AGENTS.md).** Claude Code los carga solo al trabajar en esa carpeta; Codex, si se arranca en la raíz, no.

## Reglas que no se rompen

1. **Cada cuenta ve solo lo suyo.** Toda consulta filtra por la cuenta de la sesión (`findOne({ _id, userId })`, nunca `findById` a secas sobre algo del cliente), y un recurso ajeno responde **404, no 403**. Un endpoint nuevo con `:id`, o que reciba ids en el cuerpo, lleva su caso en `Backend/tests/isolation/` → [pruebas-y-scripts.md § Tests de aislamiento](docs/arquitectura/pruebas-y-scripts.md#tests-de-aislamiento).
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

## Diseño y marca

**Antes de crear o modificar cualquier componente, página, o estilo, consultar el skill `/brand-guidelines`.**

Esto incluye: nuevos componentes React, modificaciones de clases Tailwind, elección de colores, diseño de páginas, variantes de botones/inputs, layouts, iconografía, o cualquier decisión visual. El skill contiene la paleta de tokens, reglas de componentes, y anti-patterns del proyecto.

Identidad vigente: **Manual de marca v1.0 · dirección 3b «Barra oscura»** — verde tinta (`#0B3B2E`) sobre blanco puro y grises fríos, con menta (`#6FE3AE`) como único acento. El verde de WhatsApp `#25D366` **ya no forma parte de la marca**.

Fuentes originales del manual: `Frontend/brand/wasmishbrand/*.dc.html` (canvas de Claude Design). **No mover esa carpeta a `Frontend/dist/`** — un `npm run build` la borra. `.interface-design/system.md` deriva del manual y cubre lo estructural.

## CI y git

**CI** (`.github/workflows/ci.yml`, GitHub Actions, 2026-10-11): en cada push a `master` y en cada PR, dos trabajos en paralelo con Node 22 (el de los Dockerfiles) y `npm ci`: Backend `npm test` + `npm run test:isolation` (con caché del binario de Mongo por versión), Frontend `npm run lint` + `npm run build` (que incluye `tsc -b`). No usa secretos: los tests no tocan red y el build compila sin las `VITE_META_*`. **No despliega**, y **no se despliega un commit en rojo**.

**Flujo con git** (2026-10-11): a `master` **no se hace push directo**. Lo impide la regla `master` del repo (*Settings → Rules → Rulesets*): pide un PR, que los dos trabajos del CI estén en verde y prohíbe force push y borrar la rama; no pide aprobación (no se puede aprobar un PR propio). Cada funcionalidad va en **su rama**, con nombre simple (`chatbot-menu`, `fix-envio-sin-whatsapp`), en **commits pequeños** que tengan sentido solos, y entra por **un PR** que se revisa en GitHub. Si pasa de unas 400–500 líneas de código real, se parte: primero el backend con sus tests, después la UI. El repo solo admite **squash**: `master` queda con un commit por PR (con el título del PR) y la rama se borra al unir. `version:bump` va **dentro del PR**, como último commit. **Se despliega solo desde `master` unido y en verde**: antes del `tar`, `git switch master && git pull && git status` limpio, porque el `tar` sube la carpeta local tal cual. Claude crea ramas y PRs con `gh` (con la sesión de Jonathan) y nunca se pone de coautor.

## Mapa: dónde consultar cada tema

Cada archivo de `docs/arquitectura/` empieza con su índice. Las secciones son títulos `###`, así que `grep -n "^### " docs/arquitectura/*.md` las lista todas.

| Tema | Archivo | Qué hay (secciones y palabras para buscar) |
|---|---|---|
| Endpoints, autenticación, límites | [api.md](docs/arquitectura/api.md) | tabla completa de rutas; cookie JWT, API key, superadmin; login sin enumeración de correos; `authLimiter`, `publicApi*Limiter` |
| Enviar a WhatsApp | [whatsapp-envio.md](docs/arquitectura/whatsapp-envio.md) | `libs/whatsapp.js`, cifrado del token, Embedded Signup, API pública `/v1`, `buildButtonComponents` (sub_type), cabecera de plantillas (`TemplateMedia`, 132012), enviar archivos (`processMessageSending`), ventana de 24 h (`freeTextBlockReason`, 409), `processTemplateSending`, flujo saliente |
| Lo que entra de Meta | [webhook-adjuntos.md](docs/arquitectura/webhook-adjuntos.md) | firma HMAC, estados monótonos (`resolveStatusTransition`), `describeInboundMessage`, tipos no soportados, adjuntos (`descargarAdjunto`, `MEDIA_DIR`), `GET /api/media/:id`, `caption` vs `text` |
| Contactos y etiquetas | [contactos.md](docs/arquitectura/contactos.md) | teléfono y BSUID, `resolveContact`, `mergeContactUpdates`, bajas de publicidad (131050, `user_preferences`), cambio de número (`user_id_update`), etiquetas (`tagKey`, 20 por contacto), importar (`planImportRows`, tandas); la UI de Contactos, Importar y Etiquetas |
| Campañas | [campanas.md](docs/arquitectura/campanas.md) | destinatarios congelados, variables con reserva, worker y ritmo, pausas automáticas, reinicios (`interrupted`), estadísticas, `CAMPAIGN_DRY_RUN`; asistente, borrador en `localStorage`, detalle |
| Chat y tiempo real | [chat.md](docs/arquitectura/chat.md) | SSE y sus eventos, `unreadCount`, `useConversationMessages`, `useConversations`, ventana en la UI, conversación nueva, ficha del contacto, `SendTemplateDialog`, composer y archivos, `temporalId` |
| Frontend transversal | [frontend.md](docs/arquitectura/frontend.md) | `AuthProvider`, errores de WhatsApp en palabras (`whatsappErrors.ts`), la lista de hooks |
| Probar y mantener | [pruebas-y-scripts.md](docs/arquitectura/pruebas-y-scripts.md) | `webhook:simulate`, `seed:contacts`, backfills, `check:duplicates`, `version:bump`, tests de aislamiento |
| Reglas del backend | [Backend/AGENTS.md](Backend/AGENTS.md) | estructura, configuración, tests, índices de MongoDB |
| Reglas del frontend | [Frontend/AGENTS.md](Frontend/AGENTS.md) | providers, rutas, flujo de datos, caché de React Query, componentes compartidos |
| Decisiones de producto | [docs/decisiones.md](docs/decisiones.md) | lo que Jonathan decidió y por qué, con fecha |
| Diseños y briefs | `Design/*.html`, `docs/superpowers/specs/` | diseños exportados de Claude Design; briefs de UI y specs técnicas de cada módulo |
| Producción | `deploy/README.md` | compose, Traefik, despliegue con `tar`, volver a una versión anterior |

**Para buscar algo concreto:** `grep -rn "<palabra>" AGENTS.md Backend/AGENTS.md Frontend/AGENTS.md docs/`. El nombre de una función o un código de error de Meta (`131047`, `132012`…) suele llevar directo a su sección.
