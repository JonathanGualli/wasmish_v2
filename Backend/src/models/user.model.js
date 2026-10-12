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
    // La cuenta a la que pertenece. El owner que la creó comparte su `_id`.
    accountId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        required: true,
    },
    // Sin valor por defecto: quien crea un usuario decide su rol.
    role: {
        type: String,
        enum: ['owner', 'admin', 'supervisor', 'agent'],
        required: true,
    },
    // Las líneas a las que accede un supervisor o un agente (owner y admin ven todas).
    lineIds: {
        type: [mongoose.Schema.Types.ObjectId],
        default: [],
    },
    // El superadmin de la plataforma (panel /admin): no es un rol de la cuenta.
    isSuperadmin: {
        type: Boolean,
        default: false,
    },
    // Campo viejo: lo reemplazan `role` e `isSuperadmin`. Se conserva para poder
    // volver a una imagen anterior, y se borra en la Fase 5 de multi-línea.
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

// Un owner por cuenta. Parcial: los demás roles de la cuenta no cuentan.
userSchema.index(
    { accountId: 1 },
    { name: 'user_account_owner_unique', unique: true, partialFilterExpression: { role: 'owner' } },
);

export default mongoose.model('User', userSchema);