import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true, 
        index: true
    },
    contactPhone: { 
        type: String, 
        required: true,
        index: true,
    },
    contactName: {
        type: String, 
        default: null,
    },
    phoneNumberId: {
        type: String, 
        required: true,
    },
    lastMessage: { 
        type: String, 
        default: '',
    },
    unreadCount: { 
        type: Number, 
        default: 0,
    },
    lastMessageAt: { 
        type: Date, 
        default: Date.now,
    },
}, { 
    timestamps: true,
});

conversationSchema.index({ userId: 1, contactPhone: 1 }, { unique: true });

export default mongoose.model('Conversation', conversationSchema);