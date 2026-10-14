# Brief de diseño: el equipo de una cuenta (usuarios, roles y acceso por línea)

> Para la IA de diseño. Describe **qué** tiene que poder hacer cada persona y **qué información** ve, no cómo se ve. Ya conoces la marca, Ajustes (con Líneas y API keys), el panel de superadmin, Chats, Contactos, Campañas, Plantillas y las pantallas de acceso (entrar y crear cuenta). El diseño tiene que sentirse parte de ellos y reutilizar sus piezas.

---

## 1. Contexto

Hasta hoy, cada cuenta de Wasmish la usa **una sola persona**. Ahora una cuenta podrá tener **varios usuarios**: el negocio invita a sus agentes para que respondan los chats, cada uno con su rol.

**Los roles** (uno por persona):

| Rol | Para quién | Qué ve | Qué puede hacer además de chatear |
|---|---|---|---|
| **Owner** | Quien creó la cuenta. Hay uno. | Todas las líneas | Todo |
| **Admin** | Quien gestiona el día a día | Todas las líneas | Todo menos tocar al owner |
| **Supervisor** | Quien coordina a los agentes de unas líneas | Solo sus líneas | Campañas, importar y borrar contactos, etiquetas, sincronizar plantillas |
| **Agente** | Quien responde los chats | Solo sus líneas | Nada más: chatear, ver y editar contactos, ver plantillas |

**Más reglas:**
- Supervisor y agente tienen una **lista de líneas** (las de Ajustes → Líneas). Owner y admin ven todas, también las que se conecten después.
- **Solo owner y admin** conectan o desconectan líneas, gestionan las API keys y gestionan el equipo.
- **Todos ven todos los contactos** de la cuenta, pero solo las conversaciones de sus líneas.
- **Cuántos usuarios** puede tener la cuenta lo dice su plan («3 de 5 usuarios»), igual que las líneas. Cuentan los activos (el owner incluido) y las invitaciones pendientes. Hoy todas las cuentas tienen 1, y así seguirán hasta que se active cuenta por cuenta.
- **Un correo es una persona en una sola cuenta:** no se puede invitar un correo que ya usa Wasmish.
- La **asignación de conversaciones** («Mías / Sin asignar», transferir) viene después y **no entra en este diseño**. Hasta entonces, un agente ve todas las conversaciones de sus líneas.

**Lo que el diseño tiene que transmitir:**
- **Con una sola persona, Wasmish se ve como hoy**, más la sección Equipo en Ajustes.
- Cada uno **ve lo que puede hacer, sin botones que no le sirven**: a un agente no se le enseña «Importar» apagado, sencillamente no está.
- **Quitar acceso es inmediato y no borra nada:** las conversaciones y los mensajes de esa persona se quedan.

---

## 2. Ajustes → Equipo (owner y admin)

Una sección nueva de Ajustes, junto a Líneas y API keys. **Solo la ven el owner y los admins.**

### 2.1 Qué se ve
- **El uso del plan:** «3 de 5 usuarios». Cuentan las invitaciones pendientes.
- **Cada persona:**
  - Nombre y correo.
  - Rol.
  - Sus líneas, con la etiqueta de línea de toda la app (las de Ajustes → Líneas). Para owner y admin, «Todas las líneas».
  - Estado: activa o desactivada.
- **Marcas:** el owner y «tú» (quien está mirando) se reconocen de un vistazo.
- **Las invitaciones pendientes:** correo, rol, líneas, quién invitó y cuándo caduca («Caduca en 5 días»).

### 2.2 Qué se puede hacer
- **Invitar:**
  - Correo, rol (admin, supervisor o agente) y, para supervisor y agente, sus líneas: al menos una, elegidas de las conectadas.
  - Al crearla se enseña **el enlace de invitación una sola vez**, con «Copiar» y el aviso de que no se volverá a mostrar, como la API key recién creada. Wasmish no envía correos: la persona lo manda por donde quiera (WhatsApp, correo…).
  - Caduca a los 7 días.
- **Anular una invitación pendiente:** libera su plaza.
- **Volver a invitar el mismo correo** reemplaza la invitación anterior: el enlace viejo deja de valer. Sirve para reenviar un enlace perdido.
- **Cambiar el rol** de una persona.
- **Cambiar sus líneas** (supervisor y agente).
- **Desactivar a una persona:**
  - Con confirmación: «Dejará de entrar a Wasmish en el momento. Sus mensajes y conversaciones se quedan.»
  - Libera su plaza.
- **Reactivarla:** necesita plaza libre.
- **Lo que no se puede hacer:**
  - Nadie se cambia a sí mismo el rol ni se desactiva.
  - El owner no se cambia ni se desactiva desde aquí.
  - Un admin no toca al owner.
  - Esas acciones no se ofrecen.
- **En el límite del plan**, invitar se explica antes de intentarlo: «Tu plan permite 5 usuarios. Desactiva a alguien o anula una invitación, o pide más usuarios.»

### 2.3 Lo que pasa al cambiar el acceso
Cambiar el rol o las líneas de alguien, o desactivarlo, **le afecta al momento**, aunque tenga Wasmish abierto: su pantalla se actualiza sola con el acceso nuevo, o sale si se le desactivó. Conviene que quien hace el cambio lo sepa: «Se aplica al momento en sus pestañas abiertas.»

### 2.4 Errores (texto del backend; el diseño decide dónde)
| Cuándo | Mensaje |
|---|---|
| Invitar un correo que ya usa Wasmish | «Ese correo ya tiene una cuenta en Wasmish.» |
| Invitar o reactivar sin plaza | «Tu plan permite N usuarios. Desactiva a alguien o anula una invitación, o pide más usuarios.» |
| Otro cambio a la vez, o un error de red | Los mismos que en Líneas |

---

## 3. Aceptar la invitación (página pública)

Quien recibe el enlace llega a una página **sin sesión**, con el estilo de las pantallas de acceso (entrar y crear cuenta).

- **Ve:**
  - A qué negocio lo invitan («Distribuidora Andina te invita a Wasmish»).
  - Quién lo invitó.
  - Con qué rol.
  - Su correo, fijo: no se puede cambiar.
- **Escribe** su nombre y una contraseña (con las mismas reglas que al crear cuenta).
- **Al aceptar** entra directamente a Wasmish, ya dentro de la cuenta.
- **Si el enlace ya se usó o no existe:** «Esta invitación no existe o ya no es válida.» Si caducó: «La invitación caducó. Pide que te envíen otra.» En los dos casos, el camino a «Entrar».
- **Si el correo se registró entretanto:** «Ese correo ya tiene una cuenta en Wasmish.»

---

## 4. Lo que cambia según el rol en el resto de la app

**Ocultar, no apagar.** Lo que el rol no puede hacer no se enseña.

| Dónde | Supervisor | Agente |
|---|---|---|
| Menú | Igual que el owner | Sin «Campañas» |
| Chats y conversación nueva | Solo sus líneas | Solo sus líneas |
| Contactos | Todo | Ve y edita; **sin** importar, borrar, etiquetar en bloque ni crear etiquetas (sí pone y quita etiquetas que ya existen en la ficha) |
| Plantillas | Todo | Las ve; **sin** sincronizar ni subir la cabecera |
| Campañas | Las de sus líneas | No existe |
| Ajustes → Líneas | Solo sus líneas, para consultar: sin conectar, renombrar, desconectar ni ver el PIN | Igual |
| Ajustes → API keys y Equipo | No existen | No existen |

- **«Enviar desde»** solo ofrece las líneas de la persona. Con una sola, no sale (como hoy).
- **Ajustes de un agente:** con lo que queda, ¿qué ve? Decídelo: quizá «tus líneas» y poco más.

---

## 5. Quién respondió (Chats)

Con varias personas en una cuenta, en cada mensaje que enviamos desde el chat se ve **quién lo envió** («Ana»), también si esa persona ya no está en el equipo.
- Los de **campañas** y los de la **API** no son de nadie: el diseño decide si dicen «Campaña» o «API», o nada.
- **Con una sola persona en la cuenta, no hace falta** enseñarlo.

---

## 6. Superadmin → Clientes

Junto a la columna «Líneas», una de **usuarios**: «2 de 5», con el máximo editable en el sitio, igual que el de líneas.
