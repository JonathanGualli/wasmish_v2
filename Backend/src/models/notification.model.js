import mongoose from 'mongoose';

// Los avisos de la campanita (avisos de la asignación, spec § 3.2): lo que le
// toca a cada persona la espera hasta que lo ve. Una fila por destinatario.
// Caducan a los 30 días (decisión del 2026-10-28); lo que pasó de verdad queda
// en la historia de la conversación (`ConversationEvent`). `lost`: otra persona
// le quitó una conversación que atendía (la tomó, se la pasó a un tercero o la
// dejó sin asignar; decisión del 2026-10-29).
export const NOTIFICATION_TYPES = ['assigned', 'passed', 'rejected', 'requested', 'lost'];
export const NOTIFICATION_TTL_SECONDS = 30 * 24 * 60 * 60;

const notificationSchema = new mongoose.Schema({
    // La cuenta, como en todos los modelos.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    // Solo en `lost`: quién la tiene ahora (quien la movió, si se la quedó;
    // `null`, si la dejó sin asignar).
    targetId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Solo en `requested`: la solicitud (`transferRequest.id`). Si sigue
    // pendiente se calcula al servirlo, mirando la conversación.
    requestId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Solo en `requested`, cuando se resolvió: cómo terminó, para la nota.
    resolution: {
        type: new mongoose.Schema({
            status: { type: String, enum: ['passed', 'rejected', 'gone'], required: true },
            by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
            at: { type: Date, required: true },
        }, { _id: false }),
        default: null,
    },
    seenAt: { type: Date, default: null },
}, {
    timestamps: true,
});

// La lista de cada persona, del más nuevo al más viejo, y su contador.
notificationSchema.index({ recipientId: 1, createdAt: -1, _id: -1 }, { name: 'notification_inbox' });
// Resolver los avisos de una solicitud.
notificationSchema.index(
    { conversationId: 1, requestId: 1 },
    { name: 'notification_request', partialFilterExpression: { requestId: { $type: 'objectId' } } },
);
notificationSchema.index({ createdAt: 1 }, { name: 'notification_ttl', expireAfterSeconds: NOTIFICATION_TTL_SECONDS });

export default mongoose.model('Notification', notificationSchema);
