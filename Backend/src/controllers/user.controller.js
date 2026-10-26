import { encrypt } from "../utils/crypto.js";
import {
    isPhoneNumberTaken, isWabaTaken, checkLineLimit, claimWaba, verifyWabaPhoneNumber, registerIfNeeded,
    readPhoneNumberPlatform,
} from "../services/whatsapp.connection.service.js";
import { applyConnection } from "../services/line.service.js";
import { wakeHistoryWorker } from "../workers/history.worker.js";
import { connectionErrorResponse, sendPhoneNumberTaken, sendWabaTaken } from "./whatsapp.controller.js";


// El formulario manual de Ajustes: las mismas comprobaciones que el Embedded
// Signup (whatsapp.controller.js), con el token que pega el usuario.
export const updateUserTokenWhatsapp = async (req, res) => {
    const { tokenWhatsapp, phoneNumberId, waBusinessId } = req.body;
    const { accountId } = req.auth;

    try {
        if (await isPhoneNumberTaken(accountId, phoneNumberId)) {
            return sendPhoneNumberTaken(res);
        }
        if (await isWabaTaken(accountId, waBusinessId)) {
            return sendWabaTaken(res);
        }
        await checkLineLimit(accountId, phoneNumberId);

        const details = await verifyWabaPhoneNumber({ token: tokenWhatsapp, waBusinessId, phoneNumberId });
        // Un número que sigue en la app de WhatsApp Business no se registra. La
        // coexistencia solo se ofrece por el Embedded Signup (este camino no
        // suscribe la app al WABA), pero no se rompe el número si llega por aquí.
        const { onBusinessApp } = await readPhoneNumberPlatform({ token: tokenWhatsapp, phoneNumberId });
        // El WABA para esta cuenta, antes de guardar nada.
        await claimWaba(accountId, waBusinessId);
        const twoStepPin = await registerIfNeeded({ accountId, waBusinessId, token: tokenWhatsapp, phoneNumberId, details, onBusinessApp });

        const { lineId } = await applyConnection({
            accountId, waBusinessId, tokenWhatsapp: encrypt(tokenWhatsapp), phoneNumberId, details, twoStepPin,
            businessApp: onBusinessApp === true,
        });
        // Un número de la app: que pida la agenda y el historial ya, sin esperar su vuelta.
        wakeHistoryWorker();

        return res.json({ message: 'Token updated successfully', lineId: String(lineId) });
    } catch (error) {
        return connectionErrorResponse(res, error);
    }
}
