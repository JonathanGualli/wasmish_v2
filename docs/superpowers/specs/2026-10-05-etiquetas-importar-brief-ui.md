# Brief de diseño — Etiquetas e Importar contactos

> Para la IA de diseño. Describe **qué** tiene que poder hacer el usuario y **qué información** ve en cada momento, no cómo se ve. Ya conoces la marca, la sección Contactos y el asistente de campañas: el diseño debe sentirse parte de ellos y reutilizar sus componentes. Son dos piezas relacionadas; puedes entregarlas en un archivo o en dos.

---

## 1. Contexto

Wasmish es un CRM para WhatsApp Business. En **Contactos** hay una tabla paginada con búsqueda, filtros (*Todos, Con conversación, Sin conversación, Baja de publicidad*), selección con casillas y una ficha lateral por contacto. Desde ahí se eligen los destinatarios de una **campaña**: se marcan contactos o «todos los que coinciden» con la búsqueda y el filtro, y se sigue al asistente.

Dos problemas que resuelve este trabajo:

1. **Segmentar.** Hoy no hay forma de decir «estos son mis clientes VIP». Para mandarles una campaña hay que buscarlos uno a uno.
2. **Traer la lista.** Los negocios ya tienen sus clientes en un Excel o exportados de otro sistema. Hoy solo se pueden dar de alta de uno en uno.

Lo que el diseño tiene que transmitir:

- **Una etiqueta es un grupo de contactos.** Un contacto puede tener ninguna o varias (VIP y Quito, por ejemplo).
- **El uso principal es elegir destinatarios de una campaña**: filtrar por VIP, marcar todos, enviar.
- **Importar no estropea lo que ya hay.** Un contacto que ya existe solo se completa; nunca se pisa lo que tiene.
- **La gente se equivoca al preparar su lista.** El importador tiene que ayudar a encontrar y corregir los errores, no solo rechazarlos.

---

# Parte 1 · Etiquetas

## 2. Qué es una etiqueta

- Un nombre corto: **VIP, ESTÁNDAR, Mayorista, Feria octubre, Quito**. Máximo 30 caracteres.
- Cada cuenta tiene **su lista de etiquetas**. Se crean al escribirlas, en cualquier sitio donde se etiqueta: no hace falta ir a otra pantalla antes.
- «VIP», «vip» y «Vip » son **la misma etiqueta**: al escribir, se sugiere la que ya existe en vez de crear otra.
- **Sin colores**: todas se ven igual. La marca pide poco color, y el color de la pantalla ya lo tienen los estados (baja de publicidad, ventana abierta…). Tienen que distinguirse de esas píldoras de estado: una etiqueta es un dato que puso el usuario, no un estado.
- Un contacto tiene como mucho 20.

## 3. Dónde aparecen

### A. Lista de Contactos

- **Columna o espacio para las etiquetas** de cada contacto. Si tiene muchas, se ven las primeras y «+3».
- **Filtro por etiquetas**, de selección múltiple, junto a los filtros que ya hay. Marcar VIP y ESTÁNDAR muestra a los que tengan **alguna de las dos**. Se combina con la búsqueda y con el filtro de conversación («VIP sin conversación»).
- El filtro activo tiene que verse claramente, con forma de quitarlo, porque cambia lo que se selecciona para la campaña.
- En la lista vacía por filtro: «Ningún contacto con la etiqueta VIP», con la salida de quitar el filtro.

### B. Etiquetar varios a la vez

- En la **barra de selección** (la que aparece al marcar contactos), una acción **«Etiquetar»**.
- Permite **añadir** una o varias etiquetas a los marcados, y también **quitar**.
- Funciona igual con «todos los que coinciden» (pueden ser miles): hay que decir cuántos se van a etiquetar antes de confirmarlo.
- Al terminar, un aviso corto: «Se añadió VIP a 128 contactos».
- **Flujo típico:** buscar «ferretería», marcar todos, Etiquetar → VIP.

### C. Ficha del contacto y formulario

- La ficha muestra sus etiquetas en la sección de datos.
- En el formulario de crear o editar, un **selector de etiquetas**: busca entre las existentes mientras se escribe, deja crear una nueva («Crear «Mayorista»») y quitar las puestas.

### D. Gestionar etiquetas

- Un sitio pequeño, accesible desde Contactos (no una sección del menú), con la lista de etiquetas y **cuántos contactos tiene cada una**.
- **Renombrar:** cambia en todos sus contactos a la vez. Si el nombre ya es de otra etiqueta, se avisa.
- **Borrar:** se pide confirmación con el número de contactos («Se quitará de 128 contactos. Los contactos no se borran»).
- Desde cada etiqueta, ir a ver sus contactos (la lista filtrada).
- Sin etiquetas todavía: explicar en una línea para qué sirven, con un ejemplo.

### E. Campañas

- **Elegir destinatarios** ya es la lista de Contactos en «modo campaña»: el filtro por etiqueta aparece ahí también y es la forma rápida de elegir «todos los VIP».
- En el **paso de revisar** de la campaña, si se eligió por etiquetas: «Etiquetas: VIP, ESTÁNDAR».
- La campaña **guarda la lista al crearse**: quitarle la etiqueta a alguien después no lo saca de una campaña ya enviada. No hace falta explicarlo en la pantalla salvo que lo creas útil.

---

# Parte 2 · Importar contactos

## 4. El recorrido

Una **página con pasos**, como el asistente de «Nueva campaña» (no un diálogo), a la que se llega con un botón **«Importar»** en Contactos, junto a «Nuevo contacto». Pasos: **Archivo → Columnas → Revisar**, y después la importación y el resultado.

Si la cuenta no tiene ningún contacto, la pantalla vacía de Contactos («Aún no tienes contactos») ofrece importar además de crear uno.

### Paso 1 · Archivo

- **Elegir o arrastrar un archivo**: Excel (`.xlsx`) o CSV. Hasta **10 000 filas**.
- **Descargar la plantilla.** Un Excel ya preparado con las columnas Teléfono, Nombre, Apellido, Email, Empresa, Etiquetas y Notas, y una hoja de instrucciones. Tiene que verse como la forma más fácil de empezar, no como letra pequeña. Conviene explicar en una línea por qué ayuda: las columnas ya están puestas y el teléfono no se estropea (Excel suele convertir los números largos en `5,93991E+11` o quitarles el 0 del principio).
- **País de los números.** Un selector con Ecuador por defecto (se recuerda el último elegido). Se aplica a los números que vienen sin código de país, como `0991234567`. Los que ya traen `+593…` se respetan. Hay que entender para qué sirve sin leer un párrafo.
- **Errores de este paso:**
  - Formato no admitido: «Ese archivo es .xls, de una versión antigua de Excel. Ábrelo y guárdalo como .xlsx».
  - Demasiadas filas: «El archivo tiene 14 230 filas: el máximo es 10 000. Divídelo en dos».
  - Vacío, o sin filas aparte de la cabecera.
- Leer el archivo es inmediato: pasa en el navegador y no se sube nada.

### Paso 2 · Columnas

- Para **cada dato de Wasmish**, de qué columna del archivo sale: **Teléfono** (obligatorio), Nombre, Apellido (se junta al nombre), Email, Empresa, Etiquetas y Notas.
- **Viene emparejado solo** cuando se puede: con la plantilla, todo; con otro archivo, por el nombre de la columna («Celular», «Móvil», «WhatsApp» → Teléfono; «Razón social» → Empresa). El usuario revisa y corrige.
- Junto a cada emparejamiento, **2 o 3 valores reales** del archivo, para comprobar a simple vista que es la columna correcta.
- Las columnas del archivo que no se usan se pueden ver (para saber que se ignoran), sin protagonismo.
- **Columna Etiquetas:** separadas por comas en la celda («VIP, Quito»). Se crean las que no existan.
- **Etiquetas para todos:** añadir una o varias etiquetas a todos los contactos de este archivo, por ejemplo «Feria octubre». Es el mismo selector de la Parte 1. Es opcional, pero conviene sugerirlo, porque es la forma de encontrar después a los importados.
- Sin Teléfono emparejado no se puede seguir.

### Paso 3 · Revisar

Wasmish comprueba el archivo entero **sin guardar nada todavía** y enseña qué va a pasar:

| Resultado | Qué significa |
|---|---|
| **Nuevos** | No existían: se crearán. |
| **Se completarán** | Ya existían y el archivo trae algo que les faltaba (un email, la empresa) o etiquetas nuevas. Solo se rellena lo vacío: nunca se cambia lo que ya tienen. |
| **Sin cambios** | Ya existían con todo lo que trae el archivo. |
| **Repetidos en el archivo** | El mismo número aparece dos o más veces: se juntan en un solo contacto. |
| **Con error** | No se importarán. |
| **Con aviso** | Se importan, pero falta algo. |

- **Solo el teléfono impide importar una fila.** Ejemplos de error: «Fila 14: el teléfono tiene 6 dígitos», «Fila 22: sin teléfono», «Fila 31: "099-ABC" no es un número».
- **Lo demás es aviso, no error**: el contacto se importa sin ese dato. Por ejemplo: «Fila 40: "juan@" no es un email válido; se importa sin email».
- **La lista de errores y avisos** lleva el número de fila (el que ve el usuario en su Excel), el valor que había y el motivo. Puede ser larga: tiene que poder recorrerse y filtrarse (errores / avisos).
- **Descargar las filas con error**: un archivo con esas filas y una columna con el motivo, para corregirlas en Excel y volver a importarlas. Hay que transmitir que **repetir la importación es seguro**: no duplica a nadie.
- Una **muestra de cómo quedarán** algunos contactos (el teléfono ya con el formato de Wasmish, el nombre junto al apellido, sus etiquetas), para detectar un emparejamiento equivocado antes de importar.
- **Consentimiento, obligatorio:** una casilla «Estos contactos aceptaron recibir mensajes de mi negocio por WhatsApp». Hay que explicar en una línea por qué importa: escribir a quien no lo pidió trae bloqueos y denuncias que bajan la calidad del número de WhatsApp. Sin marcarla no se puede importar.
- **La acción principal:** «Importar 1 240 contactos» (nuevos + se completarán). Si no hay nada que importar (todo con error o sin cambios), se dice claramente y no se ofrece el botón.

### Importando

- Se guardan en tandas; con miles de filas tarda **unos segundos**. Hace falta un progreso real («800 de 1 240»).
- **Hay que avisar de no cerrar la pestaña.** Si se cierra a mitad, lo ya guardado se queda; volver a importar el mismo archivo completa el resto sin duplicar.
- Si falla una tanda (se cae la conexión), se dice cuántos se guardaron y se ofrece **reintentar** lo que falta.

### Resultado

- Las cifras finales: creados, completados, sin cambios y con error.
- **«Crear campaña con estos»**: lleva al asistente con los importados ya elegidos. Es la razón por la que la gente importa.
- **«Ver en Contactos»**: la lista filtrada por la etiqueta para todos, si se puso.
- Si hubo filas con error, volver a ofrecer descargarlas.

## 5. Comportamientos que el diseño debe respetar

- **Importar nunca cambia la baja de publicidad.** Un contacto que pidió no recibir publicidad sigue así aunque venga en el archivo. Si hay alguno, conviene decirlo en el paso 3 («12 ya existían y pidieron no recibir publicidad: no recibirán campañas de marketing»).
- **Nunca se pisa un dato existente.** Si el contacto se llama «Juan Pérez» en Wasmish y en el archivo «J. Pérez», se queda «Juan Pérez».
- **Las etiquetas solo se añaden**: importar no quita ninguna.
- **Una acción menta por pantalla**: en cada paso, «Siguiente» / «Importar» en el pie fijo, como en el asistente de campañas. Descargar la plantilla no debe competir con ella.
- **Salir a mitad** (antes de importar) no deja nada guardado. No hace falta un borrador: el archivo se vuelve a elegir en segundos.

## 6. Móvil

- **Etiquetar, filtrar y gestionar etiquetas** tienen que funcionar en móvil: es donde se usa a diario.
- **Importar** es sobre todo de escritorio (los archivos están en la computadora), pero no puede romperse en móvil: el selector de archivos del sistema, el emparejamiento de columnas en una sola columna y el resumen legible.
- Los controles necesitan un área de toque de 44 px.

## 7. Textos y tono

- **Español neutro latinoamericano**, de tú y directo.
- **Sin jerga técnica:** nada de «CSV parsing», «mapping», «upsert», «E.164», «tag». Sí se puede decir «Excel» y «CSV»: son los nombres que la gente conoce.
- **Los números de fila** son los del Excel del usuario (la fila 1 es la cabecera), para que pueda encontrarlos.
- Las cifras van en el formato local: «1 240».

## 8. Componentes que ya existen

Reutilízalos antes de inventar otros: tabla de Contactos con selección y barra de selección, buscador, píldoras de estado, avisos (`Callout`), diálogo de confirmar, casilla, desplegable, barra de progreso, cabecera de pasos y pie fijo del asistente de campañas, pantalla vacía (`BlankState`) y aviso global arriba a la derecha (se cierra solo a los 5 s: los errores que hay que leer **no** van solo ahí).

## 9. Fuera de alcance

- Colores por etiqueta, etiquetas automáticas («escribió este mes») y el filtro «tiene todas las etiquetas».
- Importar directo desde Google Contacts u otro CRM.
- Sobrescribir los datos existentes con los del archivo.
- Deshacer una importación.
- Excel antiguo (`.xls`).
