# Brief de diseño — Ficha del contacto y adjuntos en el chat

> Para la IA de diseño. Describe **qué** tiene que poder hacer el usuario y **qué información** ve en cada momento, no cómo se ve. Ya conoces la marca, la pantalla de Chats, la sección Contactos (con su ficha lateral) y las etiquetas: el diseño debe sentirse parte de ellos y reutilizar sus componentes. Son dos piezas de la misma pantalla; se construirán en este orden, pero conviene diseñarlas juntas porque las dos tocan la cabecera y el campo de escribir.

---

## 1. Contexto

Wasmish es un CRM para WhatsApp Business. La pantalla de **Chats** tiene la bandeja a la izquierda (360 px) y la conversación abierta a la derecha: cabecera con el nombre y el teléfono del contacto, los mensajes, y abajo el campo de escribir.

WhatsApp solo deja escribir texto libre durante las **24 h siguientes al último mensaje del contacto** (la «ventana»). Fuera de ella solo se puede enviar una **plantilla** aprobada. Hoy el campo de escribir tiene tres estados: normal, aviso naranja cuando la ventana cierra en menos de 2 h, y bloqueado («La ventana de 24 h se cerró» / «Esperando respuesta») con el botón «Enviar plantilla».

Lo que falla hoy, mientras se atiende a una persona:

1. **No se sabe con quién se habla.** Solo se ve el nombre y el teléfono. Sus etiquetas, sus notas, si pidió no recibir publicidad, de dónde vino… están en Contactos, en otra sección.
2. **No hay dónde apuntar nada.** «Pidió cotización de 50 unidades», «Paga a 30 días», «Llamar el lunes».
3. **Solo se puede escribir texto.** No se puede mandar una foto de un producto, un PDF con la cotización o un vídeo.
4. **Con la ventana abierta no se puede enviar una plantilla.** El botón solo aparece cuando está cerrada. Pero hay plantillas que se quieren mandar igual: una con botones («Ver catálogo», «Pagar»), una con la imagen de la promoción, o un recordatorio ya redactado.

Lo que el diseño tiene que transmitir:

- **Todo lo del contacto, sin salir del chat.** Quien atiende ve y apunta lo importante mientras escribe.
- **El campo de escribir es el sitio de todo lo que se envía**: texto, archivo o plantilla.
- **La ventana de 24 h sigue mandando.** Los archivos son mensajes libres: con la ventana cerrada, solo plantillas, como hoy.

---

# Parte 1 · Ficha del contacto en el chat (se construye primero)

## 2. Cómo se abre y dónde vive

- **Se abre desde la cabecera de la conversación**: al pulsar el nombre o el avatar, y con un botón visible (no solo el clic en el nombre, que no todo el mundo descubre).
- **Es una columna a la derecha** del chat en pantallas anchas: la bandeja, la conversación y la ficha conviven, y se puede seguir escribiendo con ella abierta. Cuando no caben las tres (pantallas medianas), la ficha se superpone a la conversación. En móvil ocupa la pantalla, con su forma de volver al chat.
- **Al cambiar de conversación, la ficha sigue abierta** y muestra al nuevo contacto. Abierta o cerrada se recuerda en el navegador: quien la usa, la quiere siempre.
- Cerrar con su X y con Esc.

## 3. Qué muestra

Es la ficha que ya existe en Contactos, ordenada para **quien está atendiendo** (lo de uso diario arriba):

1. **Quién es:** nombre, teléfono o @usuario de WhatsApp (algunos contactos no tienen teléfono), y el nombre que la persona tiene puesto en WhatsApp si es distinto.
2. **Avisos que cambian lo que se puede hacer**, solo si aplican: «Pidió no recibir publicidad».
3. **Etiquetas**, editables ahí mismo: añadir (buscando o creando, como en el resto de la app) y quitar. Es lo que más se toca mientras se habla («este es Mayorista»).
4. **Notas** (ver §4).
5. **Datos:** email, empresa. Editables (ver §5).
6. **Actividad:** cliente desde (primer mensaje), mensajes enviados, recibidos y fallidos.
7. **Origen:** «Escribió él», «Desde un anuncio» (con el anuncio, si vino de uno), «Importado», «Creado a mano»…
8. **Ventana de 24 h:** abierta y cuánto le queda, o cerrada. La conversación ya la avisa abajo; aquí puede ser una línea discreta o no estar, según veas.

Al pie, **«Ver en Contactos»** (la ficha completa). Borrar un contacto **no** se hace desde aquí: un contacto con conversación no se puede borrar.

## 4. Notas

- **Un solo texto libre por contacto**, de hasta **1000 caracteres**. Es el mismo campo «Notas» que ya se ve y edita en Contactos.
- **Se edita en el sitio**, sin abrir un formulario: se pulsa, se escribe y se guarda.
- **No se puede perder lo escrito**: ni al cambiar de conversación, ni al cerrar la ficha, ni si llega un mensaje mientras se escribe. Propón cómo se guarda (al salir del campo, con un botón, o las dos) y cómo se confirma («Guardado»). Si falla al guardar, el texto se queda y se dice.
- Vacío: una invitación corta con un ejemplo de qué apuntar («Ej.: paga a 30 días, prefiere que le escriban por la tarde»).
- Cerca del límite, contador de caracteres.
- Sin autor ni fecha: hoy cada cuenta la usa una persona.

## 5. Editar el resto

- **Nombre, email y empresa** también se pueden cambiar desde la ficha, sin ir a Contactos. Propón si es en el sitio (como las notas) o con un modo «Editar» que abra el formulario que ya existe.
- El **nombre** que se pone aquí es el que se ve en la bandeja y en la cabecera: al guardarlo, cambian en el momento.
- El **teléfono no se edita** desde el chat (un contacto con conversación no puede cambiar de número).

---

# Parte 2 · Enviar archivos y plantillas desde el campo de escribir

## 6. Lo que se puede enviar

Con la ventana **abierta**, el campo de escribir permite:

- **Texto**, como hoy.
- **Un archivo**: imagen, vídeo, documento o audio.
- **Una plantilla**: abre el diálogo de enviar plantilla que ya existe (el mismo que hoy sale con la ventana cerrada).

Con la ventana **cerrada** no cambia nada: solo plantillas, con el aviso de hoy.

Propón cómo se accede a «archivo» y «plantilla» desde el campo (un botón con menú, dos botones…). El botón de enviar sigue siendo la acción principal.

## 7. Archivos

**Tipos y tamaños** (los que acepta WhatsApp, con el tope de Wasmish):

| Tipo | Formatos | Tamaño máximo |
|---|---|---|
| Imagen | JPG, PNG | 5 MB |
| Vídeo | MP4, 3GP | 16 MB |
| Audio | MP3, M4A, AAC, OGG, AMR | 16 MB |
| Documento | PDF, Word, Excel, PowerPoint, TXT | 16 MB |

**Cómo se elige:**
- Con el selector de archivos del sistema.
- **Arrastrándolo sobre la conversación**: toda la zona del chat lo recibe, con una indicación clara mientras se arrastra.
- **Pegándolo** (Ctrl+V) en el campo de escribir: una captura de pantalla se pega como imagen. Es muy común al atender («te mando captura de tu pedido»).

**Antes de enviar**, una vista previa:
- Imagen y vídeo: la miniatura. Documento: icono, nombre y tamaño. Audio: nombre, duración si se puede, y poder escucharlo.
- **Un texto que acompaña** (pie de foto) para imagen, vídeo y documento. El audio no lleva texto en WhatsApp.
- Quitar el archivo o cambiarlo por otro.
- **Un archivo por envío.** Si se sueltan varios, decir que se envían de uno en uno.

**Mientras se envía:**
- El mensaje aparece en la conversación **en el momento**, con su archivo, y un progreso real de la subida (un PDF de 15 MB tarda segundos). Se puede **cancelar** mientras sube.
- Después se comporta como cualquier mensaje enviado: Enviado → Entregado → Leído, o Fallido con su motivo (el globo de «Fallido» de hoy).

**Errores que hay que decir antes de subir nada**, en palabras y con qué hacer:
- Formato no admitido: «WhatsApp no admite archivos .heic. Conviértelo a JPG o PNG».
- Demasiado grande: «La imagen pesa 8 MB y el máximo es 5 MB». Si es una imagen grande, sugerir enviarla como documento si eso tiene sentido en el diseño.
- La ventana se cerró mientras preparaba el envío: no se pierde el archivo elegido ni el texto, y se explica que ahora solo puede mandar una plantilla.

**Cómo se ven en la conversación:** los archivos **recibidos** ya se muestran (imagen, vídeo, reproductor de audio, fila descargable para documentos). Los enviados deben verse igual, del lado propio.

## 8. Plantillas con la ventana abierta

- Se envían con el **mismo diálogo** de hoy (elegir plantilla, rellenar variables, ver la vista previa).
- Si había texto escrito en el campo, no se pierde al abrir y cerrar el diálogo.
- No hace falta explicar la diferencia entre texto libre y plantilla en este estado: con la ventana abierta, la plantilla es simplemente otra cosa que se puede mandar.

---

## 9. Móvil

- La **ficha** ocupa la pantalla y se vuelve al chat con la flecha, como la bandeja.
- **Adjuntar** en móvil abre el selector del sistema, que ya ofrece la cámara y la galería. Arrastrar y pegar no aplican.
- La vista previa del archivo y el texto que lo acompaña tienen que caber con el teclado abierto.
- Áreas de toque de 44 px.

## 10. Textos y tono

- **Español neutro latinoamericano**, de tú y directo.
- **Sin jerga técnica:** nada de «upload», «media», «MIME», «payload». Sí «archivo», «foto», «documento», «PDF».
- Los tamaños en MB con un decimal como mucho: «4,8 MB».

## 11. Componentes que ya existen

Reutilízalos antes de inventar otros:
- La **ficha de Contactos** (`ContactPanel`): secciones, pares etiqueta/valor, actividad en cifras, aviso de baja de publicidad, datos del anuncio.
- Las **etiquetas**: la etiqueta de papel (`TagChip`) y el selector de buscar o crear (`TagSelector`).
- El **campo de archivo de la cabecera de campañas** (`HeaderMediaField`): elegir o arrastrar, progreso, cancelar y errores de tipo y tamaño. Se adapta a su contenedor.
- La **burbuja de archivo** de la conversación (`MessageMedia`) y el globo de «Fallido».
- El **diálogo de enviar plantilla** (`SendTemplateDialog`).
- Avisos (`Callout`), píldoras de estado, diálogo de confirmar y el aviso global arriba a la derecha (se cierra solo a los 5 s: los errores que hay que leer **no** van solo ahí).

## 12. Fuera de alcance

- **Grabar notas de voz** desde el navegador (WhatsApp no acepta el formato que graba; se hará aparte).
- Varios archivos en un solo envío.
- Responder citando un mensaje concreto, reacciones, emojis y stickers.
- Respuestas rápidas guardadas.
- Notas con historial, autor o fecha; asignar conversaciones a otras personas del equipo.
- Enviar ubicación o contactos.
