import mongoose from 'mongoose';

// Una línea: un número de WhatsApp (`phoneNumberId`) de una cuenta. Las de
// números anteriores se conservan `disconnected`, con su historial. Desde la
// Fase 2c de multi-línea es la fuente de la conexión (la escribe solo
// services/line.service.js); `User` guarda una copia de la línea por defecto.
const lineSchema = new mongoose.Schema({
    accountId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        required: true,
        index: true,
    },
    // null en las líneas de números anteriores: no se sabe de qué WABA eran, y
    // desde ellas no se envía.
    wabaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Waba',
        default: null,
    },
    phoneNumberId: {
        type: String,
        required: true,
        trim: true,
    },
    // Lo que dice Meta al conectar (`GET /{waba-id}/phone_numbers`).
    displayPhoneNumber: { type: String, default: null },
    verifiedName: { type: String, default: null },
    // El nombre interno que le pone la cuenta («Ventas»).
    name: { type: String, default: null, trim: true },
    status: {
        type: String,
        enum: ['active', 'disconnected'],
        default: 'active',
    },
    // Cuándo se conectó (o reactivó) y cuándo se desconectó por última vez
    // (Fase 2c). null en las líneas anteriores a estos campos. `connectedAt`
    // decide la siguiente línea por defecto (`nextDefaultLine`).
    connectedAt: { type: Date, default: null },
    disconnectedAt: { type: Date, default: null },
    // El PIN de la verificación en dos pasos con el que Wasmish registró el
    // número en la Cloud API (`registerIfNeeded`), cifrado como el token. El
    // cliente lo necesita para llevarse el número; solo sale en
    // `GET /lines/:id/pin`. null si el número ya estaba registrado al conectarlo.
    twoStepPin: { type: String, default: null },
    // El número sigue en la app de WhatsApp Business (coexistencia), según Meta
    // (`is_on_biz_app`) al conectar. Lo que se responde desde la app llega como
    // eco (`origin: 'businessApp'`).
    businessApp: { type: Boolean, default: false },
    // Por qué la desconectó Meta (`PARTNER_REMOVED`): el motivo tal cual
    // (`PRIMARY_INACTIVITY`…), o null si no lo dijo o se desconectó desde
    // Wasmish. Se borra al reconectar o renovar.
    disconnectionReason: { type: String, default: null },
}, {
    timestamps: true,
});

// Un número activo está en una sola cuenta (el webhook enrutará por él). Solo
// entre las ACTIVAS: un número que fue de una cuenta y hoy es de otra deja en
// la primera su línea desconectada, con su historial.
lineSchema.index(
    { phoneNumberId: 1 },
    { name: 'line_phoneNumberId_active_unique', unique: true, partialFilterExpression: { status: 'active' } },
);
// Una línea por número dentro de la cuenta, activa o no.
lineSchema.index({ accountId: 1, phoneNumberId: 1 }, { name: 'line_account_phone_unique', unique: true });

export default mongoose.model('Line', lineSchema);
