# Brief de diseño — Archivo de la cabecera en «Nueva campaña»

> Para la IA de diseño. Describe **qué** tiene que poder hacer el usuario y **qué información** ve en cada momento, no cómo se ve. Ya conoces la marca y el asistente de campañas: el diseño debe sentirse parte de él y reutilizar sus componentes. Ya existe una versión funcionando; puedes rehacerla por completo.

---

## 1. Contexto

Una **campaña** manda una plantilla aprobada de WhatsApp a muchos contactos a la vez. Se crea en un asistente de 3 pasos: *Destinatarios → Mensaje → Revisar y enviar*. Esta pieza vive en el **paso 2, «Mensaje»**.

Algunas plantillas llevan arriba del texto una **cabecera con un archivo**: una imagen, un vídeo o un documento PDF.

Lo que el diseño tiene que transmitir, porque es lo que confunde a la gente:

- **Meta aprueba el tipo de cabecera, no el archivo.** La plantilla dice «lleva una imagen», pero no cuál.
- **El archivo se manda en cada envío.** Si no hay ninguno, WhatsApp rechaza el mensaje.
- **Cada plantilla puede tener un archivo guardado por defecto.** Se sube en la página Plantillas y es el que usa cualquier envío si nadie elige otro.
- **En una campaña se puede usar otro archivo solo para esa campaña**: la promo de octubre con su imagen, sin cambiar la de la plantilla.

## 2. Dónde aparece

- **Paso 2**, justo debajo del selector de plantilla y antes de las variables.
- **Solo si la plantilla elegida tiene cabecera con archivo.** Si no tiene cabecera, o es de texto, la pieza no existe.
- A la derecha está la **vista previa** del mensaje (la burbuja de WhatsApp). Muestra el archivo elegido en la cabecera.
- Más adelante se reutilizará en el **diálogo de enviar plantilla desde el chat** (unos 460 px de ancho) y en el **panel de conversación nueva**. Tiene que funcionar también en un contenedor estrecho.

## 3. Qué admite cada tipo

| Tipo | Archivos | Máximo |
|---|---|---|
| Imagen | JPG o PNG | 5 MB |
| Vídeo | MP4 o 3GP | 16 MB |
| Documento | PDF | 16 MB |

- La **imagen** se puede mostrar en miniatura.
- El **vídeo** y el **documento** no tienen miniatura: se identifican por un icono y el nombre del archivo.
- En el documento, **el contacto ve el nombre del archivo** al abrirlo, así que conviene mostrarlo bien.

## 4. Estados

### A. La plantilla tiene un archivo guardado (el caso más común)

- **Se ve:** el archivo (miniatura o icono), el nombre, el peso y que es **«el de la plantilla»**.
- **Se puede:** subir otro solo para esta campaña.
- No hay que hacer nada para avanzar: ya está completo.

### B. La plantilla no tiene archivo guardado

- **Es obligatorio subir uno para poder continuar.** Tiene que verse claramente como algo que falta, no como opcional.
- **Conviene explicar en una línea por qué:** sin archivo, WhatsApp no envía la plantilla.
- **Se indican el tipo y el máximo admitidos** (tabla de arriba).

### C. Se subió un archivo solo para esta campaña

- **Se ve:** el archivo nuevo, el nombre, el peso y que es **«solo para esta campaña»**.
- **Se puede:**
  - **cambiarlo por otro**;
  - **volver al de la plantilla**, solo si la plantilla tiene uno (estado A);
  - **marcar «Usar también como imagen de la plantilla»**: el texto dice imagen, vídeo o documento según el tipo.
- **La casilla empieza desmarcada.** Se aplica **al enviar la campaña**, no al subir el archivo: si el usuario descarta el borrador, la plantilla no cambia. Conviene que se entienda que marcarla cambia el archivo por defecto para los envíos siguientes.

### D. Subiendo

- Puede tardar unos segundos: un vídeo pesa hasta 16 MB.
- Hace falta indicar que está en curso y evitar que se suba otro a la vez.

### E. Errores

- **Archivo de otro tipo o demasiado pesado:** se avisa antes de subir, con el motivo («La cabecera pide una imagen: elige un archivo JPG o PNG», «El archivo pesa 7,2 MB: el máximo es 5 MB»).
- **El servidor lo rechaza** (por ejemplo, un archivo que dice ser PNG pero no lo es): se muestra su mensaje.
- **Falta el archivo y se pulsa «Siguiente»:** la pieza queda marcada en rojo con un mensaje corto, y la página baja hasta ella.
- El resto del asistente ya funciona así: borde rojo y un texto corto debajo del campo. Los errores **no** van solo en la notificación de arriba a la derecha, que se cierra sola.

## 5. Comportamientos que el diseño debe respetar

- **Cambiar de plantilla descarta el archivo subido**: era para la cabecera de la otra.
- **Subir no manda nada a WhatsApp.** El archivo se guarda en Wasmish y se envía con la campaña.
- **El archivo subido se guarda en el borrador.** Si el usuario sale y vuelve, sigue elegido.
- **En el paso 3, «Revisar y enviar»,** la vista previa muestra el archivo elegido. No hace falta otro control ahí, aunque se puede mostrar de cuál se trata (el de la plantilla o uno solo para esta campaña).
- **Una acción menta por pantalla:** en este paso la acción principal es «Siguiente», en el pie fijo. Esta pieza no debe competir con ella.

## 6. Móvil

El asistente funciona en móvil. Subir un archivo abre el selector del sistema (galería o archivos). Los controles necesitan un área de toque de 44 px.

## 7. Textos y tono

- **Español neutro latinoamericano**, de tú y directo.
- **Sin jerga técnica:** nada de «media», «header», «upload» ni códigos de Meta.
- **Las palabras concuerdan con el tipo de archivo:** «la imagen / el vídeo / el documento», «otra / otro», «ninguna / ninguno».
- La sección se puede llamar «Cabecera» o como lo entienda mejor un operador de negocio («Imagen del mensaje», por ejemplo). Propón lo que creas mejor.

## 8. Fuera de alcance

- Recortar, editar o comprimir la imagen.
- Elegir entre archivos subidos antes (una galería).
- Cabeceras de texto con variable, y plantillas de carrusel.
