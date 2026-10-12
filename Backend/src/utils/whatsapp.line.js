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
