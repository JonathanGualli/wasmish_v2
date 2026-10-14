import mongoose from 'mongoose';

// Un dispositivo (un navegador) que recibe avisos push de los mensajes nuevos
// (app móvil). Es de UNA persona de una cuenta: si otra activa los avisos en
// el mismo navegador, pasa a ser suya. El `endpoint` es la URL del servicio de
// push del navegador (Google, Apple, Mozilla, Microsoft) y `keys` las claves
// con que se cifra cada aviso.
const pushSubscriptionSchema = new mongoose.Schema({
    accountId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        required: true,
    },
    // La persona (`User._id`). No se llama `userId` porque en los modelos de
    // Wasmish `userId` es la cuenta.
    memberId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    endpoint: {
        type: String,
        required: true,
    },
    keys: {
        p256dh: { type: String, required: true },
        auth: { type: String, required: true },
    },
    // Para reconocer el dispositivo si hace falta diagnosticar.
    userAgent: {
        type: String,
        default: null,
    },
}, {
    timestamps: true,
});

// Un navegador, una persona.
pushSubscriptionSchema.index({ endpoint: 1 }, { name: 'push_endpoint_unique', unique: true });
// `notifyInbound` busca las suscripciones de la cuenta en cada mensaje entrante.
pushSubscriptionSchema.index({ accountId: 1 });

export default mongoose.model('PushSubscription', pushSubscriptionSchema);
