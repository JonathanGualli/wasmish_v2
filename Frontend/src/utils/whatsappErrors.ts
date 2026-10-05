/**
 * Los errores de WhatsApp (Meta) en palabras, con qué hacer cuando hay algo
 * que hacer. Lo usan el chat (el «Fallido» de un mensaje, el aviso al enviar
 * una plantilla) y las campañas. Un código que no esté aquí se enseña con el
 * detalle que mandó Meta, que viene en inglés.
 *
 * Referencia: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
const WHATSAPP_ERROR_LABEL: Record<string, string> = {
    // Cuenta y permisos
    '190': 'El token de WhatsApp caducó: vuelve a conectar la cuenta en Ajustes',
    '368': 'WhatsApp bloqueó la cuenta temporalmente por incumplir sus políticas',
    '131005': 'La cuenta no tiene permiso para enviar mensajes',
    '131031': 'WhatsApp bloqueó la cuenta',
    '131042': 'Hay un problema con el método de pago de la cuenta de WhatsApp',
    '131045': 'El número de la empresa no está registrado en WhatsApp',
    '133010': 'El número de la empresa no está registrado en WhatsApp',
    // Ritmo
    '130429': 'WhatsApp pidió bajar el ritmo de envío',
    '131048': 'Envío frenado por WhatsApp: demasiados reportes de spam',
    '131056': 'Demasiados mensajes seguidos a este número: espera un poco antes de volver a escribirle',
    // El destinatario
    '131021': 'No puedes escribirte a tu propio número',
    '131026': 'No se pudo entregar (número sin WhatsApp o app desactualizada)',
    '131030': 'El número no está en la lista de prueba de la app de Meta',
    '131047': 'La ventana de 24 h está cerrada: envía una plantilla para retomar la conversación',
    '470': 'La ventana de 24 h está cerrada: envía una plantilla para retomar la conversación',
    '131049': 'WhatsApp no lo entregó para no saturar al usuario con publicidad',
    '131050': 'Pidió no recibir publicidad',
    '130472': 'WhatsApp no le muestra publicidad a este usuario por ahora (está en una prueba de Meta)',
    // El mensaje
    '131008': 'Falta un dato obligatorio en el mensaje',
    '131009': 'Uno de los datos del mensaje no es válido',
    '131051': 'WhatsApp no admite este tipo de mensaje',
    '131053': 'No se pudo subir el archivo a WhatsApp',
    // Plantillas
    '132000': 'La plantilla pide otro número de datos del que se envió',
    '132001': 'La plantilla no existe en WhatsApp o no está en ese idioma: sincroniza las plantillas',
    '132005': 'El mensaje queda demasiado largo con los datos puestos',
    '132007': 'El texto de algún dato no cumple las reglas de WhatsApp',
    '132012': 'No coincide con el formato de la plantilla (p. ej., falta el archivo de la cabecera)',
    '132015': 'WhatsApp pausó la plantilla por su baja calidad',
    '132016': 'WhatsApp desactivó la plantilla',
    '132018': 'Algún dato de la plantilla no es válido (vacío, con saltos de línea o demasiados espacios)',
    // Temporales
    '131000': 'WhatsApp tuvo un error inesperado: inténtalo de nuevo',
    '131016': 'WhatsApp no está disponible en este momento: inténtalo más tarde',
    // Nuestros, de antes de llamar a Meta
    '409': 'La cuenta no tenía WhatsApp conectado',
};

/** El error de WhatsApp en palabras, o `null` si no lo conocemos. */
export const whatsappErrorLabel = (code: string | null | undefined) =>
    (code && WHATSAPP_ERROR_LABEL[code]) || null;

/** El motivo de un fallo en una frase: el conocido, o el detalle que mandaron. */
export const whatsappErrorText = (code: string | null | undefined, detail: string | null | undefined) =>
    whatsappErrorLabel(code) || detail || 'Error desconocido';
