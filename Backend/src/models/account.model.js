import mongoose from 'mongoose';

// La cuenta (organización): de ella cuelgan los datos de un cliente. Su `_id`
// es el mismo que el de su primer owner, y por eso el campo `userId` de los
// demás modelos guarda la cuenta (ver utils/account.js).
const accountSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    // Nombre del plan comercial, solo informativo: lo que limita son `limits`,
    // que el superadmin ajusta a mano mientras el cobro va fuera de Wasmish.
    plan: {
        type: String,
        default: null,
    },
    limits: {
        maxLines: { type: Number, default: 1 },
        maxUsers: { type: Number, default: 1 },
    },
    // La línea del número actual (Fase 2a de multi-línea: se guarda, todavía
    // no se usa para enrutar; la escribe `syncLinesFromOwner`).
    defaultLineId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Line',
        default: null,
    },
}, {
    timestamps: true,
});

export default mongoose.model('Account', accountSchema);
