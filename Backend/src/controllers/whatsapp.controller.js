import { encrypt } from "../utils/crypto.js";
import { exchangeCodeForToken, subscribeAppToWaba } from "../libs/whatsapp.js";
import {
    isPhoneNumberTaken, isWabaTaken, checkLineLimit, claimWaba, verifyWabaPhoneNumber, registerIfNeeded,
    readPhoneNumberPlatform, resolveBusinessAppPhoneNumber, PHONE_NUMBER_TAKEN_MESSAGE, WABA_TAKEN_MESSAGE,
} from "../services/whatsapp.connection.service.js";
import { applyConnection } from "../services/line.service.js";
import { LINE_ERROR_CODES } from "../utils/whatsapp.line.js";

// La respuesta de error de las dos formas de conectar (esta y el formulario
// manual, en user.controller.js). El 11000 es el índice único de las líneas
// activas (`line_phoneNumberId_active_unique`): otra cuenta se quedó el número
// entre la comprobación y el guardado. `code` es el nuestro (`LINE_ERROR_CODES`,
// para que el front sepa dónde enseñarlo); `errorCode`, el de Meta.
export const connectionErrorResponse = (res, error) => {
    if (error.code === 11000) return sendPhoneNumberTaken(res);
    const status = error.statusCode || (error.waErrorCode ? 502 : 500);
    if (status >= 500) console.error('Conectar WhatsApp falló:', error.waErrorDetail ?? error.message);
    const code = typeof error.code === 'string' ? error.code : null;
    return res.status(status).json([{ message: error.message, code, errorCode: error.waErrorCode ?? null }]);
};

export const sendPhoneNumberTaken = (res) =>
    res.status(409).json([{ message: PHONE_NUMBER_TAKEN_MESSAGE, code: LINE_ERROR_CODES.phoneNumberTaken }]);

export const sendWabaTaken = (res) =>
    res.status(409).json([{ message: WABA_TAKEN_MESSAGE, code: LINE_ERROR_CODES.wabaTaken }]);

export const connectWhatsappEmbedded = async (req, res) => {
    try {
        const { code, waBusinessId, businessApp: claimedBusinessApp = false } = req.body;
        const { accountId } = req.auth;
        // En la coexistencia, Meta solo da el WABA: el número se deduce después
        // de canjear el código, y sus comprobaciones van detrás.
        let phoneNumberId = req.body.phoneNumberId ?? null;

        // 1. Lo que se sabe sin molestar a Meta: el número y el WABA no pueden
        //    estar en otra cuenta, y el número tiene que caber en el plan.
        if (phoneNumberId && await isPhoneNumberTaken(accountId, phoneNumberId)) {
            return sendPhoneNumberTaken(res);
        }
        if (await isWabaTaken(accountId, waBusinessId)) {
            return sendWabaTaken(res);
        }
        if (phoneNumberId) await checkLineLimit(accountId, phoneNumberId);

        // 2. Canjear el "code" por el token permanente
        const accessToken = await exchangeCodeForToken(code);
        if ( !accessToken ) return res.status(400).json([{message: 'No se pudo obtener el token de Meta'}]);

        if (!phoneNumberId) {
            phoneNumberId = await resolveBusinessAppPhoneNumber({ token: accessToken, waBusinessId });
            if (await isPhoneNumberTaken(accountId, phoneNumberId)) return sendPhoneNumberTaken(res);
            await checkLineLimit(accountId, phoneNumberId);
        }

        // 3. El número tiene que ser del WABA de ese token. Antes de suscribir
        //    la app: si no lo es, no se toca nada en Meta. Y si sigue en la app
        //    de WhatsApp Business (coexistencia): lo dice Meta, no el navegador.
        const details = await verifyWabaPhoneNumber({ token: accessToken, waBusinessId, phoneNumberId });
        const { onBusinessApp } = await readPhoneNumberPlatform({ token: accessToken, phoneNumberId });
        if (claimedBusinessApp && onBusinessApp === false) {
            console.warn('Conectar: el navegador dijo que el número está en la app y Meta dice que no', { waBusinessId });
        }
        // El WABA para esta cuenta, antes de suscribir la app y de guardar nada.
        await claimWaba(accountId, waBusinessId);

        // 4. Subir la app a los whebhooks del whatsapp del cliente
        await subscribeAppToWaba( { token: accessToken, waBusinessId } );

        // 5. Registrar el número en la Cloud API, si Meta dice que no lo está:
        //    sin esto, uno recién estrenado no puede enviar (133010).
        const twoStepPin = await registerIfNeeded({
            accountId, waBusinessId, token: accessToken, phoneNumberId, details, onBusinessApp, claimedBusinessApp,
        });

        // 6. La línea, con el token (cifrado) en su WABA
        const { lineId } = await applyConnection({
            accountId, waBusinessId, tokenWhatsapp: encrypt(accessToken), phoneNumberId, details, twoStepPin,
            businessApp: onBusinessApp === true,
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
