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

// Para enviar hace falta el token y el número. Sin esto, `decrypt(null)`
// revienta y el envío responde un 500 que no explica nada.
export const assertWhatsappConnected = (user) => {
    if (user?.tokenWhatsapp && user?.phoneNumberId) return;
    const error = new Error(WHATSAPP_NOT_CONNECTED_MESSAGE);
    error.statusCode = 409;
    throw error;
};
