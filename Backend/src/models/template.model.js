import mongoose, { mongo } from "mongoose";

const templateSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    templateId: {
        type: String,
        required: true,
        unique: true,
    },
    // El WABA del que es la plantilla (Fase 2a de multi-línea: se guarda al
    // sincronizar, todavía no se usa para buscarlas).
    waBusinessId: {
        type: String,
        default: null,
    },
    name: {
        type: String,
        required: true,
    },
    language: {
        type: String,
        required: true,
    },
    category: {
        type: String,
    },
    status: {
        type: String,
    },
    bodyText: {
        type: String, 
        default: '',
    },
    // Definición cruda de los botones tal como los devuelve Meta. Es Mixed a 
    // propósito, pues la forma cambia segun el tipo 
    buttons: {
        type: [mongoose.Schema.Types.Mixed],
        default: [],
    },
    // 'POSITIONAL' ({{1}} o 'NAMED' ({{nombre}}))
    parameterFormat: {
        type: String,
    },
    // `{ format, text }` o null si no tiene (ver utils/template.header.js).
    // Sin default a propósito: `undefined` distingue una plantilla sincronizada
    // antes de guardar la cabecera, que se vuelve a sincronizar.
    header: {
        type: mongoose.Schema.Types.Mixed,
    },
    // El archivo que se envía en la cabecera (imagen, vídeo o documento). Lo
    // pone quien usa Wasmish en Plantillas; la sincronización no lo toca.
    headerMedia: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TemplateMedia',
        default: null,
    },
    // Lo demás que dice Meta de la plantilla (ver `toTemplateFields` en
    // utils/template.sync.js). Sin default, como `header`: `undefined` = 
    // sincronizada antes de guardarlos, y se rellenan en el siguiente sync.
    footerText: { type: String },
    // `[{ key, example }]`: '1', '2'… o el nombre de la variable.
    bodyExamples: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    headerExample: { type: String },
    // 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN'
    qualityScore: { type: String },
    rejectedReason: { type: String },
    previousCategory: { type: String },
    subCategory: { type: String },
    metaUpdatedAt: { type: Date },
    // Cuándo dejó de llegar en un sync completo: se borró en Meta. Se queda
    // en la lista (los mensajes y las campañas viejos la nombran), pero no se
    // envía. Un sync en el que vuelve a llegar la desmarca.
    deletedInMetaAt: { type: Date, default: null },

}, {timestamps: true});

templateSchema.index({ templateId: 1, timestamps: 1 });

export default mongoose.model('Template', templateSchema);