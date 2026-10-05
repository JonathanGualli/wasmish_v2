import { z } from "zod";
import { VARIABLE_SOURCES } from "../utils/campaign.message.js";
import { CAMPAIGN_MAX_RECIPIENTS } from "../config.js";
import { contactSelectionSchema, objectIdSchema } from "./contact.schema.js";

// De dónde sale el valor de una variable o un botón. Que el texto fijo o la
// reserva no falten lo comprueba `validateCampaignMessage`, que conoce la
// plantilla; aquí solo la forma.
const fill = {
    source: z.enum(VARIABLE_SOURCES, { message: `source debe ser ${VARIABLE_SOURCES.join(', ')}` }),
    value: z.string().max(1024).nullish(),
    fallback: z.string().max(1024).nullish(),
};

// Los destinatarios: la misma selección que en Contactos.
const recipientsSchema = contactSelectionSchema(CAMPAIGN_MAX_RECIPIENTS);

// Lo que pide la vista previa. La plantilla es opcional: el paso de los
// destinatarios va antes de elegirla y solo necesita los conteos.
export const campaignDraftSchema = z.object({
    templateId: z.string().min(1).nullish(),
    variables: z.array(z.object({ key: z.string().min(1).max(64), ...fill })).max(30).nullish(),
    buttons: z.array(z.object({ index: z.number().int().min(0).max(9), ...fill })).max(10).nullish(),
    excludeOptedOut: z.boolean().nullish(),
    recipients: recipientsSchema,
    // El archivo de la cabecera elegido para esta campaña; sin él, el de la plantilla.
    headerMediaId: objectIdSchema.nullish(),
});

export const createCampaignSchema = campaignDraftSchema.extend({
    templateId: z.string({ error: 'Elige una plantilla' }).min(1, 'Elige una plantilla'),
    name: z.string({ error: 'Ponle un nombre a la campaña' }).trim().min(1, 'Ponle un nombre a la campaña').max(80),
    // Que el archivo elegido pase a ser también el de la plantilla.
    saveHeaderAsDefault: z.boolean().nullish(),
});

// A quién llega un borrador, sin el mensaje: la lista del primer paso. La
// plantilla, si ya hay, decide si la baja de publicidad excluye a alguien.
export const campaignAudienceSchema = campaignDraftSchema.pick({ recipients: true, excludeOptedOut: true, templateId: true });
