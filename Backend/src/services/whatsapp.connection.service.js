import Account from "../models/account.model.js";
import Line from "../models/line.model.js";
import User from "../models/user.model.js";
import Waba from "../models/waba.model.js";
import { REGISTER_TIMEOUT_MS, getPhoneNumberPlatform, getWabaPhoneNumbers, registerPhoneNumber } from "../libs/whatsapp.js";
import { withLineLock } from "./line.service.js";
import { decrypt, encrypt } from "../utils/crypto.js";
import { planConnection } from "../utils/line.js";
import {
    BUSINESS_APP_NUMBER_UNKNOWN_MESSAGE, LINE_ERROR_CODES, PHONE_NUMBER_REGISTRATION_FAILED_MESSAGE,
    describePhoneNumberPlatform, describeWabaPhoneNumber, generateTwoStepPin, lineLimitMessage, needsRegistration,
    nextPageCursor, pickBusinessAppPhoneNumber,
} from "../utils/whatsapp.line.js";

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
        taken.code = LINE_ERROR_CODES.wabaTaken;
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
        error.code = LINE_ERROR_CODES.limit;
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
        error.code = LINE_ERROR_CODES.phoneNumberNotInWaba;
        throw error;
    }
    return line;
};

// Si el número sigue en la app de WhatsApp Business (coexistencia), según Meta:
// `{ onBusinessApp: true | false | null, platformType }`. Nunca lanza: si Meta
// falla, `onBusinessApp` es null («no se sabe») y la conexión sigue.
export const readPhoneNumberPlatform = async ({ token, phoneNumberId }) => {
    try {
        const res = await getPhoneNumberPlatform({ token, phoneNumberId });
        return describePhoneNumberPlatform(res.data);
    } catch (error) {
        console.warn('No se pudo saber si el número está en la app de WhatsApp Business:', error.waErrorDetail ?? error.message);
        return { onBusinessApp: null, platformType: null };
    }
};

// El número a conectar en la coexistencia, deducido del WABA (el evento de la
// app no trae `phone_number_id`): el único del WABA, o el único que Meta dice
// que está en la app. Si no queda exactamente uno, 409 y no se guarda nada.
export const resolveBusinessAppPhoneNumber = async ({ token, waBusinessId }) => {
    const ids = [];
    let after = null;
    for (let page = 0; page < MAX_PHONE_NUMBER_PAGES; page++) {
        const res = await getWabaPhoneNumbers({ token, waBusinessId, after });
        for (const entry of Array.isArray(res.data?.data) ? res.data.data : []) {
            if (entry?.id) ids.push(String(entry.id));
        }
        after = nextPageCursor(res.data);
        if (!after) break;
    }
    const numbers = ids.length === 1
        ? [{ phoneNumberId: ids[0], onBusinessApp: null }]
        : await Promise.all(ids.map(async phoneNumberId => ({
            phoneNumberId, onBusinessApp: (await readPhoneNumberPlatform({ token, phoneNumberId })).onBusinessApp,
        })));
    const phoneNumberId = pickBusinessAppPhoneNumber(numbers);
    if (!phoneNumberId) {
        const error = new Error(BUSINESS_APP_NUMBER_UNKNOWN_MESSAGE);
        error.statusCode = 409;
        error.code = LINE_ERROR_CODES.businessAppNumberUnknown;
        throw error;
    }
    return phoneNumberId;
};

// Registra el número en la Cloud API si Meta dice que no lo está (`details`, de
// `verifyWabaPhoneNumber`), y devuelve el PIN (cifrado) que tiene que guardar
// su línea, o null. El `Waba` ya es de esta cuenta (`claimWaba`).
//
// El PIN se apunta en el `Waba` ANTES de llamar a Meta y no se borra hasta que
// llega a la línea (`applyConnection`): si la respuesta se pierde o la conexión
// falla después, el siguiente intento lo reutiliza, para registrar con el mismo
// o para dárselo a la línea si Meta ya dice que está registrado. Solo un
// rechazo de Meta (respuesta con `waErrorCode`: no quedó registrado) lo borra.
//
// El registro va con el candado de líneas de la cuenta: dos conexiones del
// mismo número a la vez no pueden registrar con PINs distintos ni borrar el PIN
// de la otra. La segunda recibe 409 `line_busy` y se reintenta. El candado
// dura más que la espera a Meta, para no caducar a mitad del registro.
const REGISTER_LOCK_MS = REGISTER_TIMEOUT_MS + 30_000;

// `onBusinessApp` y `claimedBusinessApp` (lo que dijo el navegador): un número
// de la app de WhatsApp Business nunca se registra (`needsRegistration`).
export const registerIfNeeded = async ({ accountId, waBusinessId, token, phoneNumberId, details, onBusinessApp = null, claimedBusinessApp = false }) => {
    const wabaFilter = { waBusinessId, accountId };
    const pinPath = `pendingTwoStepPins.${phoneNumberId}`;
    const findPendingPin = async () =>
        (await Waba.findOne(wabaFilter).select('pendingTwoStepPins').lean())?.pendingTwoStepPins?.[phoneNumberId] ?? null;

    if (!needsRegistration(details, { onBusinessApp, claimedBusinessApp })) {
        if (details?.platformType !== 'CLOUD_API' && onBusinessApp !== true) {
            console.warn('Registrar número: platform_type inesperado', phoneNumberId, details?.platformType);
        }
        return findPendingPin();
    }

    return withLineLock(accountId, async () => {
        const pending = await findPendingPin();
        const encryptedPin = pending ?? encrypt(generateTwoStepPin());
        if (!pending) await Waba.updateOne(wabaFilter, { $set: { [pinPath]: encryptedPin } });

        try {
            await registerPhoneNumber({ token, phoneNumberId, pin: decrypt(encryptedPin) });
            return encryptedPin;
        } catch (cause) {
            if (cause.waErrorCode) await Waba.updateOne(wabaFilter, { $unset: { [pinPath]: '' } });
            const error = new Error(PHONE_NUMBER_REGISTRATION_FAILED_MESSAGE);
            error.statusCode = 502;
            error.code = LINE_ERROR_CODES.registrationFailed;
            error.waErrorCode = cause.waErrorCode;
            error.waErrorDetail = cause.waErrorDetail ?? cause.message;
            throw error;
        }
    }, { ttlMs: REGISTER_LOCK_MS });
};
