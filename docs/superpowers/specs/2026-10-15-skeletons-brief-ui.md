# Brief de diseño: pantallas de carga (skeletons)

> **Diseño entregado:** `Design/Wasmish Pantallas de carga.html`. Plan: `docs/superpowers/plans/2026-10-15-pantallas-de-carga.md`.

> Para la IA de diseño. Describe **qué** tiene que poder hacer cada persona y **qué información** ve, no cómo se ve. Ya conoces la marca y todas las pantallas de Wasmish (Chats con su bandeja, hilo y ficha; Contactos, Campañas, Plantillas, Ajustes, el panel de administración y la app en el celular). El diseño tiene que sentirse parte de ellas y reutilizar sus piezas.

---

## 1. Contexto

Mientras Wasmish trae los datos del servidor, hoy cada pantalla muestra algo distinto: un texto suelto («Cargando contactos…», «Cargando conversaciones…», «Cargando mensajes…»), un círculo que gira sobre la tabla, una página en blanco o un guion en lugar de la cifra. Se nota improvisado, y más en el celular, donde la red es más lenta y la espera se ve más.

Jonathan quiere **pantallas de carga con la forma de lo que va a aparecer** (*skeletons*): bloques que ocupan el sitio de las filas, los textos y los avatares, para que la persona ya vea qué viene y la pantalla no salte cuando llegan los datos. Te pasa una **captura de referencia de Contactos** con la dirección que le gusta: la misma tabla, con su cabecera y sus filtros, y bloques grises en lugar de cada dato.

Lo que se pide es **un solo lenguaje de carga para toda la app**, aplicado a cada pantalla de la lista de abajo.

---

## 2. Lo que tiene que cumplir siempre

- **La forma de lo que viene.** Cada skeleton imita la pantalla real: el mismo número aproximado de columnas, la altura de las filas, dónde va el avatar, cuántas líneas de texto. Al llegar los datos, nada se mueve de sitio.
- **Lo que no depende de los datos se ve desde el primer momento:** el título de la página, el buscador, los filtros, los botones de acción («Nuevo contacto», «Sincronizar»), las cabeceras de las tablas. Solo se sustituye lo que todavía no ha llegado.
- **Que se note que está cargando, sin distraer:** si se anima, que sea suave, y que respete a quien tiene activado «reducir movimiento» en su dispositivo.
- **Accesible:** un lector de pantalla tiene que poder anunciar qué se está cargando («Cargando contactos»), aunque el texto no se vea.
- **Celular y computadora:** cada pantalla tiene su versión de teléfono (las tablas, en el celular, son una lista de tarjetas; Chats muestra la bandeja o el hilo, no los dos).
- **Lo que pasa después no cambia:** si al cargar no hay nada, sale el estado vacío que ya existe («Todavía no creaste ninguna campaña»); si falla, el error que ya existe, con «Reintentar».

---

## 3. Las pantallas

### 3.1 Entrar a la app
Al abrir Wasmish (o la app instalada en el celular), mientras se comprueba la sesión, hoy sale una página en blanco con «Cargando…». Es lo primero que se ve **cada vez que se abre la app**. Debería verse ya el marco de Wasmish (la barra lateral en la computadora; la cabecera en el celular) con la página cargando.

### 3.2 Las tablas
Contactos (la de la captura), Plantillas, Campañas, los destinatarios del detalle de una campaña y los clientes del panel de administración. Todas son la misma tabla compartida, cada una con sus columnas: el skeleton de cada una sigue sus columnas (avatar y dos líneas en Contactos, píldoras de estado donde las hay, cifras donde hay cifras).

**Dos momentos distintos que hay que resolver:**
1. **La primera carga:** todavía no hay ninguna fila. Es el caso de la captura.
2. **Ya hay filas y se piden otras:** al pasar de página, al cambiar un filtro o una búsqueda, o al pulsar «Sincronizar» en Plantillas. Hoy se tapan las filas visibles con un velo y un círculo que gira. Aquí la persona ya tiene algo delante: hay que decidir si se mantiene lo que ve mientras llega lo nuevo (con alguna señal de que está cargando) o se sustituye por el skeleton. Que la tabla no «parpadee» al pasar de página.

### 3.3 Chats
- **La bandeja:** las filas de conversaciones (avatar, nombre, hora, la vista previa del último mensaje, los no leídos y, con varias líneas, su etiqueta). Hoy: «Cargando conversaciones…».
- **El hilo:** los mensajes de una conversación, de los dos lados. Hoy: «Cargando mensajes…». La cabecera (contacto y teléfono) ya se conoce al abrirla, y el cuadro de escribir también puede verse.
- **La ficha del contacto:** el panel de la derecha en la computadora y la pantalla completa en el celular (notas, etiquetas y datos). Hoy: un círculo que gira con «Cargando…». Es la misma ficha que se abre desde Contactos.

### 3.4 El detalle de una campaña
Hoy, mientras carga, la página sale **en blanco**. Tiene su cabecera (nombre, estado, acciones), las cifras de envío (enviados, entregados, leídos, fallidos) y la tabla de destinatarios (§ 3.2).

### 3.5 Ajustes
Las tarjetas que dependen de datos: **Líneas de WhatsApp** (hoy «Cargando las líneas…»), **Equipo** («Cargando el equipo…»), **API keys** («Cargando…») y, para supervisores y agentes, **Tus líneas y tu acceso** («Cargando las líneas…»). Cada una con la forma de su lista.

### 3.6 El panel de administración
Las cifras de arriba (hoy un «—» mientras cargan) y la tabla de clientes (§ 3.2).

### 3.7 Dentro de los diálogos
Al **enviar una plantilla** y en la **conversación nueva**, la lista de plantillas para elegir (hoy «Cargando plantillas…»). Al **gestionar etiquetas** en Contactos, la lista de etiquetas (hoy un círculo con «Cargando…»).

---

## 4. Lo que no entra

- **Las esperas de una acción**, que ya tienen su forma y se quedan como están: un botón que dice «Enviando…» o «Creando cuenta…», «Activando…» en los avisos, el PIN que se pide con «Mostrar», el progreso de una importación o de una campaña.
- **«Cargando más»** al final de una lista que se va completando sola (los destinatarios al crear una campaña).
- La página pública para **aceptar una invitación** (fuera de la app).
- Hacer que las pantallas carguen más rápido: eso es otro trabajo.
