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

export default mongoose.model('Message', messageSchema);