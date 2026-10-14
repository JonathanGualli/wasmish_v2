// Una línea de WhatsApp: un número (`phoneNumberId`) dentro de un WABA.

import crypto from 'node:crypto';

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
        // Si Meta ya lo tiene en la Cloud API (`CLOUD_API`) o no (`NOT_APPLICABLE`).
        platformType: entry.platform_type ?? null,
    };
};

// Si hay que registrar el número en la Cloud API (`POST /{id}/register`) para
// que pueda enviar. Solo cuando Meta dice que no lo está: un número ya
// registrado (renovar el token, un cliente que viene de otro proveedor), en
// On-Premises o con un valor desconocido no se toca, porque registrarlo con un
// PIN distinto del suyo haría fallar la conexión.
export const needsRegistration = (details) => details?.platformType === 'NOT_APPLICABLE';

// El PIN de la verificación en dos pasos con el que se registra un número: seis
// dígitos al azar, con los ceros a la izquierda.
export const generateTwoStepPin = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

// El cursor de la página siguiente de una lista de Meta, o null si es la última.
// Meta manda `paging.cursors.after` también en la última página: lo que dice que
// hay más es `paging.next`.
export const nextPageCursor = (body) =>
    (body?.paging?.next && body.paging.cursors?.after) || null;

export const WHATSAPP_NOT_CONNECTED_MESSAGE = 'La cuenta no tiene WhatsApp conectado. Conéctala desde Ajustes antes de enviar.';

// Una conversación de un número que ya no está conectado (Fase 2b de multi-línea).
export const LINE_DISCONNECTED_MESSAGE = 'Esta conversación es de un número de WhatsApp que ya no está conectado. Para escribirle, inicia una conversación nueva desde tu número actual.';

export const LINE_NOT_FOUND_MESSAGE = 'La línea no existe en tu cuenta.';

// El `code` de los errores de conectar y de gestionar líneas (Fase 2c): el front
// decide con él dónde y cómo enseñarlos (ámbar con «Reintentar» si la línea
// está ocupada, marcar el campo del formulario manual…), sin comparar textos.
export const LINE_ERROR_CODES = {
    notFound: 'line_not_found',
    busy: 'line_busy',
    limit: 'line_limit',
    defaultInactive: 'default_line_inactive',
    phoneNumberTaken: 'phone_number_taken',
    phoneNumberNotInWaba: 'phone_number_not_in_waba',
    wabaTaken: 'waba_taken',
    registrationFailed: 'phone_number_registration_failed',
};

// Conectar otro número con la cuenta en el límite de su plan (Fase 2c).
export const lineLimitMessage = (maxLines) => (maxLines === 1
    ? 'Tu plan permite 1 línea conectada. Desconéctala antes de conectar otra, o pide más líneas.'
    : `Tu plan permite ${maxLines} líneas conectadas. Desconecta una antes de conectar otra, o pide más líneas.`);

// Meta no registró el número en la Cloud API al conectarlo (`registerIfNeeded`).
export const PHONE_NUMBER_REGISTRATION_FAILED_MESSAGE = 'WhatsApp no dejó activar este número para enviar mensajes. Inténtalo de nuevo en unos minutos; si se repite, escríbenos.';

// Otro cambio en las líneas de la misma cuenta a la vez (`withLineLock`).
export const LINE_BUSY_MESSAGE = 'Hay otro cambio en las líneas de esta cuenta en curso. Inténtalo de nuevo en unos segundos.';

// Hacer por defecto una línea desconectada (Fase 2c).
export const DEFAULT_LINE_INACTIVE_MESSAGE = 'Solo una línea conectada puede ser la línea por defecto.';
