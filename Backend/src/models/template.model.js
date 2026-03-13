import mongoose from "mongoose";

const templateSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    templateId: {
        type: String,
        required: true,
        unique: true,
    },
    name: {
        type: String,
        required: true,
    },
    language: {
        type: String,
        required: true,
    },
    category: {
        type: String,
    },
    status: {
        type: String,
    },
    bodyText: {
        type: String, 
        default: '',
    }
}, {timestamps: true});

templateSchema.index({ templateId: 1, timestamps: 1 });

export default mongoose.model('Template', templateSchema);