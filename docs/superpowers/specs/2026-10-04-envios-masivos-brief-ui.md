# Brief de diseño — Envíos masivos con plantilla

> Para la IA de diseño. Describe **qué** tiene que poder hacer el usuario y **qué información** ve en cada momento, no cómo se ve. Ya conoces la marca y las pantallas existentes: el diseño nuevo debe sentirse parte de ellas y reutilizar sus componentes.

---

## 1. Contexto del producto

**Wasmish** es un SaaS B2B para gestionar WhatsApp Business:

- **Clientes:** negocios pequeños y medianos de Latinoamérica, sobre todo de Ecuador.
- **Usuario:** el operador del negocio. Alguien que atiende clientes, no un técnico.
- **Lo que ya existe:** bandeja de chats, plantillas sincronizadas desde Meta, API pública, y una página de **Contactos**: una agenda con búsqueda, filtros y una ficha lateral por contacto.

**La funcionalidad nueva:** elegir varios contactos, elegir una plantilla de WhatsApp aprobada y enviársela a todos de una vez, personalizada con los datos de cada contacto («Hola Ana», «Hola Pedro»). Después, seguir el resultado: cuántos se entregaron, cuántos se leyeron y cuántos fallaron, y por qué.

En la interfaz se llama **«Envío masivo»**. La sección que los agrupa se llama **«Envíos»**.

## 2. Reglas de WhatsApp que el diseño tiene que reflejar

1. **Solo plantillas aprobadas por Meta.** Un envío masivo nunca es texto libre.
2. **Las plantillas tienen categoría:**
   - **Marketing** (promociones) y **Utilidad** (avisos, recordatorios) **sí** se pueden usar.
   - **Autenticación** (códigos de verificación) **no**: aparece en el selector deshabilitada, con el motivo.
3. **Las plantillas tienen variables** en el cuerpo. Pueden ser numeradas (`{{1}}`, `{{2}}`) o con nombre (`{{nombre}}`). Algunas tienen botones que también piden un valor (un enlace con una parte variable, un código de cupón).
4. **Meta rechaza una variable vacía.** Si una variable sale de un dato del contacto que puede faltar (la empresa, por ejemplo), hace falta un **valor de reserva**.
5. **Cada mensaje de marketing tiene costo** para el negocio. Antes de enviar hay una confirmación explícita con el número de destinatarios.
6. **Límite diario.** WhatsApp limita a cuántas personas distintas se puede escribir al día (250, 1.000 o más, según la cuenta). Si se conoce y la selección lo supera, se avisa: no es un bloqueo, pero lo que sobre fallará.
7. **Bajas de publicidad.** Algunos contactos pidieron no recibir publicidad («Baja publicidad», ya existe como estado en Contactos). Por defecto **se incluyen** y Meta rechaza el mensaje, lo que deja registro. El asistente ofrece **una casilla para excluirlos** en ese envío concreto.
8. **No es instantáneo.** Se manda a un ritmo controlado: unos cientos de contactos tardan uno o varios minutos. El usuario puede cerrar la pantalla y el envío sigue. Se puede **pausar**, **reanudar** y **cancelar**.

## 3. Flujo completo

```
Contactos ──(selecciona)──► barra de acción «Enviar plantilla (N)»
     │
     ▼
Asistente de envío masivo (3 pasos)
  1. Destinatarios   → resumen, avisos, casilla «Excluir a los dados de baja»
  2. Mensaje         → plantilla + de dónde sale cada variable
  3. Revisar y enviar → vista previa real, nombre del envío, confirmación
     │
     ▼
Detalle del envío (progreso en vivo) ◄── también desde la página «Envíos»
```

## 4. Pantallas

### 4.1 Contactos: seleccionar destinatarios (pantalla existente, se amplía)

Es la pantalla de Contactos que ya conoces (tabla paginada, búsqueda, filtros, ficha lateral al pulsar una fila, tarjetas en móvil).

Lo que se añade:

- **Una casilla por fila** y una en la cabecera para marcar la página.
  - Marcar la casilla **no abre la ficha**; pulsar el resto de la fila sí.
- **Seleccionar todos los que coinciden**, al estilo de Gmail. Al marcar la página entera aparece:
  > «Seleccionaste los 20 de esta página. **Seleccionar los 453 contactos que coinciden con la búsqueda**»

  Después se puede **desmarcar** alguno suelto («453 seleccionados, 2 excluidos»).
- **La selección se mantiene** al cambiar de página.
  - Cambiar la búsqueda o el filtro con «todos los que coinciden» activo hay que resolverlo. Propuesta: avisar y reiniciar la selección.
- **Barra de acción** visible mientras haya selección: «**N seleccionados**», **«Enviar plantilla»** y **«Quitar selección»**.
- **Móvil:** la casilla también tiene que poder usarse en las tarjetas.

### 4.2 Asistente — Paso 1: Destinatarios

**Formato:** modal grande o panel; lo decides tú. Muestra un indicador de pasos (1 · 2 · 3) y se puede volver atrás sin perder lo elegido.

**Muestra:**
- **Total de destinatarios** (dato principal).
- **Desglose**, solo con lo que aplique:
  - «12 dados de baja de publicidad. Si la plantilla es de marketing, WhatsApp los rechazará», con la **casilla «Excluirlos de este envío»**.
  - «3 no tienen teléfono (escribieron con su nombre de usuario)». Solo importa en algunos casos, como información.
  - «2 contactos repetidos se enviarán una sola vez».
- **El límite diario**, si se conoce y se supera: «Tu número puede escribir a 1.000 personas por día. Este envío tiene 1.450: unos 450 podrían fallar».
- **Una lista compacta** de los destinatarios: los primeros y «ver todos». Sirve para confirmar que es la gente correcta.

**Botón:** «Siguiente».

### 4.3 Asistente — Paso 2: Mensaje

**Selector de plantilla.**
- Cada plantilla muestra su nombre, idioma, categoría como píldora (Marketing / Utilidad / Autenticación) y el comienzo del texto.
- Las de autenticación aparecen deshabilitadas: «Las plantillas de autenticación no se pueden enviar de forma masiva».
- Si la lista está vacía o desactualizada: botón «Sincronizar plantillas».

**Variables.** Para cada variable de la plantilla, una fila:
- **Etiqueta:** `{{1}}` o `{{nombre}}`, y si se puede, un trozo del texto donde aparece («Hola **{{1}}**, tu pedido…»).
- **Origen**, un selector con:
  - **Texto fijo:** el mismo para todos. Campo de texto.
  - **Nombre del contacto:** el nombre que ve el operador. Si no hay, el de su perfil de WhatsApp.
  - **Primer nombre:** solo la primera palabra del nombre («Hola Ana» en vez de «Hola Ana Pérez»).
  - **Empresa**, **Teléfono**, **Correo**.
- **Valor de reserva:** obligatorio si el campo puede faltar. Ejemplo: Empresa vacía → «su empresa». Al lado, cuántos lo usarán: «31 contactos no tienen empresa: verán "su empresa"».

**Botones con valor** (enlace variable, cupón): igual que las variables (texto fijo o campo del contacto). En la práctica casi siempre será texto fijo.

**Vista previa en vivo** a la derecha o debajo:
- Una burbuja de WhatsApp con el mensaje ya relleno para **un contacto real** de la selección.
- Un selector para ver el resultado con otro contacto («Ver como: Ana Pérez ▾»).
- Los valores sustituidos resaltados, y los que salen del valor de reserva marcados de otra forma.
- Puede reutilizar la burbuja propia del chat de Wasmish.

**Botón:** «Siguiente». Deshabilitado mientras falte algo: plantilla, variables sin origen o sin reserva.

### 4.4 Asistente — Paso 3: Revisar y enviar

- **Nombre del envío**, editable, con una sugerencia: «Promo octubre · 4 oct».
- **Resumen:**
  - la plantilla y su categoría;
  - el número final de destinatarios, ya descontados los excluidos;
  - la vista previa final.
- **Aviso de costo** si la plantilla es de marketing: «WhatsApp cobra cada mensaje de marketing entregado».
- **Botón principal:** «**Enviar a 441 contactos**», siempre con el número.
- **Tras enviar:** se cierra el asistente, se limpia la selección y se va al **detalle del envío** (4.6) o aparece un aviso con «Ver progreso».

### 4.5 Página «Envíos» (nueva, en el menú lateral)

Entrada nueva en el menú lateral, junto a Contactos y Plantillas.

**Lista de envíos**, del más reciente al más antiguo. Cada fila muestra:
- el nombre;
- la plantilla;
- la fecha;
- el **estado** como píldora: En cola / Enviando / Pausado / Completado / Cancelado;
- una **barra de progreso** mientras se envía («230 de 441»);
- los **resultados**: entregados, leídos y fallidos.

**Sin envíos todavía:** un estado vacío que explique que se hacen desde Contactos, con un botón «Ir a Contactos».

**Móvil:** cada envío es una tarjeta.

### 4.6 Detalle de un envío

**Cabecera:** nombre, plantilla, quién y cuándo lo lanzó, estado y las acciones según el estado:

| Estado | Acciones |
|---|---|
| Enviando | Pausar · Cancelar |
| Pausado | Reanudar · Cancelar |
| Completado / Cancelado | ninguna |

Cancelar pide confirmación: «Los 211 que faltan no se enviarán. Los ya enviados no se pueden deshacer».

**Métricas**, que se actualizan solas mientras el envío avanza y también después, porque las entregas y las lecturas llegan durante horas:

| Métrica | Significado |
|---|---|
| Destinatarios | Total |
| Enviados | Meta los aceptó |
| Entregados | Llegaron al teléfono |
| Leídos | Doble check azul |
| Fallidos | Rechazados, con el motivo |
| Omitidos | No se intentaron: excluidos o repetidos |
| Pendientes | Todavía en cola (solo mientras se envía) |

La relación entre ellos merece una visualización: un embudo o barras de enviados → entregados → leídos.

**Tabla de destinatarios:**
- Columnas: contacto, estado del mensaje y hora.
- Filtros por estado (Todos / Fallidos / Leídos…).
- Los fallidos muestran el **motivo en lenguaje claro**, no el código. El código queda en pequeño o en un tooltip.
- Pulsar un destinatario lleva a su conversación en Chats.

**Motivos de fallo frecuentes:**

| Código | Texto para el usuario |
|---|---|
| 131050 | Pidió no recibir publicidad |
| 131049 | WhatsApp no lo entregó para no saturar al usuario con publicidad |
| 131026 | No se pudo entregar (número sin WhatsApp o app desactualizada) |
| 131048 | Envío frenado por WhatsApp: demasiados reportes de spam |
| 130429 | Demasiados envíos seguidos; se reintentará |
| — | Interrumpido: no se sabe si llegó y no se reintenta para no duplicar |

**«Interrumpido»** pasa si el servidor se reinicia a mitad de un envío. Es raro, pero tiene que tener su sitio.

## 5. Efectos en otras pantallas

- **Chats:** cada destinatario recibe el mensaje en **su conversación**. Los que no tenían, la estrenan, y la bandeja se llena de chats nuevos tras un envío grande. Es lo esperado; no hay que diseñar nada aquí, pero conviene saberlo.
- **Ficha del contacto:** opcionalmente, «Envíos recibidos» en su actividad. No es prioritario.

## 6. Fuera de alcance (no diseñar todavía)

- Programar el envío para una fecha u hora.
- Listas o etiquetas guardadas («Clientes VIP»). Ahora se eligen en el momento.
- Importar contactos desde CSV.
- «Reintentar fallidos».
- Plantillas con imagen o vídeo en la cabecera.

## 7. Textos y tono

- **Español neutro latinoamericano**, de tú y directo. Las mismas palabras que el resto de la app: «contacto», «plantilla», «conversación», «envío».
- **Sin jerga técnica:** nada de «BSUID», «webhook», «API» ni códigos sueltos.
- **Números siempre a la vista** en las acciones con consecuencias («Enviar a 441 contactos», «Cancelar los 211 restantes»).

## 8. Identidad visual

Sigue la marca y los componentes que ya tienes. Solo dos puntos específicos de esta funcionalidad:

- **Un solo acento menta por pantalla.** En el asistente y en el detalle lo natural es el botón principal («Enviar a N contactos») o la barra de progreso, no los dos.
- **Cifras, horas, teléfonos y códigos de error en la tipografía mono**, como el resto de datos de la app.

## 9. Lo que se espera del diseño

1. **Contactos** con la selección: casillas, aviso de «seleccionar todos los que coinciden» y barra de acción, en escritorio y en móvil.
2. **Los 3 pasos del asistente**, incluido el paso 2 con varias variables, alguna con valor de reserva, y la vista previa.
3. **Página «Envíos»**: con envíos (uno enviando, uno completado, uno pausado) y vacía.
4. **Detalle de un envío**: enviando, completado con fallos, y la tabla filtrada por fallidos.
5. **Estados límite:**
   - selección que supera el límite diario;
   - todos los seleccionados dados de baja y excluidos (0 destinatarios: no se puede enviar);
   - plantilla sin variables (el paso 2 solo pide elegir la plantilla);
   - cancelar con confirmación.

**Datos de ejemplo verosímiles:**
- Negocio: una tienda de Quito.
- Plantilla de marketing «promo_octubre»: «Hola {{1}}, este mes tienes 20% de descuento en {{2}}. Te esperamos.»
- 441 destinatarios: 12 de baja, 3 sin teléfono, 31 sin empresa.
