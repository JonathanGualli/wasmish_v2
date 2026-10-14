# Brief de diseño: Wasmish en el celular (app instalable y avisos)

> Para la IA de diseño. Describe **qué** tiene que poder hacer cada persona y **qué información** ve, no cómo se ve. Ya conoces la marca, Ajustes, Chats (bandeja, hilo, ficha del contacto, enviar plantilla, adjuntos) y el resto de la app. El diseño tiene que sentirse parte de ellos y reutilizar sus piezas.

---

## 1. Contexto

Quien atiende WhatsApp en un negocio vive en el celular. Hoy Wasmish solo avisa de un mensaje nuevo con la página abierta en pantalla. Ahora:

- Wasmish **se instala en el celular** desde el navegador (sin tiendas): tiene su ícono en la pantalla de inicio y se abre a pantalla completa, sin la barra del navegador.
- **Suena al llegar un mensaje**, aunque la app esté cerrada, con un aviso del sistema: *«María López: ¿Tienen turno para mañana?»*. Tocarlo abre esa conversación.
- Cada persona **activa los avisos en cada dispositivo** (su celular, su compu) y los puede apagar. Le llegan los de las conversaciones que ya puede ver.

**Diferencias entre teléfonos que el diseño tiene que resolver:**
- **Android:** los avisos funcionan desde el navegador, sin instalar. Instalar es opcional pero recomendable (Chrome ofrece «Instalar app»; Wasmish puede tener su propio botón).
- **iPhone:** los avisos **solo** funcionan con Wasmish **añadido a la pantalla de inicio**, y eso no tiene botón: se hace desde Safari con Compartir → «Añadir a pantalla de inicio». Además, la app instalada **pide iniciar sesión otra vez** (no comparte la sesión con Safari). Hay que guiar a la persona paso a paso, sin que se pierda.
- **El permiso del sistema se pide una sola vez.** Si la persona toca «No permitir», Wasmish ya no puede volver a preguntar: solo puede explicarle cómo activarlo en los ajustes del teléfono o del navegador. Por eso el momento de pedirlo importa: siempre tras un toque en un botón de Wasmish que explique para qué es, nunca al abrir la página.

---

## 2. Activar los avisos

### 2.1 Dónde
- **En Ajustes**, una sección «Avisos en este dispositivo», para todos los roles.
- **En Chats, en el celular**, una invitación discreta a activarlos mientras estén apagados en ese dispositivo (descartable; no debe tapar la bandeja ni volver en cada visita).

### 2.2 Los estados que hay que diseñar
1. **Apagados:** qué ganas al activarlos y un botón «Activar avisos».
2. **Activos:** «Este dispositivo recibe avisos de mensajes nuevos» y la opción de apagarlos.
3. **iPhone sin instalar:** no se pueden activar todavía. Los pasos para añadir Wasmish a la pantalla de inicio (Compartir → «Añadir a pantalla de inicio» → abrirla desde el ícono → iniciar sesión → activar).
4. **Bloqueados:** la persona dijo «No permitir». Cómo desbloquearlo (en los ajustes del navegador o del teléfono).
5. **No disponibles:** el navegador no los admite (un navegador viejo o poco común). Qué navegador usar.
6. **Activando…** y **error al activar** (con «Reintentar»).

### 2.3 Lo que se dice siempre
- Que los avisos son **por dispositivo**: activarlos en el celular no los activa en la compu.
- Que el aviso **muestra el nombre y el texto** del mensaje, y se ve con el teléfono bloqueado.
- Que **al cerrar sesión** el dispositivo deja de recibirlos.

---

## 3. Instalar la app

- En Android y en la compu (Chrome, Edge), un **«Instalar Wasmish»** cuando el navegador lo permita, en Ajustes y junto a la invitación de Chats. Una vez instalada, desaparece.
- En iPhone, los pasos del § 2.2, estado 3.
- **El ícono de la app**: el de la pantalla de inicio y el del aviso. Hacen falta un ícono cuadrado de 512 × 512 y 192 × 192, una versión «maskable» (Android lo recorta en círculo o en cuadrado redondeado, así que el logo tiene que quedar dentro de la zona segura central) uno de 180 × 180 para iPhone y uno **monocromo** de 96 × 96 (silueta sobre transparente) para la barra de estado de Android, que si no lo es sale como un cuadrado blanco. También el color de fondo de la pantalla de arranque.

---

## 4. Chats en el teléfono

Chats tiene que sentirse **como una app de mensajería**, no como una web encogida. Hoy ya se adapta (en el celular se ve la bandeja o la conversación, con flecha para volver), pero nunca se diseñó para el teléfono. Hacen falta las vistas móviles de:

- **La bandeja:** buscador, filtro de línea, el «+» de conversación nueva y las filas (con no leídos y la etiqueta de la línea).
- **El hilo:** cabecera con volver, el contacto y el acceso a su ficha; mensajes, adjuntos, la ventana de 24 h y su aviso.
- **El cuadro de escribir** con el teclado abierto: adjuntar, enviar plantilla, el archivo elegido antes de enviarlo.
- **La ficha del contacto:** notas, etiquetas y datos, a pantalla completa en el teléfono.
- **Enviar plantilla** y **conversación nueva.**
- **Con la app instalada en iPhone**: respetar la muesca y la barra de inicio de abajo (el cuadro de escribir no puede quedar debajo).

El resto de la app (Contactos, Campañas, Plantillas, Ajustes) **no se rediseña**: tiene que poder usarse, pero lo normal es hacerlo desde la computadora.

---

## 5. Lo que no entra

- Elegir de qué líneas recibir avisos, horarios de silencio o sonidos propios.
- Avisos de otra cosa que no sea un mensaje nuevo (campañas, estados).
- El número de no leídos sobre el ícono de la app.
- Una app de App Store o Google Play.
