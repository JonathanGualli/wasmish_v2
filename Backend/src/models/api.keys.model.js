import mongoose from "mongoose";

const apiKeysSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    key: {
        type: String,
        required: true,
        unique: true,
    },
    name: {
        type: String,
        required: true,
        unique: true,
    },
    status: {
        type: String,
        default: 'active',
        enum: ['active', 'inactive'],
        required: true,
    },
}, { timestamps: true } );

export default mongoose.model('ApiKey', apiKeysSchema);