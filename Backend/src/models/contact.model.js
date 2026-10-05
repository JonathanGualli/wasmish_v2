import mongoose from "mongoose";

// El anuncio que trajo al contacto (ver `describeReferral`). Sin _id: es un dato
// del contacto, no un documento con vida propia.
const referralSchema = new mongoose.Schema({
    sourceType: String,
    sourceId: String,
    sourceUrl: String,
    headline: String,
    body: String,
    mediaType: String,
    ctwaClid: String,
}, { _id: false });

const contactSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    // Identidad en WhatsApp: al menos uno de los dos (ver utils/contact.identity.js).
    phone: {
        type: String,
        default: null,
    },
    waUserId: {          // BSUID
        type: String,
        default: null,
    },
    username: {          // nombre de usuario de WhatsApp, sin la @
        type: String,
        default: null,
    },
    // El que pone quien usa Wasmish. Nunca lo pisa lo que llegue de WhatsApp.
    name: {
        type: String,
        default: null,
        trim: true,
    },
    // El que la persona tiene puesto en su WhatsApp; se actualiza en cada mensaje.
    profileName: {
        type: String,
        default: null,
    },
    email: {
        type: String,
        default: null,
        trim: true,
        lowercase: true,
    },
    company: {
        type: String,
        default: null,
        trim: true,
    },
    notes: {
        type: String,
        default: null,
    },
    // Etiquetas de la cuenta (`Tag`), como mucho MAX_TAGS_PER_CONTACT.
    tags: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag' }],
        default: [],
    },
    // Cómo llegó. null = anterior a que existieran los contactos: no se sabe.
    source: {
        type: String,
        enum: ['inbound', 'manual', 'api', 'ad', 'import', null],
        default: null,
    },
    referral: {
        type: referralSchema,
        default: null,
    },
    // Pidió no recibir marketing. Enviarle una plantilla de marketing la rechaza
    // Meta (131050) y baja la calidad del número. Lo escribe el webhook
    // (`user_preferences` y el 131050), ver utils/marketing.preference.js.
    marketingOptOut: {
        type: Boolean,
        default: false,
    },
    // Cuándo se dio de baja; null si acepta publicidad.
    marketingOptOutAt: {
        type: Date,
        default: null,
    },
    // Cuándo ocurrió el último cambio aplicado (baja o alta). Meta no garantiza
    // el orden de los webhooks: lo que sea más viejo que esto se ignora.
    marketingPreferenceAt: {
        type: Date,
        default: null,
    },
}, {
    timestamps: true,
});

contactSchema.pre('validate', function () {
    if (!this.phone && !this.waUserId) {
        this.invalidate('phone', 'El contacto necesita un teléfono o un BSUID');
    }
});

// Un mismo teléfono (o BSUID) es un solo contacto por cuenta. Son PARCIALES por
// el mismo motivo que `waMessageId_unico` en Message: los dos campos pueden ser
// null, y dos null chocarían en un índice único normal.
contactSchema.index(
    { userId: 1, phone: 1 },
    { name: 'contact_phone_unique', unique: true, partialFilterExpression: { phone: { $type: 'string' } } },
);
// El filtro por etiquetas de Contactos y de las campañas.
contactSchema.index({ userId: 1, tags: 1 });
contactSchema.index(
    { userId: 1, waUserId: 1 },
    { name: 'contact_waUserId_unique', unique: true, partialFilterExpression: { waUserId: { $type: 'string' } } },
);

export default mongoose.model('Contact', contactSchema);
