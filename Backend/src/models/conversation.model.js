import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true, 
        index: true
    },
    // El índice simple es para el $lookup de la lista de contactos, que busca
    // solo por contactId: el compuesto { userId, contactId } no le sirve.
    contactId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Contact',
        default: null,
        index: true,
    },
    // Copia del teléfono del contacto. Se puede copiar sin miedo a que se
    // desincronice porque, una vez hay conversación, el teléfono ya no cambia.
    // Es null cuando la persona escribió con su nombre de usuario y Meta no
    // mandó el número.
    contactPhone: { 
        type: String, 
        default: null,
        index: true,
    },
    // OBSOLETO: el nombre vive en Contact. Solo lo leen `backfill:contacts` y el
    // enlace de las conversaciones anteriores a los contactos (`linkConversation`).
    contactName: {
        type: String, 
        default: null,
    },
    phoneNumberId: {
        type: String, 
        required: true,
    },
    lastMessage: { 
        type: String, 
        default: '',
    },
    unreadCount: { 
        type: Number, 
        default: 0,
    },
    lastMessageAt: { 
        type: Date, 
        default: Date.now,
    },
    lastInboundAt: {
        type: Date,
        default: null,
    }
}, { 
    timestamps: true,
});

// Una conversación por contacto y cuenta. Antes la clave era el teléfono, pero
// un contacto puede no tenerlo (ver utils/contact.identity.js). Es PARCIAL para
// que las conversaciones anteriores a los contactos, aún sin contactId, no
// choquen entre sí; `npm run backfill:contacts` las enlaza todas y borra el
// índice viejo `userId_1_contactPhone_1`.
conversationSchema.index(
    { userId: 1, contactId: 1 },
    { name: 'conversation_contact_unique', unique: true, partialFilterExpression: { contactId: { $type: 'objectId' } } },
);

export default mongoose.model('Conversation', conversationSchema);