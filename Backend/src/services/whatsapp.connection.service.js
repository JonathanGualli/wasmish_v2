import Account from "../models/account.model.js";
import Line from "../models/line.model.js";
import User from "../models/user.model.js";
import Waba from "../models/waba.model.js";
import { getWabaPhoneNumbers } from "../libs/whatsapp.js";
import { planConnection } from "../utils/line.js";
import { describeWabaPhoneNumber, lineLimitMessage, nextPageCursor } from "../utils/whatsapp.line.js";

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

// Si el número ya está en OTRA cuenta: una línea activa suya, o el `User` de
// una cuenta que no tiene ninguna `Line` de ese número (anterior a las líneas,
// o conectada con la imagen anterior). Un `User` con la copia atrasada de un
// número que su cuenta ya desconectó no lo bloquea. El propio no cuenta:
// volver a conectarlo (para renovar el token) tiene que poder hacerse.
export const isPhoneNumberTaken = async (accountId, phoneNumberId) => {
    if (await Line.exists({ phoneNumberId, status: 'active', accountId: { $ne: accountId } })) return true;
    const holders = await User.find({ phoneNumberId, accountId: { $ne: accountId } }).select('accountId').lean();
    for (const holder of holders) {
        if (!await Line.exists({ accountId: holder.accountId, phoneNumberId })) return true;
    }
    return false;
};

// Si el número cabe en el plan de la cuenta, ANTES de llamar a Meta: 409 si
// no. `applyConnection` lo vuelve a comprobar con el candado tomado.
export const checkLineLimit = async (accountId, phoneNumberId) => {
    const account = await Account.findById(accountId).select('limits').lean();
    const maxLines = account?.limits?.maxLines ?? 1;
    const lines = await Line.find({ accountId }).select('_id phoneNumberId status').lean();
    if (planConnection({ lines, maxLines, phoneNumberId }).error) {
        const error = new Error(lineLimitMessage(maxLines));
        error.statusCode = 409;
        throw error;
    }
};

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
