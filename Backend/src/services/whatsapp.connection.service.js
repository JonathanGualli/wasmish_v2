import User from "../models/user.model.js";
import { getWabaPhoneNumbers } from "../libs/whatsapp.js";
import { describeWabaPhoneNumber } from "../utils/whatsapp.line.js";

// Lo que comparten las dos formas de conectar un número (Embedded Signup y el
// formulario manual de Ajustes). El webhook enruta cada mensaje por su
// `phoneNumberId`, así que un número es de una sola cuenta y tiene que ser del
// WABA cuyo token se guarda.

export const PHONE_NUMBER_TAKEN_MESSAGE = 'Ese número de WhatsApp ya está conectado a otra cuenta de Wasmish.';

// Si el número ya está en OTRA cuenta. El propio no cuenta: volver a conectarlo
// (para renovar el token) tiene que poder hacerse.
export const isPhoneNumberTaken = async (userId, phoneNumberId) =>
    Boolean(await User.exists({ phoneNumberId, _id: { $ne: userId } }));

// El número tal como lo lista Meta en ese WABA. Si no está, 400; los errores de
// Meta (token inválido, WABA ajeno) suben con su `waErrorCode`.
export const verifyWabaPhoneNumber = async ({ token, waBusinessId, phoneNumberId }) => {
    const res = await getWabaPhoneNumbers({ token, waBusinessId });
    const line = describeWabaPhoneNumber(res.data, phoneNumberId);
    if (!line) {
        const error = new Error('Ese número no pertenece a la cuenta de WhatsApp Business conectada.');
        error.statusCode = 400;
        throw error;
    }
    return line;
};
