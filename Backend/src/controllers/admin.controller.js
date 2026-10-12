import mongoose from "mongoose";
import Account from "../models/account.model.js";
import Line from "../models/line.model.js";
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
            // Las cuentas con alguna línea activa (Fase 2c: `Line` es la fuente).
            Line.distinct('accountId', { status: 'active' }).then(ids => ids.length),
            Message.countDocuments({ timestamp: { $gte: desde } }),
            Message.countDocuments({ status: 'failed', timestamp: { $gte: desde } }),
        ]);

        return res.json({ totalClients, connectedClients, messages7d, failed7d });
    } catch (error) {
        return res.status(500).json([{ message: error.message }]);
    }
}

// Listado paginado de clientes con sus agregados.
// NUNCA devuelve tokenWhatsapp (ni lo lee), texto de mensajes ni teléfonos de contactos.
export const listClients = async (req, res) => {
    try {
        const page  = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
        const skip  = (page - 1) * limit;

        const [users, totalCount] = await Promise.all([
            User.find({})
                .select('name email rol status accountId waBusinessId createdAt')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            User.countDocuments({}),
        ]);

        // Los datos cuelgan de la cuenta (`userId` = cuenta), no del usuario: en
        // una cuenta migrada coinciden, pero no tienen por qué.
        const accountIds = users.map(u => u.accountId);

        // Las líneas activas y el máximo de cada cuenta (Fase 2c).
        const [accounts, activeLines] = await Promise.all([
            Account.find({ _id: { $in: accountIds } }).select('limits').lean(),
            Line.aggregate([
                { $match: { accountId: { $in: accountIds.filter(Boolean) }, status: 'active' } },
                { $group: { _id: '$accountId', active: { $sum: 1 }, wabas: { $addToSet: '$wabaId' } } },
            ]),
        ]);
        const maxLinesOf = new Map(accounts.map(a => [String(a._id), a.limits?.maxLines ?? 1]));
        const activeLinesOf = new Map(activeLines.map(l => [String(l._id), l]));

        // Conversaciones solo de las cuentas de ESTA página (usa el índice userId)
        const conversations = await Conversation.find({ userId: { $in: accountIds } })
            .select('_id userId lastMessageAt')
            .lean();

        const convIds = conversations.map(c => c._id);
        // conversationId -> cuenta, para plegar los mensajes por cliente
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

        // Acumuladores por cuenta
        const perUser = new Map(
            accountIds.map(id => [String(id), { conversations: 0, messages: 0, failed: 0, lastActivityAt: null }])
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
            const entry = perUser.get(String(u.accountId));
            const lines = activeLinesOf.get(String(u.accountId));
            return {
                id: String(u._id),
                accountId: u.accountId ? String(u.accountId) : null,
                name: u.name,
                email: u.email,
                rol: u.rol,
                status: u.status,
                // Conectado = con alguna línea activa (Fase 2c: `Line` es la fuente).
                whatsappConnected: Boolean(lines),
                // El WABA de la línea por defecto (la copia en User) y cuántos más tiene.
                waBusinessId: maskId(u.waBusinessId),
                extraWabas: Math.max((lines?.wabas.filter(Boolean).length ?? 0) - 1, 0),
                lines: { active: lines?.active ?? 0, max: maxLinesOf.get(String(u.accountId)) ?? 1 },
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

// PATCH /admin/accounts/:accountId/limits — cuántas líneas puede tener la cuenta
// (el plan comercial: el cobro va fuera de Wasmish). Bajarlo no desconecta
// nada: solo impide conectar otra mientras esté por encima.
export const updateAccountLimits = async (req, res) => {
    try {
        const { accountId } = req.params;
        const account = mongoose.isValidObjectId(accountId)
            ? await Account.findOneAndUpdate(
                { _id: accountId },
                { $set: { 'limits.maxLines': req.body.maxLines } },
                { new: true, projection: { limits: 1 } },
            ).lean()
            : null;
        if (!account) return res.status(404).json([{ message: 'La cuenta no existe.' }]);

        return res.json({ accountId: String(account._id), maxLines: account.limits.maxLines });
    } catch (error) {
        return res.status(500).json([{ message: error.message }]);
    }
}
