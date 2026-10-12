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
        enum: ['admin', 'agent', 'superadmin'],
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
    },
    phoneNumberId: {
        type: String, 
        trim: true,
        default: null,
    },
    waBusinessId: {
        type: String, 
        trim: true,
        default: null,
    },
}, {
    timestamps: true,
});

// Un número de WhatsApp es de una sola cuenta: el webhook enruta por él. Es
// PARCIAL por lo mismo que `contact_phone_unique`: hay muchos usuarios sin
// número (null), y dos null chocarían en un índice único normal.
userSchema.index(
    { phoneNumberId: 1 },
    { name: 'user_phoneNumberId_unique', unique: true, partialFilterExpression: { phoneNumberId: { $type: 'string' } } },
);

export default mongoose.model('User', userSchema);