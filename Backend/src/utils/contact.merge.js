// Contactos partidos por la coexistencia (2026-10-19). Alguien con nombre de
// usuario escribe y Meta manda solo su BSUID; el negocio le responde desde la
// app de WhatsApp Business y el eco trae solo su teléfono. Wasmish no puede
// saber que son la misma persona y el eco crea un segundo contacto con ese
// teléfono. Cuando después llega un mensaje con los dos, el segundo se absorbe
// en el primero (`mergeEchoContactInto`), pero solo si es un «contacto de eco»:
// lo creó Wasmish a partir de ecos y nadie lo ha tocado.

/**
 * ¿Es `contact` un contacto que solo existe por los ecos y que nadie tocó?
 * Solo teléfono (sin BSUID), sin nada puesto por quien usa Wasmish (nombre,
 * correo, empresa, notas, etiquetas), sin baja de publicidad ni anuncio, y con
 * solo ecos en sus conversaciones: ni un entrante ni un envío desde Wasmish.
 *
 * `usage` es lo que hay de él fuera del documento: `echoMessages` y
 * `otherMessages` (los mensajes de sus conversaciones), `notes` (`ContactNote`)
 * y `campaignRecipients`. Ante la duda, false: juntar a dos personas distintas
 * es mucho peor que dejar un contacto partido.
 */
export const isUntouchedEchoContact = (contact, usage = {}) => {
    if (!contact?.phone || contact.waUserId) return false;
    if (contact.name || contact.email || contact.company || contact.notes) return false;
    if ((contact.tags ?? []).length > 0) return false;
    if (contact.marketingOptOut || contact.marketingPreferenceAt || contact.referral) return false;

    const { echoMessages = 0, otherMessages = 0, notes = 0, campaignRecipients = 0 } = usage;
    return echoMessages > 0 && otherMessages === 0 && notes === 0 && campaignRecipients === 0;
};
