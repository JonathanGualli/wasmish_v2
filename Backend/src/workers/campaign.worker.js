import Campaign from "../models/campaign.model.js";
import CampaignRecipient from "../models/campaign.recipient.model.js";
import Contact from "../models/contact.model.js";
import User from "../models/user.model.js";
import { processTemplateSending } from "../controllers/template.controller.js";
import { emitCampaignProgress } from "../services/campaign.service.js";
import { buildContactParameters } from "../utils/campaign.message.js";
import { recipientSkipReason, stoppingErrorMessage, THROTTLE_ERROR } from "../utils/campaign.status.js";
import { CAMPAIGN_DRY_RUN, CAMPAIGN_RATE_PER_SECOND } from "../config.js";

// ---------------------------------------------------------------------------
// Worker de las campañas. Corre dentro del proceso de la API: la cola es
// la colección CampaignRecipient, así que no hace falta Redis ni otro servicio.
//
// En cada vuelta toma UNA campaña activa por cuenta y le envía UN mensaje a
// cada una, con una pausa entre envíos que fija el ritmo total. Así una campaña
// grande de una cuenta no deja esperando a la de otra.
//
// Supone UNA sola instancia de la API (como hoy en el compose): al arrancar da
// por muertos los envíos a medias. Con dos réplicas, una marcaría como
// interrumpidos los que la otra está enviando.
// ---------------------------------------------------------------------------

const IDLE_MS = 3000;            // sin trabajo: cada cuánto se vuelve a mirar
const THROTTLE_PAUSE_MS = 10000; // Meta pidió bajar el ritmo (130429)
const SEND_INTERVAL_MS = 1000 / Math.max(CAMPAIGN_RATE_PER_SECOND, 0.1);

let running = false;
let loopPromise = null;
let wakeIdle = null;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// La espera sin trabajo se puede cortar: crear o reanudar una campaña llama a
// `wakeCampaignWorker` para que empiece ya y no a los 3 s.
const idle = (ms) => new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    wakeIdle = () => { clearTimeout(timer); resolve(); };
});

export const wakeCampaignWorker = () => wakeIdle?.();

// Una por cuenta: la que ya está enviando o, si no hay, la más antigua en cola.
const pickActiveCampaigns = async () => {
    const candidates = await Campaign.find({ status: { $in: ['sending', 'queued'] } }).sort({ createdAt: 1 }).lean();
    const byUser = new Map();
    for (const campaign of candidates) {
        const key = String(campaign.userId);
        const current = byUser.get(key);
        if (!current || (current.status === 'queued' && campaign.status === 'sending')) byUser.set(key, campaign);
    }
    return [...byUser.values()];
};

const autoPause = async (campaign, code, message) => {
    const paused = await Campaign.updateOne(
        { _id: campaign._id, status: 'sending' },
        { $set: { status: 'paused', pauseReason: { code: String(code), message } } },
    );
    if (paused.modifiedCount > 0) {
        console.warn('Campaña pausada por un error de la cuenta o la plantilla:', { campaignId: String(campaign._id), code });
        await emitCampaignProgress(campaign._id, { force: true });
    }
};

// Sin pendientes ni en curso, la campaña ha terminado.
const finishIfDone = async (campaign) => {
    const inFlight = await CampaignRecipient.exists({ campaignId: campaign._id, status: { $in: ['pending', 'sending'] } });
    if (inFlight) return;

    const done = await Campaign.updateOne(
        { _id: campaign._id, status: 'sending' },
        { $set: { status: 'completed', finishedAt: new Date() } },
    );
    if (done.modifiedCount > 0) await emitCampaignProgress(campaign._id, { force: true });
};

const markRecipient = (recipient, changes) =>
    CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { ...changes, processedAt: new Date() } });

/**
 * Envía al siguiente destinatario de una campaña. Devuelve qué pasó, para que
 * la vuelta decida cuánto esperar: 'sent' (hubo llamada a Meta), 'skipped'
 * (no hizo falta llamar), 'throttled' (Meta pidió frenar) o 'idle' (no quedaba
 * nadie).
 */
const processNext = async (campaign) => {
    if (campaign.status === 'queued') {
        const started = await Campaign.findOneAndUpdate(
            { _id: campaign._id, status: 'queued' },
            { $set: { status: 'sending', startedAt: campaign.startedAt ?? new Date() } },
            { new: true },
        ).lean();
        if (!started) return 'idle';
        campaign = started;
        await emitCampaignProgress(campaign._id, { force: true });
    }

    // Atómico: pasar de pending a sending es lo que «reserva» al destinatario.
    const recipient = await CampaignRecipient.findOneAndUpdate(
        { campaignId: campaign._id, status: 'pending' },
        { $set: { status: 'sending' } },
        { sort: { _id: 1 }, new: true },
    ).lean();

    if (!recipient) {
        await finishIfDone(campaign);
        return 'idle';
    }

    // Se vuelve a mirar el contacto: puede haberse borrado o dado de baja
    // desde que se creó la campaña.
    const contact = await Contact.findOne({ _id: recipient.contactId, userId: campaign.userId });
    const skipReason = recipientSkipReason(contact, { excludeOptedOut: campaign.excludeOptedOut });
    if (skipReason) {
        await markRecipient(recipient, { status: 'skipped', skipReason });
        await emitCampaignProgress(campaign._id);
        return 'skipped';
    }

    const user = await User.findById(campaign.userId);

    try {
        const { parameters, buttons } = buildContactParameters(campaign.template, campaign, contact);
        const result = await processTemplateSending({
            user,
            contact,
            templateName: campaign.template.name,
            language: campaign.template.language,
            parameters,
            buttons,
            template: campaign.template,
            campaignId: campaign._id,
            // Con el modo de prueba encendido no sale nada, aunque la campaña
            // se hubiera creado sin él.
            dryRun: CAMPAIGN_DRY_RUN || campaign.dryRun,
        });

        await markRecipient(recipient, {
            status: 'done',
            messageId: result.msg._id,
            errorCode: result.errorCode,
            errorDetail: result.errorDetail,
        });

        const stopMessage = stoppingErrorMessage(result.errorCode);
        if (stopMessage) await autoPause(campaign, result.errorCode, stopMessage);

        await emitCampaignProgress(campaign._id);
        return result.errorCode === THROTTLE_ERROR ? 'throttled' : 'sent';
    } catch (error) {
        // Un error ANTES de Meta (o al guardar): no hay Message. Se apunta en el
        // destinatario para que se vea en el detalle de la campaña.
        await markRecipient(recipient, {
            status: 'failed',
            errorCode: error.statusCode ? String(error.statusCode) : null,
            errorDetail: error.message,
        });
        console.error('Campaña: destinatario fallido antes de Meta:', {
            campaignId: String(campaign._id), recipientId: String(recipient._id), error: error.message,
        });

        // 409 = la cuenta ya no tiene WhatsApp conectado: le pasará a todos.
        // Lo mismo con la cabecera de la plantilla (su archivo ya no está).
        if (error.statusCode === 409) await autoPause(campaign, 'whatsapp_disconnected', error.message);
        else if (error.pausesCampaign) await autoPause(campaign, 'template_header', error.message);

        await emitCampaignProgress(campaign._id);
        return 'sent';
    }
};

const runRound = async () => {
    const campaigns = await pickActiveCampaigns();
    let worked = false;

    for (const campaign of campaigns) {
        if (!running) break;
        const outcome = await processNext(campaign);
        if (outcome !== 'idle') worked = true;
        if (outcome === 'sent') await sleep(SEND_INTERVAL_MS);
        if (outcome === 'throttled') await sleep(THROTTLE_PAUSE_MS);
    }
    return worked;
};

const loop = async () => {
    while (running) {
        try {
            const worked = await runRound();
            if (!worked && running) await idle(IDLE_MS);
        } catch (error) {
            // Un fallo de la BD no puede matar el worker: se reintenta en la vuelta siguiente.
            console.error('Worker de campañas:', error.message);
            if (running) await idle(IDLE_MS);
        }
    }
};

/**
 * Arranca el worker. Lo primero es cerrar lo que quedó a medias: un
 * destinatario en `sending` es de un proceso anterior que murió mientras le
 * enviaba. No se sabe si Meta lo recibió, así que se marca `interrupted` y NO
 * se reintenta: mejor uno sin enviar que uno repetido.
 */
export const startCampaignWorker = async () => {
    if (running) return;
    running = true;

    const { modifiedCount } = await CampaignRecipient.updateMany(
        { status: 'sending' },
        { $set: { status: 'interrupted', errorDetail: 'El servidor se reinició mientras se enviaba', processedAt: new Date() } },
    );
    if (modifiedCount > 0) console.warn(`Campañas: ${modifiedCount} destinatario(s) interrumpidos por un reinicio.`);

    if (CAMPAIGN_DRY_RUN) {
        console.warn('Campañas en MODO DE PRUEBA (CAMPAIGN_DRY_RUN): no se llama a Meta.');
    }

    loopPromise = loop();
};

// Para el worker después del envío en curso. Lo llama el apagado del proceso,
// para que un deploy no deje un destinatario a medias.
export const stopCampaignWorker = async () => {
    running = false;
    wakeIdle?.();
    await loopPromise;
};
