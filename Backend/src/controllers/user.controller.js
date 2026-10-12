import User from "../models/user.model.js";
import { encrypt } from "../utils/crypto.js";
import { isPhoneNumberTaken, verifyWabaPhoneNumber, PHONE_NUMBER_TAKEN_MESSAGE } from "../services/whatsapp.connection.service.js";
import { connectionErrorResponse } from "./whatsapp.controller.js";


// El formulario manual de Ajustes: las mismas comprobaciones que el Embedded
// Signup (whatsapp.controller.js), con el token que pega el usuario.
export const updateUserTokenWhatsapp = async (req, res) => {
    const { tokenWhatsapp, phoneNumberId, waBusinessId } = req.body;
    const userId = req.user.id;

    try {
        const userFound = await User.findById(userId);

        if (!userFound) return res.status(404).json([{ message: 'User not found' }]);

        if (await isPhoneNumberTaken(userId, phoneNumberId)) {
            return res.status(409).json([{ message: PHONE_NUMBER_TAKEN_MESSAGE }]);
        }

        await verifyWabaPhoneNumber({ token: tokenWhatsapp, waBusinessId, phoneNumberId });

        // Encript the token before saving
        userFound.tokenWhatsapp = encrypt(tokenWhatsapp);
        userFound.phoneNumberId = phoneNumberId;
        userFound.waBusinessId = waBusinessId;

        await userFound.save();

        return res.json({ message: 'Token updated successfully' });
    } catch (error) {
        return connectionErrorResponse(res, error);
    }
}
