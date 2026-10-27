import mongoose from 'mongoose';

// Un acuse de Meta (entregado, leído, fallido) que llegó antes de que se
// guardara su saliente: Wasmish guarda el mensaje después de que Meta responde
// con el wamid, y un acuse rápido puede adelantarse. Cada lado escribe antes de
// buscar al otro, como `HistoryMedia`: el webhook guarda esto y busca el
// mensaje; el envío guarda el mensaje y busca esto (`message.status.service.js`).
// Los de mensajes que no son de Wasmish (otra herramienta en el mismo número)
// nunca encuentran el suyo y caducan solos.
const pendingStatusSchema = new mongoose.Schema({
    // La cuenta del número por el que llegó: solo se aplica a un mensaje suyo.
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        required: true,
    },
    waMessageId: { type: String, required: true },
    status: { type: String, required: true },
    // El acuse tal como lo mandó Meta (`id`, `status`, `timestamp`, `errors`…).
    statusData: { type: mongoose.Schema.Types.Mixed, required: true },
}, {
    timestamps: true,
});

// Una reentrega de Meta no guarda el mismo acuse dos veces.
pendingStatusSchema.index(
    { waMessageId: 1, status: 1, userId: 1 },
    { name: 'pending_status_unique', unique: true },
);
// El saliente se guarda milisegundos después de que Meta responde: una hora
// sobra, y lo que no encontró su mensaje en ese tiempo ya no lo encontrará.
pendingStatusSchema.index({ createdAt: 1 }, { name: 'pending_status_ttl', expireAfterSeconds: 60 * 60 });

export default mongoose.model('PendingStatus', pendingStatusSchema);
