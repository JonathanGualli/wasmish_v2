# Brief de diseño: asignar conversaciones a una persona del equipo

> Para la IA de diseño. Describe **qué** tiene que poder hacer cada persona y **qué información** ve, no cómo se ve. Ya conoces la marca, Chats (la bandeja con el filtro por línea, el hilo, la ficha del contacto, la conversación nueva y enviar plantilla), Ajustes → Equipo y la firma de quién envió cada mensaje. El diseño tiene que sentirse parte de ellos y reutilizar sus piezas.

---

## 1. Contexto

Una cuenta de Wasmish ya puede tener **varias personas** (owner, admin, supervisor y agente), cada una con sus líneas. Hoy todas ven todas las conversaciones de sus líneas, y dos agentes pueden contestarle lo mismo al mismo cliente.

Ahora **cada conversación puede tener a una persona que la atiende**:

| Rol | Qué conversaciones ve | Qué puede hacer con la asignación |
|---|---|---|
| **Owner y admin** | Todas | Asignar cualquiera a cualquiera que pueda atender esa línea, quitársela a alguien, aceptar o rechazar solicitudes |
| **Supervisor** | Todas las de sus líneas, también las de sus agentes | Lo mismo, en sus líneas |
| **Agente** | Las de sus líneas **sin asignar** y **las suyas**. **Nunca** las de sus compañeros | Tomar una sin asignar, pasar las suyas a un compañero o soltarlas, y **pedir** que le pasen una ajena |

**Reglas que el diseño tiene que dejar claras:**
- **Responder una conversación sin asignar te la asigna**, sin pasos de más: el agente contesta y pasa a ser suya. Desde ese momento, sus compañeros agentes dejan de verla.
- **Si un supervisor, admin u owner responde una conversación de otro, no se la queda**: su mensaje sale firmado con su nombre y la conversación sigue siendo del agente. Para quedársela, la asigna.
- **Lo automático no asigna:** el bot, las campañas y la API no cambian quién la atiende. Un mensaje nuevo del cliente tampoco.
- **Si a alguien lo desactivan o le quitan una línea**, sus conversaciones de esa línea vuelven a «sin asignar».
- **Avisos al celular:** un mensaje en una conversación asignada avisa solo a quien la atiende. Uno en una sin asignar avisa a todos los que ven esa línea.
- **Con una sola persona en la cuenta, nada de esto se ve**: la bandeja queda como hoy. Aparece en cuanto hay una segunda persona activa. Hoy casi todas las cuentas tienen una.
- **No hay «cerrar» ni «resolver» conversaciones** todavía. Una conversación sigue asignada hasta que alguien la mueve.

---

## 2. La bandeja

### 2.1 Qué se ve
- **Tres vistas:** «Mías», «Sin asignar» y «Todas».
  - Para el agente, «Todas» es «Mías» + «Sin asignar»: no hay otra cosa que pueda ver.
  - Se combinan con el filtro por línea que ya existe.
- **Cuántas hay en cada vista**, o al menos cuántas sin leer: lo que ayude a saber si alguien está esperando.
- **En cada conversación, quién la atiende**, cuando no es quien mira: el owner o el supervisor tienen que ver de un vistazo cuáles lleva cada agente y cuáles no lleva nadie.
- **Una solicitud de transferencia pendiente** (ver § 4) se nota en la conversación, para quien puede responderla.

### 2.2 Qué se puede hacer
- Cambiar de vista. Se recuerda la última que usó cada persona en ese navegador; la primera vez, «Todas».
- Una conversación que alguien acaba de asignar a otro **desaparece** de la bandeja del agente que la perdió.

---

## 3. En el chat: quién la atiende y asignarla

### 3.1 Qué se ve
- **Quién la atiende** (o «Sin asignar»), en la cabecera de la conversación.
- Cuando la conversación cambia de manos con el chat abierto:
  - **si es para quien la está mirando**, se le dice («Luis te pasó esta conversación»);
  - **si la pierde un agente**, la conversación se cierra y se le dice («Esta conversación ahora la atiende Ana»), sin enseñarle nada más de ella.

### 3.2 Qué se puede hacer
- **Tomarla**, si está sin asignar. Responder también la toma.
- **Asignarla o pasarla a otra persona:** se elige de una lista de las personas que pueden atender esa línea (nombre y rol, quien mira marcado como «tú»). Incluye «Sin asignar» para soltarla.
  - El agente solo puede con las suyas.
  - Owner, admin y supervisor pueden con cualquiera.
- Si mientras tanto otra persona la cambió, se avisa («La conversación cambió de manos. Vuelve a intentarlo.») y se enseña cómo está ahora.

---

## 4. Pedir que te la pasen

El agente no ve las conversaciones de sus compañeros, pero ve **todos los contactos**. Puede intentar escribirle a un contacto cuya conversación en esa línea ya atiende otro agente, desde la ficha del contacto o desde «Conversación nueva».

### 4.1 Lo que ve el agente que lo intenta
- El aviso **«Esta conversación la atiende Ana»**, sin el historial y sin su último mensaje. No se envía nada.
- Un botón **«Solicitar que te la transfieran»**. Al pedirla:
  - se le confirma que se envió;
  - después se le avisa la respuesta: aceptada (la conversación aparece en «Mías» y puede abrirla) o rechazada.
- Lo mismo si dos agentes contestan a la vez una sin asignar y el otro llegó primero: el mensaje no sale y ve el aviso.

### 4.2 Lo que ve quien puede responderla
Le llega a **la persona que atiende la conversación** y a **los supervisores, admins y owner** que la ven.
- **Quién la pide y cuándo**, en la conversación y en la bandeja (ver § 2.1).
- **Aceptar:** la conversación pasa al que la pidió. Si quien aceptó era el agente que la atendía, deja de verla.
- **Rechazar:** sigue como estaba, y al que la pidió se le avisa.
- Hay **una sola solicitud por conversación**: si otro la pide, reemplaza a la anterior.
- Si la conversación cambia de manos por otro camino, la solicitud desaparece.

---

## 5. Lo que el diseño tiene que transmitir

- **Nadie se pisa:** cada uno sabe qué le toca y qué es de otro, sin tener que preguntar en el grupo de WhatsApp del equipo.
- **Para el agente, lo de sus compañeros no existe.** No hay conversaciones grises ni bloqueadas en su bandeja: lo único que sabe de ellas es el aviso de § 4.1 cuando intenta escribir.
- **Para el supervisor, todo a la vista:** quién lleva qué y qué no lleva nadie.
- **Con una persona sola, Wasmish se ve igual que hoy.**

## 6. Lo que no entra

- Repartir automáticamente las conversaciones (por turnos o por carga), cerrar o resolver una conversación, ver quién está conectado, notas internas al transferir («Ana → Luis: pide factura») y métricas por agente: vienen después.
- Ajustes → Equipo no cambia.
