// Reglas de un envío masivo que no dependen de la BD: a quién no se le manda,
// qué error de Meta obliga a parar y cómo se resumen los resultados.

/**
 * Por qué no se le manda a un contacto, o null si sí se le manda. Se mira al
 * crear la campaña y otra vez justo antes de enviar, porque entre medias el
 * contacto puede haberse dado de baja o haber sido borrado.
 *
 * Los dados de baja solo se omiten si `excludeOptedOut`, que ya llega
 * resuelto por `shouldExcludeOptedOut` (solo cuenta con marketing). Sin
 * excluirlos se envían y Meta los rechaza (131050), lo que deja registro.
 */
export const recipientSkipReason = (contact, { excludeOptedOut = false } = {}) => {
    if (!contact) return 'contact_deleted';
    if (!contact.phone && !contact.waUserId) return 'no_identity';
    if (excludeOptedOut && contact.marketingOptOut) return 'opted_out';
    return null;
};

/**
 * Si la baja de publicidad cuenta en este envío: solo con plantillas de
 * marketing. A quien la pidió le siguen llegando los avisos de utilidad, así
 * que excluirlo de uno sería quitarle un mensaje que sí quiere. Sin plantilla
 * (el primer paso del asistente) todavía no se sabe, y no se excluye a nadie.
 */
export const shouldExcludeOptedOut = (template, excludeOptedOut) =>
    Boolean(excludeOptedOut) && template?.category === 'MARKETING';

/**
 * Errores de Meta que no son de un contacto sino de la cuenta o de la
 * plantilla: si uno sale, los demás saldrán igual. Con ellos la campaña se
 * pausa en vez de quemar la lista entera; se reanuda cuando esté arreglado.
 */
export const CAMPAIGN_STOPPING_ERRORS = {
    '190': 'El token de WhatsApp caducó o fue revocado. Vuelve a conectar WhatsApp en Ajustes.',
    '368': 'WhatsApp bloqueó temporalmente la cuenta por incumplir sus políticas.',
    '131031': 'WhatsApp bloqueó la cuenta.',
    '131042': 'Hay un problema con el método de pago de la cuenta de WhatsApp.',
    '131048': 'WhatsApp frenó los envíos: demasiados reportes de spam.',
    '132000': 'La plantilla pide un número de datos distinto del que se le envía.',
    '132001': 'La plantilla ya no existe en WhatsApp o no está en ese idioma.',
    '132012': 'Lo que se envía no coincide con el formato de la plantilla (por ejemplo, su cabecera pide otro tipo de archivo). Revisa la plantilla en Plantillas.',
    '132015': 'WhatsApp pausó la plantilla por su baja calidad.',
    '132016': 'WhatsApp desactivó la plantilla.',
};

// Demasiados envíos por segundo: no es culpa del contacto, se baja el ritmo.
export const THROTTLE_ERROR = '130429';

export const stoppingErrorMessage = (code) =>
    code === null || code === undefined ? null : CAMPAIGN_STOPPING_ERRORS[String(code)] ?? null;

/**
 * El resumen de una campaña a partir de dos conteos:
 *  - `recipients`: destinatarios por su estado en la cola (`pending`,
 *    `sending`, `done`, `failed`, `skipped`, `cancelled`, `interrupted`);
 *  - `messages`: los `Message` de la campaña por su estado en WhatsApp
 *    (`sent`, `delivered`, `read`, `failed`), que el webhook va moviendo.
 *
 * `done` es «se creó su Message»: lo que le pasó después lo cuenta `messages`.
 * `failed` de los destinatarios es un error ANTES de Meta (sin Message), así
 * que se suma a los fallidos de WhatsApp sin contarlo dos veces.
 */
export const buildCampaignStats = (recipients = {}, messages = {}) => {
    const r = (key) => recipients[key] ?? 0;
    const m = (key) => messages[key] ?? 0;
    const total = Object.values(recipients).reduce((sum, n) => sum + n, 0);

    return {
        total,
        pending: r('pending') + r('sending'),
        sent: m('sent') + m('delivered') + m('read'),
        delivered: m('delivered') + m('read'),
        read: m('read'),
        failed: m('failed') + r('failed'),
        skipped: r('skipped'),
        cancelled: r('cancelled'),
        interrupted: r('interrupted'),
    };
};
