import { findAccountOwner } from "../services/account.service.js";
import { encrypt } from "../utils/crypto.js";
import { exchangeCodeForToken, subscribeAppToWaba } from "../libs/whatsapp.js";
import {
    isPhoneNumberTaken, isWabaTaken, claimWaba, verifyWabaPhoneNumber, syncLinesAfterConnecting, PHONE_NUMBER_TAKEN_MESSAGE, WABA_TAKEN_MESSAGE,
} from "../services/whatsapp.connection.service.js";

// La respuesta de error de las dos formas de conectar (esta y el formulario
// manual, en user.controller.js). El 11000 es el índice único de
// `User.phoneNumberId`: otra conexión se quedó el número entre la comprobación
// y el guardado.
export const connectionErrorResponse = (res, error) => {
    if (error.code === 11000) return res.status(409).json([{ message: PHONE_NUMBER_TAKEN_MESSAGE }]);
    const status = error.statusCode || (error.waErrorCode ? 502 : 500);
    if (status >= 500) console.error('Conectar WhatsApp falló:', error.waErrorDetail ?? error.message);
    return res.status(status).json([{ message: error.message, errorCode: error.waErrorCode ?? null }]);
};

export const connectWhatsappEmbedded = async (req, res) => {
    try {
        const { code, phoneNumberId, waBusinessId } = req.body;

        // La conexión es de la cuenta y la guarda su owner (hasta la Fase 2).
        const user = await findAccountOwner(req.auth.accountId);
        if (!user) return res.status(404).json([{ message: "User not found" }]);

        // 1. El número no puede estar en otra cuenta. Va antes que todo lo
        //    demás: no hace falta molestar a Meta para saberlo. Con el `_id`
        //    del owner, no el de la cuenta: si no, renovar el token del propio
        //    número daría 409.
        if (await isPhoneNumberTaken(user._id, phoneNumberId)) {
            return res.status(409).json([{ message: PHONE_NUMBER_TAKEN_MESSAGE }]);
        }
        if (await isWabaTaken(req.auth.accountId, waBusinessId)) {
            return res.status(409).json([{ message: WABA_TAKEN_MESSAGE }]);
        }

        // 2. Canjear el "code" por el token permanente
        const accessToken = await exchangeCodeForToken(code);
        if ( !accessToken ) return res.status(400).json([{message: 'No se pudo obtener el token de Meta'}]);

        // 3. El número tiene que ser del WABA de ese token. Antes de suscribir
        //    la app: si no lo es, no se toca nada en Meta.
        const line = await verifyWabaPhoneNumber({ token: accessToken, waBusinessId, phoneNumberId });
        // El WABA para esta cuenta, antes de suscribir la app y de guardar nada.
        await claimWaba(req.auth.accountId, waBusinessId);

        // 4. Subir la app a los whebhooks del whatsapp del cliente
        await subscribeAppToWaba( { token: accessToken, waBusinessId } );

        // 5. Guardar credenciales (token cifrado) en el usuario
        user.tokenWhatsapp = encrypt(accessToken);
        user.phoneNumberId = phoneNumberId;
        user.waBusinessId = waBusinessId;
        await user.save();
        await syncLinesAfterConnecting(req.auth.accountId, line);

        return res.json({
            message: "WhatsApp conectado correctamente",
            phoneNumberId,
            waBusinessId,
        });

    } catch (error) {
        return connectionErrorResponse(res, error);
    }
}
