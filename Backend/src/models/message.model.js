import mongoose from "mongoose";

// El trabajo de las respuestas automáticas, dentro del propio entrante: si el
// mensaje existe, existe su trabajo (y el índice único de `waMessageId` evita
// duplicarlo cuando Meta reintenta). Solo lo llevan los entrantes de cuentas
// con el bot encendido. Estados y flujo: docs/arquitectura/respuestas-automaticas.md.
const autoReplyJobSchema = new mongoose.Schema({
    status: {
        type: String,
        enum: ['waiting', 'pending', 'processing', 'done', 'skipped', 'failed', 'uncertain', 'expired'],
        required: true,
    },
    // Mientras está en la cola. Se quita al terminar: así el índice de la cola
    // solo guarda lo pendiente.
    active: { type: Boolean, default: undefined },
    // Cuándo había escrito antes el contacto en la cuenta (null = nunca),
    // leído al recibir: decide la bienvenida.
    previousInboundAt: { type: Date, default: null },
    runAfter: { type: Date, default: null },
    leaseUntil: { type: Date, default: null },
    // Quién tiene el trabajo: cada toma estrena uno. Una ejecución que lo
    // perdió (el barrido lo devolvió a la cola) ya no puede enviar ni cerrarlo.
    claimToken: { type: String, default: null },
    attempts: { type: Number, default: 0 },
    // Desde aquí el envío pudo llegar a Meta: un corte deja el trabajo `uncertain`.
    sendStartedAt: { type: Date, default: null },
    replyMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    skipReason: { type: String, default: null },
}, { _id: false });

const messageSchema = new mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Conversation', 
        required: true, 
        index: true, 
    },
    direction: {
        type: String,
        enum: ['inbound', 'outbound'],
        required: true,
    },
    sender: {
        type: String, 
        enum: ['me', 'them'], 
        required: true,
    }, 
    waMessageId: {
        type: String,
    }, 
    text: {
        type: String, 
        required: true,
    }, 
    // Tipo del mensaje tal como lo llama Meta: 'text', 'image', 'audio',
    // 'button'… El default hace que todo el historial anterior siga siendo
    // texto sin necesidad de migrar nada.
    type: {
        type: String,
        default: 'text',
    },
    // Identificador del archivo en Meta. Hoy no se usa: se guarda para poder
    // descargar el adjunto más adelante sin tener que remigrar el historial.
    mediaId: {
        type: String,
        default: null,
    },
    mimeType: {
        type: String,
        default: null,
    }, 
    // Nombre del archivo descargado dentro de MEDIA_DIR. null = no hay archivo,
    // o la descarga falló: el mensaje se muestra igual, solo con su etiqueta.
    mediaFile: {
        type: String,
        default: null,
    },
    // Nombre original, solo en documentos: es el que ve el usuario al abrirlo.
    mediaFilename: {
        type: String,
        default: null,
    },
    mediaSize: {
        type: Number,
        default: null,
    }, 
    // Lo que escribió el contacto junto al adjunto. `text` cae a la etiqueta
    // («Imagen») cuando no hay nada escrito; esto queda en null.
    caption: {
        type: String,
        default: null,
    }, 
    timestamp: {
        type: Date, 
        default: Date.now,
    },
    status: {
        type: String,
        enum: ['sent', 'delivered', 'read', 'failed'],
        default: 'sent',
    }, 
    deliveredAt: { 
        type: Date,
        default: null,
    },
    readAt: {
        type: Date,
        default: null,
    }, 
    failedAt: {
        type: Date,
        default: null,
    },
    errorCode: {
        type: String,
        default: null,
    },
    errorDetail: {
        type: String,
        default: null,
    },
    // Trazabilidad de plantillas: qué plantilla y con qué datos se envió. 
    // No se muestran en la ui - el texto ya viene renederizado en text
    // pero permiten auditar y re-renderizar de forma fiable si hiciera falta
    templateName: {
        type: String, 
        default: null,
    },
    templateParams: {
        type: [mongoose.Schema.Types.Mixed],
        default: undefined,
    },
    temporalId: {
        type: String,
        default: null,
    },
    // La campaña de la que salió, si salió de una. Con él se cuentan los
    // entregados y leídos de la campaña, que el webhook va actualizando aquí.
    campaignId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Campaign',
    },
    // Quién lo envió desde el chat (Fase 3), con su nombre COPIADO: el historial
    // lo dice aunque esa persona ya no esté o cambie de nombre. null en los de
    // campañas, la API y los anteriores al campo.
    sentBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    sentByName: {
        type: String,
        default: null,
    },
    // De dónde salió un saliente: el chat, una campaña, la API o el bot. null en los
    // entrantes y los anteriores al campo (ver `messageOrigin`).
    origin: {
        type: String,
        // 'businessApp': respondido desde la app de WhatsApp Business (coexistencia).
        enum: ['chat', 'campaign', 'api', 'bot', 'businessApp', null],
        default: null,
    },
    bot: {
        type: autoReplyJobSchema,
        default: undefined,
    },
    // Coexistencia: el contacto o el negocio (desde la app) lo borró o lo editó
    // (`applyMessageChange`). Al borrarlo se conserva lo que decía: el chat lo
    // enseña con el ojito. Spec: 2026-10-19-mensajes-eliminados-editados-design.md.
    deletedAt: {
        type: Date,
        default: null,
    },
    // La hora de la última edición aplicada: una más vieja no la pisa.
    editedAt: {
        type: Date,
        default: null,
    },
    // Lo que decía antes de cada edición, en orden de llegada; `editedAt` es
    // desde cuándo decía eso. Sin default: no se guarda un array vacío en cada mensaje.
    previousVersions: {
        type: [new mongoose.Schema({
            text: { type: String, required: true },
            caption: { type: String, default: null },
            editedAt: { type: Date, required: true },
        }, { _id: false })],
        default: undefined,
    },
    // Sube en 1 con cada borrado o edición aplicada: ordena los cambios de un
    // mensaje (la UI descarta un `message_updated` más viejo que el que tiene).
    changeVersion: {
        type: Number,
        default: undefined,
    },
}, {
    timestamps: true,
});

messageSchema.index({ conversationId: 1, timestamp: 1 });
// La cola de las respuestas automáticas: solo los trabajos activos.
messageSchema.index(
    { 'bot.status': 1, 'bot.runAfter': 1 },
    { name: 'auto_reply_queue', partialFilterExpression: { 'bot.active': true } },
);
// Los conteos de una campaña por estado. Normal, ni parcial ni sparse: Mongo
// no usa un parcial para `{ campaignId: id }` (ver waMessageId abajo), y un
// sparse compuesto indexa igual todo documento que tenga `status`, o sea todos.
messageSchema.index({ campaignId: 1, status: 1 }, { name: 'campaignId_status' });

// waMessageId lleva DOS índices, y hacen falta los dos. Suena redundante, pero
// cada uno resuelve un problema que el otro no puede.
//
// 1) Unicidad. Meta no garantiza que un webhook llegue una sola vez: si no recibe
//    el 200 a tiempo reintenta el lote entero, y como este handler baja los
//    adjuntos antes de responder, eso pasa de verdad. Sin unicidad el reintento
//    duplicaba el mensaje en el chat del cliente.
//
//    Es PARCIAL, no `sparse`: un mensaje que Meta rechaza se guarda con
//    `waMessageId: null` explícito para no perderlo, y `sparse` solo excluye el
//    campo AUSENTE — dos `null` chocarían y el segundo envío fallido se perdería.
//    `$type: 'string'` deja fuera tanto los null como los ausentes.
//
// 2) Búsqueda. `procesarEstado` busca por waMessageId en CADA acuse de recibo, y
//    cada mensaje enviado genera dos o tres. El índice parcial NO sirve para eso:
//    Mongo no deduce que `{ waMessageId: 'wamid.x' }` implique `$type: 'string'`,
//    así que no lo considera elegible y cae en un escaneo completo de la colección
//    (medido: 5000 documentos examinados frente a 1 con este índice). Antes que
//    ensuciar cada consulta con un `$type`, se paga un segundo índice.
//
// Los nombres son explícitos a propósito: sin ellos ambos se llamarían
// `waMessageId_1` y Mongo rechazaría el segundo.
messageSchema.index(
    { waMessageId: 1 },
    { name: 'waMessageId_unico', unique: true, partialFilterExpression: { waMessageId: { $type: 'string' } } },
);
messageSchema.index({ waMessageId: 1 }, { name: 'waMessageId_busqueda' });

export default mongoose.model('Message', messageSchema);