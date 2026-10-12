import User from "../models/user.model.js";
import { getWabaPhoneNumbers } from "../libs/whatsapp.js";
import { describeWabaPhoneNumber, nextPageCursor } from "../utils/whatsapp.line.js";

// Lo que comparten las dos formas de conectar un número (Embedded Signup y el
// formulario manual de Ajustes). El webhook enruta cada mensaje por su
// `phoneNumberId`, así que un número es de una sola cuenta y tiene que ser del
// WABA cuyo token se guarda.

export const PHONE_NUMBER_TAKEN_MESSAGE = 'Ese número de WhatsApp ya está conectado a otra cuenta de Wasmish.';

// Si el número ya está en OTRA cuenta. El propio no cuenta: volver a conectarlo
// (para renovar el token) tiene que poder hacerse.
export const isPhoneNumberTaken = async (userId, phoneNumberId) =>
    Boolean(await User.exists({ phoneNumberId, _id: { $ne: userId } }));

// Tope de páginas de `/phone_numbers` (de 100): ningún WABA real se acerca, y
// una respuesta rara de Meta no puede dejar la petición dando vueltas.
const MAX_PHONE_NUMBER_PAGES = 10;

// El número tal como lo lista Meta en ese WABA, recorriendo sus páginas. Si no
// está, 400; los errores de Meta (token inválido, WABA ajeno) suben con su
// `waErrorCode`.
export const verifyWabaPhoneNumber = async ({ token, waBusinessId, phoneNumberId }) => {
    let line = null;
    let after = null;
    for (let page = 0; page < MAX_PHONE_NUMBER_PAGES && !line; page++) {
        const res = await getWabaPhoneNumbers({ token, waBusinessId, after });
        line = describeWabaPhoneNumber(res.data, phoneNumberId);
        after = nextPageCursor(res.data);
        if (!after) break;
    }
    if (!line) {
        const error = new Error('Ese número no pertenece a la cuenta de WhatsApp Business conectada.');
        error.statusCode = 400;
        throw error;
    }
    return line;
};
