import Notification from "../models/notification.model.js";
import { sendToUser } from "./stream.controller.js";
import { serializeNotifications, unseenCountOf } from "../services/assignment.history.service.js";
import { NOTIFICATIONS_PER_PAGE, decodeCursor, encodeCursor } from "../utils/conversation.events.js";

// Los avisos de la campanita (avisos de la asignación, spec § 5.2). Cada
// persona ve y marca solo los suyos: todo filtra por la cuenta y por quien mira.

/** GET /notifications?before=<cursor>: los de quien mira, 30 por página, con cuántos no vio de todos. */
export const listNotifications = async (req, res) => {
    const { accountId, userId } = req.auth;
    let cursor = null;
    if (req.query.before !== undefined) {
        cursor = decodeCursor(String(req.query.before));
        if (!cursor) return res.status(400).json([{ message: 'El cursor no es válido.', code: 'invalid_cursor' }]);
    }
    try {
        const filter = { userId: accountId, recipientId: userId };
        if (cursor) {
            filter.$or = [
                { createdAt: { $lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
            ];
        }
        const docs = await Notification.find(filter).sort({ createdAt: -1, _id: -1 }).limit(NOTIFICATIONS_PER_PAGE + 1).lean();
        const page = docs.slice(0, NOTIFICATIONS_PER_PAGE);
        const [items, unseenCount] = await Promise.all([
            serializeNotifications(req.auth, page),
            unseenCountOf(accountId, userId),
        ]);
        return res.json({
            items,
            nextCursor: docs.length > NOTIFICATIONS_PER_PAGE ? encodeCursor(page[page.length - 1]) : null,
            unseenCount,
        });
    } catch (error) {
        return res.status(500).json([{ message: error.message }]);
    }
};

/**
 * POST /notifications/seen: marca como vistos unos (`ids`) o todos (`all`).
 * Un id de otra persona o de otra cuenta no cambia nada, y no se distingue de
 * uno que no existe. Avisa a sus otras pestañas y dispositivos.
 */
export const markNotificationsSeen = async (req, res) => {
    const { accountId, userId } = req.auth;
    try {
        const filter = { userId: accountId, recipientId: userId, seenAt: null };
        if (!req.body.all) filter._id = { $in: req.body.ids };
        await Notification.updateMany(filter, { $set: { seenAt: new Date() } });
        const unseenCount = await unseenCountOf(accountId, userId);
        sendToUser(String(accountId), String(userId), 'notifications_seen', { unseenCount });
        return res.json({ unseenCount });
    } catch (error) {
        return res.status(500).json([{ message: error.message }]);
    }
};
