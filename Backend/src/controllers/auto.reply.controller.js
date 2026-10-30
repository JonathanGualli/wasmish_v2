import mongoose from "mongoose";
import AutoReplySettings from "../models/auto.reply.settings.model.js";
import Line from "../models/line.model.js";
import { autoReplyPreviewSchema, autoReplySettingsSchema } from "../schemas/auto.reply.schema.js";
import { defaultAutoReplySettings, simulateConversation } from "../utils/auto.reply.js";
import { WEEK_DAYS } from "../utils/business.hours.js";

// ---------------------------------------------------------------------------
// La configuración de las respuestas automáticas de la cuenta: verla,
// guardarla entera y probarla sin guardar. Solo owner y admin
// (`autoReplies.manage`, en la ruta). Enviar lo hace el worker.
// ---------------------------------------------------------------------------

const sendError = (res, status, message) => res.status(status).json([{ message }]);

// Lo que ve la página, campo a campo: ni `_id` ni `userId` ni marcas internas.
// `configured`: si la cuenta ya guardó alguna vez (sin eso, la página abre el asistente).
const serializeSettings = (settings, configured) => ({
    configured,
    enabled: settings.enabled,
    timezone: settings.timezone,
    handoffHours: settings.handoffHours,
    welcome: {
        enabled: settings.welcome.enabled,
        text: settings.welcome.text,
        returnAfterDays: settings.welcome.returnAfterDays ?? null,
    },
    outOfHours: {
        enabled: settings.outOfHours.enabled,
        text: settings.outOfHours.text,
        schedule: Object.fromEntries(WEEK_DAYS.map(day => {
            const entry = settings.outOfHours.schedule?.[day] ?? { closed: true, ranges: [] };
            return [day, { closed: entry.closed, ranges: entry.ranges.map(({ start, end }) => ({ start, end })) }];
        })),
    },
    keywordRules: settings.keywordRules.map(rule => ({
        id: String(rule._id),
        enabled: rule.enabled,
        keywords: rule.keywords,
        text: rule.text,
        lineIds: rule.lineIds.map(String),
    })),
    // Sin el campo (guardada antes de que existiera): apagado.
    fallback: {
        enabled: settings.fallback?.enabled ?? false,
        text: settings.fallback?.text ?? '',
    },
});

const findSettings = (accountId) => AutoReplySettings.findOne({ userId: accountId }).lean();

// GET /auto-replies — sin documento, las de por defecto (apagadas).
export const getAutoReplies = async (req, res) => {
    try {
        const settings = await findSettings(req.auth.accountId);
        return res.json(serializeSettings(settings ?? defaultAutoReplySettings(), Boolean(settings)));
    } catch (error) {
        console.error('Error leyendo las respuestas automáticas:', error.message);
        return sendError(res, 500, error.message);
    }
};

// PUT /auto-replies — reemplaza la configuración entera.
export const saveAutoReplies = async (req, res) => {
    try {
        const accountId = req.auth.accountId;
        const data = autoReplySettingsSchema.parse(req.body);

        // Una regla solo puede apuntar a líneas de esta cuenta: una ajena es
        // una línea que no existe (404), como en el resto de la API.
        const lineIds = [...new Set(data.keywordRules.flatMap(rule => rule.lineIds))];
        if (lineIds.length > 0) {
            const owned = await Line.countDocuments({ _id: { $in: lineIds }, accountId });
            if (owned !== lineIds.length) return sendError(res, 404, 'Línea no encontrada');
        }

        // Las reglas que ya tenían id lo conservan: con él se recuerda en cada
        // conversación cuándo respondió (`Conversation.bot.keywordRepliedAt`).
        const keywordRules = data.keywordRules.map(({ id, ...rule }) => ({
            _id: id ?? new mongoose.Types.ObjectId(),
            ...rule,
        }));

        const saved = await AutoReplySettings.findOneAndUpdate(
            { userId: accountId },
            { $set: { ...data, keywordRules } },
            { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
        ).lean();
        return res.json(serializeSettings(saved, true));
    } catch (error) {
        console.error('Error guardando las respuestas automáticas:', error.message);
        return sendError(res, 500, error.message);
    }
};

/**
 * POST /auto-replies/preview — qué respondería ahora `settings` (sin guardar)
 * a un contacto nuevo que escribe `messages`, mensaje a mensaje
 * (`simulateConversation`): `{ turns }`. No envía ni guarda nada.
 */
export const previewAutoReply = (req, res) => {
    const { settings, messages } = autoReplyPreviewSchema.parse(req.body);
    return res.json({ turns: simulateConversation({ settings, messages }) });
};
