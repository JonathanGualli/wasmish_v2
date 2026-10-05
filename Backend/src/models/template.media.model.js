import mongoose from "mongoose";

// El archivo de la cabecera de una plantilla (imagen, vídeo o documento). La
// plantilla apunta al suyo (`Template.headerMedia`) y una campaña guarda el
// que tenía al crearse (`Campaign.template.headerMedia`): por eso cambiar la
// imagen crea un documento nuevo y nunca borra el anterior, que una campaña en
// curso puede seguir usando.
const templateMediaSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    // Ruta dentro de MEDIA_DIR: `templates/<sha256>.<ext>`.
    file: { type: String, required: true },
    mimeType: { type: String, required: true },
    // El nombre original: el contacto lo ve al abrir un documento.
    filename: { type: String, default: null },
    size: { type: Number, required: true },
    // El id que dio Meta al subirlo, de qué número y cuándo. Se reutiliza en
    // cada envío hasta que caduca (ver `isMetaMediaFresh`).
    metaMediaId: { type: String, default: null },
    metaPhoneNumberId: { type: String, default: null },
    metaUploadedAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model('TemplateMedia', templateMediaSchema);
