# Wasmish en el celular: app instalable y avisos de mensajes nuevos

Fecha: 2026-10-14. Diseño acordado con Jonathan en una sesión de Claude (preguntas y respuestas abajo, en § 7).

## 1. Qué problema resuelve

Hoy Wasmish solo avisa de un mensaje nuevo mientras está abierto en pantalla: el tiempo real es una conexión SSE, y cuando el celular pone la app en segundo plano o se bloquea, el sistema la congela y la conexión se cae. Quien atiende WhatsApp necesita que **le suene el celular** al llegar un mensaje, como con WhatsApp. Los proveedores parecidos tienen app móvil, y los clientes lo piden para dejar el proveedor que usan hoy.

## 2. Qué se construye

1. **Wasmish se instala en el celular** como una PWA: ícono en la pantalla de inicio, se abre a pantalla completa sin la barra del navegador. Sin tiendas de apps.
2. **Avisos push** al llegar un mensaje entrante, aunque la app esté cerrada: *«María López: ¿Tienen turno para mañana?»*. Tocarlo abre esa conversación.
3. **Chats impecable en el teléfono** (bandeja, hilo, responder, plantillas, adjuntos, ficha). El resto de la app, usable sin rediseño.

Fuera de alcance: app de tienda (Capacitor), modo sin conexión, avisos de otra cosa que no sea un mensaje entrante (campañas, estados), elegir líneas u horarios de silencio, el número de no leídos en el ícono.

## 3. Decisiones

- **PWA con Web Push propio** (opción A): el backend firma y cifra cada aviso con un par de claves **VAPID** propias (librería `web-push`) y lo entrega al servicio de push de cada navegador (Google, Apple, Mozilla, Microsoft). Sin OneSignal ni Firebase: el contenido no pasa por terceros más allá del servicio de push del propio navegador, que lo recibe cifrado, y no dependemos de un script que los bloqueadores de anuncios cortan. Si un día se hace app de tienda, el backend suma otro canal de envío; lo demás no cambia.
- **El service worker se escribe a mano** (`public/sw.js`), sin `vite-plugin-pwa` y **sin caché**: solo instala la app, recibe el push y abre el chat. Cachear el frontend arriesga que, tras un despliegue, el celular siga con una versión vieja.
- **Android y iPhone.** En iPhone (iOS 16.4 o posterior) el push solo existe con la app **añadida a la pantalla de inicio**, y la app instalada tiene sus propias cookies: hay que iniciar sesión otra vez dentro. La interfaz lo explica paso a paso.
- **El aviso dice el nombre del contacto y el texto** (lo que se ve en la bandeja: un adjunto sin texto sale con su etiqueta, «Imagen», «Documento»…). Se ve en la pantalla bloqueada: es lo que eligió Jonathan.
- **Cada persona activa o desactiva los avisos en cada dispositivo.** Le llegan los de las conversaciones que ya puede ver: su cuenta, su rol y sus líneas, con la **misma regla que el SSE** (`canReceive`). Con la Fase 4, cuando haya asignación, la regla cambia en el mismo sitio.
- **Cada mensaje muestra su aviso, también con Wasmish en pantalla.** Callarlo no es posible desde el navegador: Chrome pondría un aviso genérico suyo y Safari retiraría el permiso (revisión de Codex del PR #41).
- **Un aviso por conversación:** varios mensajes seguidos del mismo contacto reemplazan el aviso anterior y vuelven a sonar.
- **Al cerrar sesión, el dispositivo deja de recibir avisos**, aunque falle la red: el navegador cancela la suscripción antes de avisar al backend. Si otra persona inicia sesión en el mismo navegador y **los activa**, ese navegador pasa a ser suyo; la sincronización automática nunca cambia de dueño.

## 4. Cómo funciona

**Activar (una vez por dispositivo):** la persona toca «Activar avisos» → el navegador pide permiso → `pushManager.subscribe` con la clave pública VAPID (la da `GET /api/push/config`) → la suscripción (`endpoint` + claves) va a `POST /api/push/subscriptions`, que la guarda con la cuenta y la persona.

**Al llegar un mensaje:** el webhook guarda el mensaje y emite el SSE como siempre; después, sin esperar, `notifyInbound` busca las suscripciones de la cuenta, relee a esas personas (activas, rol y líneas **de ahora**, no de cuando se suscribieron), se queda con las que pueden ver la conversación y les manda el aviso. Si el servicio de push responde 404 o 410, la suscripción ya no existe y se borra.

**Al tocar el aviso:** si Wasmish está abierto, se enfoca y abre la conversación; si no, se abre en `/private/chats?c=<id>`. Si la sesión caducó, pasa por el login y después abre esa conversación.

**Mantener la suscripción viva:** el navegador puede renovarla o perderla. El service worker manda la nueva cuando el navegador avisa (`pushsubscriptionchange`, Chrome y Firefox), y al abrir la app se vuelve a guardar, o se crea otra vez si desapareció y la persona no apagó los avisos (Safari no avisa).

**Garantías:**
- El webhook no se cae ni se retrasa por un aviso (regla 7): el envío no se espera y nunca lanza.
- Los logs no llevan el contenido del mensaje, como en el webhook.
- El backend solo hace POST a servicios de push conocidos: un `endpoint` de otro host se rechaza al suscribir (si no, sería una forma de hacer que el servidor llame a cualquier URL).
- Sin claves VAPID configuradas, los avisos quedan apagados y todo lo demás funciona igual (útil en local).

## 5. Datos

`PushSubscription`: `accountId`, `memberId` (la persona: `User._id`), `endpoint` (único), `keys: { p256dh, auth }`, `userAgent`, `createdAt`/`updatedAt`. Se llama `memberId` y no `userId` porque en los modelos de Wasmish `userId` es la cuenta (regla 1 de `AGENTS.md`).

## 6. Cómo se prueba

- Funciones puras con su test: quién recibe, qué dice el aviso y qué `endpoint` se acepta.
- Aislamiento: una cuenta no borra la suscripción de otra, el aviso de un entrante de A nunca llega a B ni al agente de otra línea, una suscripción caducada se borra y el webhook responde 200 aunque el envío del push falle.
- A mano, en un **Android y un iPhone reales**: instalar, iniciar sesión, activar, recibir con la app cerrada (`npm run webhook:simulate` en local; en producción, con la cuenta de prueba de Jonathan), tocar el aviso, cerrar sesión y ver que ya no llega.

## 7. Preguntas y respuestas (2026-10-14)

| Pregunta | Respuesta de Jonathan |
|---|---|
| ¿Qué celulares usan los clientes? | Mezcla de Android y iPhone. |
| ¿Qué muestra el aviso? | Nombre y texto, como WhatsApp. |
| ¿Qué tiene que funcionar bien en el celular? | Chats impecable; lo demás usable. |
| ¿Qué control tiene cada persona? | Activar o desactivar por dispositivo. |
| ¿PWA o app de tienda? | PWA con Web Push (opción A). |
| ¿OneSignal o Web Push propio? | Web Push propio. |
