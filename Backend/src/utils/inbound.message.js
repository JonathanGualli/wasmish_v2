// Traduce un mensaje entrante del webhook de Meta a lo que guardamos nosotros.
//
// Meta manda una forma distinta por cada tipo (`image.caption`, `button.text`,
// `interactive.button_reply.title`…). Este archivo es el único sitio que conoce
// esas formas: el controller solo recibe { type, text, mediaId, mimeType }.
//
// Regla que no se puede romper: `text` NUNCA sale vacío. `Message.text` es
// required en el modelo, y un throw dentro del webhook hace que Meta reintente
// y que el cliente acabe perdiendo el mensaje. Por eso todo tipo tiene etiqueta.

// Un `system` no es un mensaje de la conversación (avisos del tipo «este
// contacto cambió de número»): ni se guarda ni abre la ventana de 24 h.
const IGNORADOS = new Set(['system']);

// También las usan los archivos que se envían desde el chat (`outbound.media.js`).
export const ETIQUETAS = {
    image:    'Imagen',
    video:    'Video',
    audio:    'Audio',
    document: 'Documento',
    sticker:  'Sticker',
    location: 'Ubicación',
    contacts: 'Contacto',
    order:    'Pedido',
};

const ETIQUETA_DESCONOCIDO = 'Mensaje no compatible';

// Cuando Meta no sabe entregar algo manda type:'unsupported' y, dentro, QUÉ era
// (`unsupported.type`). Aprovecharlo convierte un «Mensaje no compatible» mudo
// en algo que el agente entiende. La lista crece según vayan apareciendo tipos
// reales: si ves uno nuevo en producción, se añade aquí y ya.
const ETIQUETAS_NO_SOPORTADO = {
    poll_creation: 'Encuesta',
    poll_update:   'Encuesta',
};

// Los únicos tipos donde `contenido.id` es un archivo de Meta. En los demás ese
// campo es otra cosa (en una reacción, el id del mensaje al que reacciona).
const CON_ARCHIVO = new Set(['image', 'video', 'audio', 'document', 'sticker']);

// Devuelve el string si tiene contenido de verdad; si no, null. Un caption con
// solo espacios cuenta como vacío.
const conTexto = (valor) => {
    const limpio = typeof valor === 'string' ? valor.trim() : '';
    return limpio.length > 0 ? limpio : null;
};

// Nombre legible de un contacto compartido, con lo que Meta traiga a mano.
const nombreDeContacto = (contacto) =>
    conTexto(contacto?.name?.formatted_name)
    ?? conTexto(contacto?.name?.first_name)
    ?? conTexto(contacto?.phones?.[0]?.phone);

const describirUbicacion = (location) => {
    const nombre = conTexto(location?.name);
    const direccion = conTexto(location?.address);
    const detalle = [nombre, direccion].filter(Boolean).join(' · ');
    return detalle ? `${ETIQUETAS.location}: ${detalle}` : ETIQUETAS.location;
};

const describirContactos = (contactos) => {
    const lista = Array.isArray(contactos) ? contactos : [];
    const nombres = lista.map(nombreDeContacto).filter(Boolean);

    if (nombres.length === 0) return ETIQUETAS.contacts;
    if (nombres.length === 1) return `${ETIQUETAS.contacts}: ${nombres[0]}`;
    return `Contactos: ${nombres.join(', ')}`;
};

const describirReaccion = (reaction) => {
    const emoji = conTexto(reaction?.emoji);
    // Meta manda la reacción sin emoji cuando el contacto la retira.
    return emoji ? `Reaccionó con ${emoji}` : 'Quitó su reacción';
};

// Un tipo que Meta no entrega. Si sabemos qué era, lo decimos; si no, genérico
// antes que enseñarle al agente el nombre en inglés que manda Meta.
const describirNoSoportado = (contenido) => {
    const subtipo = conTexto(contenido?.type) ?? conTexto(contenido?.raw_type);
    return ETIQUETAS_NO_SOPORTADO[subtipo] ?? ETIQUETA_DESCONOCIDO;
};

/**
 * Por qué Meta no entregó un mensaje (`unsupported` o `unknown`), para el log:
 * `{ subtype, errors: [{ code, title }] }`, o null si el mensaje no es de esos.
 * Solo el subtipo y, de cada error, el código y el título, que son de Meta:
 * nunca `message` ni `error_data`, ni nada del contenido, porque el log no rota
 * y lo lee quien entra al servidor. Si el subtipo se repite, va a
 * `ETIQUETAS_NO_SOPORTADO`, como las encuestas.
 */
export const describeUnsupportedReason = (messageData) => {
    if (messageData?.type !== 'unsupported' && messageData?.type !== 'unknown') return null;
    const contenido = messageData[messageData.type];
    const errores = Array.isArray(messageData.errors) ? messageData.errors : [];
    return {
        subtype: conTexto(contenido?.type) ?? conTexto(contenido?.raw_type),
        errors: errores
            .filter(error => error && typeof error === 'object')
            .map(error => ({
                code: typeof error.code === 'number' || typeof error.code === 'string' ? error.code : null,
                title: conTexto(error.title),
            })),
    };
};

// La respuesta a una plantilla con botones. Es el caso que más se pierde hoy:
// el cliente pulsa «Confirmar» y en el chat no aparecía nada.
const describirInteractivo = (interactive) =>
    conTexto(interactive?.button_reply?.title)
    ?? conTexto(interactive?.list_reply?.title)
    ?? ETIQUETA_DESCONOCIDO;

/**
 * @returns {{type: string, text: string, mediaId: string|null, mimeType: string|null, filename: string|null}|null}
 *          null si el mensaje no debe guardarse ni abrir la ventana.
 */
export const describeInboundMessage = (messageData) => {
    const type = messageData?.type;
    if (!type || IGNORADOS.has(type)) return null;

    const contenido = messageData[type];      // messageData.image, .button, …
    const mediaId = conTexto(contenido?.id);
    const mimeType = conTexto(contenido?.mime_type);

    const salida = (text) => ({
        type,
        text,
        mediaId: CON_ARCHIVO.has(type) ? mediaId : null,
        mimeType: CON_ARCHIVO.has(type) ? mimeType : null,
        // Nombre original del documento. Va aparte del texto porque con caption
        // el texto es el caption y el nombre se perdería.
        filename: type === 'document' ? conTexto(contenido?.filename) : null,
        // El texto que ESCRIBIÓ el contacto, si escribió algo. Distinto de
        // `text`, que cae a la etiqueta («Imagen») cuando no hay caption. La UI
        // lo necesita para no poner «Imagen» debajo de una imagen que ya se ve.
        caption: conTexto(contenido?.caption),
    });

    switch (type) {
        case 'text':
            // Un texto sin cuerpo no debería existir, pero si llega, que no
            // reviente el webhook: cae a la etiqueta genérica.
            return salida(conTexto(messageData.text?.body) ?? ETIQUETA_DESCONOCIDO);

        case 'image':
        case 'video':
        case 'sticker':
            return salida(conTexto(contenido?.caption) ?? ETIQUETAS[type]);

        case 'audio':
            // `voice: true` distingue la nota de voz grabada del archivo adjunto.
            return salida(contenido?.voice ? 'Nota de voz' : ETIQUETAS.audio);

        case 'document':
            return salida(
                conTexto(contenido?.caption)
                ?? conTexto(contenido?.filename)
                ?? ETIQUETAS.document
            );

        case 'location':
            return salida(describirUbicacion(contenido));

        case 'contacts':
            // `contacts` es el único que llega como array en la raíz.
            return salida(describirContactos(messageData.contacts));

        case 'reaction':
            return salida(describirReaccion(contenido));

        case 'button':
            // Quick reply de una plantilla: el texto del botón pulsado.
            return salida(conTexto(contenido?.text) ?? ETIQUETA_DESCONOCIDO);

        case 'interactive':
            return salida(describirInteractivo(contenido));

        case 'order':
            return salida(ETIQUETAS.order);

        // Comprobado con un webhook real: una encuesta llega como
        // { type:'unsupported', errors:[…], unsupported:{ type:'poll_creation' } }.
        case 'unsupported':
        case 'unknown':
            return salida(describirNoSoportado(contenido));

        default:
            return salida(ETIQUETA_DESCONOCIDO);
    }
};

/**
 * Una reacción del contacto (o del negocio, en un eco): a qué mensaje va y con
 * qué emoji. No es un mensaje de la conversación: `applyReaction` la pega a su
 * original. Meta manda la reacción SIN `emoji` cuando se quita: `emoji: null`.
 * `timestamp` es cuándo reaccionó (segundos de Meta; sin ella, ahora).
 *
 * @returns {{ waMessageId: string, targetWaMessageId: string, emoji: string|null, timestamp: Date }|null}
 *          null si no es una reacción o viene sin `id` o sin `reaction.message_id`.
 */
export const describeReaction = (messageData) => {
    if (messageData?.type !== 'reaction') return null;
    const waMessageId = conTexto(messageData.id);
    const targetWaMessageId = conTexto(messageData.reaction?.message_id);
    if (!waMessageId || !targetWaMessageId) return null;

    const seconds = Number.parseInt(messageData.timestamp, 10);
    return {
        waMessageId,
        targetWaMessageId,
        emoji: conTexto(messageData.reaction?.emoji),
        timestamp: Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date(),
    };
};

/**
 * El `context` de un mensaje: a qué mensaje responde (la cita, `context.id`) y
 * si es un reenvío. `frequently_forwarded` (una cadena) gana a `forwarded`.
 * Lo usan los entrantes y los ecos.
 *
 * @returns {{ replyToWaMessageId: string|null, forwarded: 'once'|'many'|null }}
 */
export const describeMessageContext = (messageData) => {
    const context = messageData?.context;
    let forwarded = null;
    if (context?.frequently_forwarded === true) forwarded = 'many';
    else if (context?.forwarded === true) forwarded = 'once';
    return { replyToWaMessageId: conTexto(context?.id), forwarded };
};
