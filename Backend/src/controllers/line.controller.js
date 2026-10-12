import mongoose from "mongoose";
import Account from "../models/account.model.js";
import Line from "../models/line.model.js";
import Waba from "../models/waba.model.js";
import { disconnectLine, updateLineSettings } from "../services/line.service.js";
import { cleanLineName } from "../utils/line.js";
import { LINE_NOT_FOUND_MESSAGE } from "../utils/whatsapp.line.js";

// ---------------------------------------------------------------------------
// Las líneas de la cuenta (Fase 2c de multi-línea): listarlas, ponerles
// nombre, elegir la por defecto y desconectarlas. Conectar sigue en
// whatsapp.controller.js (Embedded Signup) y user.controller.js (a mano).
// Hasta la Fase 3 lo puede hacer cualquier usuario de la cuenta.
// ---------------------------------------------------------------------------

const sendError = (res, error) => {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('Líneas:', error.message);
    return res.status(status).json([{ message: error.message }]);
};

/** La línea para el frontend. Nunca el token. */
export const serializeLine = (line, { defaultLineId, waba }) => ({
    id: String(line._id),
    name: line.name ?? null,
    phoneNumberId: line.phoneNumberId,
    displayPhoneNumber: line.displayPhoneNumber ?? null,
    verifiedName: line.verifiedName ?? null,
    status: line.status,
    isDefault: Boolean(defaultLineId) && String(defaultLineId) === String(line._id),
    waBusinessId: waba?.waBusinessId ?? null,
});

const serializeAccountLine = async (accountId, line) => {
    const account = await Account.findById(accountId).select('defaultLineId').lean();
    const waba = line.wabaId ? await Waba.findById(line.wabaId).lean() : null;
    return serializeLine(line, { defaultLineId: account?.defaultLineId, waba });
};

// Un id mal formado es una línea que no existe: 404, no un CastError (500).
const findOwnedLine = (accountId, id) =>
    mongoose.isValidObjectId(id) ? Line.findOne({ _id: id, accountId }).lean() : null;

// GET /lines — todas, también las desconectadas (con su historial): las
// activas primero, la por defecto la primera; después, por antigüedad.
export const listLines = async (req, res) => {
    try {
        const { accountId } = req.auth;
        const account = await Account.findById(accountId).select('limits defaultLineId').lean();
        const lines = await Line.find({ accountId }).sort({ createdAt: 1 }).lean();
        const wabas = await Waba.find({ _id: { $in: lines.map(line => line.wabaId).filter(Boolean) }, accountId }).lean();
        const wabaById = new Map(wabas.map(waba => [String(waba._id), waba]));

        const serialized = lines
            .map(line => serializeLine(line, { defaultLineId: account?.defaultLineId, waba: wabaById.get(String(line.wabaId)) }))
            .sort((a, b) => Number(b.isDefault) - Number(a.isDefault)
                || Number(b.status === 'active') - Number(a.status === 'active'));

        return res.json({ lines: serialized, maxLines: account?.limits?.maxLines ?? 1 });
    } catch (error) {
        return sendError(res, error);
    }
};

// PATCH /lines/:id — `name` (null o vacío lo quita) y/o `isDefault: true`.
export const updateLine = async (req, res) => {
    try {
        const { accountId } = req.auth;
        const line = await findOwnedLine(accountId, req.params.id);
        if (!line) return res.status(404).json([{ message: LINE_NOT_FOUND_MESSAGE }]);

        await updateLineSettings(accountId, line._id, {
            name: req.body.name === undefined ? undefined : cleanLineName(req.body.name),
            makeDefault: Boolean(req.body.isDefault),
        });

        return res.json(await serializeAccountLine(accountId, await Line.findById(line._id).lean()));
    } catch (error) {
        return sendError(res, error);
    }
};

// POST /lines/:id/disconnect — deja de enviar y recibir; conserva el historial.
export const disconnectLineController = async (req, res) => {
    try {
        const { accountId } = req.auth;
        const line = await findOwnedLine(accountId, req.params.id);
        if (!line) return res.status(404).json([{ message: LINE_NOT_FOUND_MESSAGE }]);

        await disconnectLine(accountId, line._id);
        return res.json(await serializeAccountLine(accountId, await Line.findById(line._id).lean()));
    } catch (error) {
        return sendError(res, error);
    }
};
