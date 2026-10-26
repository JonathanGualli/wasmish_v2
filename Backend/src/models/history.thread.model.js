import mongoose from 'mongoose';

// Una pieza de un hilo del historial de la app de WhatsApp Business, tal como la
// mandó Meta (`messages`, sin tocar): el webhook solo la guarda y el worker la
// procesa después. Spec: docs/superpowers/specs/2026-10-23-historial-coexistencia-design.md (§ 5 y 6).
const historyThreadSchema = new mongoose.Schema({
    // La cuenta, como en todos los modelos.
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        required: true,
    },
    lineId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Line',
        required: true,
    },
    // La conexión de la línea de la que es (`Line.historySync.connectionAt`).
    connectionAt: { type: Date, required: true },
    // El teléfono del contacto (`threads[].id`), en solo dígitos.
    contactPhone: { type: String, required: true },
    // `metadata.phase` y `metadata.chunk_order` del trozo; null si Meta no los mandó.
    phase: { type: Number, default: null },
    chunkOrder: { type: Number, default: null },
    // Qué pieza del hilo es dentro del trozo (`splitThreadMessages`), desde 0.
    part: { type: Number, required: true },
    messages: { type: [mongoose.Schema.Types.Mixed], default: [] },
    status: {
        type: String,
        enum: ['pending', 'processing', 'done', 'failed'],
        default: 'pending',
    },
    attempts: { type: Number, default: 0 },
    // La reclamación del worker: hasta cuándo es suya y con qué marca.
    leaseUntil: { type: Date, default: null },
    claimToken: { type: String, default: null },
    error: { type: String, default: null },
}, {
    timestamps: true,
});

// Una reentrega de Meta choca aquí y no crea otra pieza.
historyThreadSchema.index(
    { lineId: 1, connectionAt: 1, phase: 1, chunkOrder: 1, contactPhone: 1, part: 1 },
    { name: 'history_thread_piece_unique', unique: true },
);
// La cola del worker.
historyThreadSchema.index({ status: 1, createdAt: 1 }, { name: 'history_thread_queue' });

export default mongoose.model('HistoryThread', historyThreadSchema);
