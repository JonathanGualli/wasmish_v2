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
    // La línea de `phoneNumberId` (Fase 2a de multi-línea: se guarda,
    // todavía no se usa para enrutar). null hasta que `migrate:lines` la ponga.
    lineId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Line',
        default: null,
        index: true,
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
    },
    // Quién la atiende (Fase 4 de multi-línea): null = sin asignar, también
    // en las anteriores al campo. El agente ve solo las sin asignar y las
    // suyas (`conversationScope`). Lo escribe solo services/assignment.service.js.
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    assignedAt: {
        type: Date,
        default: null,
    },
    // Quién hizo el último cambio de asignación (null al liberarla porque esa
    // persona perdió el acceso).
    assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    // La solicitud de transferencia pendiente: una sola, y una nueva reemplaza
    // a la anterior. `id` es nuevo en cada una: aceptar y rechazar lo exigen,
    // para no resolver una distinta de la que se ve (revisión de Codex del plan).
    transferRequest: {
        type: new mongoose.Schema({
            id: { type: mongoose.Schema.Types.ObjectId, required: true },
            requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            requestedAt: { type: Date, required: true },
        }, { _id: false }),
        default: undefined,
    },
    // El estado de las respuestas automáticas en esta conversación (ver
    // docs/arquitectura/respuestas-automaticas.md). Solo existe si alguna vez
    // respondió una persona o el bot.
    bot: {
        type: new mongoose.Schema({
            // La última respuesta manual desde el chat: el bot se calla `handoffHours`.
            humanRepliedAt: { type: Date, default: null },
            // Cuándo autorizó el bot su último envío (`authorizeBotSend`).
            authorizedAt: { type: Date, default: null },
            // La clave del último tramo cerrado avisado (`closedPeriodKey`).
            outOfHoursNotified: { type: String, default: null },
            // Id de regla → cuándo respondió aquí.
            keywordRepliedAt: { type: Map, of: Date, default: undefined },
            // El último «no entiendo»: sale una vez cada `handoffHours`.
            fallbackRepliedAt: { type: Date, default: null },
            // Las últimas respuestas del bot, para el freno.
            recentReplies: { type: [Date], default: undefined },
        }, { _id: false }),
        default: undefined,
    },
}, { 
    timestamps: true,
});

// Una conversación por contacto y LÍNEA (Fase 2b de multi-línea): el mismo
// contacto tiene una en cada número de la cuenta, cada una con su historial y
// su ventana. Antes la clave era el teléfono, pero un contacto puede no tenerlo
// (ver utils/contact.identity.js). Es PARCIAL para que las conversaciones sin
// contactId (anteriores a los contactos) o sin lineId (anteriores a las
// líneas) no choquen entre sí. Mongoose no borra el índice anterior,
// `conversation_contact_unique` ({ userId, contactId }): lo borra `migrate:lines`.
conversationSchema.index(
    { userId: 1, lineId: 1, contactId: 1 },
    {
        name: 'conversation_line_contact_unique',
        unique: true,
        partialFilterExpression: { contactId: { $type: 'objectId' }, lineId: { $type: 'objectId' } },
    },
);
// Las que nacen SIN línea (la reserva del webhook: un número sin `Line`) son una
// por contacto y NÚMERO: el índice de arriba no las cubre, y dos entrantes a la
// vez de un contacto nuevo crearían dos. Por número y no por contacto, porque
// cada número tiene su historial y su ventana. Otras claves que el índice
// viejo `{ userId, contactId }`: Mongo no admite dos índices con las mismas,
// y los dos conviven mientras `migrate:lines` cambia uno por otro.
conversationSchema.index(
    { userId: 1, contactId: 1, phoneNumberId: 1 },
    {
        name: 'conversation_contact_number_without_line_unique',
        unique: true,
        partialFilterExpression: { contactId: { $type: 'objectId' }, lineId: { $type: 'null' } },
    },
);

// Las conversaciones de una persona, para soltarlas cuando pierde el acceso
// (Fase 4). Parcial: la mayoría no tiene a nadie.
conversationSchema.index(
    { userId: 1, assignedTo: 1 },
    { name: 'conversation_assignee', partialFilterExpression: { assignedTo: { $type: 'objectId' } } },
);

export default mongoose.model('Conversation', conversationSchema);