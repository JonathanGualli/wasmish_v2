import mongoose from 'mongoose';

// Un contacto de la agenda del celular de la app de WhatsApp Business, tal como
// llega en el webhook `smb_app_state_sync`. Se guarda aunque no tenga chat: no
// entra a Contactos, pero nombra a quien escriba después (`applyAgendaName`).
// Una agenda por cuenta: con dos líneas de la app, gana el cambio más nuevo.
// Spec: docs/superpowers/specs/2026-10-23-historial-coexistencia-design.md (§ 5 y 7).
const agendaEntrySchema = new mongoose.Schema({
    // La cuenta, como en todos los modelos.
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        required: true,
    },
    // Solo dígitos, con código de país (como `Contact.phone`).
    phone: { type: String, required: true },
    fullName: { type: String, default: null },
    firstName: { type: String, default: null },
    // El negocio lo borró de la agenda: el contacto se queda sin `agendaName`.
    removed: { type: Boolean, default: false },
    // La hora del cambio en el celular (`metadata.timestamp`): Meta no garantiza
    // el orden, y uno más viejo que este no se aplica.
    syncedAt: { type: Date, required: true },
}, {
    timestamps: true,
});

agendaEntrySchema.index({ userId: 1, phone: 1 }, { name: 'agenda_entry_unique', unique: true });

export default mongoose.model('AgendaEntry', agendaEntrySchema);
