import Campaign from "../models/campaign.model.js";
import CampaignRecipient from "../models/campaign.recipient.model.js";
import Message from "../models/message.model.js";
import { sendUser } from "../controllers/stream.controller.js";
import { buildCampaignStats } from "../utils/campaign.status.js";
import { CAMPAIGN_RATE_PER_SECOND } from "../config.js";

// Lo que comparten el controller y el worker de los envíos masivos: las
// estadísticas, la forma en que la API devuelve una campaña y el aviso por SSE.

const toIso = (date) => (date ? new Date(date).toISOString() : null);

// Conteos por campaña, de varias a la vez (la lista pide una página entera).
// Devuelve Map<campaignId, stats>.
export const getCampaignsStats = async (campaignIds) => {
    if (campaignIds.length === 0) return new Map();

    const [recipients, messages] = await Promise.all([
        CampaignRecipient.aggregate([
            { $match: { campaignId: { $in: campaignIds } } },
            { $group: { _id: { campaignId: '$campaignId', status: '$status' }, count: { $sum: 1 } } },
        ]),
        Message.aggregate([
            { $match: { campaignId: { $in: campaignIds } } },
            { $group: { _id: { campaignId: '$campaignId', status: '$status' }, count: { $sum: 1 } } },
        ]),
    ]);

    const byCampaign = (rows) => rows.reduce((map, { _id, count }) => {
        const key = String(_id.campaignId);
        map.set(key, { ...map.get(key), [_id.status]: count });
        return map;
    }, new Map());

    const r = byCampaign(recipients);
    const m = byCampaign(messages);
    return new Map(campaignIds.map(id => [String(id), buildCampaignStats(r.get(String(id)), m.get(String(id)))]));
};

export const getCampaignStats = async (campaignId) =>
    (await getCampaignsStats([campaignId])).get(String(campaignId));

const ACTIVE_STATUSES = ['queued', 'sending'];

/**
 * Cuánto falta, a ojo: los pendientes al ritmo del worker. Es un mínimo, porque
 * el ritmo se reparte entre las cuentas que estén enviando a la vez. `null` si
 * no avanza (pausada, terminada).
 */
const estimateSecondsLeft = (status, stats) =>
    ACTIVE_STATUSES.includes(status) && stats.pending > 0
        ? Math.ceil(stats.pending / CAMPAIGN_RATE_PER_SECOND)
        : null;

/**
 * Los fallidos de una campaña agrupados por código de error, del más frecuente
 * al menos: `[{ code, detail, count }]`. Junta los dos sitios donde se apunta un
 * fallo: el `Message` que rechazó Meta y el destinatario que falló antes de
 * llegar a Meta (sin `Message`). `detail` es el texto de uno de ellos, para los
 * códigos que la UI no sabe traducir.
 */
export const getCampaignFailureReasons = async (campaignId) => {
    const groupByCode = [
        { $group: { _id: '$errorCode', detail: { $first: '$errorDetail' }, count: { $sum: 1 } } },
    ];
    const [fromMessages, fromRecipients] = await Promise.all([
        Message.aggregate([{ $match: { campaignId, status: 'failed' } }, ...groupByCode]),
        CampaignRecipient.aggregate([{ $match: { campaignId, status: 'failed' } }, ...groupByCode]),
    ]);

    const byCode = new Map();
    [...fromMessages, ...fromRecipients].forEach(({ _id, detail, count }) => {
        const code = _id ?? null;
        const current = byCode.get(code);
        byCode.set(code, { code, detail: current?.detail ?? detail ?? null, count: (current?.count ?? 0) + count });
    });
    return [...byCode.values()].sort((a, b) => b.count - a.count);
};

// La forma en que la API (y el SSE) devuelven una campaña.
export const serializeCampaign = (campaign, stats = buildCampaignStats()) => ({
    id: String(campaign._id),
    name: campaign.name,
    status: campaign.status,
    pauseReason: campaign.pauseReason?.message ? campaign.pauseReason : null,
    template: {
        templateId: campaign.template?.templateId ?? null,
        name: campaign.template?.name ?? null,
        language: campaign.template?.language ?? null,
        category: campaign.template?.category ?? null,
        bodyText: campaign.template?.bodyText ?? '',
    },
    variables: campaign.variables ?? [],
    buttons: campaign.buttons ?? [],
    excludeOptedOut: Boolean(campaign.excludeOptedOut),
    dryRun: Boolean(campaign.dryRun),
    totalRecipients: campaign.totalRecipients ?? 0,
    stats,
    estimatedSecondsLeft: estimateSecondsLeft(campaign.status, stats),
    createdAt: toIso(campaign.createdAt),
    startedAt: toIso(campaign.startedAt),
    finishedAt: toIso(campaign.finishedAt),
});

// Un aviso por segundo como mucho por campaña: a 10 envíos por segundo, emitir
// en cada uno sería un aggregate y un evento por envío para nada.
const PROGRESS_INTERVAL_MS = 1000;
const lastProgressAt = new Map();

/**
 * Emite `campaign_progress` con la campaña y sus estadísticas al día. `force`
 * salta el límite: los cambios de estado (empezar, pausar, terminar) siempre
 * se avisan, que son los que la UI no puede perderse.
 */
export const emitCampaignProgress = async (campaignId, { force = false } = {}) => {
    const key = String(campaignId);
    const now = Date.now();
    if (!force && now - (lastProgressAt.get(key) ?? 0) < PROGRESS_INTERVAL_MS) return;
    lastProgressAt.set(key, now);

    const campaign = await Campaign.findById(campaignId).lean();
    if (!campaign) return;
    if (['completed', 'cancelled'].includes(campaign.status)) lastProgressAt.delete(key);

    const stats = await getCampaignStats(campaign._id);
    sendUser(String(campaign.userId), 'campaign_progress', serializeCampaign(campaign, stats));
};
