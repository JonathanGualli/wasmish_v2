# Brief de diseño: el detalle de plantillas

> Para la IA de diseño. Describe **qué** tiene que poder hacer cada persona y **qué información** ve, no cómo se ve. Ya conoces la marca y la página **Plantillas** de hoy (una tabla con nombre, «Se envía desde», ID, cuerpo, cabecera, idioma y estado, y el botón «Sincronizar»), el **detalle de una campaña** y las vistas previas de plantilla del chat y del asistente de campañas (la burbuja con la cabecera, el cuerpo y los botones debajo). El diseño tiene que sentirse parte de ellos y reutilizar sus piezas.
>
> El porqué de cada cosa está en el spec: `docs/superpowers/specs/2026-11-06-detalle-plantillas-design.md`.

---

## 1. Contexto

Las plantillas son los mensajes que WhatsApp aprueba para escribir a un contacto que no ha escrito en las últimas 24 horas, y las únicas que se pueden mandar en una campaña. Se crean en el panel de Meta, no en Wasmish: Wasmish las trae al sincronizar.

Hoy Plantillas es solo una tabla, y el cuerpo sale cortado en una línea. **No se puede abrir una plantilla y verla entera**: ni cómo le llega al contacto, ni sus botones, ni su categoría, ni por qué WhatsApp la rechazó, ni si alguien la está usando. Es lo que pidió Jonathan: «que se pueda ver toda la plantilla, su información más detallada».

**Quién la ve:** todos los de la cuenta. El owner, los admins y los supervisores, además, sincronizan y suben el archivo de la cabecera (como hoy). **El agente** solo ve: el uso, contado en sus líneas y en sus conversaciones, y sin las campañas.

**Qué cambia por debajo (lo que la pantalla tiene que reflejar):**
- Wasmish trae ahora **todo** de cada plantilla: también el **pie** (el texto gris bajo el cuerpo), los **ejemplos de las variables** que se mandaron a Meta para aprobarla, la **calidad** que le da WhatsApp y el **motivo del rechazo**.
- **Una plantilla borrada en Meta** ya no desaparece en silencio ni se queda como «Aprobada»: se marca **borrada**, **no se puede enviar**, pero **sigue en la lista** (con su detalle y su uso), porque los mensajes y las campañas viejos la nombran.
- **Se sincroniza sola al abrir** Plantillas o un detalle, si la última vez fue hace más de 10 minutos. «Sincronizar» se queda para forzarlo.
- **El uso** se cuenta con lo que ya guarda Wasmish: cuántas veces se envió, cuántas se entregaron, se leyeron y fallaron, la última vez, y en qué campañas. Desde siempre, no por período.

**Lo que el diseño tiene que transmitir:**
- Que en un vistazo se sabe **si la plantilla se puede usar** y, si no, **por qué** y qué hacer.
- Que se ve **igual que le llega al contacto**.
- Que se sabe **si está funcionando**: si se usa y si llega.

---

## 2. La tabla de Plantillas

Lo de hoy, más:

- **Abrir una plantilla** desde su fila.
- **La categoría** de cada una (Marketing, Utilidad, Autenticación). Ya existe una píldora de categoría en el detalle de campaña.
- **Las borradas en Meta** se distinguen (hoy, una píldora «Borrada» en el estado) y están **escondidas por defecto**, con un filtro para verlas.
- Si encaja, filtrar por **estado** o por **categoría**. No es imprescindible.
- **Ojo:** a 1440 px la tabla ya no cabe (la columna de estado se corta). Al rehacerla, que quepa.
- El aviso de hoy de las plantillas **sin archivo de cabecera** sigue.

---

## 3. El detalle de una plantilla

Una página propia (con su dirección, para volver atrás o guardar el enlace), que se abre desde la tabla y desde el **detalle de una campaña** («Ver plantilla»).

### 3.1 Cómo la ve el contacto

La burbuja de las vistas previas, con todo: la **cabecera** (el archivo, el texto o el hueco si falta el archivo), el **cuerpo completo**, el **pie** y los **botones**. En el cuerpo, las variables se rellenan con **sus ejemplos** (los que se mandaron a Meta) y se nota que son variables; sin ejemplo, se quedan marcadas (`{{1}}`, `{{nombre}}`), como hoy en el asistente.

### 3.2 Los datos

- **Nombre** (en mono: es lo que se copia a la API) e **ID**.
- **Idioma.**
- **Categoría** y, si WhatsApp la cambió, **la anterior** («WhatsApp la pasó de Utilidad a Marketing»: cambia lo que cobra Meta y, en las campañas, si se deja fuera a quien se dio de baja de publicidad).
- **Estado**, en palabras: Aprobada, Pendiente de revisión, Rechazada, En pausa, Desactivada, En apelación, Borrada en Meta, y las raras de Meta (límite alcanzado, archivada, borrándose) en palabras también.
- **El motivo del rechazo**, en palabras y con qué hacer. Los de Meta: formato no válido, categoría incorrecta, contenido abusivo, estafa, contenido promocional en una de utilidad, las variables no coinciden con el ejemplo; para cualquier otro, «WhatsApp la rechazó» con el código.
- **Calidad**, según WhatsApp: alta (verde), media (amarilla), baja (roja) o sin datos todavía. Que una baja se note: si sigue bajando, WhatsApp la pausa.
- **La última modificación en Meta.**
- **Cada botón con su destino:** el enlace (y si una parte cambia en cada envío), el teléfono, el código que copia, o la respuesta rápida.
- **Las variables** con su ejemplo, una por una.
- **Desde qué líneas se envía** (con varias líneas; como la columna de hoy).
- **El archivo de la cabecera** (con imagen, vídeo o documento): verlo, subirlo, cambiarlo o quitarlo, como hoy en la columna «Cabecera».

### 3.3 Su uso

- **Envíos:** cuántos en total, cuántos **se entregaron**, cuántos **se leyeron** y cuántos **fallaron**. Que se entienda que un leído también se entregó.
- **El último envío.**
- **Las campañas** que la usaron (nombre, estado, fecha), con el enlace a cada una. Solo para quien gestiona campañas.
- **Para el agente:** el uso es el de sus líneas y sus conversaciones; que no parezca el total de la cuenta.
- **Sin envíos:** que no parezca un error («Todavía no se ha enviado»).

### 3.4 Avisos

- **Borrada en Meta:** ya no se puede enviar; sigue aquí por los mensajes y las campañas que la usaron. Una campaña ya creada con ella va a fallar.
- **Rechazada:** el motivo y qué hacer (corregirla en el panel de Meta y volver a mandarla).
- **En pausa o desactivada:** WhatsApp la paró por su calidad; no se puede enviar hasta que la reactive.
- **Calidad baja:** todavía se envía, pero WhatsApp puede pausarla.
- **Pendiente:** WhatsApp la está revisando; suele tardar minutos u horas.
- **Sin el archivo de la cabecera:** como hoy, que sin él no sale.

### 3.5 Estados de la página

- **Cargando** (mientras sincroniza sola, que no bloquee lo que ya se sabe).
- **No existe:** también al llegar desde una campaña cuya plantilla ya no está («Esta plantilla ya no está en tu cuenta»).
- **Error al cargar**, con «Reintentar».

---

## 4. Las vistas previas de plantilla

En **todas** (el detalle, el chat al enviar una, la conversación nueva, el asistente de campañas), la burbuja suma **el pie**, en gris bajo el cuerpo, como lo ve el contacto.

---

## 5. Lo que no entra

Crear o editar plantillas desde Wasmish (se hace en Meta), elegir un período para el uso, avisos al momento cuando Meta cambia el estado (llegan al sincronizar), y abrir el detalle desde un mensaje del chat. No hace falta dejarles hueco.

---

## 6. Pantallas que necesitamos

1. La **tabla** en escritorio, con una borrada escondida y el filtro para verla.
2. El **detalle** en escritorio de una plantilla aprobada de marketing con imagen en la cabecera, variables con ejemplo, pie, dos botones (un enlace con una parte variable y una respuesta rápida), uso y campañas.
3. El **detalle** de una **rechazada** (con su motivo) y el de una **borrada en Meta**.
4. El **detalle** como **agente** (sin campañas) y el de una plantilla **sin envíos**.
5. El **detalle** en el **teléfono**.
6. **Desde una campaña:** «Ver plantilla» y el caso «ya no está en tu cuenta».
