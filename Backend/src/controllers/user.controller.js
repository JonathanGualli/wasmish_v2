import { encrypt } from "../utils/crypto.js";
import {
    isPhoneNumberTaken, isWabaTaken, checkLineLimit, claimWaba, verifyWabaPhoneNumber, PHONE_NUMBER_TAKEN_MESSAGE, WABA_TAKEN_MESSAGE,
} from "../services/whatsapp.connection.service.js";
import { applyConnection } from "../services/line.service.js";
import { connectionErrorResponse } from "./whatsapp.controller.js";


// El formulario manual de Ajustes: las mismas comprobaciones que el Embedded
// Signup (whatsapp.controller.js), con el token que pega el usuario.
export const updateUserTokenWhatsapp = async (req, res) => {
    const { tokenWhatsapp, phoneNumberId, waBusinessId } = req.body;
    const { accountId } = req.auth;

    try {
        if (await isPhoneNumberTaken(accountId, phoneNumberId)) {
            return res.status(409).json([{ message: PHONE_NUMBER_TAKEN_MESSAGE }]);
        }
        if (await isWabaTaken(accountId, waBusinessId)) {
            return res.status(409).json([{ message: WABA_TAKEN_MESSAGE }]);
        }
        await checkLineLimit(accountId, phoneNumberId);

        const details = await verifyWabaPhoneNumber({ token: tokenWhatsapp, waBusinessId, phoneNumberId });
        // El WABA para esta cuenta, antes de guardar nada.
        await claimWaba(accountId, waBusinessId);

        const { lineId } = await applyConnection({
            accountId, waBusinessId, tokenWhatsapp: encrypt(tokenWhatsapp), phoneNumberId, details,
        });

        return res.json({ message: 'Token updated successfully', lineId: String(lineId) });
    } catch (error) {
        return connectionErrorResponse(res, error);
    }
}
