# Brief de diseño: página web de Wasmish (v2 + dirección visual)

> Copia del brief de la carpeta comercial privada de Jonathan, del 2026-10-17, sin los enlaces a esa carpeta. Lo usa el [diseño técnico de la página](2026-10-17-pagina-publica-design.md). Si cambia el contenido de la página, se cambia aquí.

## Cómo usar este brief

Este brief une el contenido de la versión 2 (2026-10-15) con la dirección visual de la página. Las secciones 1 a 3 y 5 a 7 dicen **qué** tiene que entender y hacer quien visita la página; la sección 4 dice **cómo se ve**. Ya conoces la marca de Wasmish (manual v1.0, dirección «Barra oscura») y las pantallas de la app: la página tiene que sentirse parte de la misma marca y **mostrar la app tal como es hoy**.

**Cambios de la versión 2:** entran las **respuestas automáticas** (§ 3.3, como segundo beneficio) y **Wasmish en el celular con avisos**, que ya existe (§ 3.3 y § 3.7). La lista de lo prohibido (§ 5) cambia con ellas.

**Primera entrega:** diseña **solo la página de inicio**, en celular primero (390 px) y luego computadora, con **3 direcciones visuales realmente distintas** (no la misma página con otra fuente). Los nichos se hacen después, sobre la dirección elegida.

**Actualización 2026-10-17 (para quien implemente):** el diseño del inicio es la **v3, «Calma con vida»**: una ronda corta de Claude Design sobre la 2a, más dinámica. Las páginas por nicho siguen la 3a y la 3b, ajustadas a la v3. **Si un texto del diseño no coincide con el de este brief, manda el brief.** Lo que cambió en los textos el 2026-10-17:
- **La coexistencia ya existe** (1.0.25, probada con Meta de verdad el 2026-10-17): el negocio **sigue usando su app de WhatsApp Business** con el mismo número. Cambian el § 3.4, punto 1 (en el diseño, la sección «01 Su número»), su pregunta frecuente (§ 3.7) y una línea del precio (§ 3.6).
- **«Si no entiende»:** las respuestas automáticas son de cuatro formas, no tres (§ 3.3 y § 4.4).
- **«¿Qué necesito para empezar?»** ya tiene respuesta (§ 3.7), porque la prueba de alta de un negocio nuevo terminó.
- Los borradores de «¿Qué pasa si cancelo?», «¿De quién son mis datos?», Privacidad y Términos están en la carpeta comercial privada de Jonathan (`2026-10-17-borradores-faq-y-legales.md`), **pendientes de Jonathan y del contador**.

---

## 1. Contexto

Hoy Wasmish no tiene página pública: quien entra a la dirección de la app llega directo al inicio de sesión. Wasmish empieza a venderse **en frío** a pequeños negocios de **Quito y Guayaquil**. Cuando alguien recibe un mensaje o una llamada de Jonathan, lo primero que hace es buscar Wasmish.

**Quién la visita:** el dueño o la persona que atiende en el negocio, casi siempre **desde el celular**, porque abre el enlace que le llegó por WhatsApp. Desconfía con razón, porque le escribió un desconocido, y no es técnico: no sabe qué es una «API». **El diseño parte del celular**, y la computadora va después.

**Por qué cambiaría:** la app de WhatsApp Business ya le permite atender desde varios dispositivos. «Varios atienden el mismo WhatsApp» no lo convence. Lo que sí lo convence es una situación que ya vivió: **otra persona retoma la conversación con un cliente y no sabe qué se habló**. La página tiene que venderle eso: que su equipo sepa qué se habló con cada cliente, qué notas hay y quién respondió.

**El segundo motivo:** las mismas preguntas llegan una y otra vez («¿cuánto cuesta?», «¿dónde están?», «¿qué horario tienen?»), alguien las contesta copiando y pegando, y de noche o el fin de semana nadie responde. Sobre todo si el negocio pone anuncios que llevan a WhatsApp. Además, «¿tiene respuestas automáticas?» es de lo primero que pregunta quien compara proveedores.

**Lo que tiene que entender**, en este orden de importancia:
1. Qué es Wasmish y qué problema suyo resuelve: el equipo sabe qué se habló con cada cliente y, además, lo repetido se responde solo.
2. Qué cambia en su WhatsApp si lo usa: que **sigue con su app y su número**, lo poco que se apaga en la app, y las plantillas (§ 3.4). **Esto tiene que verse antes de pedir la demostración**, no solo en las preguntas frecuentes.
3. Cuánto paga en total: Wasmish más lo que cobra Meta.
4. Que detrás hay una persona real que lo ayuda.

**La acción principal: «Pedir una demostración».** Junto al botón: «Coordine por WhatsApp una demostración de 15 minutos con Jonathan». El botón abre un chat de WhatsApp con un texto ya escrito: «Hola, quiero ver una demostración de Wasmish». **No reserva una cita**: abre el chat. Debajo del botón, una línea que quita miedos (2026-10-17): «Demostración de 15 minutos · Sin compromiso · Le atiende Jonathan». La acción secundaria es «Iniciar sesión», para quienes ya son clientes.

**Tono:** se trata al visitante de **usted**, en toda la página. Claro, cercano y sin jerga técnica.

---

## 2. Las páginas

1. **Inicio (`/`)**: para cualquier negocio que atiende por WhatsApp entre varias personas. **Es la primera entrega.**
2. **Una página por nicho, `/capacitacion` e `/imprentas`**: el mismo molde, pero el mensaje principal, el problema, los ejemplos y las imágenes hablan de su caso. Son las que Jonathan manda en sus mensajes. Tiene que ser fácil agregar otro nicho más adelante, cambiando solo los textos y las imágenes.
3. **Privacidad (`/privacidad`) y Términos (`/terminos`)**: páginas de texto, propias de wasmish.com. El contenido lo pone Jonathan después; solo hace falta su forma.

---

## 3. La información

### 3.1 El mensaje principal

- **Inicio:** «**Que su equipo sepa qué se habló con cada cliente.**» Y debajo: «Atiendan el WhatsApp del negocio desde Wasmish, con usuarios individuales, notas compartidas y el nombre de quien respondió.»
- **Capacitación:** «**Retome las consultas cuando abra un nuevo curso.**»
- **Imprentas:** «**Retome cada cotización con la conversación y el PDF a mano.**»

Estos textos son la idea. Puedes ajustar las palabras, pero no el sentido.

### 3.2 El problema, como lo vive el negocio

- **Capacitación:** consultas que no terminan en matrícula; cuando se abre otro grupo, nadie vuelve a escribirles a los interesados; quien retoma una conversación no sabe qué le dijeron antes; y las consultas que llegan de noche, preguntando el precio o la fecha de inicio, esperan hasta el día siguiente.
- **Imprentas:** el cliente vuelve por una cotización, lo atiende otra persona, y hay que preguntar qué se le ofreció y buscar el PDF. Y quien escribe fuera de horario no sabe si alguien lo leyó.
- **Inicio:** las situaciones en general.

### 3.3 Cómo lo resuelve Wasmish

**El beneficio principal, demostrado con la app real:** cualquiera del equipo abre la conversación de un cliente y ve qué se habló, las notas del contacto y quién respondió. En cada nicho, el ejemplo es el suyo: la ficha de un interesado con la etiqueta de su curso, o una conversación con la cotización en PDF.

**El segundo beneficio: respuestas automáticas.** Con menos protagonismo que el principal, pero con su propio espacio. El negocio escribe sus respuestas una vez y Wasmish las envía solo, de cuatro formas:
1. **Bienvenida:** a quien escribe por primera vez, o vuelve después de un tiempo.
2. **Fuera de horario:** si escriben con el negocio cerrado, un aviso con el horario. Una sola vez, no a cada mensaje.
3. **Palabras clave:** si el mensaje dice, por ejemplo, «precio» o «ubicación», responde el texto que el negocio preparó para eso.
4. **Si no entiende:** si el mensaje no coincide con nada, una respuesta que el negocio prepara (por ejemplo, «En un momento le atiende una persona»). Una sola vez por conversación.

Y lo que le da confianza al dueño:
- **Cuando alguien del equipo responde a mano, el bot se calla** en esa conversación durante unas horas (lo elige el negocio). No se pisan. **También si responde desde la app de WhatsApp Business** del celular.
- En el chat se ve **qué mensajes envió el bot**.
- **Se prueba antes de encenderlo:** se escribe una conversación de ejemplo y se ve qué respondería a cada mensaje.
- **Viene apagado.** No responde nada hasta que el negocio lo enciende.

Ejemplos por nicho:
- **Capacitación:** alguien pregunta a las 22:00 «¿cuánto cuesta el curso de contabilidad?» y recibe al momento el precio y la fecha de inicio. Al día siguiente, la asesora retoma la conversación y ve qué se le respondió.
- **Imprentas:** «¿hacen tarjetas de presentación?» recibe la lista de productos y qué datos enviar para cotizar. **La cotización la hace una persona**: el bot no cotiza.

**Lo que acompaña**, con menos protagonismo:
- **Wasmish en el celular, con avisos.** Se instala desde el navegador del celular, sin pasar por la tienda de aplicaciones, y avisa cuando llega un mensaje. Funciona en Android y en iPhone (en iPhone, agregándolo a la pantalla de inicio desde Safari).
- **Sigue con su app de WhatsApp Business**, con el mismo número (§ 3.4).
- **Cada persona con su propio usuario.** Se ve quién respondió desde Wasmish, y el historial se queda en el negocio aunque alguien se vaya. Lo que se responde desde la app del celular también se ve en Wasmish, marcado «Desde la app de WhatsApp», pero **sin el nombre de quién lo envió** (la app no lo dice).
- **Notas y etiquetas en cada contacto** que ve todo el equipo («interesado en el curso de contabilidad», «cotizó 1.000 volantes»).
- **Avisos a un grupo de contactos** (por ejemplo, «abrimos un grupo nuevo»), con cuántos llegaron y cuántos se leyeron. Solo a contactos que aceptaron recibirlos: **eso lo garantiza el negocio, no Wasmish**.
- **Importar los contactos** desde Excel.
- **Enviar documentos e imágenes.** En la página de imprentas, aclarar que cada archivo puede pesar **hasta 16 MB** y que **no se envían archivos editables como AI o PSD** (sí PDF e imágenes).
- **Conexión mediante la plataforma oficial de WhatsApp Business.**

**Lo que no se dice ni se insinúa:** que Wasmish reparte las conversaciones entre el equipo o avisa de lo que quedó pendiente. Hoy los no leídos son de todo el equipo y no se pueden asignar conversaciones a una persona. Tampoco que avisa quién abrió o está viendo una conversación: eso no existe.

**Sobre las respuestas automáticas, tampoco:** que entienden lo que escribe el cliente o usan inteligencia artificial (responden a palabras exactas que el negocio elige), que «atienden solas», «venden solas» o reemplazan al equipo, que mandan menús con botones, o que envían fotos o archivos (por ahora, solo texto). Y nunca la palabra «inteligente».

### 3.4 Lo que cambia en su WhatsApp (visible antes de pedir la demostración)

Tres cosas, explicadas en pocas palabras, sin asustar ni esconderlas:
1. **Su número y su app:** **sigue usando la app de WhatsApp Business en el celular**, con el mismo número, y además atiende desde Wasmish. Lo que llega se ve en los dos lados, y lo que se responde desde la app también aparece en Wasmish. Lo que hay que saber, sin esconderlo:
   - En la app se apagan las **listas de difusión** (las de antes quedan de solo lectura; en Wasmish se reemplazan con avisos a un grupo, § 3.3), los mensajes temporales, «ver una vez» y la ubicación en tiempo real.
   - **WhatsApp para Windows** deja de servir para ese número: se usa WhatsApp Web o Wasmish en la computadora.
   - Hay que **abrir la app en el celular de vez en cuando** (Meta desconecta si pasan unas dos semanas sin abrirla).
   - **Las conversaciones anteriores se quedan en la app**: Wasmish muestra lo que llega desde que se conecta.
   - Si prefiere no tocar su app, también puede usar **un número nuevo** solo para Wasmish.

   Fuente: la documentación de Meta sobre la coexistencia y la prueba real del 2026-10-16 y 17.
2. **Las 24 horas:** puede responderle a un cliente libremente durante las 24 horas siguientes a su último mensaje. Pasado ese tiempo, para escribirle hay que usar una **plantilla**, que es un mensaje aprobado por WhatsApp para iniciar o retomar una conversación. Y siempre a contactos que aceptaron recibir mensajes.
3. **Lo que cobra Meta:** va aparte (§ 3.6).

### 3.5 «Le ayudo a dejarlo funcionando»

La implementación está incluida y tiene un **alcance claro**:
1. Una reunión de 15 minutos para entender cómo atiende hoy.
2. Jonathan conecta el número con WhatsApp, junto al cliente.
3. Prepara **2 plantillas**, hace **1 importación** de contactos y da **1 capacitación** al equipo.
4. Todo eso en **hasta 2 horas** de trabajo. Lo que vaya más allá, como integraciones, se cotiza antes de hacerlo.

Después, soporte por WhatsApp.

**Cómo se presenta (2026-10-17):** 4 pasos numerados y grandes, que se entiendan de un vistazo: «Conversamos 15 minutos» → «Conectamos su número juntos, sin dejar su app» → «Preparo sus plantillas e importo sus contactos» → «Su equipo ya responde». El tope de 2 horas va en una línea debajo.

### 3.6 Precio

Presentarlo así:

> **USD 20 al mes durante los primeros 12 meses. Desde el mes 13, USD 30 al mes.**
> Oferta para los primeros 10 clientes. Pago mensual.
> Incluye 1 número de WhatsApp, 3 usuarios (contando al dueño) y la implementación inicial (§ 3.5). Usuario adicional: USD 5 al mes.
> Los cargos de Meta se pagan aparte.

Sin contador de cupos ni urgencias.

**Lo que cobra Meta**, explicado claro: Meta, la empresa dueña de WhatsApp, cobra **por cada mensaje entregado**, según el tipo de mensaje y el país de quien lo recibe, y se lo cobra **directamente a la tarjeta del negocio**. Wasmish no gana nada con eso.
- Hace falta **un ejemplo del total de un mes**. Por ejemplo: «un aviso de promoción entregado a 500 contactos cuesta unos USD 37 de Meta; ese mes pagaría USD 20 de Wasmish más USD 37 de Meta». Esconderlo es peor que explicarlo.
- **Las respuestas automáticas también son mensajes**, y Meta cobra las respuestas igual que las de una persona (según varias fuentes, desde octubre de 2026, con unos 1.000 mensajes gratis al mes por número). Por eso Wasmish junta en un solo mensaje todo lo que corresponde responder. Decirlo en una línea, sin alarmar. **Esta línea va en la sección de precio; no la omitas.**
- **Lo que se responde desde la app de WhatsApp Business sigue siendo gratis**; Meta cobra lo que se envía desde Wasmish (lo dice la documentación de Meta sobre la coexistencia). Una línea.
- Cuando se cuenta lo de los anuncios, se habla de **las conversaciones que empiezan desde un anuncio que abre WhatsApp**, que pueden tener un período sin costo de Meta. El anuncio se paga aparte.
- **Las cifras de Meta están pendientes de confirmar** con la información oficial. Deja el espacio, y que se puedan cambiar fácilmente.

### 3.7 Preguntas frecuentes

- **¿Tengo que dejar la app de WhatsApp Business?** No: sigue con su app y su número, y atiende además desde Wasmish. Lo que se apaga en la app y que las conversaciones anteriores se quedan en ella: § 3.4, punto 1.
- **¿Puedo escribirle a un cliente cuando quiera?** La regla de las 24 horas y qué es una plantilla (§ 3.4, punto 2).
- **¿Cuánto me cobra Meta?** Remite al precio (§ 3.6).
- **¿Qué pasa si cancelo?** Cuándo termina el cobro, qué pasa con el acceso, y que el número sigue siendo del negocio. **Borrador** en 2026-10-17-borradores-faq-y-legales.md, por confirmar. No prometer que se pueden exportar las conversaciones: la app no tiene cómo.
- **¿De quién son mis datos?** Del negocio. **Borrador** en el mismo archivo, por confirmar junto con la política de privacidad.
- **¿Me pueden bloquear el número?** Wasmish usa la plataforma oficial, pero hay que seguir las reglas de WhatsApp, por ejemplo no escribirle a quien no lo pidió. **No prometer** que nunca habrá bloqueos.
- **¿Qué necesito para empezar?** La lista está en el borrador (sale de la prueba de alta del 2026-10-14 al 17): su número, una cuenta de Facebook, una tarjeta en Meta para las plantillas y, si usa la app, el celular a mano para escanear un código.
- **¿Se puede usar desde el celular?** Sí: se instala desde el navegador y avisa cuando llega un mensaje (§ 3.3). No está en la tienda de aplicaciones. En iPhone hace falta agregarlo a la pantalla de inicio.
- **¿Responde solo?** Lo que el negocio deja preparado: bienvenida, fuera de horario, palabras clave y «si no entiende» (§ 3.3). Cuando alguien del equipo responde, el bot se calla en esa conversación.

### 3.8 Quién está detrás

**Jonathan Gualli**, desarrollador de Wasmish, en Ecuador. Atiende y da soporte él mismo, por WhatsApp y en español. **Sin foto**: Jonathan no quiere poner su cara. Su nombre tiene que ser coherente con el contacto, el pie de página y los documentos legales.

### 3.9 Pie de página

- WhatsApp de contacto y correo.
- Privacidad y Términos.
- **Quién factura:** Jonathan Gualli, con su RUC. Pendiente de que lo confirme el contador; deja el espacio para el nombre y el RUC.
- Una línea que aclare que WhatsApp es una marca de Meta y que Wasmish es independiente de Meta.
- «Iniciar sesión».

---

## 4. Dirección visual

La página tiene que verse como **una startup seria y cercana, no como una plantilla**: titulares grandes con carácter, mucho aire y **la app real como protagonista, animada**.

### 4.1 Marca

Usa el manual v1.0, dirección «Barra oscura», sin inventar colores. Sus principios mandan sobre cualquier referencia:
- **El verde es estructura:** el verde profundo `#0B3B2E` va en barras y bloques estructurales (encabezado, franjas, pie, tarjetas puntuales), nunca como fondo de toda la página. El contenido vive sobre blanco `#FFFFFF` y gris frío `#F4F6F8`.
- **Frío, nunca crema:** grises con azul. Cero amarillos, cero beige.
- **La menta se gana:** `#6FE3AE` solo en la acción principal («Pedir una demostración»), con texto `#06251C` encima. **Un solo elemento menta por vista** de la página. Dentro de una pantalla de la app que se muestre (una captura o un mockup), la menta aparece donde la usa la app (el contador de no leídos, el elemento activo): eso no cuenta.
- **Tipografía:** Inter para todo (titulares en 800, minúsculas en el wordmark, tracking cerrado); JetBrains Mono solo para datos: teléfonos, horas, códigos.
- **Prohibido:** el verde de WhatsApp (`#25D366`), degradados verde-azul o verde-lima.

Con una marca tan definida, las 3 direcciones se distinguen por la composición, la escala de los titulares, el ritmo de las secciones y el movimiento, no por los colores.

### 4.2 Referencias

Tomar la sensación, no copiar estructura ni textos:
- **granola.ai:** la calma, el aire y el tono humano. Es la base del tono. **No sus colores**: sus tonos cálidos y crema chocan con el manual.
- **jeton.com:** titulares grandes con carácter, color con confianza, animaciones que aparecen al hacer scroll.
- **antigravity.google:** solo la sensación de profundidad y los detalles sutiles en movimiento. No su fondo oscuro: choca con el manual.
- **lusion.co:** solo como inspiración de microinteracciones fluidas.

### 4.3 Elemento protagonista: el traspaso entre personas

En el hero, **una conversación de la app animada paso a paso**. Que se entienda sin leer el texto, y que muestre **solo lo que la app hace hoy**:
1. Un cliente pregunta por un producto. **Ana** responde con el precio y le envía el catálogo en PDF. Sus mensajes llevan su nombre.
2. Ana deja una **nota** en el contacto («quiere 3 unidades, volver a escribirle el lunes»).
3. Días después el cliente vuelve a escribir. **Luis**, que no lo atendió la primera vez, abre la conversación y ve lo que se habló, el PDF y la nota de Ana. Sin ningún aviso de «Luis abrió la conversación»: la app no lo tiene.
4. Luis responde sabiendo todo. Cada mensaje del negocio muestra quién lo envió.

Debajo, una línea corta del tipo: «Luis no atendió la primera vez. Igual supo qué se le ofreció.»

El caso del inicio es general a propósito. En las páginas de nicho, la misma animación usa su caso: un interesado en un curso, o la cotización de 1.000 volantes.

### 4.4 Segundo momento: respuestas automáticas

Su propia sección, con menos protagonismo que el hero. Otra conversación animada:
1. Un cliente escribe de noche «¿cuánto cuesta?».
2. Llega al momento la respuesta preparada por el negocio. En la app, un mensaje del bot se distingue por la marca **«Bot»** junto a la hora, como hoy «Campaña» y «API».
3. A la mañana siguiente, alguien del equipo responde a mano y su nombre aparece en el mensaje. **En el chat no aparece ningún aviso de pausa** (la app no lo tiene): lo explica una línea de texto junto a la animación, del tipo «Cuando alguien del equipo responde, el bot se calla en esa conversación».

Junto a ella, las cuatro formas (bienvenida, fuera de horario, palabras clave y «si no entiende»), y que viene apagado y se prueba antes de encenderlo. Si se muestra la pantalla de configuración, que sea como la de la app.

### 4.5 Otras secciones

- **Antes y después** con los dos dolores: otra persona retoma el chat y pregunta «¿qué le ofrecimos?», y las mismas preguntas copiadas y pegadas todo el día, o sin respuesta de noche. Luego, con Wasmish.
- **Wasmish en el celular:** puede aparecer como apoyo (por ejemplo, un aviso de mensaje nuevo en la pantalla del celular), sin botones de tiendas y sin barras de estado falsas.
- **«Lo que cambia en su WhatsApp» y precio:** deben verse tan cuidadas como el hero, no como texto legal. El total del mes (Wasmish + Meta) se muestra como una suma visual.
- **Jonathan sin foto:** una tarjeta con sus iniciales y sus datos, coherente con el pie de página.

### 4.6 Ritmo y técnica

- Alterna secciones de mucho aire con secciones densas.
- La página se abre desde WhatsApp con datos móviles: **nada de 3D, WebGL, video de fondo ni librerías pesadas**. Todo el movimiento con CSS y JavaScript liviano, respetando `prefers-reduced-motion`. Debe cargar rápido en un celular de gama media.

### 4.7 Evita

- Hero centrado genérico (titular, subtítulo y botón, y nada más).
- Tarjetas de 3 columnas con íconos de stock; fotos de stock.
- Degradados morado-azul típicos de IA.
- Parecerse a la página de algún proveedor de WhatsApp para empresas.
- Cualquier estética de inteligencia artificial para el bot (destellos, robots, cerebros, «magia»): el bot es una herramienta simple que responde lo que el negocio preparó.

---

## 5. Lo que la página no debe tener

- **Testimonios, logos de clientes o cifras de clientes.** Todavía no hay, y no se inventan.
- **Botones de Google Play o App Store**: la app del celular se instala desde el navegador, no desde una tienda.
- **Sellos, insignias o logos de Meta o de WhatsApp** que sugieran un aval («Partner», «verificado por Meta»), ni el logo de WhatsApp como si fuera de Wasmish. El verde de WhatsApp tampoco es de la marca.
- **Promesas que hoy no se cumplen:** «sin bloqueos», «se conecta en minutos», «no pierde ningún cliente», repartir conversaciones, avisar quién abrió una conversación, inteligencia artificial, menús con botones, Instagram, agenda. Las respuestas automáticas sí, con los límites del § 3.3. **Con la app:** que trae a Wasmish las conversaciones anteriores o los contactos de la app (no los importa), que en la app «todo sigue igual» (se apagan las listas de difusión y lo del § 3.4) o que se ve qué persona respondió desde la app.
- **Registro por cuenta propia o pago en línea:** el alta siempre se hace con Jonathan.
- **Urgencias falsas:** contadores, «solo hoy», ventanas emergentes.

---

## 6. Requisitos

- **Liviana y rápida con datos móviles.**
- **La vista previa del enlace en WhatsApp:** es lo que ve el prospecto antes de abrir la página. Hacen falta la imagen y el texto de esa vista previa para el inicio y para cada nicho.
- **Buscadores:** título y descripción en español de Ecuador para cada página.
- **Accesible:** buen contraste, botones de al menos 44 px de alto y texto legible en el celular.
- **Las imágenes de la app muestran solo lo que existe hoy**, con datos de ejemplo y nunca datos reales de clientes. Si recreas pantallas, que sean como la app actual. Las capturas definitivas se toman de la cuenta de demostración cuando exista. Las respuestas automáticas se muestran con la pantalla de la app donde se configuran, o en una conversación: la pregunta del cliente y la respuesta con la marca «Bot».

---

## 7. Pendiente y fuera de alcance

El diseño puede avanzar con estos huecos marcados. La página **no se publica** hasta llenarlos:
- [ ] El número de WhatsApp del botón y el correo.
- [ ] Si el precio lleva IVA y cómo se muestra.
- [ ] Las condiciones para cancelar y qué pasa con los datos (hay borrador).
- [ ] El texto de privacidad y términos (hay borrador), y quién factura (nombre y RUC).
- [ ] Las cifras de Meta, confirmadas en la información oficial.
- [x] Qué hace falta para empezar (2026-10-17, en el borrador).

**Lo que no entra:** blog, versión en inglés, chat en vivo, pago en línea, registro por cuenta propia, comparaciones con otras empresas por su nombre, y precios para más de un número.
