# La voz de Jonathan en el video de capacitación

> Diseño aprobado por Jonathan el 2026-10-30. Sigue al plan del video (`docs/superpowers/plans/2026-10-28-video-capacitacion.md`), que dejó «la voz y la música» para un plan aparte. Cómo está hecho el video: [video.md](../../arquitectura/video.md).

## 1. Qué problema resuelve

El video (`Video/`, 72 s) está entero pero mudo, con los tiempos del storyboard. Jonathan grabó la voz: seis archivos, uno por escena, con audífonos. Se probaron antes una voz del catálogo de ElevenLabs y un clon de la suya, y se descartaron. Su voz real dura 57 s en total y no cae en los tiempos del storyboard. Hay que meterla en el video y que **la imagen siga a la voz**, no al revés.

## 2. Qué se construye

- **Los tiempos salen de la voz.** Cada escena dura lo que dura su voz, más un respiro. Los momentos de cada escena (los *cues*) y los subtítulos se atan a las palabras que dice Jonathan.
- **El audio suena en el video**, una pista por escena.
- **El subtítulo de la escena 5** suma lo que Jonathan dijo de más, a propósito: «…de ese curso, por medio de una campaña.»
- **El logo del final queda quieto 3 s**, como pedía el storyboard (con los tiempos de antes no cabían).
- **Fuera:** la música. Se agrega después, en un cambio aparte, como otra pista a nivel del video. Este cambio no hace nada para ella, más allá de no estorbarle.

## 3. De dónde salen los tiempos

Cada grabación ya está mejorada (filtro de graves empinado contra un retumbe de 53 Hz, compuerta suave en las pausas, −16 LUFS) y **alineada palabra por palabra** con el *forced alignment* de ElevenLabs, que recibe el audio y el texto exacto. Por cada escena hay un FLAC y un JSON con `words: [{ text, start, end }]` en segundos desde el inicio del archivo.

Las grabaciones y los JSON viven en la memoria privada (`wasmish-memoria`, `comercial/video-voz/`), como el guion y el storyboard: **el audio de la voz de Jonathan no va al repo público.**

## 4. Diseño

### 4.1 Importar la voz: `npm run voice:import -- <carpeta>`

Un script (`Video/voice-import.ts`, en la raíz del workspace como `remotion.config.ts`: sin carpeta nueva) que, desde la carpeta con los seis pares `escena-N.flac` / `escena-N.json`:

- copia los FLAC a `Video/public/voz/`, la carpeta de archivos estáticos de Remotion, que el script crea y **git ignora**;
- escribe `Video/src/story/capacitacion.voice.ts`, que **sí va al repo**, con las palabras de cada escena y sus tiempos redondeados a centésimas. Solo lleva texto y tiempos: el texto ya es público (son los subtítulos).

La lectura y la conversión del JSON son una función pura con su test. El script solo lee, escribe y copia. Si falta un archivo o el JSON no tiene `words`, falla diciendo cuál.

Si Remotion no reproduce FLAC al renderizar, el script convierte a WAV con `remotion ffmpeg` (se comprueba en la primera tarea del plan).

### 4.2 Duración de cada escena

`duración = fin de la última palabra + respiro`. El respiro es de **0,8 s** (decisión de Jonathan: «medio»), y en el cierre es de **3,3 s**: 0,3 s para que el logo termine de entrar y 3 s quieto. Una escena puede pedir más respiro si una animación lo necesita (`hold` en la historia), y el test lo exige (§4.5). Las escenas van una tras otra desde 0, como hoy (`checkScenes`).

La voz de cada escena empieza con el primer cuadro de su `<Sequence>`. Las grabaciones ya traen 0,2 s de silencio al principio.

Con los tiempos de la grabación, el video queda en **unos 63–66 s** (el plan da la cifra exacta).

### 4.3 Los cues, atados a la voz

Los cues conservan sus nombres (`recap.markName`, `assign.lock`…) y `sceneCues` sigue dando cuadros de la escena: **las escenas no cambian**. Lo que cambia es cómo se definen en la historia. Hay tres formas, y una función pura (`resolveCues`) las convierte en segundos absolutos:

- **Una palabra:** `{ word: 'temario' }`, con `nth` si se repite en la escena (`'Gabriela'` sale dos veces en la 3), `edge: 'end'` para el final de la palabra y `shift` en segundos para adelantarla o atrasarla.
- **Desde el inicio de la escena:** `{ at: 0.4 }`, para lo que entra con el corte (los titulares).
- **Antes del final de la escena:** `{ beforeEnd: 1.2 }`, para lo que no tiene palabra (Mónica envía su respuesta).

La escena se deduce del prefijo del nombre (`recap.` → `recap`). Una palabra que no está en su escena es un error, no un 0. La comparación ignora mayúsculas, tildes y signos (`«quizá` es `quiza`).

### 4.4 Los subtítulos

Las frases y sus resaltados son los de hoy (más la de la escena 5), pero ya **sin tiempos escritos a mano**. Cada frase dice de qué escena es, y una función pura (`timeSubtitles`) busca sus palabras, en orden, entre las de la voz:

- empieza en el inicio de su primera palabra;
- termina donde empieza la siguiente frase de la escena, y la última de la escena termina 0,3 s después de su última palabra.

Si el texto de una frase no coincide con la voz (porque Jonathan dijo otra cosa), la función falla nombrando la frase. `checkSubtitles` sigue comprobando que no se pisen, que no crucen una escena y que quepan en dos líneas. El cierre sigue sin subtítulo: el texto ya está en pantalla.

### 4.5 El audio en el video

`Capacitacion.tsx` pone en cada `<Sequence>` un `<Audio src={staticFile('voz/escena-N.flac')} />` de Remotion. **Si el archivo no está** (en el CI, o en un clon sin la memoria privada), el video sale mudo en vez de fallar: se comprueba con `getStaticFiles()` de Remotion. Esto deja a la vista que falta la voz sin romper el Studio ni el render.

## 5. Pruebas

- **Unitarias:** `resolveCues` (palabra, `nth`, `edge`, `shift`, inicio, antes del final, palabra inexistente, escena inexistente), `timeSubtitles` (frase que coincide, que no, la última de la escena) y la conversión del JSON de la alineación.
- **De la historia:**
  - cada cue cae dentro de su escena;
  - los subtítulos pasan `checkSubtitles`;
  - el cierre deja 3 s quietos al logo;
  - las animaciones que duran tienen su tiempo (Mónica escribe su respuesta antes de enviarla; las cifras del aviso cuentan antes de que llegue la respuesta de Tatiana; el aviso de la pantalla bloqueada se queda al menos 2 s).
- **Cuadros:** los mismos que se compararon en «Video 2», más uno en cada momento atado a una palabra, mirados contra los de hoy.
- **Render con voz:** `npm run render:whatsapp`. Jonathan lo escucha en su celular, dentro de un chat. Se comprueba que la voz y lo que se marca coincidan («Gabriela» con su nombre en menta, «temario» con el PDF).

## 6. Orden de trabajo

Un solo PR: el plan como primer commit, la revisión de Codex del plan, el código y la revisión de Codex del código. Unas 300 líneas.

## 7. Decisiones (2026-10-30)

- **La voz es la de Jonathan, grabada de verdad**, y la alineación de ElevenLabs da los tiempos. ElevenLabs no da la voz.
- **Respiro medio** entre escenas (0,8 s).
- **Primero solo la voz**; la música, después.
- **Los tiempos de cada palabra van al repo; el audio no.**
- Las frases de la voz que no estaban en el guion se agregan al guion y al subtítulo, no se cortan del audio (escena 5).
- **Después, al escucharlo (2026-10-30):** los subtítulos marcan la palabra que suena (la opción «palabra por palabra» del storyboard), y **la voz pasa a ser una generada en ElevenLabs** con el guion entero, más expresiva que la de Jonathan. El mecanismo es el mismo: el archivo se alinea, se corta por escenas y entra con `voice:import`. Esa voz no dice «por medio de una campaña», así que la frase de la escena 5 vuelve a la del guion. Detalle en [video.md](../../arquitectura/video.md#los-tiempos-y-la-voz).
