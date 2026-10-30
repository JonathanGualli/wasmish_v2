# Video para las ventas

Un video vertical de unos 72 s que muestra Wasmish a un negocio que ya respondió a Jonathan en las ventas en frío: se manda como archivo por WhatsApp. Vive en `Video/` y se hace con [Remotion](https://www.remotion.dev/) (video en React): no se graba la pantalla, se renderiza desde código. El plan está en [2026-10-28-video-capacitacion.md](../superpowers/plans/2026-10-28-video-capacitacion.md).

> Parte de la documentación de Wasmish: el mapa de todos los temas está en el [AGENTS.md](../../AGENTS.md) de la raíz.
> Las decisiones de producto con fecha están en [decisiones.md](../decisiones.md).

## Contenido

- [Dónde está el diseño](#dónde-está-el-diseño)
- [Cómo está hecho](#cómo-está-hecho)
- [Los tiempos y la voz](#los-tiempos-y-la-voz)
- [Otro nicho](#otro-nicho)
- [Comandos y pruebas](#comandos-y-pruebas)

---

### Dónde está el diseño

El guion, el brief y el **storyboard de Claude Design** son comerciales y viven en la memoria privada (`wasmish-memoria`, carpeta `comercial/`), **no en este repo**. El código copia de ahí lo que necesita: los textos de la voz (`Video/src/story/`), los colores de cada capítulo (`components/tones.ts`), las medidas de cada pieza y los momentos de cada escena. Si el storyboard y el código no coinciden, se corrige el código; las cuatro correcciones al storyboard que se decidieron (la hora de la respuesta de Mónica, el orden del mensaje del bot, el botón del aviso en tinta y Tatiana) tienen su test en `tests/story.test.ts`, salvo el color del botón, que se mira en el cuadro. Además, la respuesta del bot de la escena 4 va resumida (el guion lo permite): con los textos enteros de la demostración eran diez líneas y no cabían en el chat.

### Cómo está hecho

- **Una composición, `capacitacion`**, de 1080 × 1920 a 30 fps (`src/Root.tsx`). `Capacitacion.tsx` pone cada escena en su `<Sequence>`, una tras otra, según `story.scenes`.
- **Las escenas** (`src/scenes/`) calculan el estado de cada cuadro (qué mensaje se ve, qué está resaltado, dónde está la cámara) y se lo pasan a las **piezas** (`src/components/`), que solo dibujan: el lienzo con sus tres capas fijas (`Stage`, con las zonas que tapa WhatsApp), el titular (`Headline`), el subtítulo (`Subtitle`) y el chat de la app (`AppChat`). Son seis: `Hook` (el gancho), `Recap` (Mónica lo ve todo), `Assign` (la asignación y la pantalla bloqueada de Gabriela), `AfterHours` (el bot de noche y Gabriela al abrir), `Broadcast` (el aviso a un grupo) y `Closing` (la computadora y el celular, y el cierre con el logo). Lo que solo sale en una escena (la pantalla bloqueada, la tarjeta del aviso, los dispositivos) se dibuja en su archivo, no en `components/`.
- **El cambio de escena** lo marca el fondo: `Stage` lo funde en 0,7 s (`from`, `changeAt`) o lo barre en 0,6 s (`sweep`: el menta de izquierda a derecha, el gris desde abajo). Cuando el fondo no cambia (de la escena 2 a la 3, de la 3 a la 4), la escena nueva pinta también el titular anterior saliendo hacia arriba (`leaving`). La pastilla de debajo del titular (`kicker`: la hora de la escena 4, «Otro ejemplo») entra por su cuenta, antes que él si hace falta. Al amanecer, en la escena 4, el titular de noche y el claro se cruzan con un fundido.
- **El chat es del storyboard, no de la página.** Las imitaciones de la app de `Site/` tienen otras proporciones y no saben cambiar de estado (de silueta a mensaje, el nombre o el PDF resaltados), así que `AppChat` copia las medidas del storyboard. De `Site/` se usan los tokens de marca (`Site/src/theme.css`, que importan los dos), la pastilla del titular (`Highlight`, con `mint` para los fondos oscuros) y los tipos de los mensajes.
- **Todo movimiento sale del número de cuadro** (`useCurrentFrame`): `lib/motion.ts` tiene la curva del storyboard (`EASE`), `progress` para una entrada, `valueAt`/`cameraAt` para lo que va de llave en llave (el desplazamiento del hilo, la cámara, que nunca pasa de ×1,5), `dropOffset` para el aviso que cae con un rebote (un `spring` que no se pasa de 20 px) y `countUp` para las cifras del aviso a un grupo; `lib/clock.ts`, la hora que rueda de las 22:10 a las 08:35 pasando por la medianoche. `src/styles.css` **apaga las animaciones y transiciones CSS**: Remotion pinta cada cuadro por separado y una animación CSS saldría distinta en cada render.
- **`remotion.config.ts`** añade Tailwind v4 y fuerza `react`, `react-dom` y `lucide-react` a los de `Video/node_modules`: lo importado de `Site/` los buscaría en `Site/node_modules` y habría dos copias de React. Las fuentes (Inter y JetBrains Mono, las de la página) se cargan con `@remotion/fonts`, que detiene el render hasta que están.

### Los tiempos y la voz

Los momentos de cada escena son **cues** con nombre (`'recap.question': 6.8`), en segundos desde el inicio del video, en `story/capacitacion.ts`. Cada escena los lee con `sceneCues(story, id)`, que los da en cuadros de su `<Sequence>` y falla si el nombre no existe. Los subtítulos (`story.subtitles`) también van en segundos, y `checkSubtitles` comprueba que no se pisen, que no crucen un cambio de escena y que quepan en dos líneas.

Hoy los tiempos son los del storyboard, más unos pocos cues que el storyboard no nombraba (cuándo entra cada titular, el chat de la escena 4, la etiqueta y el permiso del aviso). Con 72 s, el logo del final queda quieto unos 2 s y no los 3 que pedía el storyboard (que duraba 75 s): se ajusta con los tiempos de la voz. **Cuando Jonathan grabe la voz**, se reemplazan por los de su audio (las escenas no cambian) y se añaden la voz y la música: es un plan aparte.

### Otro nicho

Para imprentas (Gráfica Andina) se escribe otro archivo en `src/story/` con la misma forma (`Story`, en `story/types.ts`) y otra composición en `Root.tsx`; las escenas y las piezas son las mismas.

### Comandos y pruebas

Desde `Video/` (necesita `npm ci` también en `Site/`, por los tipos de lo que importa):

- `npm run dev`: Remotion Studio, para ver y recorrer el video.
- `npm run lint` (`tsc` y eslint) y `npm test` (tiempos, subtítulos, movimiento y los datos de la historia). Es lo que corre el CI, que **no renderiza**.
- `npx remotion still capacitacion out/<nombre>.png --frame=<n>`: un cuadro suelto, para compararlo con el storyboard.
- `npm run render`: la maestra, `out/capacitacion.mp4` (1080 × 1920, 72 s; unos 5,6 MB y medio minuto en la computadora de la casa). La primera vez, Remotion baja su propio Chrome. `out/` no se sube al repo.
- `npm run render:whatsapp`: la que se manda, `out/capacitacion-whatsapp.mp4` (720 × 1280, unos 3,7 MB). Remotion no puede renderizar a 720 directo: `--scale=0.6667` da una altura de 1280,06 y exige un entero (2/3 no es exacto). Por eso renderiza una maestra casi sin pérdida (`out/capacitacion-hq.mp4`, `--crf=12`) y la reduce con el ffmpeg que trae Remotion (`remotion ffmpeg`, `lanczos`, `crf` 18). El plan esperaba de 8 a 12 MB, pero los fondos lisos se comprimen mucho: con `crf` 18 el texto queda nítido y pesa menos. Si hiciera falta más calidad, se baja el `crf`.
- **Comprobado** (2026-10-29): el mismo cuadro, renderizado dos veces, da el mismo PNG (cuadros 880, 1200, 1560 y 1990), y a 720 se leen el nombre de quien respondió, el mensaje del bot, la línea del permiso y los subtítulos.
