# Decisiones de producto

Lo que Jonathan decidió cuando había más de una forma razonable de hacerlo. Antes de «arreglar» algo de esta lista, hay que preguntar: es así a propósito. Cada decisión enlaza a la sección donde se explica el comportamiento completo.

> El mapa de toda la documentación está en el [AGENTS.md](../AGENTS.md) de la raíz.

Cuando se tome una decisión nueva, se añade aquí (la más reciente arriba) y también en su sección de `docs/arquitectura/`, con la fecha.

| Fecha | Decisión | Por qué | Dónde |
|---|---|---|---|
| 2026-10-07 | Lo que llega con el chat abierto **sigue sin leer** hasta que se abre o se responde. | Ver un mensaje en pantalla no es haberlo atendido; el badge se quita al abrir el chat o al responder. | [chat.md § `unreadCount`](arquitectura/chat.md#unreadcount) |
| 2026-10-07 | La ficha del contacto en el chat se abre **para una conversación**: al abrir otra, volver a la misma o volver desde otra página, queda cerrada. | La ficha es de esa conversación, no una preferencia de la pantalla. | [chat.md § Ficha del contacto en el chat](arquitectura/chat.md#ficha-del-contacto-en-el-chat) |
| 2026-10-07 | Si guardar las notas falla con la ficha ya cerrada, el texto se conserva en la pestaña y vuelve al campo al regresar. | Lo escrito no se pierde aunque el guardado falle fuera de la vista. | [chat.md § Ficha del contacto en el chat](arquitectura/chat.md#ficha-del-contacto-en-el-chat) |
| 2026-10-07 | **No hay «Reintentar»** para un archivo que WhatsApp rechazó (sí para uno que no llegó al servidor). | Tampoco existe para los textos: un rechazo de WhatsApp no se arregla reenviando lo mismo. | [chat.md § Enviar archivos en la UI](arquitectura/chat.md#enviar-archivos-en-la-ui-componentschatcomposer) |
| 2026-10-06 | «Crear campaña con estos N» al terminar de importar lleva **todos los del archivo**, también los que no cambiaron. | El archivo es la lista que la persona quería usar. | [contactos.md § Importar en la UI](arquitectura/contactos.md#importar-en-la-ui) |
| 2026-10-04 | Los envíos a contactos **dados de baja de publicidad no se bloquean**: salen hacia Meta, que los rechaza con el 131050. | Así queda registrado el `Message` fallido de cada intento. | [contactos.md § Contactos](arquitectura/contactos.md#contactos-contact-contactcontrollerjs) |
| 2026-10-04 | En una campaña de marketing, la casilla «Excluir a los dados de baja» **empieza marcada**; desmarcarla los envía y queda el rechazo 131050 registrado. | Lo seguro por defecto, sin impedir el envío a quien lo quiera hacer. | [campanas.md § Campañas](arquitectura/campanas.md#campañas-campaign-campaigncontrollerjs-workerscampaignworkerjs) |
