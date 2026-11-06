import mongoose from 'mongoose';
import { DEFAULT_HANDOFF_TEXT } from '../utils/auto.reply.options.js';

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

// Una opción de un menú (bot con menús, spec 2026-11-05): lleva a otra
// respuesta (`ruleId`), al inicio o a «hablar con una persona».
const optionSchema = new mongoose.Schema({
    title: { type: String, required: true },
    target: { type: String, enum: ['rule', 'start', 'person'], required: true },
    ruleId: { type: mongoose.Schema.Types.ObjectId, default: null },
}, { _id: false });

// Dónde dejó la persona su tarjeta en el lienzo de la página (bot con menús,
// plan, Tarea 9). `null`: la página la coloca sola.
const positionSchema = new mongoose.Schema({
    x: { type: Number, required: true },
    y: { type: Number, required: true },
}, { _id: false });

// Una «respuesta» en la pantalla. Sin frases, solo se llega por una opción.
const keywordRuleSchema = new mongoose.Schema({
    name: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
    keywords: { type: [String], default: [] },
    text: { type: String, default: '' },
    // Vacío = todas las líneas. Hoy la página no lo ofrece: está para poder
    // pasar a «cada regla elige sus líneas» sin migrar nada.
    lineIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'Line', default: [] },
    options: { type: [optionSchema], default: [] },
    position: { type: positionSchema, default: null },
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
        options: { type: [optionSchema], default: [] },
        position: { type: positionSchema, default: null },
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
        options: { type: [optionSchema], default: [] },
        position: { type: positionSchema, default: null },
    },
    // Lo que responde el bot cuando el contacto pide una persona. Un documento
    // guardado antes no lo tiene: se completa al leer (`withAutoReplyDefaults`).
    handoff: {
        text: { type: String, default: DEFAULT_HANDOFF_TEXT },
        // La tarjeta «Una persona» del lienzo.
        position: { type: positionSchema, default: null },
    },
}, {
    timestamps: true,
});

autoReplySettingsSchema.index({ userId: 1 }, { name: 'auto_reply_settings_account_unique', unique: true });

export default mongoose.model('AutoReplySettings', autoReplySettingsSchema);
