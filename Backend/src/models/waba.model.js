import mongoose from 'mongoose';

// Una cuenta de WhatsApp Business (WABA) conectada a una cuenta de Wasmish. El
// token del Embedded Signup es del WABA y vale para todos sus números, así que
// va aquí una vez, no copiado en cada línea. En la Fase 2a de multi-línea es
// una proyección de `User` (ver utils/line.js): nada la lee para enviar.
const wabaSchema = new mongoose.Schema({
    accountId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        required: true,
    },
    waBusinessId: {
        type: String,
        required: true,
        trim: true,
    },
    // Cifrado, como en `User`: se copia tal cual. Nunca sale del backend.
    tokenWhatsapp: {
        type: String,
        default: null,
    },
}, {
    timestamps: true,
});

// Un WABA es de una sola cuenta: sus plantillas (`Template.templateId` es único
// global) no se pueden repartir entre dos.
wabaSchema.index({ waBusinessId: 1 }, { name: 'waba_waBusinessId_unique', unique: true });

export default mongoose.model('Waba', wabaSchema);
