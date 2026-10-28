import mongoose from 'mongoose';

// La historia de una conversación (avisos de la asignación, spec § 3.1): cada
// cambio de manos, en el hilo y por hora, sin ser un mensaje. No lo ve el
// cliente, no cuenta como no leído ni sale en la vista previa. Los nombres no
// se guardan: se leen con `populate` al servirlo.
export const CONVERSATION_EVENT_TYPES = ['take', 'assign', 'release', 'request', 'pass', 'reject', 'revoked'];

const conversationEventSchema = new mongoose.Schema({
    // La cuenta, como en todos los modelos.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    type: { type: String, enum: CONVERSATION_EVENT_TYPES, required: true },
    // Quién lo hizo; `null` en `revoked`.
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // A quién: el asignado, el solicitante o quien perdió el acceso; `null` en
    // `take`, `release` y `request`.
    targetId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Cuándo ocurrió el cambio: la fecha de la escritura ganadora, no la de
    // guardar el evento. Si no, dos reasignaciones cuyas confirmaciones
    // terminan al revés quedarían al revés en el hilo (revisión de Codex del spec, 5).
    at: { type: Date, required: true },
});

// El hilo los pide por conversación y por tramo de tiempo; `_id` desempata.
conversationEventSchema.index({ conversationId: 1, at: 1, _id: 1 }, { name: 'conversation_event_list' });

export default mongoose.model('ConversationEvent', conversationEventSchema);
