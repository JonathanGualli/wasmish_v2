import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    name: {
        type: String, 
        required: true,
        trim: true,
    },
    email: { 
        type: String, 
        required: true,
        trim: true,
        unique: true,
    }, 
    password: {
        type: String, 
        required: true,
        trim: true,
    },
    rol:{
        type: String,
        default: 'admin',
        enum: ['admin', 'agent'],
        required: true,
    },
    status: {
        type: String,
        default: 'active',
        enum: ['active', 'inactive'],
        required: true,
    },
    tokenWhatsapp: {
        type: String, 
        trim: true,
        required: false,
        default: null,
    }
}, { 
    timestamps: true,
});

export default mongoose.model('User', userSchema);