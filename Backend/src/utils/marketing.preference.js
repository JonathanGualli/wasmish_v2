// Si un contacto acepta o no publicidad (plantillas de categoría MARKETING).
//
// La persona lo decide desde WhatsApp —el botón «Dejar de recibir ofertas» de
// una plantilla de marketing, o «Reanudar» más tarde— y Meta lo avisa con el
// webhook `user_preferences`. Enviarle marketing a quien se dio de baja lo
// rechaza Meta con el 131050, así que ese error confirma la baja también.

// «No se entregó: el usuario pidió no recibir mensajes de marketing».
export const MARKETING_OPT_OUT_ERROR = 131050;

const VALUES = { stop: true, resume: false };

const cleanString = (value) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed.length > 0 ? trimmed : null;
};

/**
 * Traduce un elemento de `value.user_preferences` a
 * `{ phone, waUserId, optOut, at }`. Devuelve null si no es una preferencia de
 * marketing conocida: hoy Meta solo manda `marketing_messages`, pero lo que
 * invente mañana no debe leerse como una baja.
 *
 * Como en los mensajes, el teléfono (`wa_id`) puede no venir si la persona
 * activó su nombre de usuario; el BSUID (`user_id`) sí.
 */
export const describeUserPreference = (preference) => {
    if (preference?.category !== 'marketing_messages') return null;
    if (!Object.hasOwn(VALUES, preference.value)) return null;

    const seconds = Number(preference.timestamp);
    return {
        phone: cleanString(preference.wa_id),
        waUserId: cleanString(preference.user_id),
        optOut: VALUES[preference.value],
        at: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date(),
    };
};

// Un acuse `failed` dice que la persona está dada de baja si alguno de sus
// errores es el 131050. Meta lo manda como número; se acepta también en texto.
export const isMarketingOptOutFailure = (errors) =>
    Array.isArray(errors) && errors.some(e => Number(e?.code) === MARKETING_OPT_OUT_ERROR);

/**
 * Qué cambiar en el contacto para aplicar una baja (`optOut: true`) o un alta
 * (`false`) ocurrida en `at`. Devuelve null si no hay que hacer nada.
 *
 * Meta no garantiza el orden de los webhooks: una baja vieja que llegue después
 * de un alta más reciente volvería a dar de baja a alguien que ya quiere
 * publicidad. Por eso se guarda cuándo fue el último cambio aplicado
 * (`marketingPreferenceAt`) y solo se aplica lo que no sea más viejo — el mismo
 * criterio que `resolveStatusTransition` y `lastInboundAt`. El empate lo gana
 * el que llega después: Meta da la hora en segundos, y una baja y un alta en el
 * mismo segundo descartando la segunda dejarían de baja a quien se arrepintió.
 *
 * Si el estado ya es ese, solo avanza la fecha, para que una contraorden más
 * vieja que llegue después no gane. `marketingOptOutAt` es cuándo se dio de
 * baja la primera vez de esta racha: una segunda baja no la mueve, y un alta
 * la vacía.
 */
export const resolveMarketingPreference = (current, { optOut, at }) => {
    if (!(at instanceof Date) || Number.isNaN(at.getTime())) return null;

    const lastChange = current?.marketingPreferenceAt ? new Date(current.marketingPreferenceAt) : null;
    if (lastChange && at < lastChange) return null;

    if (Boolean(current?.marketingOptOut) === optOut) {
        return { marketingPreferenceAt: at };
    }

    return {
        marketingOptOut: optOut,
        marketingOptOutAt: optOut ? at : null,
        marketingPreferenceAt: at,
    };
};
