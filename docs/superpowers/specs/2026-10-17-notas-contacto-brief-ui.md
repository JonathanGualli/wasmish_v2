# Brief de diseño: notas del contacto con autor

> Para la IA de diseño. Describe **qué** tiene que poder hacer cada persona y **qué información** ve, no cómo se ve. Ya conoces la marca y todas las pantallas de Wasmish (Chats con su bandeja, hilo y ficha; Contactos con su panel; Ajustes → Equipo; la app en el celular). El diseño tiene que sentirse parte de ellas y reutilizar sus piezas. Spec técnico: [2026-10-17-notas-contacto-design.md](2026-10-17-notas-contacto-design.md).

---

## 1. Contexto

Una cuenta de Wasmish puede tener varias personas (owner, admin, supervisor y agentes) que atienden a los mismos contactos. Hoy cada contacto tiene **una nota**: un solo cuadro de texto que se edita en el sitio y se guarda solo. Con una persona funciona; con un equipo, no:

- no se sabe **quién** escribió qué ni **cuándo**;
- si dos personas cambian la nota, la última borra lo de la otra.

Las notas pasan a ser **una lista**: cada nota con su texto, su autor y su fecha. Se añaden sin tocar las de los demás. Es lo que hace creíble el primer beneficio que Wasmish promete: «el equipo sabe qué se habló».

Un ejemplo de uso: Ana (agente) atiende a un cliente por la mañana y apunta «Pidió cotización de 500 volantes, le paso precio el lunes». Por la tarde el cliente vuelve a escribir y lo atiende Luis: abre la ficha y ve la nota de Ana, de hoy a las 10:12, sin preguntarle nada.

---

## 2. Dónde aparecen

1. **La ficha del contacto en Chats**: el panel de la derecha en la computadora y la pantalla completa en el celular. Hoy tiene la tarjeta «Notas» (un cuadro de texto que se guarda solo), encima de las etiquetas y los datos. Es donde más se usan: mientras se atiende una conversación.
2. **El panel de un contacto en Contactos**: hoy las notas son una fila más de «Datos» (texto plano). Tiene que mostrar la misma lista, con lo mismo que se puede hacer en la ficha.

---

## 3. Lo que ve la persona

Cada nota muestra:
- **el texto** (hasta 1000 caracteres, con saltos de línea; puede llevar un enlace largo);
- **quién la escribió**: su nombre. Si esa persona ya no está en la cuenta, su nombre sigue saliendo;
- **cuándo**: «hace 5 min», «hoy 10:12», «ayer», una fecha; con la fecha y hora exactas al alcance;
- **si se editó** («editada»), con cuándo;
- dos casos especiales:
  - **la nota que el contacto ya tenía** antes de este cambio: no se sabe quién la escribió ni cuándo. Tiene que entenderse que es «la nota de antes», no un error ni algo anónimo sospechoso;
  - **una nota importada** desde un archivo (Contactos → Importar): a nombre de quien importó, y que se note que vino del archivo.

**Orden:** de la más nueva a la más vieja.

**Cuántas:** lo normal son pocas (1 a 5), pero puede haber decenas. La ficha del chat es estrecha y comparte espacio con las etiquetas y los datos: hay que decidir cuántas se ven de entrada y cómo se llega al resto, sin que la ficha se vuelva un muro de notas.

**Sin notas:** que invite a escribir la primera (hoy: «Apunta lo que no quieras olvidar. Ej.: paga a 30 días, prefiere que le escriban por la tarde.»).

---

## 4. Lo que puede hacer

- **Añadir una nota**, siempre, cualquier persona que vea el contacto (también un agente). Al guardarla aparece al momento, arriba, a su nombre.
- **Editar y borrar las suyas.** El **owner y los admin** pueden editar y borrar **cualquiera**, también la de antes y las importadas. Un supervisor o un agente **no ve** cómo editar o borrar las de otros (no un botón que luego falla).
- **Borrar pide confirmación**, y la confirmación dice de quién es la nota cuando no es de quien borra («Vas a borrar una nota de Ana»).
- **Editar** se hace en el sitio, con Guardar y Cancelar (o el equivalente que encaje). Una nota editada queda marcada.
- **Lo que llega de otra persona** mientras se mira la ficha (otra nota, una edición, un borrado) aparece solo, sin recargar. No tiene que cerrar ni borrar una nota que la persona está escribiendo o editando.

---

## 5. Estados que hay que resolver

- **Escribiendo una nota nueva** y **editando una existente**, en la computadora y en el celular (con el teclado abierto).
- **Guardando** (breve) y **guardada**.
- **No se pudo guardar** (sin conexión, el servidor cayó): **el texto no se pierde**. Se queda donde estaba, con un aviso en esa nota y «Reintentar». Hoy el cuadro de notas ya lo hace así: no empeorarlo.
- **No se pudo borrar**: la nota vuelve a su sitio, con el motivo.
- **Límite de caracteres**: cerca de los 1000, un contador (hoy aparece desde 900).
- **Cargando la ficha**: las pantallas de carga que ya existen (skeletons) tienen que cubrir la lista.

---

## 6. Otros sitios que cambian (pequeños)

- **Contactos → Nuevo contacto**: el campo «Notas» se queda; lo que se escriba es la primera nota, a nombre de quien crea el contacto. **Al editar un contacto**, el campo desaparece: las notas se gestionan en la lista del panel. Que no parezca que se perdieron: la persona tiene que saber dónde están.
- **Contactos → Importar**: en la vista previa, bajo un contacto de ejemplo que ya existía, hoy se lee «Se le añade el email y la empresa.». Con una nota en el archivo dirá «Se le añade una nota.». Solo es el texto; no hace falta diseñar nada nuevo, salvo que veas un problema.

---

## 7. Lo que no entra

- Notas dentro del hilo de una conversación (notas internas entre mensajes).
- Mencionar a alguien (@Ana), adjuntar archivos a una nota, reacciones.
- Buscar contactos por el texto de sus notas.
- Fijar una nota arriba o darle colores.
