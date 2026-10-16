import mongoose from 'mongoose';

// Las respuestas automáticas de una cuenta: un documento por cuenta, que la
// página edita entero. Sin documento, la cuenta tiene las de por defecto
// (apagadas: `defaultAutoReplySettings`). Qué hace cada campo:
// docs/arquitectura/respuestas-automaticas.md.

const rangeSchema = new mongoose.Schema({
    start: { type: String, required: true },
    end: { type: String, required: true },
}, { _id: false });

const daySchema = new mongoose.Schema({
    closed: { type: Boolean, default: true },
    ranges: { type: [rangeSchema], default: [] },
}, { _id: false });

const keywordRuleSchema = new mongoose.Schema({
    enabled: { type: Boolean, default: true },
    keywords: { type: [String], default: [] },
    text: { type: String, default: '' },
    // Vacío = todas las líneas. Hoy la página no lo ofrece: está para poder
    // pasar a «cada regla elige sus líneas» sin migrar nada.
    lineIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'Line', default: [] },
});

const autoReplySettingsSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    enabled: { type: Boolean, default: false },
    timezone: { type: String, default: 'America/Guayaquil' },
    handoffHours: { type: Number, default: 12 },
    welcome: {
        enabled: { type: Boolean, default: false },
        text: { type: String, default: '' },
        returnAfterDays: { type: Number, default: 30 },
    },
    outOfHours: {
        enabled: { type: Boolean, default: false },
        text: { type: String, default: '' },
        schedule: {
            mon: daySchema, tue: daySchema, wed: daySchema, thu: daySchema,
            fri: daySchema, sat: daySchema, sun: daySchema,
        },
    },
    keywordRules: { type: [keywordRuleSchema], default: [] },
    // «Si no entiende»: solo cuando no saldría nada más. Un documento guardado
    // antes del 2026-10-15 no lo tiene, y se lee apagado.
    fallback: {
        enabled: { type: Boolean, default: false },
        text: { type: String, default: '' },
    },
}, {
    timestamps: true,
});

autoReplySettingsSchema.index({ userId: 1 }, { name: 'auto_reply_settings_account_unique', unique: true });

export default mongoose.model('AutoReplySettings', autoReplySettingsSchema);
