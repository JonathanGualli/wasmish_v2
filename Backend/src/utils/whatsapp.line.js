// Una línea de WhatsApp: un número (`phoneNumberId`) dentro de un WABA.

// El número `phoneNumberId` tal como lo lista Meta en `GET /{waba-id}/phone_numbers`
// (`body` es el cuerpo de esa respuesta), o null si no está. Que esté es lo que
// prueba que el número es de ese WABA, y por eso se exige antes de conectarlo.
export const describeWabaPhoneNumber = (body, phoneNumberId) => {
    if (!phoneNumberId || !Array.isArray(body?.data)) return null;

    const entry = body.data.find(item => String(item?.id) === String(phoneNumberId));
    if (!entry) return null;

    return {
        phoneNumberId: String(entry.id),
        displayPhoneNumber: entry.display_phone_number ?? null,
        verifiedName: entry.verified_name ?? null,
    };
};

// El cursor de la página siguiente de una lista de Meta, o null si es la última.
// Meta manda `paging.cursors.after` también en la última página: lo que dice que
// hay más es `paging.next`.
export const nextPageCursor = (body) =>
    (body?.paging?.next && body.paging.cursors?.after) || null;

export const WHATSAPP_NOT_CONNECTED_MESSAGE = 'La cuenta no tiene WhatsApp conectado. Conéctala desde Ajustes antes de enviar.';

// Una conversación de un número que ya no está conectado (Fase 2b de multi-línea).
export const LINE_DISCONNECTED_MESSAGE = 'Esta conversación es de un número de WhatsApp que ya no está conectado. Para escribirle, inicia una conversación nueva desde tu número actual.';

export const LINE_NOT_FOUND_MESSAGE = 'La línea no existe en tu cuenta.';

// Conectar otro número con la cuenta en el límite de su plan (Fase 2c).
export const lineLimitMessage = (maxLines) => (maxLines === 1
    ? 'Tu plan permite 1 línea conectada. Desconéctala antes de conectar otra, o pide más líneas.'
    : `Tu plan permite ${maxLines} líneas conectadas. Desconecta una antes de conectar otra, o pide más líneas.`);

// Otro cambio en las líneas de la misma cuenta a la vez (`withLineLock`).
export const LINE_BUSY_MESSAGE = 'Hay otro cambio en las líneas de esta cuenta en curso. Inténtalo de nuevo en unos segundos.';

// Hacer por defecto una línea desconectada (Fase 2c).
export const DEFAULT_LINE_INACTIVE_MESSAGE = 'Solo una línea conectada puede ser la línea por defecto.';
