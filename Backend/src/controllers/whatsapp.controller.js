import { encrypt } from "../utils/crypto.js";
import { exchangeCodeForToken, subscribeAppToWaba } from "../libs/whatsapp.js";
import {
    isPhoneNumberTaken, isWabaTaken, checkLineLimit, claimWaba, verifyWabaPhoneNumber, PHONE_NUMBER_TAKEN_MESSAGE, WABA_TAKEN_MESSAGE,
} from "../services/whatsapp.connection.service.js";
import { applyConnection } from "../services/line.service.js";

// La respuesta de error de las dos formas de conectar (esta y el formulario
// manual, en user.controller.js). El 11000 es el índice único de las líneas
// activas (`line_phoneNumberId_active_unique`): otra cuenta se quedó el número
// entre la comprobación y el guardado.
export const connectionErrorResponse = (res, error) => {
    if (error.code === 11000) return res.status(409).json([{ message: PHONE_NUMBER_TAKEN_MESSAGE }]);
    const status = error.statusCode || (error.waErrorCode ? 502 : 500);
    if (status >= 500) console.error('Conectar WhatsApp falló:', error.waErrorDetail ?? error.message);
    return res.status(status).json([{ message: error.message, errorCode: error.waErrorCode ?? null }]);
};

export const connectWhatsappEmbedded = async (req, res) => {
    try {
        const { code, phoneNumberId, waBusinessId } = req.body;
        const { accountId } = req.auth;

        // 1. Lo que se sabe sin molestar a Meta: el número y el WABA no pueden
        //    estar en otra cuenta, y el número tiene que caber en el plan.
        if (await isPhoneNumberTaken(accountId, phoneNumberId)) {
            return res.status(409).json([{ message: PHONE_NUMBER_TAKEN_MESSAGE }]);
        }
        if (await isWabaTaken(accountId, waBusinessId)) {
            return res.status(409).json([{ message: WABA_TAKEN_MESSAGE }]);
        }
        await checkLineLimit(accountId, phoneNumberId);

        // 2. Canjear el "code" por el token permanente
        const accessToken = await exchangeCodeForToken(code);
        if ( !accessToken ) return res.status(400).json([{message: 'No se pudo obtener el token de Meta'}]);

        // 3. El número tiene que ser del WABA de ese token. Antes de suscribir
        //    la app: si no lo es, no se toca nada en Meta.
        const details = await verifyWabaPhoneNumber({ token: accessToken, waBusinessId, phoneNumberId });
        // El WABA para esta cuenta, antes de suscribir la app y de guardar nada.
        await claimWaba(accountId, waBusinessId);

        // 4. Subir la app a los whebhooks del whatsapp del cliente
        await subscribeAppToWaba( { token: accessToken, waBusinessId } );

        // 5. La línea, con el token (cifrado) en su WABA
        const { lineId } = await applyConnection({
            accountId, waBusinessId, tokenWhatsapp: encrypt(accessToken), phoneNumberId, details,
        });

        return res.json({
            message: "WhatsApp conectado correctamente",
            phoneNumberId,
            waBusinessId,
            lineId: String(lineId),
        });

    } catch (error) {
        return connectionErrorResponse(res, error);
    }
}
