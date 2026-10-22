import test from 'node:test';
import assert from 'node:assert/strict';

import { describeInboundMessage, describeUnsupportedReason, describeReaction, describeMessageContext } from '../src/utils/inbound.message.js';

// EL test que importa: Message.text es required, así que un texto vacío hace
// throw dentro del webhook, Meta reintenta y el mensaje del cliente se pierde.
// Ningún tipo, ni siquiera uno que no conozcamos, puede salir sin texto.
test('ningún tipo devuelve un texto vacío', () => {
    const casos = [
        { type: 'text', text: { body: '   ' } },
        { type: 'image', image: { id: '1', caption: '  ' } },
        { type: 'video', video: {} },
        { type: 'audio', audio: {} },
        { type: 'document', document: {} },
        { type: 'sticker', sticker: {} },
        { type: 'location', location: {} },
        { type: 'contacts', contacts: [] },
        { type: 'reaction', reaction: {} },
        { type: 'button', button: {} },
        { type: 'interactive', interactive: {} },
        { type: 'order', order: {} },
        { type: 'unsupported', unsupported: {} },
        { type: 'unknown', unknown: {} },
        { type: 'tipo_que_meta_invente_mañana' },
    ];

    for (const caso of casos) {
        const salida = describeInboundMessage(caso);
        assert.ok(salida, `${caso.type} no debería ignorarse`);
        assert.ok(salida.text.trim().length > 0, `${caso.type} salió con texto vacío`);
    }
});

test('un texto normal se guarda tal cual', () => {
    const salida = describeInboundMessage({ type: 'text', text: { body: 'Hola, ¿siguen abiertos?' } });

    assert.equal(salida.type, 'text');
    assert.equal(salida.text, 'Hola, ¿siguen abiertos?');
    assert.equal(salida.mediaId, null);
});

test('una imagen con caption guarda el caption, no la etiqueta', () => {
    const salida = describeInboundMessage({
        type: 'image',
        image: { id: 'MEDIA123', mime_type: 'image/jpeg', caption: 'Mira el pedido' },
    });

    assert.equal(salida.text, 'Mira el pedido');
    assert.equal(salida.mediaId, 'MEDIA123');
    assert.equal(salida.mimeType, 'image/jpeg');
});

test('una imagen sin caption cae a la etiqueta', () => {
    const salida = describeInboundMessage({ type: 'image', image: { id: 'MEDIA123' } });

    assert.equal(salida.text, 'Imagen');
});

// `voice: true` es la nota grabada en el momento; sin él es un mp3 adjunto.
test('la nota de voz se distingue del audio adjunto', () => {
    assert.equal(describeInboundMessage({ type: 'audio', audio: { id: 'a', voice: true } }).text, 'Nota de voz');
    assert.equal(describeInboundMessage({ type: 'audio', audio: { id: 'a' } }).text, 'Audio');
});

test('un documento usa el nombre del archivo cuando no hay caption', () => {
    const salida = describeInboundMessage({
        type: 'document',
        document: { id: 'd1', filename: 'factura-2026.pdf', mime_type: 'application/pdf' },
    });

    assert.equal(salida.text, 'factura-2026.pdf');
    assert.equal(salida.mediaId, 'd1');
});

// El caso que hoy se pierde entero: el cliente responde a una plantilla
// pulsando un botón y en el chat no aparecía nada.
test('la respuesta a un botón de plantilla guarda el texto del botón', () => {
    const salida = describeInboundMessage({ type: 'button', button: { text: 'Confirmar cita', payload: 'CONFIRM' } });

    assert.equal(salida.text, 'Confirmar cita');
});

test('la respuesta a un menú interactivo guarda el título elegido', () => {
    const botones = describeInboundMessage({
        type: 'interactive',
        interactive: { type: 'button_reply', button_reply: { id: 'b1', title: 'Sí, confirmo' } },
    });
    const lista = describeInboundMessage({
        type: 'interactive',
        interactive: { type: 'list_reply', list_reply: { id: 'l1', title: 'Plan mensual' } },
    });

    assert.equal(botones.text, 'Sí, confirmo');
    assert.equal(lista.text, 'Plan mensual');
});

test('la ubicación añade nombre y dirección cuando vienen', () => {
    const conDetalle = describeInboundMessage({
        type: 'location',
        location: { latitude: -0.18, longitude: -78.46, name: 'Oficina', address: 'Av. Amazonas 123' },
    });
    const pelada = describeInboundMessage({ type: 'location', location: { latitude: -0.18, longitude: -78.46 } });

    assert.equal(conDetalle.text, 'Ubicación: Oficina · Av. Amazonas 123');
    assert.equal(pelada.text, 'Ubicación');
});

test('los contactos compartidos salen por su nombre', () => {
    const uno = describeInboundMessage({
        type: 'contacts',
        contacts: [{ name: { formatted_name: 'Ana Pérez' } }],
    });
    const varios = describeInboundMessage({
        type: 'contacts',
        contacts: [{ name: { formatted_name: 'Ana Pérez' } }, { name: { formatted_name: 'Luis Gómez' } }],
    });

    assert.equal(uno.text, 'Contacto: Ana Pérez');
    assert.equal(varios.text, 'Contactos: Ana Pérez, Luis Gómez');
});

test('quitar una reacción se distingue de ponerla', () => {
    assert.equal(describeInboundMessage({ type: 'reaction', reaction: { emoji: '👍' } }).text, 'Reaccionó con 👍');
    assert.equal(describeInboundMessage({ type: 'reaction', reaction: {} }).text, 'Quitó su reacción');
});

// En una reacción, `reaction.id` no existe, pero sí `message_id`: si algún día
// alguien lo renombra, no queremos guardarlo como si fuera un archivo.
test('solo los tipos con archivo guardan mediaId', () => {
    assert.equal(describeInboundMessage({ type: 'reaction', reaction: { id: 'no-soy-media', emoji: '👍' } }).mediaId, null);
    assert.equal(describeInboundMessage({ type: 'location', location: { id: 'tampoco' } }).mediaId, null);
    assert.equal(describeInboundMessage({ type: 'sticker', sticker: { id: 'sí' } }).mediaId, 'sí');
});

// Los `system` son avisos de Meta («este contacto cambió de número»), no
// mensajes: ni se guardan ni deben abrir la ventana de 24 h.
test('los mensajes de sistema se ignoran', () => {
    assert.equal(describeInboundMessage({ type: 'system', system: { body: 'cambió de número' } }), null);
});

test('un mensaje sin tipo se ignora en vez de reventar', () => {
    assert.equal(describeInboundMessage({}), null);
    assert.equal(describeInboundMessage(null), null);
    assert.equal(describeInboundMessage(undefined), null);
});

// Payload REAL capturado de un webhook de producción: una encuesta enviada
// desde el móvil llega así. Meta no la entrega, pero sí dice qué era.
test('una encuesta se identifica aunque Meta no la entregue', () => {
    const salida = describeInboundMessage({
        type: 'unsupported',
        errors: [{ code: 131051, title: 'Message type unknown' }],
        unsupported: { type: 'poll_creation', raw_type: 'poll_creation' },
    });

    assert.equal(salida.type, 'unsupported');
    assert.equal(salida.text, 'Encuesta');
});

test('un no-soportado que no conocemos cae al genérico, no al nombre en inglés', () => {
    const salida = describeInboundMessage({
        type: 'unsupported',
        unsupported: { type: 'algo_que_meta_saque_mañana' },
    });

    assert.equal(salida.text, 'Mensaje no compatible');
});

// Regresión que vigila: del 2026-10-20 al 22 los primeros mensajes a la línea con coexistencia
// (saludos automáticos de negocios a los que se escribió en frío) salían como «Mensaje no compatible»,
// como si se hubieran perdido, cuando se pueden ver en la app de WhatsApp Business. Payload real.
test('un 131060 dice que no está disponible y dónde verlo', () => {
    const salida = describeInboundMessage({
        type: 'unsupported',
        errors: [{ code: 131060, title: 'This message is unavailable.' }],
        unsupported: { type: 'unknown' },
    });

    assert.equal(salida.type, 'unsupported');
    assert.equal(salida.text, 'Mensaje no disponible: míralo en tu celular');
    assert.equal(describeInboundMessage({ type: 'unknown', errors: [{ code: '131060' }], unknown: {} }).text,
        'Mensaje no disponible: míralo en tu celular');
});

test('un 131051 sin subtipo conocido sigue siendo no compatible', () => {
    const salida = describeInboundMessage({
        type: 'unsupported',
        errors: [{ code: 131051, title: 'Message type unknown' }],
        unsupported: { type: 'unknown' },
    });

    assert.equal(salida.text, 'Mensaje no compatible');
});

// Meta añade tipos nuevos sin avisar. Que aparezca algo en el chat es mejor que
// un hueco silencioso, aunque no sepamos pintarlo.
test('un tipo desconocido se guarda como no compatible', () => {
    const salida = describeInboundMessage({ type: 'nfm_reply', nfm_reply: { response_json: '{}' } });

    assert.equal(salida.type, 'nfm_reply');
    assert.equal(salida.text, 'Mensaje no compatible');
});

// --- El motivo de un no soportado (para el log) ---

// Regresión que vigila: el 2026-10-20 un texto llegó como `unsupported` en una línea con coexistencia y
// el motivo de Meta (subtipo y errores) no quedó en ningún sitio: no se pudo saber por qué.
test('describeUnsupportedReason: el subtipo y, de cada error, solo el código y el título', () => {
    const reason = describeUnsupportedReason({
        type: 'unsupported',
        errors: [{
            code: 131051, title: 'Message type unknown', message: 'Message type unknown',
            error_data: { details: 'Message type is currently not supported.' },
        }],
        unsupported: { type: 'edit' },
    });
    assert.deepEqual(reason, { subtype: 'edit', errors: [{ code: 131051, title: 'Message type unknown' }] });
});

test('describeUnsupportedReason: el raw_type si no hay type, y sin errores una lista vacía', () => {
    assert.deepEqual(describeUnsupportedReason({ type: 'unsupported', unsupported: { raw_type: 'poll_creation' } }),
        { subtype: 'poll_creation', errors: [] });
    assert.deepEqual(describeUnsupportedReason({ type: 'unknown', errors: [{ code: 131060, title: 'This message is currently unavailable' }] }),
        { subtype: null, errors: [{ code: 131060, title: 'This message is currently unavailable' }] });
});

test('describeUnsupportedReason: nada del contenido, aunque Meta lo meta en los errores', () => {
    const reason = describeUnsupportedReason({
        type: 'unsupported',
        text: { body: 'el texto del cliente' },
        errors: [{ code: 131051, title: 'Message type unknown', message: 'el texto del cliente', error_data: { details: 'el texto del cliente' } }, 'raro', null],
        unsupported: { type: 'text', body: 'el texto del cliente' },
    });
    assert.ok(!JSON.stringify(reason).includes('el texto del cliente'));
    assert.deepEqual(reason.errors, [{ code: 131051, title: 'Message type unknown' }]);
});

test('describeUnsupportedReason: un mensaje que no es un no soportado → null', () => {
    assert.equal(describeUnsupportedReason({ type: 'text', text: { body: 'hola' } }), null);
    assert.equal(describeUnsupportedReason(null), null);
});

// Citas y reacciones (spec 2026-10-20-citas-reacciones-design.md).

// La forma de la referencia del webhook `reaction` de Meta.
const reaccion = (reaction, extra = {}) => ({
    from: '593999000111', id: 'wamid.REACCION', timestamp: '1750090702', type: 'reaction', reaction, ...extra,
});

test('describeReaction: la reacción con su emoji y el mensaje al que va', () => {
    assert.deepEqual(describeReaction(reaccion({ message_id: 'wamid.X', emoji: '👍' })), {
        waMessageId: 'wamid.REACCION',
        targetWaMessageId: 'wamid.X',
        emoji: '👍',
        timestamp: new Date(1750090702000),
    });
});

test('describeReaction: sin emoji (o vacío) es que la quitó', () => {
    assert.equal(describeReaction(reaccion({ message_id: 'wamid.X' })).emoji, null);
    assert.equal(describeReaction(reaccion({ message_id: 'wamid.X', emoji: '' })).emoji, null);
});

test('describeReaction: mal formada o de otro tipo → null', () => {
    assert.equal(describeReaction(reaccion({ emoji: '👍' })), null);
    assert.equal(describeReaction(reaccion({ message_id: 'wamid.X', emoji: '👍' }, { id: undefined })), null);
    assert.equal(describeReaction({ type: 'text', id: 'wamid.T', text: { body: 'hola' } }), null);
    assert.equal(describeReaction(null), null);
});

test('describeMessageContext: la cita y el reenvío', () => {
    assert.deepEqual(
        describeMessageContext({ type: 'text', context: { from: '15550000000', id: 'wamid.Q' } }),
        { replyToWaMessageId: 'wamid.Q', forwarded: null },
    );
    assert.deepEqual(describeMessageContext({ type: 'text', context: { forwarded: true } }), { replyToWaMessageId: null, forwarded: 'once' });
    assert.deepEqual(
        describeMessageContext({ type: 'text', context: { forwarded: true, frequently_forwarded: true } }),
        { replyToWaMessageId: null, forwarded: 'many' },
    );
    assert.deepEqual(describeMessageContext({ type: 'text' }), { replyToWaMessageId: null, forwarded: null });
    assert.deepEqual(describeMessageContext(null), { replyToWaMessageId: null, forwarded: null });
});
