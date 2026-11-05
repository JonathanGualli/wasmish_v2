# Brief de diseño: el bot con menús

> Para la IA de diseño. Describe **qué** tiene que poder hacer cada persona y **qué información** ve, no cómo se ve. Ya conoces la marca, la página de Respuestas automáticas que diseñaste (`Wasmish Respuestas automáticas v2`, por pasos, con «Probar» como conversación), Chats (con la asignación, la campanita y las citas), en escritorio y en el teléfono. El diseño tiene que sentirse parte de ellos y reutilizar sus piezas.
>
> El porqué de cada cosa está en el spec: `docs/superpowers/specs/2026-11-05-bot-menus-design.md`.

---

## 1. Contexto

Hoy el bot solo responde texto: el contacto tiene que adivinar qué palabra escribir («precio», «horario») y, si no acierta, recibe el «no entiendo». Los negocios quieren lo que ven en otros WhatsApp de empresa: **un menú con botones** («Precios», «Horarios», «Hablar con una persona») que lleva a otra respuesta, y que **pedir una persona** de verdad avise a alguien del equipo.

**Quién configura:** el owner y los admins, como hoy. **Quién ve lo de Chats:** todos los que ven la conversación.

**Cómo funciona (lo que la pantalla tiene que dejar claro sin manual):**
- Las «reglas de palabras clave» pasan a llamarse **respuestas**. Cada una tiene un **nombre** («Precios»), sus **frases** (ahora **opcionales**: una respuesta sin frases solo se alcanza con un botón), su **texto** y hasta **10 opciones**.
- **Una opción** es un título corto (hasta **20 caracteres**) y adónde lleva: **otra respuesta**, **volver al inicio** (la bienvenida) o **hablar con una persona**. Así se arma un menú de varios niveles: Bienvenida → «Precios» → «Tarjetas», «Volantes», «Volver».
- **La bienvenida y el «si no entiende» también llevan opciones.** El fuera de horario no: se suma al texto de la respuesta que salga.
- **El formato lo decide Wasmish, no el negocio:** con **hasta 3 opciones** salen como **botones** debajo del mensaje; con **4 a 10**, como una **lista** que el contacto abre con «Ver opciones». Si el texto es muy largo (más de unos 1.000 caracteres), también sale como lista: WhatsApp no deja botones con tanto texto.
- **En una misma respuesta, dos opciones no pueden llamarse igual** (WhatsApp lo rechaza).
- **Un toque siempre responde**, aunque esa respuesta ya haya salido hace poco. Un botón de un menú viejo que ya no lleva a ningún sitio se trata como si el contacto hubiera escrito su título.
- **«Hablar con una persona»:** el bot responde un texto (por defecto «Enseguida te atiende alguien del equipo»), **se calla** en esa conversación, la **marca** en la bandeja y **avisa** al equipo en la campanita y en el celular. La marca se quita sola **cuando alguien del equipo responde**, o a mano con **«Quitar»**.
- Lo de hoy no cambia: el horario, «Cuándo se calla», el interruptor general, el asistente de la primera vez, el cobro de Meta.
- Hasta **50 respuestas** por cuenta.

**Lo que el diseño tiene que transmitir:**
- Que se está armando **un flujo**: de la bienvenida a cada respuesta y adónde lleva cada botón. Jonathan lo quiere sentir como «un menú nuevo, una versión más potente del bot», no como una lista de reglas con algo pegado.
- Que es **fácil crear el siguiente paso** sin salir de donde se está.
- Que **se puede probar tocando** antes de guardar.

---

## 2. La página «Respuestas automáticas» (reemplaza a la de hoy)

Misma ruta y mismo lugar en el menú. Lo configurado hoy aparece tal cual: cada regla como una respuesta llamada «Respuesta 1», «Respuesta 2»… hasta que se le ponga nombre.

### 2.1 Qué se ve

- **El flujo:** la bienvenida y, desde ella, las respuestas a las que llevan sus opciones, y así hacia abajo. Cada respuesta dice su nombre, un trozo del texto, sus frases (si tiene) y sus opciones con su destino. Un menú puede tener ciclos («Volver al inicio»): no hace falta dibujar un árbol perfecto, pero sí que se entienda adónde lleva cada botón.
- **Las respuestas a las que no se llega:** sin frases y sin ningún botón que lleve a ellas, o apagadas con botones que llevan a ellas. Es un aviso, no un error: se puede guardar igual.
- **«Volver al inicio» con la bienvenida apagada:** otro aviso; ese botón se tratará como un texto escrito.
- **El «si no entiende»** con sus opciones (lo típico: «Volver al inicio» o «Hablar con una persona»).
- **El texto de «Hablar con una persona»**, uno para toda la cuenta.
- **Lo de hoy:** el interruptor general, el fuera de horario con su horario, «Cuándo se calla» y el aviso del cobro al encender.

### 2.2 Qué se puede hacer

- **Editar una respuesta:** nombre, frases, texto, encendida o apagada, y sus opciones.
- **Añadir una opción:** su título y su destino. Al elegir el destino se puede escoger una respuesta que existe, «volver al inicio», «hablar con una persona» o **«+ Nueva respuesta»**, que la crea en ese momento y deja escribirla sin perder el sitio.
- **Reordenar y borrar opciones.** El orden es el de los botones o las filas.
- **Ver cómo saldrá:** al editar las opciones, que se entienda si van como botones (hasta 3) o como lista (4 a 10).
- **Borrar una respuesta.** Si había botones que llevaban a ella, decir cuáles antes de borrarla: al borrarla, esos botones también se quitan (o se les elige otro destino), porque un botón no puede llevar a una respuesta que no existe.
- **Probar:** la conversación de prueba de hoy, ahora con **los botones o la lista tocables**. Tocar una opción la manda como si fuera el contacto. Debajo de cada respuesta, como hoy, de dónde salió («Bienvenida», «Precios: tocó una opción», «Hablar con una persona»). Después de tocar «Hablar con una persona», la prueba muestra que el bot se calla.
- **Guardar** y **descartar**, todo junto, como hoy. Salir con cambios avisa.

### 2.3 Estados

- **La primera vez:** el asistente de hoy, que ahora puede sugerir un menú de ejemplo (por ejemplo, la bienvenida con «Precios», «Horarios» y «Hablar con una persona»).
- **Cargando** y **error al cargar**, con «Reintentar».
- **Errores** (cada uno junto a su campo):
  - una opción sin título, de más de 20 caracteres o repetida en la misma respuesta;
  - una opción sin destino;
  - más de 10 opciones, o más de 50 respuestas;
  - «Hablar con una persona» en algún botón y su texto vacío;
  - los de hoy (textos vacíos, horario mal escrito, más de 800 caracteres).
- **La página cambió:** si alguien la tenía abierta desde antes de esta versión y guarda, Wasmish le pide **recargar** («La página de respuestas automáticas cambió: recárgala») para no borrar los menús. Un aviso, con un botón para recargar.
- **Guardado:** la confirmación breve de hoy.

---

## 3. En Chats

### 3.1 El mensaje del bot con sus opciones

El mensaje que mandó el bot se ve con **sus opciones debajo**, como las vio el contacto: botones o el botón «Ver opciones» (con las filas a la vista o desplegables). **No se pueden tocar**: son del contacto. Sigue llevando la marca «Bot» en la hora.

### 3.2 El toque del contacto

Cuando el contacto toca una opción, llega como un **mensaje suyo con el título** («Precios») que **cita el menú** del que salió (como las citas que ya existen) y una marca discreta de que **tocó una opción**, no lo escribió.

### 3.3 «Pide una persona»

- **En la cabecera del chat:** que el contacto pidió hablar con una persona, desde cuándo, y **«Quitar»** (por si fue un error o ya se atendió por otro lado). Al quitarla, el bot vuelve a responder.
- **Responder** quita la marca solo, sin hacer nada más.
- **En la bandeja:** la conversación marcada, que se distinga a simple vista de un no leído. Que se pueda encontrar con prisa (quizás con un filtro, si encaja con los de hoy).
- **En la campanita:** un aviso nuevo, «Marisol pide hablar con una persona», con la conversación, como los de la asignación. Lo reciben quien la atiende si está asignada o, si no, todos los que ven esa línea.
- **En el celular (push):** título, el contacto (y la línea si hay varias); texto, «Marisol pide hablar con una persona.».

---

## 4. Lo que no entra

Archivos o fotos en las respuestas, reglas por línea, feriados, pausar el bot a mano, IA, asignar sola la conversación al pedir una persona y un tiempo máximo de espera. No hace falta dejarles hueco.

---

## 5. Pantallas que necesitamos

1. La **página en escritorio** con un menú de dos niveles (bienvenida con 3 botones; «Precios» con 5 opciones que salen como lista) y una respuesta a la que no se llega.
2. **Editar una respuesta**, con sus opciones y el selector de destino abierto en «+ Nueva respuesta».
3. **Probar**, con una conversación en la que se tocan dos opciones y se termina en «Hablar con una persona».
4. Los **errores** y el aviso de «la página cambió».
5. La **primera vez** (el asistente con el menú de ejemplo).
6. La página en el **teléfono**.
7. En **Chats**: el mensaje del bot con botones, el de lista, el toque citando el menú, y la cabecera con «Pide una persona» y «Quitar».
8. La **bandeja** con una conversación marcada, y la **campanita** con el aviso nuevo.
