import { z } from "zod";
import { VARIABLE_SOURCES } from "../utils/campaign.message.js";
import { CONTACT_FILTERS } from "../utils/contact.query.js";
import { CAMPAIGN_MAX_RECIPIENTS } from "../config.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Id de contacto no válido');

// De dónde sale el valor de una variable o un botón. Que el texto fijo o la
// reserva no falten lo comprueba `validateCampaignMessage`, que conoce la
// plantilla; aquí solo la forma.
const fill = {
    source: z.enum(VARIABLE_SOURCES, { message: `source debe ser ${VARIABLE_SOURCES.join(', ')}` }),
    value: z.string().max(1024).nullish(),
    fallback: z.string().max(1024).nullish(),
};

// Los destinatarios: los marcados uno a uno, o «todos los que coinciden» con
// una búsqueda y un filtro de Contactos, menos los desmarcados.
const recipientsSchema = z.discriminatedUnion('mode', [
    z.object({
        mode: z.literal('ids'),
        contactIds: z.array(objectId).min(1, 'Elige al menos un contacto').max(CAMPAIGN_MAX_RECIPIENTS),
    }),
    z.object({
        mode: z.literal('query'),
        search: z.string().max(100).nullish(),
        filter: z.enum(CONTACT_FILTERS).nullish(),
        excludeIds: z.array(objectId).max(CAMPAIGN_MAX_RECIPIENTS).nullish(),
    }),
]);

// Lo que pide la vista previa. La plantilla es opcional: el paso de los
// destinatarios va antes de elegirla y solo necesita los conteos.
export const campaignDraftSchema = z.object({
    templateId: z.string().min(1).nullish(),
    variables: z.array(z.object({ key: z.string().min(1).max(64), ...fill })).max(30).nullish(),
    buttons: z.array(z.object({ index: z.number().int().min(0).max(9), ...fill })).max(10).nullish(),
    excludeOptedOut: z.boolean().nullish(),
    recipients: recipientsSchema,
});

export const createCampaignSchema = campaignDraftSchema.extend({
    templateId: z.string({ error: 'Elige una plantilla' }).min(1, 'Elige una plantilla'),
    name: z.string({ error: 'Ponle un nombre al envío' }).trim().min(1, 'Ponle un nombre al envío').max(80),
});

// A quién llega un borrador, sin el mensaje: la lista del primer paso. La
// plantilla, si ya hay, decide si la baja de publicidad excluye a alguien.
export const campaignAudienceSchema = campaignDraftSchema.pick({ recipients: true, excludeOptedOut: true, templateId: true });
