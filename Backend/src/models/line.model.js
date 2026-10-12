import mongoose from 'mongoose';

// Una línea: un número de WhatsApp (`phoneNumberId`) de una cuenta. Las de
// números anteriores se conservan `disconnected`, con su historial. En la Fase
// 2a de multi-línea es una proyección de `User` (ver utils/line.js): el webhook
// y los envíos todavía no la leen.
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
