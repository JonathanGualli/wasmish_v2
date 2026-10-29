# Video de capacitación (Remotion): plan de implementación

> **Para agentes:** en Wasmish los planes se ejecutan **nativos** (`AGENTS.md` § Planes): rama, PR y revisión cruzada; se ignoran las referencias a `subagent-driven-development`, `executing-plans` y `using-git-worktrees`. Los pasos usan casillas (`- [ ]`).

**Objetivo:** un video vertical de unos 72 s que muestra Wasmish a un centro de capacitación que ya respondió a Jonathan, renderizado desde código en un workspace nuevo, `Video/`, en dos salidas: la maestra (1080 × 1920) y la de WhatsApp (720 × 1280, 8–12 MB).

**Arquitectura:** Remotion (video en React) en `Video/`, con Tailwind v4 y los tokens de marca que ya usa `Site/`. Reutiliza las imitaciones de la app de la página (`Site/src/components/app/Chat.tsx`, `Highlight.tsx`, `Logo.tsx`) importándolas por ruta relativa, con las animaciones CSS apagadas: **todo movimiento sale del número de cuadro**. Los tiempos viven en una tabla de marcas (`cues`) por escena: ahora son los del storyboard y, cuando Jonathan grabe la voz, se reemplazan por los de su audio sin tocar las escenas. Los datos de la historia van aparte de las escenas, para que imprentas sea otro archivo de datos.

**Stack:** Remotion 4.0.535 (`remotion`, `@remotion/cli`, `@remotion/tailwind-v4`, `@remotion/fonts`), React 19, TypeScript, Tailwind v4, `node:test` con eliminación de tipos (como `Site/`).

**Spec:** no hay spec en el repo: el diseño es comercial y vive en la memoria privada (`wasmish-memoria`, carpeta `comercial/`): el **storyboard** de Claude Design (`Wasmish Video capacitación - Storyboard.html`, aprobado el 2026-10-28), el **guion** (`2026-10-28-video-capacitacion-guion.md`, borrador 2, con las cuatro correcciones del storyboard) y el **brief**. Este plan copia de ahí todo lo que el código necesita (textos, medidas, tiempos), así que se puede ejecutar sin ellos; el storyboard sirve para comparar los cuadros a ojo. **No entran al repo.**

## Global Constraints

- Remotion y todos los `@remotion/*` en **`4.0.535` exacta** (sin `^`): Remotion exige la misma versión en todos sus paquetes. React y React DOM en la misma versión que `Site/` (`^19.1.0`). Node 22.
- Composición `capacitacion`: **1080 × 1920, 30 fps**, unos 72 s. La salida de WhatsApp es la misma composición con `--scale` (720 × 1280), en MP4, de **8 a 12 MB**.
- **Zonas que ocupa WhatsApp:** arriba 230 px (12 %) y abajo 288 px (15 %), solo fondo. **Tres capas fijas:** el titular empieza en y = 240; el contenido va de y = 560 a 1420; los subtítulos, de 1452 a 1616. El titular nunca tapa el contenido y el subtítulo nunca tapa nada.
- **Tipografía:** titular Inter 800 a 88 px, con una palabra en pastilla girada −1,5° (como `wasmish.com`); chat a 38 px; subtítulos a 48 px en 700, tarjeta blanca centrada de dos líneas como mucho, con la frase clave en menta; etiquetas a 23–27 px; horas y teléfonos en JetBrains Mono.
- **Movimiento:** algo cambia cada 2–3 s. Cámara: acercamiento de **×1,5 como mucho**, curva `cubic-bezier(0.45, 0, 0.2, 1)` en 1 s, **nunca gira**. Un mensaje entra subiendo 28 px en 0,5 s. Al cambiar de escena cambia el fondo (0,7 s) y el contenido se queda en su sitio.
- **Capítulos por color de fondo:** tinta `#0B3B2E` (problema y cierre), gris claro `#F4F6F8` (la app), noche `#06251C` (el centro cerrado), menta `#6FE3AE` (solo la escena 5, «otro ejemplo»). **Un solo elemento menta sólido por vista** fuera de la escena 5; el verde de WhatsApp `#25D366` no se usa.
- **Nada de animaciones ni transiciones CSS** en lo que se renderiza: Remotion pinta cada cuadro por separado y una animación CSS saldría distinta en cada render.
- **Nada que la app no haga:** la campaña dice cuántos leyeron, nunca quiénes; el bot responde con lo que el centro preparó (sin IA); la coexistencia dice «puede seguir usando su app de WhatsApp Business».
- Fuera de este plan: **la voz y la música** (plan aparte, cuando Jonathan grabe) e **imprentas**. Ni precios ni costo de Meta en el video.
- Código: identificadores en inglés, comentarios y documentación en español, como el resto del repo.

## Review Focus

- **Un cuadro que cambia entre renders** (una animación o transición CSS de `Site/` que se cuela): renderizar dos veces el mismo cuadro tiene que dar el mismo archivo. Prueba en la Tarea 2 y en la 6.
- **La fuente que no carga a tiempo** y el cuadro sale con la de reserva: la carga va con `delayRender` (`@remotion/fonts`). Prueba a ojo en la Tarea 2, con el ancho de un texto medido en el cuadro.
- **Dos copias de React** al importar desde `Site/` (`lucide-react` resuelto desde `Site/node_modules`): pantalla en blanco o «Invalid hook call». Alias en `remotion.config.ts`; prueba en la Tarea 2 con `Composer` (lleva un ícono de Lucide).
- **Los datos de la historia se contradicen** (las cuatro correcciones del storyboard): Mónica responde después de asignar, el bot pone el horario antes que los requisitos, Gabriela responde antes de abrir, el número de Kevin de relleno. Pruebas de datos en la Tarea 4.
- **El texto que no se lee en 720 × 1280** o que se sale de su capa con una frase larga: subtítulos de más de dos líneas, el titular de la escena 4. Prueba en la Tarea 3 (`checkSubtitles`, largo máximo) y cuadros en 720 en la Tarea 9.

---

## Archivos

```
Site/src/theme.css                    (nuevo) los tokens de marca, sacados de styles.css
Site/src/styles.css                   importa theme.css
Site/src/components/app/Chat.tsx      ChatHeader acepta `action`
Site/src/components/Highlight.tsx     Highlight acepta `mint`

Video/package.json, package-lock.json, tsconfig.json, eslint.config.js, remotion.config.ts
Video/src/index.ts                    registerRoot
Video/src/Root.tsx                    las composiciones
Video/src/styles.css                  Tailwind + theme.css de Site + animaciones apagadas
Video/src/fonts.ts                    Inter y JetBrains Mono con @remotion/fonts
Video/src/lib/timeline.ts             segundos ↔ cuadros, escenas (puro)
Video/src/lib/subtitles.ts            el subtítulo de cada momento y su chequeo (puro)
Video/src/lib/motion.ts               curva, progreso de una entrada, cámara (puro)
Video/src/story/types.ts              la forma de una historia
Video/src/story/capacitacion.ts       Academia Horizonte: textos, tiempos, chats
Video/src/components/Stage.tsx        el lienzo 9:16, el fondo por capítulo y las tres capas
Video/src/components/Headline.tsx     el titular con su pastilla
Video/src/components/Subtitle.tsx     la tarjeta del subtítulo
Video/src/components/Camera.tsx       acercamientos
Video/src/components/AppChat.tsx      el chat de la app: piezas de Site + evento, «Desde la app», «Asignar»
Video/src/scenes/Hook.tsx, Recap.tsx, Assign.tsx, AfterHours.tsx, Broadcast.tsx, Closing.tsx
Video/src/Capacitacion.tsx            las seis escenas en secuencia
Video/tests/*.test.ts

.github/workflows/ci.yml              trabajo «Video · lint, tipos y tests»
docs/arquitectura/video.md            (nuevo) cómo está hecho y cómo se renderiza
AGENTS.md                             cuatro workspaces y la fila del mapa
docs/decisiones.md, docs/estado.md
```

**Dos PRs de código**, por el tamaño: **«Video 1»** con las Tareas 1 a 6 (la base, los datos y las escenas 1 y 2) y **«Video 2»** con las 7 a 9 (escenas 3 a 6 y los renders). Cada uno con su revisión de Codex.

---

### Tarea 1: Lo que `Site/` presta al video

**Files:**
- Create: `Site/src/theme.css`
- Modify: `Site/src/styles.css` (el bloque `@theme`), `Site/src/components/app/Chat.tsx` (`ChatHeader`), `Site/src/components/Highlight.tsx`

**Interfaces:**
- Produces: `Site/src/theme.css` con el bloque `@theme` entero (sin `@import "tailwindcss"`); `ChatHeader({ contact, pressed?, action? }: { …; action?: ReactNode })`, que pinta `action` en lugar del botón «Ficha» si llega; `Highlight({ …, mint? }: { …; mint?: boolean })`: pastilla menta (`bg-brand-accent text-brand-ink`), para ir sobre tinta o noche.

- [ ] **Paso 1:** `npm run build` en `Site/` y copiar `Site/dist/` a una carpeta del scratchpad, para comparar después. Con `playwright-core` (ya está en `Site/`) y `npm run preview`, capturas de `/` y `/capacitacion` a 1280 y a 390 px de ancho, con `reducedMotion: 'reduce'` (se ven los estados finales de las animaciones, también los de `ChatHeader` y `Highlight`).
- [ ] **Paso 2:** mover el bloque `@theme { … }` de `styles.css` a `theme.css`, con su comentario, y en `styles.css` poner `@import "./theme.css";` después de las fuentes. Añadir `action` a `ChatHeader` y `mint` a `Highlight` (cuando `mint` e `inverse` vienen juntos, gana `mint`). Los valores por defecto dejan la página igual.
- [ ] **Paso 3:** `npm run lint && npm run build && npm test` en `Site/`. Esperado: todo en verde.
- [ ] **Paso 4:** comparar contra la copia. **Los HTML, idénticos** después de normalizar los nombres con hash de `/assets/` (el JavaScript cambia, y con él su hash). **El CSS**, con el mismo normalizado: cualquier diferencia se revisa una por una (un cambio de orden puede cambiar la cascada). **Las capturas** del Paso 1, otra vez, y `cmp` contra las de antes: idénticas. Si algo cambia, la página cambió y hay que corregirlo. (Revisión de Codex del plan.)
- [ ] **Paso 5:** commit «Site: los tokens en theme.css, y ChatHeader y Highlight para el video».

### Tarea 2: El workspace `Video/` y su primer cuadro

**Files:**
- Create: `Video/package.json`, `Video/tsconfig.json`, `Video/eslint.config.js`, `Video/remotion.config.ts`, `Video/src/index.ts`, `Video/src/Root.tsx`, `Video/src/styles.css`, `Video/src/fonts.ts`, `Video/src/assets.d.ts`, `Video/.gitignore` (`node_modules`, `out`)
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `Site/src/theme.css`; `ChatItemView`, `Composer` de `Site/src/components/app/Chat.tsx`.
- Produces: los scripts `npm run dev` (Remotion Studio), `npm run lint` (`tsc --noEmit && eslint .`), `npm test` (`node --experimental-strip-types --test tests/*.test.ts`), `npm run render` (`out/capacitacion.mp4`) y `npm run render:whatsapp` (`--scale=0.6667 --crf=28`, `out/capacitacion-whatsapp.mp4`). `loadFonts(): void` en `fonts.ts`, que se llama una vez en `Root.tsx`.

- [ ] **Paso 1:** `package.json` con las dependencias de Global Constraints, `lucide-react` en la misma versión que `Site/`, y como desarrollo las de lint de `Site/` (eslint, typescript-eslint, plugins de React). `tsconfig.json` como el de `Site/` (incluye `src` y `tests`); como no hay Vite, **`src/assets.d.ts` declara `*.woff2` (exporta por defecto la URL, un `string`) y `*.css`**, que `noUncheckedSideEffectImports` exige (el `vite-env.d.ts` de `Site/` no llega aquí). `eslint.config.js` como el de `Site/` sin `react-refresh`. **`npm install`** para generar `package-lock.json`, que se sube; desde ahí, `npm ci`.
- [ ] **Paso 2:** `remotion.config.ts`: una sola función en `Config.overrideWebpackConfig` que aplica `enableTailwind` y después añade, **conservando los alias que ya trae Remotion**, alias para que **`react`, `react-dom` (con sus subrutas, como `react/jsx-runtime`) y `lucide-react` resuelvan siempre a `Video/node_modules`** (si no, lo importado desde `Site/` trae su propia copia de React).
- [ ] **Paso 3:** `src/styles.css`: `@import "tailwindcss";`, `@import "../../Site/src/theme.css";`, `@source "../../Site/src/components";` y una regla que apague `animation` y `transition` en todo (`*, *::before, *::after`, con `!important`). Comentario de por qué. `fonts.ts`: Inter y JetBrains Mono variables con `loadFont` de `@remotion/fonts`, desde los `.woff2` de `@fontsource-variable/*` (dependencias de `Video/`) importados como URL.
- [ ] **Paso 4:** en `Root.tsx`, una composición provisional `capacitacion` (1080 × 1920, 30 fps, 30 cuadros) que pinta, sobre gris claro y escalado ×2,77, un `ChatItemView` de cada tipo y un `Composer`. Borrar `node_modules`, `npm ci`, `npm run lint` y `npx remotion still capacitacion out/a.png --frame=15`. Esperado: el PNG con las burbujas en Inter (no la fuente de reserva) y el ícono de enviar del `Composer`; sin «Invalid hook call» en la salida.
- [ ] **Paso 5:** lo mismo a `out/b.png` y `cmp out/a.png out/b.png`. Esperado: idénticos.
- [ ] **Paso 6:** en `ci.yml`, el trabajo «Video · lint, tipos y tests», como el de `Site/`: Node 22, caché de npm con `Video/package-lock.json` y `Site/package-lock.json`, `npm ci` en `Site/` (los componentes que importa se tipan desde allí) y en `Video/`, y `npm run lint` y `npm test` en `Video/`. **El CI no renderiza.**
- [ ] **Paso 7:** `npm run lint` en verde. Commit «Video: el workspace con Remotion y su primer cuadro».

### Tarea 3: Tiempos, subtítulos y movimiento (funciones puras)

**Files:**
- Create: `Video/src/lib/timeline.ts`, `Video/src/lib/subtitles.ts`, `Video/src/lib/motion.ts`, `Video/tests/timeline.test.ts`, `Video/tests/subtitles.test.ts`, `Video/tests/motion.test.ts`

**Interfaces:**
- Produces:
  - `FPS = 30`; `toFrames(seconds: number, fps = FPS): number` (redondea); `type Scene = { id: string; from: number; to: number }` (segundos); `sceneFrames(scenes: Scene[], fps = FPS): { id: string; from: number; durationInFrames: number }[]`; `totalFrames(scenes: Scene[], fps = FPS): number`; `checkScenes(scenes: Scene[]): string[]` (errores en español: escenas desordenadas, con hueco o solapadas, o que no empiezan en 0); `localFrame(cue: number, scene: Scene, fps = FPS): number` = `toFrames(cue) - toFrames(scene.from)`: los `cues` se guardan en **segundos desde el inicio del video** y cada escena los pasa a **cuadros de su propio `<Sequence>`** con esta función.
  - `type Subtitle = { text: string; highlight?: string; from: number; to: number }`; `subtitleAt(subs: Subtitle[], seconds: number): Subtitle | null`; `checkSubtitles(subs: Subtitle[], scenes: Scene[]): string[]` (solapados, fuera de su escena o cruzando dos, `highlight` que no está en `text`, más de `SUBTITLE_MAX_CHARS = 60` caracteres).
  - `EASE` (`Easing.bezier(0.45, 0, 0.2, 1)` de Remotion); `progress(frame: number, start: number, duration: number): number` (0 a 1 con `EASE`, acotado); `type CameraKey = { at: number; scale: number; x: number; y: number }` (`at` en cuadros; `x`, `y`, el punto del lienzo que queda al centro); `cameraAt(frame: number, keys: CameraKey[]): { scale: number; x: number; y: number }` (cada llave se alcanza en 30 cuadros con `EASE`; antes de la primera, la primera; `scale` acotada a `MAX_ZOOM = 1.5`).

- [ ] **Paso 1: los tests.**
  - `toFrames(0.5) === 15`, `toFrames(72) === 2160`; `sceneFrames` de dos escenas `0–6` y `6–25` da `[{ from: 0, durationInFrames: 180 }, { from: 180, durationInFrames: 570 }]`; `checkScenes` con un hueco (`0–6`, `7–25`) da un error que nombra las dos escenas; con escenas contiguas desde 0, `[]`. `localFrame(6.8, { id: 'recap', from: 6, to: 25 }) === 24` (el cuadro absoluto 204).
  - `subtitleAt` en el borde: `from` incluido, `to` excluido; entre dos subtítulos, `null`. `checkSubtitles`: uno que cruza de la escena 1 a la 2 → error; `highlight: 'cero'` con `text` sin «cero» → error; uno de 61 caracteres → error; los correctos → `[]`.
  - `progress(10, 10, 15) === 0`, `progress(25, 10, 15) === 1`, `progress(40, 10, 15) === 1`, `progress(5, 10, 15) === 0`; a mitad, distinto de 0,5 (la curva no es lineal). `cameraAt` antes de la primera llave devuelve la primera; 30 cuadros después de una llave, exactamente esa llave; una llave con `scale: 2` sale en `1.5`.
- [ ] **Paso 2:** `npm test`. Esperado: fallan por no existir los módulos.
- [ ] **Paso 3:** implementar los tres módulos con esas firmas (sin React; `motion.ts` solo importa `Easing` e `interpolate` de `remotion`).
- [ ] **Paso 4:** `npm test` y `npm run lint`. Esperado: en verde.
- [ ] **Paso 5:** commit «Video: tiempos, subtítulos y movimiento».

### Tarea 4: La historia de Academia Horizonte (datos)

**Files:**
- Create: `Video/src/story/types.ts`, `Video/src/story/capacitacion.ts`, `Video/tests/story.test.ts`

**Interfaces:**
- Consumes: `Scene`, `Subtitle` (Tarea 3); `ChatItem`, `ExampleContact` de `Site/src/content/types.ts`.
- Produces: `type SceneId = 'hook' | 'recap' | 'assign' | 'afterHours' | 'broadcast' | 'closing'`; `type VideoChatItem = ChatItem | { id: string; kind: 'event'; text: string; time: string } | { id: string; kind: 'out-app'; text: string; time: string }`; `type Headline = { before: string; highlight: string; after: string }`; `type Story` con `scenes: Scene[]` (con los `SceneId`, en ese orden), `cues: Record<string, number>` (segundos), `subtitles: Subtitle[]`, `headlines: Record<SceneId, Headline>`, y los datos de cada escena: `kevin: { contact: ExampleContact; thread: VideoChatItem[]; note: { text: string; author: string; date: string } }`, `notification: { title: string; body: string; time: string; date: string }`, `afterHours: { contact: ExampleContact; thread: VideoChatItem[] }`, `broadcast: { title: string; tag: string; contacts: number; sent: number; delivered: number; read: number; reply: { name: string; text: string } }`, `closing: { lines: [string, string]; url: string }`. `export const capacitacion: Story`.

Los textos, tal cual (guion, borrador 2):

| Escena | De–a (s) | Titular (pastilla) | Subtítulos (la frase clave, entre corchetes) |
|---|---|---|---|
| `hook` | 0–6 | ¿Qué le [ofrecieron]? | Un interesado vuelve a escribir después de [dos semanas]. · ¿Su equipo sabe [qué le ofrecieron]? |
| `recap` | 6–25 | Sin empezar [de cero] | Con Wasmish, cada persona atiende [con su usuario] · en el mismo WhatsApp. · Mónica abre el chat · y ve lo que respondió [Gabriela], · el temario que le mandó · y su nota: «[quizá inscriba a dos compañeros más]». · Así retoma la conversación [sin empezar de cero]. |
| `assign` | 25–32 | Asignada a [Gabriela] | Si debe seguir Gabriela, Mónica [se lo asigna], · y a Gabriela le llega [el aviso] al celular. |
| `afterHours` | 32–43 | Responde aunque estén [cerrados] | ¿Le preguntan los requisitos [a las diez de la noche]? · Wasmish [responde solo], con lo que usted dejó preparado, · y al abrir, [su equipo] sigue la conversación. |
| `broadcast` | 43–56 | Grupo nuevo: avíseles [de una vez] | Y cuando abre otro grupo, les avisa [de una vez] · a los interesados de ese curso. · Ve [cuántos lo leyeron], y las respuestas llegan al chat. |
| `closing` | 56–72 | Su mismo número · [Conexión oficial] | Funciona en la computadora · y en el celular, con [su mismo número] · y la conexión oficial de WhatsApp. · Puede seguir usando [su app de WhatsApp Business]. (Desde 68 s, sin subtítulo: «Soy Jonathan, de Wasmish.» / «Si le sirve, yo se lo dejo funcionando.» en pantalla, y `wasmish.com/capacitacion`.) |

Los datos de los chats son los de la cuenta de demostración (`Backend/scripts/fixtures/demo.scenarios.js`, `capacitacion`), con lo que pide el storyboard: Kevin escribió el 18 oct a las 10:12 («¿Qué días es el curso de Excel avanzado?»), Gabriela respondió a las 10:16 («Tenemos grupo los sábados de 9:00 a 13:00, cuatro semanas. Le envío el temario.») con `Excel-Avanzado-Academia-Horizonte.pdf` (1,2 MB), su nota es la de la demostración, firmada «Gabriela · 18 oct · 10:20», y hoy a las 09:41 escribe «Hola, ¿todavía hay cupo para el curso de Excel del sábado? Seríamos 3 personas». **Las cuatro correcciones del storyboard:** Mónica responde a las **09:42** («Hola, Kevin. Sí, hay cupo para los 3 el sábado.») y la asignación es a las **09:44** («Mónica le asignó esta conversación a Gabriela»); el mensaje de las 09:52 («Le paso los datos para la factura de su empresa.») es `out-app`. En `afterHours`, un contacto con nombre (que ya había escrito; no «Contacto nuevo»), y el mensaje del bot con **los requisitos primero y el horario después**, separados por una línea en blanco, con los textos de la demostración; Gabriela responde a las **08:35**. En `broadcast`, «Nuevo grupo de Marketing Digital · noviembre», etiqueta «Interesado · Marketing digital», 48 contactos, 48 / 46 / 31, y responde **Tatiana**: «Sí, resérveme uno por favor 🙋‍♀️». Kevin lleva un número inventado con forma real (`+593 9X XXX XXXX`, sin ceros de relleno). El aviso del celular: título «Kevin», cuerpo «Mónica te asignó esta conversación.» (como `Backend/src/utils/push.js`), 09:44, «miércoles, 28 de octubre».

Los `cues` son los momentos del storyboard que las escenas usan por nombre (segundos desde el inicio del video), por ejemplo `recap.question: 6.8`, `recap.answer: 8.3`, `recap.pdf: 9.8`, `recap.zoomName: 11.2`, `recap.toPdf: 13.4`, `recap.noteUp: 15.4`, `recap.zoomNote: 16.6`, `recap.backToToday: 20.0`, `recap.reply: 20.8`; cada escena define los suyos según las notas de sus cuadros (Tareas 6 a 8). Los subtítulos provisionales se reparten dentro de su escena.

- [ ] **Paso 1: los tests** (`story.test.ts`), cada uno con un comentario de la corrección que vigila:
  - `checkScenes(capacitacion.scenes)` y `checkSubtitles(capacitacion.subtitles, capacitacion.scenes)` dan `[]`; `totalFrames` da 2160.
  - Cada `cue` cae dentro de la escena que nombra su prefijo.
  - En el hilo de Kevin, el mensaje de Mónica va antes que el evento de asignación, y los dos con hora menor que el `out-app`.
  - En el mensaje del bot de `afterHours`, el índice de «Para inscribirse» es menor que el del horario; la respuesta de Gabriela es a las 08:30 o después.
  - `broadcast.reply.name === 'Tatiana'`; `broadcast.read <= broadcast.delivered <= broadcast.sent`.
  - El teléfono de Kevin no termina en `000 0000`.
  - Ningún texto de la historia contiene «IA», «chatbot», «USD» ni «$».
- [ ] **Paso 2:** `npm test`. Esperado: fallan.
- [ ] **Paso 3:** escribir `types.ts` y `capacitacion.ts` con esos datos.
- [ ] **Paso 4:** `npm test` y `npm run lint`. Esperado: en verde.
- [ ] **Paso 5:** commit «Video: la historia de Academia Horizonte».

### Tarea 5: Las piezas comunes

**Files:**
- Create: `Video/src/components/Stage.tsx`, `Headline.tsx`, `Subtitle.tsx`, `Camera.tsx`, `AppChat.tsx`

**Interfaces:**
- Consumes: `progress`, `cameraAt`, `subtitleAt` (Tarea 3); `VideoChatItem`, `Headline`, `Story` (Tarea 4); `ChatHeader`, `ChatItemView`, `Composer` (Site, Tarea 1), `Highlight` (Site).
- Produces:
  - `Stage({ chapter, previous?, changeAt?, children })`: el lienzo de 1080 × 1920; `chapter: 'ink' | 'app' | 'night' | 'mint'`; si llega `previous`, el fondo pasa de uno a otro en 21 cuadros (0,7 s) desde `changeAt`. `Stage.Headline`, `Stage.Content`, `Stage.Subtitle`: las tres capas con las medidas de Global Constraints. `zones?: boolean` pinta las zonas de WhatsApp para revisar (nunca en el render final).
  - `HeadlineView({ headline, enterAt, exitAt?, tone })`: Inter 800 a 88 px; la pastilla con `Highlight` (`tone: 'deep' | 'mint' | 'white'`) entra a los 18 cuadros de `enterAt` girando hasta −1,5°; si hay `exitAt`, sale hacia arriba en 10 cuadros.
  - `SubtitleView({ subtitles })`: el de `subtitleAt` en el segundo actual, tarjeta blanca, 48 px en 700, la frase clave sobre menta; nada si no hay.
  - `Camera({ keys, children })`: aplica `cameraAt` como `scale` y `translate` (nunca `rotate`).
  - `AppChat({ contact, items, visibleFrom, action?, scale = 2.77 })`: el chat de la app a 390 px de ancho, escalado; `visibleFrom: Record<string, number>` (id → cuadro en que aparece; sin entrada, ya está); cada ítem entra subiendo 28 px en 15 cuadros. Pinta con `ChatItemView` los tipos de `Site` y aquí los nuevos: `event` (línea centrada, gris, con ícono de persona) y `out-app` (burbuja propia con «Desde la app de WhatsApp» en lugar del nombre, como `FeatureScreen`). `action` va al `ChatHeader` («Asignar» o la pastilla oscura «Asignada a Gabriela»).
- [ ] **Paso 1:** escribir las piezas con esas firmas, con `useCurrentFrame()` y sin estado.
- [ ] **Paso 2:** una composición de prueba `piezas` en `Root.tsx` (solo para el Studio, 90 cuadros) con un `Stage` `app` con `zones`, un titular, un subtítulo y el hilo de Kevin. `npm run lint` en verde y `npx remotion still piezas out/piezas.png --frame=60`. Esperado: las capas no se pisan y las zonas quedan libres, como el cuadro 2a del storyboard con zonas.
- [ ] **Paso 3:** commit «Video: el lienzo, el titular, el subtítulo, la cámara y el chat».

### Tarea 6: Escenas 1 y 2, y la documentación (cierra «Video 1»)

**Files:**
- Create: `Video/src/scenes/Hook.tsx`, `Video/src/scenes/Recap.tsx`, `Video/src/Capacitacion.tsx`, `docs/arquitectura/video.md`
- Modify: `Video/src/Root.tsx` (la composición `capacitacion` de verdad, con `totalFrames`; se quitan la provisional y `piezas`), `AGENTS.md`, `docs/decisiones.md`, `docs/estado.md`

**Interfaces:**
- Consumes: todo lo anterior. Produces: `Capacitacion({ story }: { story: Story })`, que monta cada escena en un `<Sequence>` con `sceneFrames`; cada escena recibe `{ story }` y pasa sus `story.cues` (segundos absolutos) a cuadros locales con `localFrame`.

Lo que hace cada escena (notas de los cuadros del storyboard):
- **`Hook` (tinta):** cuadro 0 = la burbuja de Kevin ya en pantalla, grande (la miniatura de WhatsApp), con nombre y «ahora»; sube 40 px y se asienta en 12 cuadros; el titular entra a los 0,6 s; «Seríamos 3 personas» se marca en menta a 1,5 s. A 3,5 s la burbuja se encoge hasta su sitio en el chat (1 s, `EASE`) y encima el historial aparece como siluetas grises, sin texto.
- **`Recap` (de tinta a gris claro):** el fondo cambia en 0,7 s sin mover el chat; el titular anterior sale a 5,6 s. Las siluetas se llenan una por una (pregunta, respuesta con «Gabriela», PDF, cada 1,5 s); cámara ×1,45 sobre el nombre «Gabriela», que se marca en menta; pasa al PDF sin alejarse (se rodea de menta); se aleja y la ficha sube desde abajo (0,8 s); ×1,28 sobre la nota, y a los 0,8 s se marca «Quizá inscriba a 2 compañeros más», con su autora y su fecha a la vista; vuelve a hoy; Mónica responde a las 09:42.

- [ ] **Paso 1:** escribir `Hook`, `Recap` y `Capacitacion`, con las otras cuatro escenas como un `Stage` vacío de su color con su titular (se llenan en «Video 2").
- [ ] **Paso 2:** `npx remotion still capacitacion out/<n>.png --frame=<n>` en 0, 105, 210, 360 y 510 (los cuadros 1a, 1b, 2a, 2b y 2c) y compararlos con el storyboard, uno al lado del otro. Esperado: la misma composición y los mismos textos; diferencias menores de tamaño se anotan en el PR.
- [ ] **Paso 3:** el cuadro 360 dos veces, a dos archivos, y `cmp`. Esperado: idénticos.
- [ ] **Paso 4:** `npx remotion render capacitacion out/recap.mp4 --frames=0-750` y mirarlo entero. Esperado: algo cambia cada 2–3 s, sin saltos de la vista al cambiar de escena.
- [ ] **Paso 5: la documentación.** `docs/arquitectura/video.md`, con su índice: qué es y para qué (el video para quien ya respondió), dónde está el diseño (la memoria privada, no el repo), cómo se arranca y se renderiza (los scripts, las dos salidas), las piezas prestadas de `Site/` y por qué se apagan las animaciones CSS, las marcas de tiempo (`cues`) y cómo se cambiarán con la voz, y cómo se haría imprentas (otro archivo de `story/`). En `AGENTS.md`, la tabla de comandos pasa a **cuatro workspaces** (`Video/`: Remotion; arrancar `npm run dev`; comprobar `npm run lint` y `npm test`) y una fila del mapa para `video.md`. En `decisiones.md`, la decisión del 2026-10-28: el video se hace con Remotion en `Video/`, el diseño (storyboard y guion) vive en la memoria privada y no entra al repo, las correcciones del storyboard se aplican aquí sin otra ronda (Remotion es gratis para una persona o empresas de hasta 3: hay que revisarlo si Solventyc o Wasmish crecen). En `estado.md`, «En curso» al día. `node .github/scripts/check-docs.mjs` en verde.
- [ ] **Paso 6:** commit, PR «Video 1: la base y las escenas 1 y 2», CI en verde y revisión de Codex.

### Tarea 7: Escenas 3 y 4

**Files:**
- Create: `Video/src/scenes/Assign.tsx`, `Video/src/scenes/AfterHours.tsx`
- Modify: `Video/src/Capacitacion.tsx`, `Video/src/story/capacitacion.ts` (sus `cues`)

- **`Assign` (gris claro, luego noche):** el cambio lo marca el titular (el anterior sale hacia arriba y el nuevo entra desde abajo). «Asignar» se vuelve la pastilla oscura «Asignada a Gabriela» en 0,5 s y entra el evento en el hilo; nadie hace clic. A 28,5 s, corte a la pantalla bloqueada de Gabriela, en noche: la hora grande (09:44, «miércoles, 28 de octubre»), el aviso de Wasmish cae desde arriba con un rebote corto (`spring` de Remotion, sin pasarse de 20 px) y se queda 3 s; debajo, «Celular de Gabriela».
- **`AfterHours` (noche, luego gris claro):** «22:10 · cerrado» entra bajo el titular antes que el chat; a 1,5 s llega la pregunta y 0,8 s después la respuesta del bot (requisitos y horario en un mensaje, marca «Bot»). A 39,5 s amanece: el fondo pasa a gris claro en 0,7 s, la hora rueda hasta 08:35, el hilo sube y entra la respuesta de Gabriela con su nombre.

- [ ] **Paso 1:** escribir las dos escenas y sus `cues`; `npm test` sigue en verde (los `cues` nuevos caen en su escena).
- [ ] **Paso 2:** los cuadros (`npx remotion still`) 765, 855, 1050 y 1185 (cuadros 3a, 3b, 4a, 4b), comparados con el storyboard **con las correcciones** (la hora 08:35, el orden del mensaje del bot, el contacto con nombre).
- [ ] **Paso 3:** `npm run lint`; commit «Video: escenas 3 y 4».

### Tarea 8: Escenas 5 y 6

**Files:**
- Create: `Video/src/scenes/Broadcast.tsx`, `Video/src/scenes/Closing.tsx`
- Modify: `Video/src/Capacitacion.tsx`, `Video/src/story/capacitacion.ts`

- **`Broadcast` (menta):** un barrido menta de izquierda a derecha en 0,6 s; la pastilla «Otro ejemplo» entra antes que el titular. La tarjeta del aviso sube desde abajo: «Aviso a un grupo», el título, «Para» con la etiqueta, 48 contactos, «✓ A contactos que aceptaron recibir avisos» y el botón **en tinta** «Enviar a 48 contactos →». A 50 s el botón se convierte en las tres cifras (Enviados, Entregados, Leídos), que cuentan desde 0 una tras otra (1,2 s), y entra la respuesta de Tatiana («respondió al aviso»).
- **`Closing` (gris claro, luego tinta):** barrido blanco desde abajo; la computadora (la lista de Chats y el chat de Kevin) entra recortada por la izquierda y el celular sube por delante. Las pastillas «Su número de siempre» y «Conexión oficial de WhatsApp» entran con la voz. A 64 s la cámara se acerca al celular y entra el mensaje `out-app`. A 68 s, fundido a tinta (0,6 s): «Soy Jonathan, de Wasmish.» y «Si le sirve, yo se lo dejo [funcionando].», y al final el logo (`Logo` `mint` + «wasmish») y `wasmish.com/capacitacion`, quietos 3 s, sin subtítulo.

- [ ] **Paso 1:** escribir las dos escenas y sus `cues`; `npm test` en verde.
- [ ] **Paso 2:** los cuadros (`npx remotion still`) 1320, 1500, 1710, 1920 y 2100 (cuadros 5a, 5b, 6a, 6b y el cierre a 70 s, con el logo ya a la vista), comparados con el storyboard (con el botón en tinta y Tatiana).
- [ ] **Paso 3:** `npm run lint`; commit «Video: escenas 5 y 6».

### Tarea 9: Los renders (cierra «Video 2»)

**Files:**
- Modify: `docs/arquitectura/video.md`, `docs/estado.md`

- [ ] **Paso 1:** `npm run render`. Esperado: `out/capacitacion.mp4`, 1080 × 1920, 72 s (`ffprobe` lo dice).
- [ ] **Paso 2:** `npm run render:whatsapp`. Esperado: 720 × 1280 y **entre 8 y 12 MB** (`ls -lh`); si se pasa, subir `--crf` de a 2 y anotarlo en `video.md`.
- [ ] **Paso 3:** cuadros en 720 (`npx remotion still … --scale=0.6667`) de 2b, 4a y 5b, mirados al tamaño de un celular: el nombre de quien respondió y los subtítulos se leen.
- [ ] **Paso 4:** mandarle el MP4 de WhatsApp a Jonathan (él lo pasa a su celular y lo mira dentro de un chat, sin sonido).
- [ ] **Paso 5:** `video.md` con lo que salió (tamaños, `crf`) y `estado.md` al día («falta la voz y la música»); commit, PR «Video 2: las escenas 3 a 6 y los renders», CI y revisión de Codex. Los MP4 **no se suben al repo** (`out/` en `.gitignore`).
