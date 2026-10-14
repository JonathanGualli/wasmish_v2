import mongoose from 'mongoose';

// Una invitación a la cuenta (Fase 3 de multi-línea): un enlace de un solo uso
// que el owner o un admin crea y manda por donde quiera. El token no se guarda:
// solo su hash (`hashApiKey`), como las API keys. Mientras está pendiente
// (`acceptedAt: null` y sin caducar) ocupa una plaza de `maxUsers`.
const invitationSchema = new mongoose.Schema({
    accountId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        required: true,
    },
    // En minúsculas: es el correo con el que entrará, y no se puede cambiar al aceptar.
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
    },
    role: {
        type: String,
        enum: ['admin', 'supervisor', 'agent'],
        required: true,
    },
    // Las líneas que verá un supervisor o un agente; vacío para un admin (ve todas).
    lineIds: {
        type: [mongoose.Schema.Types.ObjectId],
        default: [],
    },
    tokenHash: {
        type: String,
        required: true,
    },
    expiresAt: {
        type: Date,
        required: true,
    },
    acceptedAt: {
        type: Date,
        default: null,
    },
    // Mientras se acepta: sigue pendiente (y ocupando su plaza) hasta que el
    // usuario existe. Un reclamo de más de un minuto se puede volver a tomar.
    claimedAt: {
        type: Date,
        default: null,
    },
    invitedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
}, {
    timestamps: true,
});

invitationSchema.index({ tokenHash: 1 }, { name: 'invitation_tokenHash_unique', unique: true });
invitationSchema.index({ accountId: 1, email: 1 }, { name: 'invitation_account_email' });

export default mongoose.model('Invitation', invitationSchema);
