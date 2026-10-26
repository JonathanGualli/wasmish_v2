import mongoose from 'mongoose';

// El contenido de un archivo del historial de los últimos 14 días: Meta manda
// primero el mensaje como `media_placeholder` y después otro webhook con el
// archivo. Cada lado escribe antes de buscar al otro: el webhook guarda esto y
// busca el mensaje; el worker crea el mensaje y busca esto. Así uno de los dos
// siempre lo encuentra, llegue antes o después.
// Spec: docs/superpowers/specs/2026-10-23-historial-coexistencia-design.md (§ 5).
const historyMediaSchema = new mongoose.Schema({
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
    connectionAt: { type: Date, required: true },
    // La identidad del mensaje: su `waMessageKey` o, si el wamid no tiene la
    // forma conocida, `'id:' + waMessageId`.
    mediaKey: { type: String, required: true },
    waMessageId: { type: String, required: true },
    waMessageKey: { type: String, default: null },
    // El mensaje tal como lo mandó Meta (`image` con `id`, `caption`, `mime_type`…).
    messageData: { type: mongoose.Schema.Types.Mixed, required: true },
    // Ya se aplicó a su mensaje.
    applied: { type: Boolean, default: false },
}, {
    timestamps: true,
});

historyMediaSchema.index(
    { lineId: 1, connectionAt: 1, mediaKey: 1 },
    { name: 'history_media_unique', unique: true },
);

export default mongoose.model('HistoryMedia', historyMediaSchema);
