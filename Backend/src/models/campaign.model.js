import mongoose from "mongoose";

// Cómo se rellena una variable o un botón (ver utils/campaign.message.js).
const fillSchema = new mongoose.Schema({
    key: String,          // variables: '1' o 'nombre'
    index: Number,        // botones: posición en la plantilla
    source: String,       // fixed | name | firstName | company | phone | email
    value: String,        // solo con `fixed`
    fallback: String,     // si el contacto no tiene el dato
}, { _id: false });

// Un envío masivo: una plantilla a una lista de contactos congelada al crearlo.
// Los destinatarios viven en CampaignRecipient, que además es la cola del worker.
const campaignSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    // Copia de la plantilla al crearlo: si después se re-sincroniza o cambia en
    // Meta, el envío sigue con lo que se revisó y confirmó.
    template: {
        templateId: String,
        name: String,
        language: String,
        category: String,
        bodyText: String,
        parameterFormat: String,
        buttons: { type: [mongoose.Schema.Types.Mixed], default: [] },
        header: { type: mongoose.Schema.Types.Mixed, default: null },
        // El archivo de la cabecera al crearlo: cambiarlo después en
        // Plantillas no cambia lo que recibe este envío.
        headerMedia: { type: mongoose.Schema.Types.ObjectId, ref: 'TemplateMedia', default: null },
    },
    variables: { type: [fillSchema], default: [] },
    buttons: { type: [fillSchema], default: [] },
    excludeOptedOut: {
        type: Boolean,
        default: false,
    },
    // Creado con CAMPAIGN_DRY_RUN: no llama a Meta, ni aunque el servidor
    // vuelva a arrancar sin el modo de prueba. Lo que se creó como prueba no
    // puede acabar mandando WhatsApps de verdad.
    dryRun: {
        type: Boolean,
        default: false,
    },
    // queued → sending → completed, y paused / cancelled por el usuario. El
    // worker también pausa solo si Meta devuelve un error de cuenta o plantilla.
    status: {
        type: String,
        enum: ['queued', 'sending', 'paused', 'completed', 'cancelled'],
        default: 'queued',
    },
    // Por qué se pausó sola (null si la pausó el usuario).
    pauseReason: {
        code: { type: String, default: null },
        message: { type: String, default: null },
    },
    totalRecipients: {
        type: Number,
        default: 0,
    },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
}, {
    timestamps: true,
});

campaignSchema.index({ userId: 1, createdAt: -1 });
// El worker busca las campañas por enviar en cada vuelta.
campaignSchema.index({ status: 1, createdAt: 1 });

export default mongoose.model('Campaign', campaignSchema);
