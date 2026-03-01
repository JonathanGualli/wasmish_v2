import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Conversation', 
        required: true, 
        index: true, 
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
    temporalId: {
        type: String,
        default: null,
    },
}, { 
    timestamps: true,
});

messageSchema.index({ conversationId: 1, timestamp: 1 });

export default mongoose.model('Message', messageSchema);