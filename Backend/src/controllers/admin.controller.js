import User from "../models/user.model.js";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";

const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

// 27766810686305175 -> "2776…175". Identifica la cuenta sin exponer el ID completo.
const maskId = (value) => {
    if (!value) return null;
    if (value.length <= 8) return value;
    return `${value.slice(0, 4)}…${value.slice(-3)}`;
}

// Métricas globales de la plataforma (los 4 tiles de arriba)
export const getPlatformStats = async (req, res) => {
    try {
        const desde = new Date(Date.now() - SIETE_DIAS_MS);

        const [totalClients, connectedClients, messages7d, failed7d] = await Promise.all([
            User.countDocuments({}),
            User.countDocuments({ tokenWhatsapp: { $ne: null } }),
            Message.countDocuments({ timestamp: { $gte: desde } }),
            Message.countDocuments({ status: 'failed', timestamp: { $gte: desde } }),
        ]);

        return res.json({ totalClients, connectedClients, messages7d, failed7d });
    } catch (error) {
        return res.status(500).json([{ message: error.message }]);
    }
}

// Listado paginado de clientes con sus agregados.
// NUNCA devuelve tokenWhatsapp, texto de mensajes ni teléfonos de contactos.
export const listClients = async (req, res) => {
    try {
        const page  = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
        const skip  = (page - 1) * limit;

        const [users, totalCount] = await Promise.all([
            User.find({})
                .select('name email rol status tokenWhatsapp waBusinessId createdAt')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            User.countDocuments({}),
        ]);

        const userIds = users.map(u => u._id);

        // Conversaciones solo de los usuarios de ESTA página (usa el índice userId)
        const conversations = await Conversation.find({ userId: { $in: userIds } })
            .select('_id userId lastMessageAt')
            .lean();

        const convIds = conversations.map(c => c._id);
        // conversationId -> userId, para plegar los mensajes por cliente
        const convOwner = new Map(conversations.map(c => [String(c._id), String(c.userId)]));

        // Mensajes agrupados por conversación (usa el índice conversationId)
        const messageStats = convIds.length === 0 ? [] : await Message.aggregate([
            { $match: { conversationId: { $in: convIds } } },
            {
                $group: {
                    _id: '$conversationId',
                    messages: { $sum: 1 },
                    failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
                }
            },
        ]);

        // Acumuladores por usuario
        const perUser = new Map(
            userIds.map(id => [String(id), { conversations: 0, messages: 0, failed: 0, lastActivityAt: null }])
        );

        for (const conv of conversations) {
            const entry = perUser.get(String(conv.userId));
            if (!entry) continue;
            entry.conversations += 1;
            if (conv.lastMessageAt && (!entry.lastActivityAt || conv.lastMessageAt > entry.lastActivityAt)) {
                entry.lastActivityAt = conv.lastMessageAt;
            }
        }

        for (const stat of messageStats) {
            const ownerId = convOwner.get(String(stat._id));
            const entry = ownerId ? perUser.get(ownerId) : null;
            if (!entry) continue;
            entry.messages += stat.messages;
            entry.failed += stat.failed;
        }

        const clients = users.map(u => {
            const entry = perUser.get(String(u._id));
            return {
                id: String(u._id),
                name: u.name,
                email: u.email,
                rol: u.rol,
                status: u.status,
                whatsappConnected: Boolean(u.tokenWhatsapp), // el token se lee pero NO se devuelve
                waBusinessId: maskId(u.waBusinessId),
                conversations: entry.conversations,
                messages: entry.messages,
                failed: entry.failed,
                lastActivityAt: entry.lastActivityAt,
                createdAt: u.createdAt,
            };
        });

        return res.json({ clients, totalCount, page, limit });
    } catch (error) {
        return res.status(500).json([{ message: error.message }]);
    }
}
