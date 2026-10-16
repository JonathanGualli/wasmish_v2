import crypto from "node:crypto";
import Message from "../models/message.model.js";
import Conversation from "../models/conversation.model.js";
import Contact from "../models/contact.model.js";
import AutoReplySettings from "../models/auto.reply.settings.model.js";
import { processMessageSending } from "../controllers/chat.controller.js";
import { findConversationLine } from "../services/line.service.js";
import { freeTextBlockReason } from "../utils/whatsapp.window.js";
import { AUTO_REPLY_EXPIRY_MS, autoReplyOutcome, botStateUpdate, decideAutoReply } from "../utils/auto.reply.js";

// ---------------------------------------------------------------------------
// Worker de las respuestas automáticas. Corre dentro del proceso de la API,
// como el de campañas: la cola son los propios entrantes (`Message.bot`), así
// que no hace falta Redis ni otra colección. El flujo completo y el porqué:
// docs/arquitectura/respuestas-automaticas.md.
//
// Supone UNA sola instancia de la API (como hoy en el compose): al arrancar da
// por muertos los trabajos que estaban en curso.
// ---------------------------------------------------------------------------

const CONCURRENCY = 5;               // trabajos a la vez
const LEASE_MS = 60_000;             // lo que puede durar un trabajo antes de darlo por muerto
const LOCK_MS = 60_000;              // el candado del contacto
const BUSY_RETRY_MS = 2_000;         // candado ocupado: se reintenta después de esto
const IDLE_MS = 3_000;               // sin trabajo: cada cuánto se vuelve a mirar
const SWEEP_MS = 30_000;             // cada cuánto se recogen los trabajos a medias
const WAITING_RECOVERY_MS = 30_000;  // un `waiting` más viejo que esto quedó a medias
const STOP_TIMEOUT_MS = 8_000;       // al parar, lo que se espera a los envíos en curso
const HOUR_MS = 60 * 60 * 1000;

let running = false;
let loopPromise = null;
let wakeIdle = null;
let wakeRequested = false;
const inFlight = new Set();

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// La espera sin trabajo se corta al llegar un entrante (`wakeAutoReplyWorker`)
// o al terminar un trabajo. Un aviso que llega mientras no se espera no se
// pierde: la siguiente espera termina al momento.
const idle = (ms) => new Promise(resolve => {
    if (wakeRequested) {
        wakeRequested = false;
        resolve();
        return;
    }
    const timer = setTimeout(resolve, ms);
    wakeIdle = () => { clearTimeout(timer); resolve(); };
});

export const wakeAutoReplyWorker = () => {
    wakeRequested = true;
    wakeIdle?.();
    wakeIdle = null;
};

// Termina el trabajo: fuera de la cola (`active`) y con su estado final.
const finishJob = (job, status, { reason = null, replyMessageId = null } = {}) => Message.updateOne(
    { _id: job._id },
    {
        $set: { 'bot.status': status, 'bot.skipReason': reason, 'bot.replyMessageId': replyMessageId, 'bot.leaseUntil': null },
        $unset: { 'bot.active': '' },
    },
);

// Sin textos: son conversaciones privadas de los clientes de nuestros clientes.
const logJob = (job, status, reason) => console.log('Respuesta automática:', {
    messageId: String(job._id),
    conversationId: String(job.conversationId),
    status,
    reason,
    ageMs: Date.now() - new Date(job.timestamp).getTime(),
});

/**
 * El bot puede enviar: un `updateOne` condicional que solo pasa si nadie
 * respondió a mano en las últimas `handoffHours`. Atómico contra
 * `markHumanReply`: desde aquí el envío está en curso. Devuelve si pasó.
 */
export const authorizeBotSend = async ({ conversationId, handoffHours, now = new Date() }) => {
    const limit = new Date(now.getTime() - handoffHours * HOUR_MS);
    const result = await Conversation.updateOne(
        { _id: conversationId, $or: [{ 'bot.humanRepliedAt': null }, { 'bot.humanRepliedAt': { $lte: limit } }] },
        { $set: { 'bot.authorizedAt': now } },
    );
    return result.matchedCount > 0;
};

// Toma el trabajo pendiente más antiguo, de forma atómica.
const claimNextJob = (now = new Date()) => Message.findOneAndUpdate(
    { 'bot.active': true, 'bot.status': 'pending', 'bot.runAfter': { $lte: now } },
    { $set: { 'bot.status': 'processing', 'bot.leaseUntil': new Date(now.getTime() + LEASE_MS) }, $inc: { 'bot.attempts': 1 } },
    { sort: { 'bot.runAfter': 1 }, new: true },
).lean();

// El candado del contacto: una evaluación a la vez por contacto, aunque
// escriba por dos líneas. Devuelve el contacto si lo consiguió.
const lockContact = (accountId, contactId, token, now) => Contact.findOneAndUpdate(
    { _id: contactId, userId: accountId, $or: [{ 'autoReply.lockUntil': null }, { 'autoReply.lockUntil': { $lt: now } }] },
    { $set: { 'autoReply.lockUntil': new Date(now.getTime() + LOCK_MS), 'autoReply.lockToken': token } },
    { new: true },
).lean();

// Solo si el candado sigue siendo nuestro: si caducó y lo tomó otro, no se toca.
const unlockContact = (contactId, token) => Contact.updateOne(
    { _id: contactId, 'autoReply.lockToken': token },
    { $set: { 'autoReply.lockUntil': null, 'autoReply.lockToken': null } },
);

/** Resuelve un trabajo ya tomado. Devuelve cómo terminó (o 'busy'). */
const resolveJob = async (job) => {
    const now = new Date();
    if (now.getTime() - new Date(job.timestamp).getTime() > AUTO_REPLY_EXPIRY_MS) {
        await finishJob(job, 'expired');
        logJob(job, 'expired', null);
        return 'expired';
    }

    const conversationRef = await Conversation.findById(job.conversationId).select('userId contactId').lean();
    if (!conversationRef?.contactId) {
        await finishJob(job, 'failed', { reason: 'no_conversation' });
        logJob(job, 'failed', 'no_conversation');
        return 'failed';
    }
    const { userId: accountId, contactId } = conversationRef;

    const token = crypto.randomUUID();
    const contact = await lockContact(accountId, contactId, token, now);
    if (!contact) {
        await Message.updateOne(
            { _id: job._id, 'bot.status': 'processing' },
            { $set: { 'bot.status': 'pending', 'bot.runAfter': new Date(now.getTime() + BUSY_RETRY_MS), 'bot.leaseUntil': null } },
        );
        return 'busy';
    }

    let sendStarted = false;
    try {
        // Todo se relee con el candado puesto: otro trabajo del contacto pudo
        // cambiarlo justo antes (la bienvenida, el freno).
        const [settings, conversation] = await Promise.all([
            AutoReplySettings.findOne({ userId: accountId }).lean(),
            Conversation.findOne({ _id: job.conversationId, userId: accountId }),
        ]);

        // El entrante guardado ya prueba que la ventana está abierta, aunque la
        // conversación no llegara a guardarse con él (un corte en el webhook).
        const lastInbound = [conversation.lastInboundAt, job.timestamp].filter(Boolean)
            .reduce((latest, date) => (new Date(date) > new Date(latest) ? date : latest));
        if (freeTextBlockReason(lastInbound, now)) {
            await finishJob(job, 'skipped', { reason: 'window_closed' });
            logJob(job, 'skipped', 'window_closed');
            return 'skipped';
        }

        const state = conversation.bot?.toObject?.() ?? {};
        const decision = decideAutoReply({
            settings: settings ?? { enabled: false },
            state,
            welcomedAt: contact.autoReply?.welcomedAt ?? null,
            message: { type: job.type, text: job.text, caption: job.caption },
            previousInboundAt: job.bot.previousInboundAt,
            lineId: conversation.lineId ? String(conversation.lineId) : null,
            now,
        });
        if (decision.skip) {
            await finishJob(job, 'skipped', { reason: decision.skip });
            logJob(job, 'skipped', decision.skip);
            return 'skipped';
        }

        let line;
        try {
            line = await findConversationLine(conversation);
        } catch (error) {
            await finishJob(job, 'failed', { reason: 'line_unavailable' });
            logJob(job, 'failed', 'line_unavailable');
            return 'failed';
        }

        if (!await authorizeBotSend({ conversationId: conversation._id, handoffHours: settings.handoffHours, now })) {
            await finishJob(job, 'skipped', { reason: 'human' });
            logJob(job, 'skipped', 'human');
            return 'skipped';
        }

        await Message.updateOne({ _id: job._id }, { $set: { 'bot.sendStartedAt': new Date() } });
        sendStarted = true;
        const result = await processMessageSending({ line, conversation, text: decision.text, origin: 'bot' });

        const outcome = autoReplyOutcome({ result, error: null, sendStarted });
        if (outcome.applyClaims) {
            await Conversation.updateOne({ _id: conversation._id }, { $set: botStateUpdate(state, decision.claims, now) });
            if (decision.claims.welcomed) await Contact.updateOne({ _id: contactId }, { $set: { 'autoReply.welcomedAt': now } });
        }
        const reason = outcome.status === 'failed' ? `meta_${result.errorCode ?? 'error'}` : null;
        await finishJob(job, outcome.status, { reason, replyMessageId: result.msg._id });
        logJob(job, outcome.status, reason);
        return outcome.status;
    } catch (error) {
        const outcome = autoReplyOutcome({ result: null, error, sendStarted });
        console.error('Respuesta automática con error:', { messageId: String(job._id), sendStarted, error: error.message });
        await finishJob(job, outcome.status, { reason: 'error' });
        return outcome.status;
    } finally {
        await unlockContact(contactId, token);
    }
};

/**
 * Toma UN trabajo pendiente y lo resuelve. 'idle' si no había ninguno listo;
 * 'busy' si su contacto estaba ocupado (vuelve a la cola). Exportada para los tests.
 */
export const processNextAutoReply = async () => {
    const job = await claimNextJob();
    if (!job) return 'idle';
    return resolveJob(job);
};

/**
 * Recoge lo que quedó a medias. Un `waiting` viejo es un entrante cuyo webhook
 * se cortó antes de marcarlo listo: se repara lo que se puede repetir sin daño
 * (`$max` de `lastInboundAt`) y vuelve a la cola. Un `processing` vencido (al
 * arrancar, todos: hay una sola instancia) vuelve a la cola si no llegó a
 * enviar, o queda `uncertain` si ya había empezado: no se reintenta.
 */
export const recoverAutoReplyJobs = async ({ startup = false } = {}) => {
    const now = new Date();

    const stale = await Message.find({
        'bot.active': true, 'bot.status': 'waiting', createdAt: { $lte: new Date(now.getTime() - WAITING_RECOVERY_MS) },
    }).select('_id conversationId timestamp').lean();
    for (const message of stale) {
        await Conversation.updateOne({ _id: message.conversationId }, { $max: { lastInboundAt: message.timestamp } });
        await Message.updateOne({ _id: message._id, 'bot.status': 'waiting' }, { $set: { 'bot.status': 'pending' } });
    }

    const dead = { 'bot.active': true, 'bot.status': 'processing', ...(startup ? {} : { 'bot.leaseUntil': { $lt: now } }) };
    const uncertain = await Message.updateMany(
        { ...dead, 'bot.sendStartedAt': { $ne: null } },
        { $set: { 'bot.status': 'uncertain', 'bot.skipReason': 'interrupted', 'bot.leaseUntil': null }, $unset: { 'bot.active': '' } },
    );
    const requeued = await Message.updateMany(
        { ...dead, 'bot.sendStartedAt': null },
        { $set: { 'bot.status': 'pending', 'bot.runAfter': now, 'bot.leaseUntil': null } },
    );

    const summary = { requeued: stale.length + requeued.modifiedCount, uncertain: uncertain.modifiedCount };
    if (summary.requeued || summary.uncertain) console.warn('Respuestas automáticas recogidas:', summary);
    return summary;
};

const loop = async () => {
    let lastSweep = Date.now();
    while (running) {
        try {
            if (Date.now() - lastSweep >= SWEEP_MS) {
                lastSweep = Date.now();
                await recoverAutoReplyJobs();
            }
            while (running && inFlight.size < CONCURRENCY) {
                const job = await claimNextJob();
                if (!job) break;
                const task = resolveJob(job)
                    .catch(error => console.error('Worker de respuestas automáticas:', error.message))
                    .finally(() => {
                        inFlight.delete(task);
                        wakeAutoReplyWorker();
                    });
                inFlight.add(task);
            }
            if (running) await idle(IDLE_MS);
        } catch (error) {
            // Un fallo de la BD no puede matar el worker: se reintenta en la vuelta siguiente.
            console.error('Worker de respuestas automáticas:', error.message);
            if (running) await idle(IDLE_MS);
        }
    }
};

/** Arranca el worker, después de recoger lo que dejó a medias el proceso anterior. */
export const startAutoReplyWorker = async () => {
    if (running) return;
    running = true;
    try {
        await recoverAutoReplyJobs({ startup: true });
    } catch (error) {
        console.error('Respuestas automáticas: no se pudo recoger lo pendiente al arrancar:', error.message);
    }
    loopPromise = loop();
};

// Deja de tomar trabajos y espera los envíos en curso, como mucho
// STOP_TIMEOUT_MS: lo que no termine queda `processing` y el próximo arranque
// lo resuelve (`uncertain` si ya había empezado a enviar).
export const stopAutoReplyWorker = async () => {
    running = false;
    wakeAutoReplyWorker();
    await loopPromise;
    await Promise.race([Promise.allSettled([...inFlight]), sleep(STOP_TIMEOUT_MS)]);
};
