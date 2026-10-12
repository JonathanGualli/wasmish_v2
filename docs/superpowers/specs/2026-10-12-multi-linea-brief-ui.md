# Brief de diseño — Varias líneas de WhatsApp por cuenta

> Para la IA de diseño. Describe **qué** tiene que poder hacer el usuario y **qué información** ve en cada momento, no cómo se ve. Ya conoces la marca, Ajustes, el panel de superadmin, Chats (con la conversación nueva y la ficha del contacto), Contactos y el asistente de campañas: el diseño debe sentirse parte de ellos y reutilizar sus componentes. Son dos piezas: la **Parte 1** se construye primero y la **Parte 2** después, pero conviene diseñarlas juntas, porque la forma de nombrar y señalar una línea tiene que ser la misma en toda la app.

---

## 1. Contexto

Wasmish es un CRM para WhatsApp Business. Hasta hoy, cada cuenta conecta **un** número de WhatsApp (en Ajustes, con «Conectar WhatsApp», que abre el inicio de sesión de Facebook). Ahora una cuenta podrá tener **varias líneas**: varios números de WhatsApp a la vez, por ejemplo «Ventas» y «Soporte», o uno por sucursal.

Qué es una línea, para el usuario:

- **Un número de WhatsApp conectado a Wasmish.** Tiene su número visible («+593 99 123 4567»), el nombre con que lo ve el cliente en WhatsApp (el nombre verificado del negocio, que pone Meta) y un **nombre interno** opcional que le pone la cuenta («Ventas», hasta 40 caracteres).
- **Cada línea tiene sus conversaciones.** Si un cliente escribe a «Ventas» y a «Soporte», son dos conversaciones distintas, cada una con su historial y su **ventana de 24 h** (WhatsApp solo deja escribir texto libre en las 24 h siguientes al último mensaje del cliente, **en ese número**).
- **Los contactos son de la cuenta**, compartidos por todas las líneas: el mismo contacto puede tener una conversación en cada línea.
- **Una línea es la «por defecto».** Es la que se usa cuando no se elige ninguna. Sobre todo, es por la que salen los mensajes de la **API pública** (los sistemas de los clientes envían por ahí, por ejemplo, los códigos de verificación de su login) si no indican otra. Siempre hay una por defecto mientras haya alguna línea conectada.
- **Las plantillas son de la cuenta de WhatsApp Business (WABA)** a la que pertenece el número. Dos líneas del mismo WABA comparten plantillas; dos de WABA distintos, no. Al enviar una plantilla por una línea, solo se pueden usar las de su WABA.
- **Una línea se puede desconectar.** Deja de enviar y de recibir mensajes en Wasmish, y **conserva sus conversaciones** para consultarlas. Si se vuelve a conectar ese número, vuelve a funcionar con su historial.
- **Cuántas líneas puede tener una cuenta lo decide su plan** (lo ajusta el superadmin; el cobro va fuera de Wasmish). **Hoy todas las cuentas tienen 1**, y así seguirán hasta que se active cuenta por cuenta.

Lo que el diseño tiene que transmitir:

- **Con una sola línea, Wasmish se ve y se usa como hoy.** Todos los clientes actuales tienen una: no pueden encontrarse selectores ni etiquetas de línea que no les dicen nada.
- **Con varias, siempre se sabe por qué número se está hablando** y por cuál va a salir lo que se envía.
- **Desconectar es serio pero no destructivo**: corta los mensajes de ese número, no borra nada.

---

# Parte 1 · Gestionar las líneas (se construye primero)

## 2. Ajustes → Líneas

Hoy Ajustes tiene la tarjeta **«WhatsApp Business»**: el estado («Conectado» / «Sin conectar»), el botón «Conectar WhatsApp» / «Volver a conectar», el ID de teléfono y el ID de WhatsApp Business, y plegado debajo «Cargar credenciales a mano» (un formulario con token, ID de teléfono e ID de WhatsApp Business, que se usa para conectar números de prueba). Debajo está la tarjeta de API keys, que no cambia.

Esa tarjeta pasa a ser **la de las líneas de la cuenta**.

### 2.1 Qué se ve de cada línea

1. **Cómo se llama:** el nombre interno si tiene; si no, el nombre verificado; si no, el número. Es la **etiqueta de la línea** en toda la app (Parte 2).
2. **El número visible.** Puede faltar en alguna línea antigua: entonces, su ID de teléfono.
3. **El nombre verificado** (el que ve el cliente en WhatsApp), si es distinto del interno.
4. **Si es la por defecto.**
5. **Su estado:** conectada o desconectada.
6. **Datos técnicos, en segundo plano:** el ID de la línea (lo usa la API pública para elegir por qué línea enviar, así que conviene poder copiarlo), el ID de teléfono y el ID de WhatsApp Business. Hoy se enseñan el ID de teléfono y el de WhatsApp Business; no tienen que competir con lo anterior.

**El token nunca se muestra.**

### 2.2 Qué se puede hacer

En cada línea **conectada**:

- **Ponerle o cambiarle el nombre interno**, en el sitio, sin abrir otra pantalla. Hasta 40 caracteres; vacío = sin nombre (vuelve a verse el nombre verificado o el número).
- **Hacerla la por defecto**, si no lo es.
- **Desconectarla**, siempre con confirmación:
  - Texto base: «Dejarás de enviar y recibir mensajes de este número en Wasmish. Sus conversaciones se conservan.»
  - Si es la **por defecto** y hay otra conectada: «La API pasará a enviar por [etiqueta de la línea que queda como por defecto].» (pasa a serlo la conectada más recientemente).
  - Si es la **única** conectada: «La API dejará de enviar hasta que conectes un número.» Aquí conviene que la confirmación pese más: desconecta a la cuenta de WhatsApp.

Las **desconectadas** se agrupan aparte, plegadas por defecto (por ejemplo «Números anteriores»): solo se consultan. Para reactivar una, se vuelve a conectar ese mismo número (con el botón de conectar o con el formulario manual); no hace falta un botón propio, pero sí decirlo.

### 2.3 Conectar

El botón de conectar abre el inicio de sesión de Facebook, como hoy. Qué pasa depende del plan:

- **Sin ninguna línea:** «Conectar WhatsApp», como hoy.
- **Plan de 1 línea con su línea conectada** (todos los clientes de hoy): el botón es el de hoy, «Volver a conectar». Sirve para renovar el permiso o para **cambiar de número**: si se conecta otro número, **reemplaza** al actual, que pasa a «Números anteriores» con sus conversaciones. Hoy eso pasa sin avisar; conviene decirlo cerca del botón, sin alarmar.
- **Plan de varias líneas, con sitio:** «Conectar otro número». Se ve cuántas se usan de cuántas («2 de 3 líneas»).
- **Plan de varias líneas, lleno:** el botón no se puede usar, con el motivo: «Tu plan permite 3 líneas conectadas. Desconecta una antes de conectar otra, o pide más líneas.»
- **Por encima del límite** (el superadmin bajó el plan): «3 de 2 líneas». **No se desconecta nada**: las tres siguen funcionando, solo no se puede añadir otra. Que no parezca un error de la cuenta.

**Volver a conectar un número que ya está conectado** (para renovar el permiso) siempre se puede, también con el plan lleno.

El formulario **«Cargar credenciales a mano»** se queda, plegado como hoy, con las mismas reglas que el botón (conecta, renueva o reemplaza).

### 2.4 Mensajes que pueden salir

Al conectar, renombrar, cambiar la por defecto o desconectar, propón dónde y cómo se ven estos errores:

- «Ese número de WhatsApp ya está conectado a otra cuenta de Wasmish.»
- «Ese número no pertenece a la cuenta de WhatsApp Business conectada.»
- «Esa cuenta de WhatsApp Business ya está conectada a otra cuenta de Wasmish.»
- El del plan lleno (arriba).
- «Hay otro cambio en las líneas de esta cuenta en curso. Inténtalo de nuevo en unos segundos.» (dos personas, o dos pestañas, cambiando líneas a la vez).
- «Solo una línea conectada puede ser la línea por defecto.»

Y el estado de carga mientras Facebook y Meta responden: conectar tarda unos segundos.

### 2.5 Casos a cubrir

- Sin ninguna línea.
- Una línea (lo de hoy), con y sin números anteriores.
- Varias líneas conectadas, con nombre y sin nombre, de un mismo WABA y de WABA distintos (¿se nota? Conviene que sí, discreto: cambia qué plantillas tiene cada una).
- Plan lleno y plan por encima del límite.
- Una línea sin número visible (antigua).
- Móvil.

## 3. Panel de superadmin

Hoy el panel tiene cuatro indicadores arriba (clientes, conectados, mensajes y fallos de 7 días) y la tabla de clientes con: Cliente, WhatsApp (conectado o no y el ID de WhatsApp Business enmascarado), Convs, Mensajes, Fallidos y Últ. actividad.

- **Nueva columna «Líneas»:** las conectadas y el máximo de su plan («1 / 1», «2 / 3»). Que se note cuando una cuenta está **por encima** de su límite («3 / 2»).
- **Cambiar el máximo** de una cuenta desde ahí: un número entero de **1 a 50**. Al **bajarlo por debajo de las conectadas**, avisar de que no desconecta nada, solo impide conectar más.
- El indicador «Conectados» pasa a contar las cuentas con al menos una línea conectada (el texto puede seguir igual).

---

# Parte 2 · Elegir y ver la línea (se construye después)

Regla general:

- **Los selectores de línea solo aparecen con más de una línea conectada.** Con una, se usa esa y no se pregunta nada.
- **La etiqueta de la línea** (en la bandeja, la cabecera del chat y la ficha) aparece en cuanto la cuenta tiene **más de una línea, conectada o no**. Una cuenta que cambió de número tiene conversaciones del número anterior, y tiene que poder distinguirlas. Si la línea está desconectada, la etiqueta lo dice.

## 4. Chats

### 4.1 Bandeja

- Cada conversación lleva **la etiqueta de su línea**. La bandeja mide 360 px y ya enseña nombre, último mensaje, hora, no leídos y el estado de la ventana: la etiqueta tiene que caber sin ruido.
- **Filtrar por línea:** «Todas» o una línea concreta, también las desconectadas (para consultar su historial). Propón dónde vive el filtro y si enseña los no leídos de cada línea.
- Las conversaciones de un contacto en dos líneas salen como **dos conversaciones** distintas, cada una con su etiqueta.

### 4.2 Conversación abierta

- La **cabecera** dice por qué línea es la conversación.
- **Conversación de una línea desconectada:** hoy, al responder, el envío da el error «Esta conversación es de un número de WhatsApp que ya no está conectado. Para escribirle, inicia una conversación nueva desde tu número actual.». Mejor que el campo de escribir lo diga **antes** de intentarlo, con un estado propio parecido al de la ventana cerrada, y que ofrezca escribir al contacto desde una línea conectada (la conversación nueva de §4.3, con el contacto ya puesto).
- **Enviar plantilla** dentro de una conversación: solo se ofrecen las plantillas del WABA de la línea de esa conversación. No hay que elegir línea: es la de la conversación.

### 4.3 Conversación nueva

Hoy el panel de conversación nueva pide el número (o un contacto) y la plantilla con la que empezar.

- **Con más de una línea conectada, primero se elige la línea**, con la por defecto ya puesta.
- Las plantillas que se ofrecen son **las del WABA de esa línea**. Si se cambia de línea y la plantilla elegida no es de su WABA, se quita, y hay que decirlo para que no sorprenda.
- Si el contacto ya tiene conversación en esa línea, la conversación nueva cae en ella (como hoy con un contacto existente).

## 5. Asistente de campañas

El asistente tiene tres pasos: **Destinatarios → Mensaje → Revisar y enviar**, y guarda un borrador en el navegador.

- En **Mensaje**, con más de una línea conectada, **la línea va antes que la plantilla**, con la por defecto ya puesta. Las plantillas, las de su WABA. Cambiar de línea quita la plantilla si no es de su WABA (y con ella las variables y botones ya rellenados): avisar antes de perder ese trabajo.
- **Revisar y enviar** dice por qué línea sale la campaña.
- **El borrador recuerda la línea.** Si al volver esa línea ya no está conectada, se vuelve a la por defecto, se quita la plantilla si no es de su WABA y se avisa de por qué.
- En la lista y en el detalle de campañas, la etiqueta de la línea por la que salió (con más de una línea).

## 6. Ficha del contacto

La ficha (en Contactos y en la columna del chat) enseña hoy la **ventana de 24 h** del contacto: abierta y cuánto le queda, o cerrada.

- Con más de una línea, **la ventana va siempre con su línea**: un contacto puede tener la ventana abierta en «Ventas» y cerrada en «Soporte». Propón cómo se ve un contacto con conversaciones en varias líneas (una línea por conversación con su etiqueta y su ventana, la más reciente primero).
- La actividad (mensajes enviados, recibidos y fallidos) es la suma de todas sus conversaciones.

---

## 7. Lo que no entra

- Usuarios, roles y asignar conversaciones a personas: es la fase siguiente. Hoy cada cuenta la usa una persona.
- Comprar o cambiar de plan desde Wasmish: el límite lo pone el superadmin a mano.
- Cambiar el número o el WABA de una línea: se conecta otro número.
