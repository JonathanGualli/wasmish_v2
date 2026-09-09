import mongoose from "mongoose";

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
}, { 
    timestamps: true,
});

messageSchema.index({ conversationId: 1, timestamp: 1 });

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