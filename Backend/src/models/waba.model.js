import mongoose from 'mongoose';

// Una cuenta de WhatsApp Business (WABA) conectada a una cuenta de Wasmish. El
// token del Embedded Signup es del WABA y vale para todos sus números, así que
// va aquí una vez, no copiado en cada línea. Desde la Fase 2c de multi-línea es
// la fuente del token (lo escribe `applyConnection`, en services/line.service.js).
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
    // El PIN (cifrado) con el que se está registrando cada número, por
    // `phoneNumberId`, desde antes de llamar a Meta hasta que llega a su línea
    // (`Line.twoStepPin`). Si la conexión falla después del registro, el
    // siguiente intento lo recupera en vez de perderlo (`registerIfNeeded`).
    pendingTwoStepPins: {
        type: Map,
        of: String,
        default: undefined,
    },
    // La última conexión o renovación confirmada de este WABA. Un aviso de
    // Meta de que retiró el acceso (`PARTNER_REMOVED`) anterior a esta fecha
    // es viejo y no desconecta nada.
    authorizedAt: { type: Date, default: null },
}, {
    timestamps: true,
});

// Un WABA es de una sola cuenta: sus plantillas (`Template.templateId` es único
// global) no se pueden repartir entre dos.
wabaSchema.index({ waBusinessId: 1 }, { name: 'waba_waBusinessId_unique', unique: true });

export default mongoose.model('Waba', wabaSchema);
