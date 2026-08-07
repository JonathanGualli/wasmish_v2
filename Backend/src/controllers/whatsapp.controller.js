import User from "../models/user.model.js";
import { encrypt } from "../utils/crypto.js";
import { exchangeCodeForToken, subscribeAppToWaba } from "../libs/whatsapp.js";

export const connectWhatsappEmbedded = async (req, res) => {
    try {
        const userId = req.user.id;
        const { code, phoneNumberId, waBusinessId } = req.body;

        // 1. Canjear el "code" por el token permanente
        const accessToken = await exchangeCodeForToken(code);
        if ( !accessToken ) return res.status(400).json([{message: 'No se pudo obtener el token de Meta'}]);

        // 2. Subir la app a los whebhooks del whatsapp del cliente
        await subscribeAppToWaba( { token: accessToken, waBusinessId } );

        // 3. Guardar credenciales (token cifrado) en el usuario
        const user = await User.findById(userId);
        if (!user) return res.status(404).json([{ message: "User not found" }]);

        user.tokenWhatsapp = encrypt(accessToken);
        user.phoneNumberId = phoneNumberId;
        user.waBusinessId = waBusinessId;
        await user.save();

        return res.json({
            message: "WhatsApp conectado correctamente",
            phoneNumberId,
            waBusinessId,
        });

    } catch (error) {
        return res.status(500).json([{message: error.message}]);
    }
}