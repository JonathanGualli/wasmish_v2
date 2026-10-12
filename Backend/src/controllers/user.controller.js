import { findAccountOwner } from "../services/account.service.js";
import { encrypt } from "../utils/crypto.js";
import {
    isPhoneNumberTaken, isWabaTaken, verifyWabaPhoneNumber, syncLinesAfterConnecting, PHONE_NUMBER_TAKEN_MESSAGE, WABA_TAKEN_MESSAGE,
} from "../services/whatsapp.connection.service.js";
import { connectionErrorResponse } from "./whatsapp.controller.js";


// El formulario manual de Ajustes: las mismas comprobaciones que el Embedded
// Signup (whatsapp.controller.js), con el token que pega el usuario.
export const updateUserTokenWhatsapp = async (req, res) => {
    const { tokenWhatsapp, phoneNumberId, waBusinessId } = req.body;

    try {
        // La conexión es de la cuenta y la guarda su owner (hasta la Fase 2).
        const userFound = await findAccountOwner(req.auth.accountId);

        if (!userFound) return res.status(404).json([{ message: 'User not found' }]);

        // El `_id` del usuario que guarda la conexión, no el de la cuenta: con
        // el de la cuenta, renovar el token del propio número daría 409.
        if (await isPhoneNumberTaken(userFound._id, phoneNumberId)) {
            return res.status(409).json([{ message: PHONE_NUMBER_TAKEN_MESSAGE }]);
        }
        if (await isWabaTaken(req.auth.accountId, waBusinessId)) {
            return res.status(409).json([{ message: WABA_TAKEN_MESSAGE }]);
        }

        const line = await verifyWabaPhoneNumber({ token: tokenWhatsapp, waBusinessId, phoneNumberId });

        // Encript the token before saving
        userFound.tokenWhatsapp = encrypt(tokenWhatsapp);
        userFound.phoneNumberId = phoneNumberId;
        userFound.waBusinessId = waBusinessId;

        await userFound.save();
        await syncLinesAfterConnecting(req.auth.accountId, line);

        return res.json({ message: 'Token updated successfully' });
    } catch (error) {
        return connectionErrorResponse(res, error);
    }
}
