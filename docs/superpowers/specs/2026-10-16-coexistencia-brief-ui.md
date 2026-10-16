# Brief de diseño: conectar un número que sigue en la app de WhatsApp Business

> Spec: [2026-10-16-coexistencia-design.md](2026-10-16-coexistencia-design.md).

> Para la IA de diseño. Describe **qué** tiene que poder hacer cada persona y **qué información** ve, no cómo se ve. Ya conoces la marca y todas las pantallas de Wasmish (Chats con su bandeja, hilo y ficha; Ajustes → Líneas con su botón «Conectar WhatsApp»; la marca «Bot» en los mensajes del chat; la app en el celular). El diseño tiene que sentirse parte de ellas y reutilizar sus piezas.

---

## 1. Contexto

Hoy, para conectar un número a Wasmish, el negocio tiene que **sacarlo de la app de WhatsApp Business**: lo borra de la app y pierde ahí sus chats. Casi todos los negocios a los que Wasmish quiere vender (centros de capacitación, imprentas) atienden desde esa app en un celular, y eso los frena.

Meta permite conectar el número **sin sacarlo de la app**. El negocio sigue respondiendo desde el celular como siempre, y además su equipo atiende desde Wasmish; lo nuevo se ve en los dos lados. Lo que pide Jonathan:

1. Que al conectar, Wasmish **pregunte** si el número está en la app, y explique qué cambia antes de abrir Facebook.
2. Que en el chat se distinga **lo que se respondió desde el celular**.
3. Que si Meta desconecta el número, Ajustes → Líneas **diga por qué** y cómo volver a conectarlo.

Quien lo usa: el dueño o el administrador de un negocio pequeño, que no es técnico, muchas veces desde el celular. No sabe qué es la «Cloud API» ni la «coexistencia»: esas palabras no aparecen en la interfaz.

---

## 2. La pregunta antes de conectar (Ajustes → Líneas)

Al pulsar «Conectar WhatsApp» (y «Reintentar» después de un error), antes de abrir la ventana de Facebook, la persona responde **una pregunta**: si ese número lo usa hoy en la **app de WhatsApp Business** del celular.

**Si responde que no** (es un número nuevo, o no está en ninguna app): se abre el flujo de siempre, sin más pasos.

**Si responde que sí:** antes de seguir, ve en pocas líneas qué va a pasar, para que no haya sorpresas:

- **Sigue usando la app** con el mismo número, y su equipo atiende además desde Wasmish. Lo que llegue y lo que se responda desde ahora se ve en los dos lados.
- **Los chats anteriores se quedan en la app**: no pasan a Wasmish.
- **En la app se apagan** las listas de difusión (las que tenía quedan solo para leer; desde Wasmish puede enviar campañas), los mensajes temporales, «ver una vez» y la ubicación en tiempo real.
- **WhatsApp para Windows deja de funcionar** con ese número (WhatsApp Web y los demás dispositivos sí; al conectar se desvinculan todos y se vuelven a vincular).
- **Necesita la app actualizada** y el celular a mano: en la ventana de Facebook va a escanear un código desde la app.
- **Tiene que abrir la app de vez en cuando**: si el celular pasa unas dos semanas sin usarla, Meta desconecta el número de Wasmish (se vuelve a conectar desde aquí).

Desde ahí puede **seguir** (se abre Facebook) o **volver** y elegir la otra respuesta.

Si duda («no sé si uso la app de WhatsApp Business o la normal»), le tiene que bastar una pista corta para saberlo: la app de WhatsApp Business tiene su propio ícono y su número sale como cuenta de empresa. Si usa el WhatsApp normal (personal) con ese número, este camino no es para él: la respuesta es «no».

Mientras la ventana de Facebook está abierta y mientras Meta confirma, se ve el mismo estado de «Conectando…» que hoy, con el texto adaptado: en este caso, «escanea el código desde la app de WhatsApp Business».

**En el celular** (Wasmish como app instalada), la pregunta y la explicación tienen que leerse cómodas y con el botón de seguir a mano.

---

## 3. En Ajustes → Líneas

- Una línea conectada así **dice que funciona junto con la app de WhatsApp Business** (para que el equipo sepa que hay alguien que también responde desde el celular).
- **Si Meta la desconectó**, la línea aparece como desconectada (como hoy) y **explica el motivo en palabras**, con la acción para volver a conectarla. Los motivos posibles:
  - el celular estuvo **unas dos semanas sin abrir la app**;
  - un dispositivo vinculado estuvo un mes sin usarse;
  - **se desconectó desde la app** (Ajustes → Cuenta → Plataforma empresarial);
  - el número **cambió** o se volvió a registrar en otro celular;
  - la cuenta dejó de ser de empresa.
  - Si el motivo no se conoce, un texto genérico («Meta desconectó el número»).
- Las conversaciones de esa línea se siguen leyendo; para escribir hay que reconectarla (eso ya existe y no cambia).

---

## 4. En el chat

- Los mensajes que alguien respondió **desde la app del celular** se ven como los demás mensajes enviados (con su foto, documento o audio), con una marca **«Desde el celular»**, igual que hoy se marcan los del bot con «Bot». No llevan el nombre de una persona: Meta no dice quién del equipo los escribió.
- En la bandeja, una conversación que se respondió desde el celular deja de contar como no leída, igual que cuando se responde desde Wasmish.
- Nada más cambia en el chat.

---

## 5. Lo que tiene que cumplir siempre

- **Sin jerga:** ni «Cloud API», ni «coexistencia», ni «WABA». Se habla de «la app de WhatsApp Business» y de «Wasmish».
- **Honesto con lo que se pierde:** la lista del § 2 no se esconde detrás de un enlace; es lo que más preguntará un dueño.
- **Celular y computadora**, como el resto de Ajustes.
- Lo demás de Ajustes → Líneas (renombrar, línea por defecto, PIN, desconectar) no cambia.

---

## 6. Qué se pide

Las pantallas y estados de:

1. La pregunta antes de conectar, con sus dos respuestas, y la explicación del «sí» (computadora y celular).
2. El «Conectando…» de este camino.
3. La línea conectada junto con la app, y la línea desconectada por Meta con su motivo y la acción de reconectar.
4. Un mensaje «Desde el celular» en el hilo del chat (texto y con una foto), junto a uno normal y uno del bot para comparar.
