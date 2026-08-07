import mongoose from "mongoose";

const apiKeysSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    keyHash: {
        type: String,
        required: true,
        unique: true,
    },
    keyPreview: {
      type: String, // ej. "wm_ab1…9f3x" — para mostrar en la UI sin exponer la key 
    },
    name: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        default: 'active',
        enum: ['active', 'inactive'],
        required: true,
    },
    lastUsedAt: {
        type: Date,
        default: null, // Asi savemos si la key se esta usando
    },
}, { timestamps: true } );

apiKeysSchema.index({ userId: 1, name: 1 }, { unique: true }); // Un usuario no puede tener dos keys con el mismo nombre

export default mongoose.model('ApiKey', apiKeysSchema);