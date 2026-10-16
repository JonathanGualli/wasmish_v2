# Brief de diseño: respuestas automáticas

> Para la IA de diseño. Describe **qué** tiene que poder hacer cada persona y **qué información** ve, no cómo se ve. Ya conoces la marca, Ajustes (con Líneas, Equipo y API keys), Chats, Contactos, Campañas y Plantillas, en escritorio y en el teléfono. El diseño tiene que sentirse parte de ellos y reutilizar sus piezas.

---

## 1. Contexto

Un negocio que pone publicidad en WhatsApp recibe muchos mensajes que preguntan casi lo mismo: cuánto cuesta, dónde están, qué horario tienen. Hoy alguien los contesta uno por uno copiando y pegando textos, y de noche nadie contesta. Con esta página, el negocio deja respuestas escritas y Wasmish las manda solo.

**Quién la usa:** el owner y los admins de la cuenta. Los supervisores y agentes no la ven (ni en el menú).

**Cómo funciona (lo que la página tiene que dejar claro sin manual):**
- Hay **tres tipos de respuesta**:
  1. **Bienvenida:** a quien escribe por primera vez, o vuelve después de un tiempo sin escribir.
  2. **Fuera de horario:** a quien escribe con el negocio cerrado. Se manda **una vez** por cada cierre, no a cada mensaje.
  3. **Palabras clave:** «si el mensaje dice *precio*, *precios* o *cuánto cuesta*, responder esto».
- **Si un mensaje dispara varias, salen todas juntas en un solo mensaje**, en ese orden: bienvenida, palabras clave (como mucho 3) y fuera de horario.
- **Cuando alguien del equipo responde a mano**, el bot se calla en esa conversación durante unas horas.
- **Cada respuesta automática es un mensaje que Meta cobra.** Cada número tiene unos 1.000 gratis al mes. No hace falta alarmar: basta con que se entienda, sobre todo al encender.
- **Solo texto** por ahora (sin fotos ni archivos).
- **Todo es de la cuenta:** vale para todas sus líneas (números).

**Lo que el diseño tiene que transmitir:**
- Que se puede **encender y apagar todo con un toque**, y cada respuesta por separado.
- Que **no responde a lo loco**: una persona que atiende lo calla, y no repite lo mismo.
- Que se puede **probar antes de guardar**.

---

## 2. La página «Respuestas automáticas»

Una página propia en el menú (no dentro de Ajustes): es una herramienta que se usa a menudo al principio, y la que se enseña en una demo.

### 2.1 Qué se ve

- **El interruptor general** («Respuestas automáticas: encendidas / apagadas») y, apagado, que ninguna respuesta sale aunque esté configurada.
- **Bienvenida:**
  - Encendida o apagada.
  - El texto.
  - Cuándo volver a saludar a alguien que ya había escrito: después de 7, 30 o 90 días sin escribir, o nunca.
- **Fuera de horario:**
  - Encendida o apagada.
  - El texto.
  - El horario de cada día de la semana: cerrado, o **uno o dos tramos** (por ejemplo, 8:00–13:00 y 14:30–18:00, para quien cierra a almorzar).
  - La zona horaria (por defecto, Ecuador). Casi nadie la cambia: puede quedar discreta.
  - Que se manda una vez por cierre: quien escribe el viernes a las 19:00 y el sábado a las 7:00 lo recibe una sola vez.
- **Palabras clave**, una lista de reglas (hasta 30):
  - Cada una con sus frases (hasta 20; por ejemplo, «precio», «precios», «cuánto cuesta», «valor»), su texto y si está encendida.
  - El orden importa: si coinciden más de 3, salen las 3 primeras. Hay que poder **reordenarlas**.
  - Cómo se buscan: da igual mayúsculas y tildes, pero son **palabras completas**. «precio» no encuentra «preciosa»: hay que poner las variantes. Esto conviene decirlo junto a donde se escriben las frases.
  - Una regla ya respondida no se repite en esa conversación durante 24 horas.
- **El traspaso a una persona:** cuántas horas se calla el bot después de una respuesta manual (1, 4, 12 o 24; por defecto 12).
- **Probar:** un recuadro donde se escribe un mensaje de ejemplo («hola, cuánto está y dónde quedan?») y se ve **qué respondería ahora** y por qué (qué reglas coincidieron, si está fuera de horario), **con lo que hay en pantalla, sin guardar**. Responde como a un contacto nuevo, así que la bienvenida siempre aparece si está encendida.
- **Los límites** al escribir: cada texto, hasta 800 caracteres (con contador).

### 2.2 Qué se puede hacer

- Encender o apagar todo, y cada respuesta.
- Escribir los textos, el horario, las frases y las reglas.
- Añadir, borrar, encender o apagar y reordenar reglas.
- Probar un mensaje.
- **Guardar** (todo junto) y **descartar los cambios**. Si alguien sale con cambios sin guardar, se le avisa.

### 2.3 Estados

- **La primera vez** (nunca se configuró): todo apagado y vacío. Necesita una invitación clara a empezar, por ejemplo con una bienvenida y un horario de ejemplo ya escritos, listos para editar.
- **Cargando** (con las pantallas de carga de siempre) y **error al cargar**, con «Reintentar».
- **Errores al guardar:**
  - un texto vacío en una respuesta encendida;
  - un tramo que termina antes de empezar o que se solapa con el otro;
  - fuera de horario encendido sin ningún día abierto;
  - una regla sin frases;
  - pasarse de un límite.

  Cada error se ve junto a su campo.
- **Guardado:** confirmación breve.

---

## 3. En Chats

Los mensajes que envió el bot llevan la marca **«Bot»** en la línea de la hora, igual que hoy «Campaña» y «API». Esto ya está resuelto con las piezas existentes; no hace falta diseñarlo, salvo que quieras proponer otra cosa.

---

## 4. Lo que no entra

Fotos o archivos en las respuestas, menús con botones, IA, reglas distintas por línea, feriados y fechas especiales, pausar el bot a mano desde el chat, y elegir «un mensaje por regla» en vez de uno combinado. Todo eso vendrá después: el diseño no tiene que dejarles hueco, pero tampoco cerrarles la puerta.

---

## 5. Pantallas que necesitamos

1. La página completa en **escritorio**, configurada (bienvenida, horario con mediodía, 3 o 4 reglas), con el recuadro de prueba mostrando una respuesta combinada.
2. La **primera vez**, sin configurar.
3. **Editar una regla** de palabras clave (frases, texto y orden).
4. **Errores al guardar**.
5. La página en el **teléfono**.
