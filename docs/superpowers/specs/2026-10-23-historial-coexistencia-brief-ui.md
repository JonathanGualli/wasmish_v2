# Brief de diseño: el historial y los contactos de la app de WhatsApp Business

> Spec: [2026-10-23-historial-coexistencia-design.md](2026-10-23-historial-coexistencia-design.md).

> Para la IA de diseño. Describe **qué** tiene que poder hacer cada persona y **qué información** ve, no cómo se ve. Ya conoces la marca y todas las pantallas de Wasmish (Ajustes → Líneas con la pregunta «¿Usas este número en la app de WhatsApp Business?» antes de conectar; Chats con su bandeja, hilo y ficha; la marca «Desde la app de WhatsApp» en los mensajes; Contactos con su panel; la app en el celular). El diseño tiene que sentirse parte de ellas y reutilizar sus piezas.

---

## 1. Contexto

Un negocio puede conectar a Wasmish el número que sigue usando en la app de WhatsApp Business del celular. Hasta ahora, lo de antes de conectar se quedaba en el celular: la bandeja empezaba vacía y los contactos aparecían como números sueltos.

Ahora, al conectar, Wasmish **trae los chats de los últimos 6 meses y la agenda del celular**, si el negocio lo permite en la app (lo decide al escanear el código, en la app). Pasa **solo una vez** y en las 24 horas siguientes a conectar: Wasmish lo pide solo, sin que nadie toque nada. Puede tardar unos minutos, o más si hay muchos chats.

Quien lo usa: el dueño o el administrador de un negocio pequeño, que no es técnico, muchas veces desde el celular. Las palabras «historial», «sincronizar», «Cloud API» o «coexistencia» no le dicen nada: se habla de «tus chats de la app» y de «tus contactos del celular».

---

## 2. La explicación antes de conectar (cambia lo que ya existe)

La lista de «qué va a pasar» que ve quien responde que sí usa la app hoy dice que **los chats anteriores se quedan en la app**. Eso cambia:

- **Sus chats de los últimos 6 meses pasan a Wasmish**, si lo acepta en la app al escanear el código. Los grupos no. Las fotos, videos y documentos de las **últimas dos semanas** se ven en Wasmish; los más viejos se quedan en el celular (en Wasmish se ve que había un archivo).
- **Sus contactos del celular** ponen nombre a los clientes en Wasmish. Solo aparecen en Contactos los que tienen chat; el resto de la agenda no se ve. Lo que cambie en la agenda del celular se refleja en Wasmish.
- **Es una sola vez:** si no lo acepta en la app, para traerlos después tendría que desconectar el número y volver a conectarlo.

El resto de la lista no cambia.

---

## 3. En Ajustes → Líneas

Cada línea conectada con la app muestra **cómo van sus chats de la app**, en pocas palabras. Los estados posibles:

- **Pedido, esperando a WhatsApp:** acaba de conectar y todavía no llegó nada (puede tardar unos minutos). Si a veces Wasmish no sabe si el pedido llegó a WhatsApp, pasada media hora sin nada también ofrece «Reintentar».
- **Trayendo tus chats:** con el avance en porcentaje, que sube solo. Los chats van apareciendo en la bandeja mientras tanto.
- **Listo:** los chats ya están en Wasmish. Habla solo de los chats: los contactos del celular no tienen un «terminado» (siguen llegando cada vez que el negocio cambia su agenda) y las fotos recientes pueden terminar de llegar un poco después.
- **Listo, con algunos chats que no se pudieron traer:** cuántos. No hay acción para recuperarlos (Meta no los vuelve a mandar); es informativo.
- **No los compartiste desde la app:** el negocio no lo aceptó en la app. Para traerlos, desconectar y volver a conectar el número (y aceptarlo esta vez). Es informativo, no un error grave.
- **No llegó nada:** pasaron 24 horas sin que WhatsApp mandara chats (por ejemplo, el celular no tenía). Informativo.
- **No se pudo pedir:** algo falló al pedirlo. Con **«Reintentar»**, y cuánto tiempo queda para hacerlo (son 24 horas desde que se conectó). Pasado ese plazo, el mismo texto que «No los compartiste»: desconectar y volver a conectar.

Las líneas conectadas antes de esta función, o que no son de la app, no muestran nada de esto.

Solo lo ven quienes pueden gestionar líneas (como hoy Ajustes → Líneas). El cambio de estado se ve sin recargar.

---

## 4. En el chat, la ficha y Contactos

- **La bandeja** se llena con las conversaciones traídas, ordenadas por la fecha de su último mensaje, **sin** no leídos ni avisos. Nada nuevo que diseñar en la bandeja.
- **En el hilo**, los mensajes traídos se ven como los demás: lo que el negocio mandó desde el celular, con la marca «Desde la app de WhatsApp» que ya existe; lo del cliente, como cualquier mensaje recibido. Un archivo viejo que no se trajo se ve como un mensaje con el texto «Archivo: míralo en tu celular» (con el mismo tratamiento que hoy tiene un mensaje que no se pudo traer).
- **El nombre** que se enseña de un contacto es, en este orden: el que le puso el equipo en Wasmish, el de la agenda del celular, el de su perfil de WhatsApp, su teléfono. No hay que diseñar nada para eso, pero sí:
  - **En la ficha del contacto y en el panel de Contactos**, el nombre de la agenda se ve como un dato más («Nombre en tu celular»), de solo lectura: se cambia en el celular, no en Wasmish. Si el equipo le puso otro nombre en Wasmish, se ven los dos.
  - Al editar el contacto, el campo de nombre sigue siendo el de Wasmish. Si está vacío, que se entienda que se está usando el de la agenda.
- **El origen** de un contacto que llegó así: «De la app de WhatsApp Business», junto a los que ya existen («Te escribió primero», «Importado»…).

---

## 5. Lo que tiene que cumplir siempre

- **Sin jerga:** nada de «historial», «sincronización», «Cloud API» ni «coexistencia».
- **Tranquilo:** traer los chats es un extra. Que no salga, o que el negocio no lo haya aceptado, no se presenta como una alarma.
- **Celular y computadora**, como el resto de Ajustes.
- Lo demás de Ajustes → Líneas (renombrar, línea por defecto, PIN, desconectar, el motivo de una desconexión) no cambia.
