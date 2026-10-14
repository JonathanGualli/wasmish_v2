import mongoose from "mongoose";
import Account from "../models/account.model.js";
import Line from "../models/line.model.js";
import Waba from "../models/waba.model.js";
import { disconnectLine, updateLineSettings } from "../services/line.service.js";
import { decrypt } from "../utils/crypto.js";
import { cleanLineName, nextDefaultLine } from "../utils/line.js";
import { LINE_ERROR_CODES, LINE_NOT_FOUND_MESSAGE } from "../utils/whatsapp.line.js";

// ---------------------------------------------------------------------------
// Las líneas de la cuenta (Fase 2c de multi-línea): listarlas, ponerles
// nombre, elegir la por defecto y desconectarlas. Conectar sigue en
// whatsapp.controller.js (Embedded Signup) y user.controller.js (a mano).
// Hasta la Fase 3 lo puede hacer cualquier usuario de la cuenta.
// ---------------------------------------------------------------------------

const sendError = (res, error) => {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('Líneas:', error.message);
    return res.status(status).json([{ message: error.message, code: error.code ?? null }]);
};

const sendNotFound = (res) => res.status(404).json([{ message: LINE_NOT_FOUND_MESSAGE, code: LINE_ERROR_CODES.notFound }]);

/** La línea para el frontend. Nunca el token ni el PIN: solo si hay PIN guardado. */
export const serializeLine = (line, { defaultLineId, waba }) => ({
    id: String(line._id),
    name: line.name ?? null,
    phoneNumberId: line.phoneNumberId,
    displayPhoneNumber: line.displayPhoneNumber ?? null,
    verifiedName: line.verifiedName ?? null,
    status: line.status,
    isDefault: Boolean(defaultLineId) && String(defaultLineId) === String(line._id),
    waBusinessId: waba?.waBusinessId ?? null,
    // El orden de conexión (el color de la línea en la UI) y las fechas que se enseñan.
    createdAt: line.createdAt,
    connectedAt: line.connectedAt ?? null,
    disconnectedAt: line.disconnectedAt ?? null,
    // Si Wasmish guardó el PIN de dos pasos al registrar el número: la UI dice
    // «Sin PIN guardado» sin pedirlo. El PIN, solo en GET /lines/:id/pin.
    hasTwoStepPin: Boolean(line.twoStepPin),
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

        // La que pasaría a ser la por defecto si se desconecta la actual: el
        // diálogo de desconectar lo dice («La API pasará a enviar por…»).
        const nextDefault = account?.defaultLineId ? nextDefaultLine(lines, account.defaultLineId) : null;

        return res.json({
            lines: serialized,
            maxLines: account?.limits?.maxLines ?? 1,
            nextDefaultLineId: nextDefault ? String(nextDefault._id) : null,
        });
    } catch (error) {
        return sendError(res, error);
    }
};

// PATCH /lines/:id — `name` (null o vacío lo quita) y/o `isDefault: true`.
export const updateLine = async (req, res) => {
    try {
        const { accountId } = req.auth;
        const line = await findOwnedLine(accountId, req.params.id);
        if (!line) return sendNotFound(res);

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
        if (!line) return sendNotFound(res);

        await disconnectLine(accountId, line._id);
        return res.json(await serializeAccountLine(accountId, await Line.findById(line._id).lean()));
    } catch (error) {
        return sendError(res, error);
    }
};

// GET /lines/:id/pin — el PIN de la verificación en dos pasos con el que Wasmish
// registró el número (`registerIfNeeded`); el cliente lo necesita para llevarse
// el número. null si el número ya estaba registrado al conectarlo. Va aparte de
// GET /lines para que solo salga cuando se pide.
export const getLinePin = async (req, res) => {
    try {
        const line = await findOwnedLine(req.auth.accountId, req.params.id);
        if (!line) return sendNotFound(res);
        return res.json({ pin: line.twoStepPin ? decrypt(line.twoStepPin) : null });
    } catch (error) {
        return sendError(res, error);
    }
};
