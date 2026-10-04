import mongoose from "mongoose";

// Un destinatario de un envío masivo, y a la vez un trabajo de la cola: el
// worker toma los `pending` de uno en uno y los pasa a `sending` de forma
// atómica, así ninguno se manda dos veces.
const campaignRecipientSchema = new mongoose.Schema({
    campaignId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Campaign',
        required: true,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    contactId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Contact',
        required: true,
    },
    // pending     → en cola
    // sending     → tomado por el worker
    // done        → se creó su Message (lo que le pase después lo dice el Message)
    // failed      → error antes de llegar a Meta; no hay Message
    // skipped     → no se intentó (ver `skipReason`)
    // cancelled   → la campaña se canceló antes de llegarle
    // interrupted → el servidor se reinició mientras se enviaba: no se sabe si
    //               llegó, y no se reintenta para no mandarlo dos veces
    status: {
        type: String,
        enum: ['pending', 'sending', 'done', 'failed', 'skipped', 'cancelled', 'interrupted'],
        default: 'pending',
    },
    skipReason: {
        type: String,
        default: null,
    },
    messageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null,
    },
    errorCode: { type: String, default: null },
    errorDetail: { type: String, default: null },
    processedAt: { type: Date, default: null },
}, {
    timestamps: true,
});

// Una persona, una vez por campaña: aunque llegue repetida en la selección.
campaignRecipientSchema.index({ campaignId: 1, contactId: 1 }, { unique: true });
// La cola (los pending en orden) y los conteos por estado.
campaignRecipientSchema.index({ campaignId: 1, status: 1, _id: 1 });

export default mongoose.model('CampaignRecipient', campaignRecipientSchema);
