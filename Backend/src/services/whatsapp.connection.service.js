import User from "../models/user.model.js";
import Waba from "../models/waba.model.js";
import { syncLinesFromOwner } from "./line.service.js";
import { getWabaPhoneNumbers } from "../libs/whatsapp.js";
import { describeWabaPhoneNumber, nextPageCursor } from "../utils/whatsapp.line.js";

// Lo que comparten las dos formas de conectar un número (Embedded Signup y el
// formulario manual de Ajustes). El webhook enruta cada mensaje por su
// `phoneNumberId`, así que un número es de una sola cuenta y tiene que ser del
// WABA cuyo token se guarda.

export const PHONE_NUMBER_TAKEN_MESSAGE = 'Ese número de WhatsApp ya está conectado a otra cuenta de Wasmish.';

export const WABA_TAKEN_MESSAGE = 'Esa cuenta de WhatsApp Business ya está conectada a otra cuenta de Wasmish.';

// Si el WABA ya es de OTRA cuenta: sus plantillas no se pueden repartir entre
// dos (`Template.templateId` es único global). Mira `User` además de `Waba`:
// entre desplegar la Fase 2a y migrar, el WABA de una cuenta solo está en su `User`.
export const isWabaTaken = async (accountId, waBusinessId) => Boolean(
    await User.exists({ waBusinessId, accountId: { $ne: accountId } })
    || await Waba.exists({ waBusinessId, accountId: { $ne: accountId } })
);

// Reclama el WABA para esta cuenta ANTES de guardar la conexión. `isWabaTaken`
// lo mira antes de llamar a Meta, pero dos cuentas a la vez lo pasarían las
// dos: el índice único de `Waba` decide quién se lo queda. Si es de otra
// cuenta, 409 y la conexión no se guarda. Reclamar el propio es un no-op.
export const claimWaba = async (accountId, waBusinessId) => {
    try {
        await Waba.updateOne({ waBusinessId, accountId }, { $setOnInsert: { tokenWhatsapp: null } }, { upsert: true });
    } catch (error) {
        if (error.code !== 11000) throw error;
        const taken = new Error(WABA_TAKEN_MESSAGE);
        taken.statusCode = 409;
        throw taken;
    }
};

// Tras guardar la conexión en `User`, refleja `Waba` y `Line`. Si falla, la
// conexión NO se deshace: el enrutado lee `User`, que ya está bien, y la
// siguiente sincronización (o `migrate:lines`) completa la proyección.
export const syncLinesAfterConnecting = async (accountId, details) => {
    try {
        await syncLinesFromOwner(accountId, { details });
    } catch (error) {
        console.error('No se pudieron sincronizar las líneas tras conectar:', { accountId: String(accountId), error: error.message });
    }
};

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
