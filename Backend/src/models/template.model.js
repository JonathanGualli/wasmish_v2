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

}, {timestamps: true});

templateSchema.index({ templateId: 1, timestamps: 1 });

export default mongoose.model('Template', templateSchema);