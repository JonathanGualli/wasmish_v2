import mongoose from "mongoose";
import Campaign from "../models/campaign.model.js";
import CampaignRecipient from "../models/campaign.recipient.model.js";
import Contact from "../models/contact.model.js";
import Template from "../models/template.model.js";
import TemplateMedia from "../models/template.media.model.js";
import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import { selectionQueryStages } from "./contact.controller.js";
import { renderTemplateBody } from "./template.controller.js";
import { wakeCampaignWorker } from "../workers/campaign.worker.js";
import {
    getCampaignsStats, getCampaignStats, getCampaignFailureReasons, serializeCampaign, emitCampaignProgress,
} from "../services/campaign.service.js";
import {
    validateCampaignMessage, buildContactParameters, extractTemplateVariables, buttonsNeedingValue,
} from "../utils/campaign.message.js";
import { recipientSkipReason, shouldExcludeOptedOut } from "../utils/campaign.status.js";
import { contactDisplayName } from "../utils/contact.identity.js";
import { headerMediaMismatch } from "../utils/template.header.js";
import { headerMediaFileExists } from "../services/template.media.service.js";
import { matchesContactSearch } from "../utils/contact.query.js";
import { CAMPAIGN_DRY_RUN, CAMPAIGN_MAX_RECIPIENTS, CAMPAIGN_RATE_PER_SECOND } from "../config.js";

const PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const SAMPLE_SIZE = 5;

// Lo único del contacto que hace falta para decidir y rellenar el mensaje.
const CONTACT_FIELDS = { name: 1, profileName: 1, username: 1, phone: 1, waUserId: 1, email: 1, company: 1, marketingOptOut: 1 };

const sendError = (res, status, message, extra = {}) => res.status(status).json([{ message, ...extra }]);

const toIso = (date) => (date ? new Date(date).toISOString() : null);

const findOwnedCampaign = (userId, id) =>
    mongoose.isValidObjectId(id) ? Campaign.findOne({ _id: id, userId }) : null;

// ---------------------------------------------------------------------------
// Borrador: plantilla + destinatarios + cómo se rellena. Lo comparten la vista
// previa y la creación, para que lo que se confirma sea lo que se revisó.
// ---------------------------------------------------------------------------

/**
 * Los contactos elegidos, como mucho CAMPAIGN_MAX_RECIPIENTS. `ids` comprueba
 * que sean de la cuenta (un id ajeno cuenta como no encontrado); `query` repite
 * la búsqueda, el filtro y las etiquetas de la lista de Contactos.
 */
const selectContacts = async (userId, recipients) => {
    if (recipients.mode === 'ids') {
        const uniqueIds = [...new Set(recipients.contactIds)];
        const contacts = await Contact.find({ _id: { $in: uniqueIds }, userId }).select(CONTACT_FIELDS).lean();
        return {
            contacts,
            duplicates: recipients.contactIds.length - uniqueIds.length,
            notFound: uniqueIds.length - contacts.length,
        };
    }

    const contacts = await Contact.aggregate([
        ...selectionQueryStages(userId, recipients),
        { $sort: { _id: 1 } },
        // Uno de más para saber si se pasó del tope sin contarlos todos.
        { $limit: CAMPAIGN_MAX_RECIPIENTS + 1 },
        { $project: CONTACT_FIELDS },
    ]);
    return { contacts, duplicates: 0, notFound: 0 };
};

// A quién llega un borrador: cada contacto elegido con su motivo para no
// enviarle (`null` = se le envía).
const planAudience = (contacts, excludeOptedOut) =>
    contacts.map(contact => ({ contact, skipReason: recipientSkipReason(contact, { excludeOptedOut }) }));

const parsePage = (query) => ({
    page: Math.max(parseInt(query.page) || 1, 1),
    limit: Math.min(Math.max(parseInt(query.limit) || PAGE_SIZE, 1), MAX_PAGE_SIZE),
});

/**
 * La plantilla con el archivo de cabecera que usará la campaña: el elegido en
 * el asistente (`headerMediaId`) en vez del de la plantilla. Tiene que ser de
 * la cuenta, del formato de la cabecera y seguir en disco.
 */
const withCampaignHeader = async (userId, template, headerMediaId) => {
    if (!template || !headerMediaId) return { template, errors: [] };

    const media = mongoose.isValidObjectId(headerMediaId)
        ? await TemplateMedia.findOne({ _id: headerMediaId, userId }).lean()
        : null;
    const mismatch = headerMediaMismatch(template, media);
    if (mismatch) return { template, errors: [{ field: 'headerMedia', message: mismatch }] };
    if (!await headerMediaFileExists(media)) {
        return { template, errors: [{ field: 'headerMedia', message: 'El archivo ya no está en el servidor: súbelo otra vez.' }] };
    }
    return { template: { ...template, headerMedia: media._id }, errors: [] };
};

const buildDraft = async (userId, body) => {
    // Sin plantilla (vista previa del paso de destinatarios) solo se cuentan
    // los contactos: no hay mensaje que validar todavía.
    const stored = body.templateId ? await Template.findOne({ userId, templateId: body.templateId }).lean() : null;
    const { template, errors: headerErrors } = await withCampaignHeader(userId, stored, body.headerMediaId);
    const config = { variables: body.variables ?? [], buttons: body.buttons ?? [] };
    // El que vale, no el que se pidió: es el que se guarda en la campaña.
    const excludeOptedOut = shouldExcludeOptedOut(template, body.excludeOptedOut);

    // Si el archivo elegido no vale, ese es el error de la cabecera (no «falta»).
    const messageErrors = body.templateId ? validateCampaignMessage(template, config) : [];
    const errors = headerErrors.length > 0
        ? [...headerErrors, ...messageErrors.filter(e => e.field !== 'headerMedia')]
        : messageErrors;
    const { contacts, duplicates, notFound } = await selectContacts(userId, body.recipients);

    if (contacts.length > CAMPAIGN_MAX_RECIPIENTS) {
        errors.push({ field: 'recipients', message: `Una campaña admite como mucho ${CAMPAIGN_MAX_RECIPIENTS} contactos. Acota la búsqueda o divídela en varias.` });
    }

    const plan = planAudience(contacts, excludeOptedOut);
    const sendable = plan.filter(p => !p.skipReason);
    if (errors.length === 0 && sendable.length === 0) {
        errors.push({ field: 'recipients', message: 'No queda ningún contacto al que enviar.' });
    }

    return { template, config, excludeOptedOut, plan, sendable, duplicates, notFound, errors };
};

// Cuántos usarán la reserva de cada variable y cómo queda el mensaje para los
// primeros. Solo con una configuración válida: con huecos no hay qué rellenar.
const previewMessages = (draft) => {
    const fallbacks = {};
    const samples = [];
    if (!draft.template || draft.errors.some(e => e.field !== 'recipients')) return { fallbacks, samples };

    for (const { contact } of draft.sendable) {
        const built = buildContactParameters(draft.template, draft.config, contact);
        built.fallbacks.forEach(key => { fallbacks[key] = (fallbacks[key] ?? 0) + 1; });
        if (samples.length < SAMPLE_SIZE) {
            samples.push({
                contactId: String(contact._id),
                displayName: contactDisplayName(contact),
                text: renderTemplateBody(draft.template.bodyText, built.parameters) ?? '',
                fallbacks: built.fallbacks,
                // Valor por clave: la UI resalta cada dato dentro del mensaje.
                values: built.values,
            });
        }
    }
    return { fallbacks, samples };
};

const summarizeDraft = (draft) => {
    const count = (fn) => draft.plan.filter(fn).length;
    const { fallbacks, samples } = previewMessages(draft);
    const template = draft.template;

    return {
        template: template ? {
            templateId: template.templateId,
            name: template.name,
            language: template.language,
            category: template.category,
            bodyText: template.bodyText ?? '',
            variables: extractTemplateVariables(template.bodyText),
            buttonsNeedingValue: buttonsNeedingValue(template.buttons).map(index => ({
                index, type: template.buttons[index]?.type, text: template.buttons[index]?.text ?? null,
            })),
        } : null,
        recipients: {
            selected: draft.plan.length,
            toSend: draft.sendable.length,
            optedOut: count(p => p.contact.marketingOptOut),
            excludedOptedOut: count(p => p.skipReason === 'opted_out'),
            // De los que lo recibirán: es lo que importa si una variable usa el
            // teléfono (la UI lo avisa en esa variable, no antes).
            withoutPhone: draft.sendable.filter(p => !p.contact.phone).length,
            duplicates: draft.duplicates,
            notFound: draft.notFound,
        },
        // A ojo, al ritmo del worker: lo que tarda si no hay otra campaña a la vez.
        estimatedSeconds: Math.ceil(draft.sendable.length / CAMPAIGN_RATE_PER_SECOND),
        // Se creará en modo de prueba: la UI lo avisa antes de enviar.
        dryRun: CAMPAIGN_DRY_RUN,
        fallbacks,
        samples,
        errors: draft.errors,
    };
};

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * POST /campaigns/preview — lo que se va a enviar, sin crear nada: cuántos
 * contactos, cuántos de baja o sin teléfono, cuántos usarán cada reserva y el
 * mensaje de ejemplo de los primeros. Responde 200 aunque haya `errors`: la UI
 * los enseña junto al campo.
 */
export const previewCampaign = async (req, res) => {
    try {
        const draft = await buildDraft(req.user.id, req.body);
        return res.json(summarizeDraft(draft));
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

/**
 * POST /campaigns/preview/recipients?page=&limit=&search= — quién recibiría el
 * borrador, por orden alfabético y paginado, con el motivo de los que se
 * omitirán. Es el «¿es la gente correcta?» del primer paso.
 */
export const previewCampaignRecipients = async (req, res) => {
    try {
        const { page, limit } = parsePage(req.query);
        const { contacts } = await selectContacts(req.user.id, req.body.recipients);
        // Como mucho CAMPAIGN_MAX_RECIPIENTS ya cargados: buscar en memoria es
        // más simple que repetir la selección con otra condición.
        const matching = contacts.filter(contact => matchesContactSearch(contact, req.query.search));
        const template = req.body.templateId
            ? await Template.findOne({ userId: req.user.id, templateId: req.body.templateId }).select('category').lean()
            : null;
        const plan = planAudience(matching, shouldExcludeOptedOut(template, req.body.excludeOptedOut))
            .map(({ contact, skipReason }) => ({
                contactId: String(contact._id),
                displayName: contactDisplayName(contact),
                phone: contact.phone ?? null,
                username: contact.username ?? null,
                optedOut: Boolean(contact.marketingOptOut),
                skipReason,
            }))
            .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));

        return res.json({
            recipients: plan.slice((page - 1) * limit, page * limit),
            totalCount: plan.length,
            page,
            limit,
        });
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

/**
 * POST /campaigns — crea la campaña y congela la lista de destinatarios. No
 * envía nada aquí: lo hace el worker, a su ritmo, aunque se cierre la página.
 */
export const createCampaign = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId).select('tokenWhatsapp phoneNumberId').lean();
        if (!user?.tokenWhatsapp || !user?.phoneNumberId) {
            return sendError(res, 409, 'La cuenta no tiene WhatsApp conectado. Conéctala desde Ajustes antes de enviar.');
        }

        const draft = await buildDraft(userId, req.body);
        if (draft.errors.length > 0) return res.status(400).json(draft.errors);

        const { template } = draft;
        const campaign = await Campaign.create({
            userId,
            name: req.body.name,
            template: {
                templateId: template.templateId,
                name: template.name,
                language: template.language,
                category: template.category,
                bodyText: template.bodyText ?? '',
                parameterFormat: template.parameterFormat,
                buttons: template.buttons ?? [],
                header: template.header ?? null,
                headerMedia: template.headerMedia ?? null,
            },
            variables: draft.config.variables,
            buttons: draft.config.buttons,
            excludeOptedOut: draft.excludeOptedOut,
            dryRun: CAMPAIGN_DRY_RUN,
            totalRecipients: draft.plan.length,
        });

        // Los omitidos también se guardan: el detalle tiene que decir a quién
        // no se le envió y por qué.
        await CampaignRecipient.insertMany(draft.plan.map(({ contact, skipReason }) => ({
            campaignId: campaign._id,
            userId,
            contactId: contact._id,
            status: skipReason ? 'skipped' : 'pending',
            skipReason,
            processedAt: skipReason ? new Date() : null,
        })), { ordered: false });

        // «Usar también como imagen de la plantilla»: el archivo elegido pasa a
        // ser el de la plantilla para los envíos siguientes.
        if (req.body.saveHeaderAsDefault && req.body.headerMediaId && template.headerMedia) {
            await Template.updateOne({ userId, templateId: template.templateId }, { $set: { headerMedia: template.headerMedia } });
        }

        wakeCampaignWorker();
        console.log('Campaña creada:', {
            campaignId: String(campaign._id), template: template.name, destinatarios: draft.sendable.length,
        });

        return res.status(201).json(serializeCampaign(campaign, await getCampaignStats(campaign._id)));
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

// GET /campaigns?page=&limit= — las campañas de la cuenta, del más reciente al más antiguo.
export const listCampaigns = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page, limit } = parsePage(req.query);

        const [campaigns, totalCount] = await Promise.all([
            Campaign.find({ userId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            Campaign.countDocuments({ userId }),
        ]);
        const stats = await getCampaignsStats(campaigns.map(c => c._id));

        return res.json({
            campaigns: campaigns.map(c => serializeCampaign(c, stats.get(String(c._id)))),
            totalCount,
            page,
            limit,
        });
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

// GET /campaigns/:id
export const getCampaign = async (req, res) => {
    try {
        const campaign = await findOwnedCampaign(req.user.id, req.params.id);
        if (!campaign) return sendError(res, 404, 'Campaña no encontrada');
        return res.json(serializeCampaign(campaign, await getCampaignStats(campaign._id)));
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

/**
 * GET /campaigns/:id/failures — por qué fallaron, agrupado por código de
 * error: `{ reasons: [{ code, detail, count }] }`.
 */
export const getCampaignFailures = async (req, res) => {
    try {
        const campaign = await findOwnedCampaign(req.user.id, req.params.id);
        if (!campaign) return sendError(res, 404, 'Campaña no encontrada');
        return res.json({ reasons: await getCampaignFailureReasons(campaign._id) });
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

// Estado de un destinatario tal como lo ve el usuario: el de su mensaje en
// WhatsApp si llegó a crearse, y si no, el de la cola. `sending` es «pendiente».
const RECIPIENT_STATES = ['pending', 'sent', 'delivered', 'read', 'failed', 'skipped', 'cancelled', 'interrupted'];

/**
 * GET /campaigns/:id/recipients?state=&page=&limit= — quién recibió qué. Cada
 * fila trae el contacto, el estado, el error de Meta si falló y la conversación
 * para poder abrirla.
 */
export const listCampaignRecipients = async (req, res) => {
    try {
        const campaign = await findOwnedCampaign(req.user.id, req.params.id);
        if (!campaign) return sendError(res, 404, 'Campaña no encontrada');

        const { page, limit } = parsePage(req.query);
        const state = RECIPIENT_STATES.includes(req.query.state) ? req.query.state : null;

        const [result] = await CampaignRecipient.aggregate([
            { $match: { campaignId: campaign._id } },
            { $lookup: { from: Message.collection.name, localField: 'messageId', foreignField: '_id', as: 'message' } },
            { $addFields: { message: { $arrayElemAt: ['$message', 0] } } },
            { $addFields: { state: { $switch: {
                branches: [
                    { case: { $ifNull: ['$message', false] }, then: '$message.status' },
                    { case: { $eq: ['$status', 'sending'] }, then: 'pending' },
                ],
                default: '$status',
            } } } },
            ...(state ? [{ $match: { state } }] : []),
            { $sort: { _id: 1 } },
            { $facet: {
                items: [
                    { $skip: (page - 1) * limit },
                    { $limit: limit },
                    { $lookup: { from: Contact.collection.name, localField: 'contactId', foreignField: '_id', as: 'contact' } },
                    { $addFields: { contact: { $arrayElemAt: ['$contact', 0] } } },
                ],
                total: [{ $count: 'count' }],
            } },
        ]);

        return res.json({
            recipients: result.items.map(row => ({
                id: String(row._id),
                contactId: String(row.contactId),
                // Un contacto borrado después de crear la campaña ya no tiene ficha.
                displayName: row.contact ? contactDisplayName(row.contact) : 'Contacto borrado',
                phone: row.contact?.phone ?? null,
                username: row.contact?.username ?? null,
                state: row.state,
                skipReason: row.skipReason ?? null,
                errorCode: row.message?.errorCode ?? row.errorCode ?? null,
                errorDetail: row.message?.errorDetail ?? row.errorDetail ?? null,
                conversationId: row.message?.conversationId ? String(row.message.conversationId) : null,
                sentAt: toIso(row.message?.timestamp),
                deliveredAt: toIso(row.message?.deliveredAt),
                readAt: toIso(row.message?.readAt),
                failedAt: toIso(row.message?.failedAt),
                processedAt: toIso(row.processedAt),
            })),
            totalCount: result.total[0]?.count ?? 0,
            page,
            limit,
        });
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

// Cambia el estado solo desde los permitidos; 409 si ya no se puede (p. ej.
// pausar uno que terminó mientras tanto).
const transition = async (req, res, { from, set, conflict, after }) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) return sendError(res, 404, 'Campaña no encontrada');

        const campaign = await Campaign.findOneAndUpdate(
            { _id: id, userId: req.user.id, status: { $in: from } },
            { $set: set() },
            { new: true },
        );
        if (!campaign) {
            const exists = await Campaign.exists({ _id: id, userId: req.user.id });
            return exists ? sendError(res, 409, conflict) : sendError(res, 404, 'Campaña no encontrada');
        }

        await after?.(campaign);
        await emitCampaignProgress(campaign._id, { force: true });
        return res.json(serializeCampaign(campaign, await getCampaignStats(campaign._id)));
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

// POST /campaigns/:id/pause — el mensaje en curso termina; el resto espera.
export const pauseCampaign = (req, res) => transition(req, res, {
    from: ['queued', 'sending'],
    set: () => ({ status: 'paused', pauseReason: { code: null, message: null } }),
    conflict: 'Esta campaña ya no se puede pausar.',
});

// POST /campaigns/:id/resume — vuelve a la cola; si la cuenta tiene otro
// enviándose, espera a que termine.
export const resumeCampaign = (req, res) => transition(req, res, {
    from: ['paused'],
    set: () => ({ status: 'queued', pauseReason: { code: null, message: null } }),
    conflict: 'Solo se puede reanudar una campaña pausada.',
    after: () => wakeCampaignWorker(),
});

// POST /campaigns/:id/cancel — los que faltan ya no se envían. Lo enviado no
// se puede deshacer.
export const cancelCampaign = (req, res) => transition(req, res, {
    from: ['queued', 'sending', 'paused'],
    set: () => ({ status: 'cancelled', finishedAt: new Date() }),
    conflict: 'Esta campaña ya terminó.',
    after: (campaign) => CampaignRecipient.updateMany(
        { campaignId: campaign._id, status: 'pending' },
        { $set: { status: 'cancelled', processedAt: new Date() } },
    ),
});
