import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import Account from '../models/account.model.js';
import User from '../models/user.model.js';
import Line from '../models/line.model.js';
import Waba from '../models/waba.model.js';
import Contact from '../models/contact.model.js';
import ContactNote from '../models/contact.note.model.js';
import Conversation from '../models/conversation.model.js';
import Message from '../models/message.model.js';
import Template from '../models/template.model.js';
import TemplateMedia from '../models/template.media.model.js';
import Tag from '../models/tag.model.js';
import Campaign from '../models/campaign.model.js';
import CampaignRecipient from '../models/campaign.recipient.model.js';
import ApiKey from '../models/api.keys.model.js';
import AutoReplySettings from '../models/auto.reply.settings.model.js';
import Invitation from '../models/invitation.model.js';
import PushSubscription from '../models/push.subscription.model.js';
import { createAccountWithOwner } from './account.service.js';
import { applyConnection, updateLineSettings } from './line.service.js';
import { encrypt } from '../utils/crypto.js';
import { tagKey } from '../utils/contact.tags.js';
import { defaultAutoReplySettings } from '../utils/auto.reply.js';
import { guardarArchivo, nombreDeArchivo, rutaDeArchivo } from '../utils/media.storage.js';
import {
    DEMO_PLAN, demoPhone, demoTime, firstNameOf, renderDemoBody, demoBulkContacts,
    demoCampaignResults, demoCampaignRecipients, demoSeedAction, demoMediaId, isDemoSeededFile,
} from '../utils/demo.js';

// Las cuentas de demostración (`npm run seed:demo`): una por nicho, con datos
// inventados, para enseñar Wasmish a un prospecto sin datos reales. Corren en
// PRODUCCIÓN, así que todo lo que borra pasa antes por la marca
// (`Account.plan === DEMO_PLAN`). Nada sale a Meta: el número y el token son
// falsos y la línea no recibe nada (ningún webhook trae su `phoneNumberId`). La
// campaña nace terminada, sin nadie en cola, así que el worker no la toca; no
// lleva `dryRun` porque la lista enseñaría «Prueba» en la demo. Detalle: pruebas-y-scripts.md § Cuentas de demostración.

const later = (date, minutes) => new Date(date.getTime() + minutes * 60e3);
const wamid = () => `wamid.demo.${new mongoose.Types.ObjectId()}`;

// Todo lo de una cuenta. Solo se llama con una cuenta de demostración
// (`cleanDemoAccount`, `seedDemoAccount`). Del disco borra solo los PDF que
// sembró: un archivo enviado desde el chat se guarda por su contenido
// (`outbound/<sha256>`) y puede ser también de un cliente real que mandó el
// mismo (revisión de Codex del PR #124). Lo enviado durante una demo queda en
// el disco, sin mensaje que lo nombre.
const deleteAccountData = async (accountId, mediaDir) => {
    const conversationIds = await Conversation.distinct('_id', { userId: accountId });
    const phoneNumberIds = await Line.distinct('phoneNumberId', { accountId });
    const files = await Message.distinct('mediaFile', { conversationId: { $in: conversationIds }, mediaFile: { $type: 'string' } });
    for (const file of files.filter(f => isDemoSeededFile(f, phoneNumberIds))) {
        const ruta = rutaDeArchivo(mediaDir, file);
        if (ruta) await fs.rm(ruta, { force: true });
    }
    await Message.deleteMany({ conversationId: { $in: conversationIds } });
    await Conversation.deleteMany({ userId: accountId });
    await CampaignRecipient.deleteMany({ userId: accountId });
    await Campaign.deleteMany({ userId: accountId });
    await ContactNote.deleteMany({ userId: accountId });
    await Contact.deleteMany({ userId: accountId });
    await Tag.deleteMany({ userId: accountId });
    await Template.deleteMany({ userId: accountId });
    await TemplateMedia.deleteMany({ userId: accountId });
    await ApiKey.deleteMany({ userId: accountId });
    await AutoReplySettings.deleteMany({ userId: accountId });
    await Invitation.deleteMany({ accountId });
    await PushSubscription.deleteMany({ accountId });
    await Line.deleteMany({ accountId });
    await Waba.deleteMany({ accountId });
    await User.deleteMany({ accountId });
    await Account.deleteOne({ _id: accountId });
};

/**
 * Borra la cuenta de demostración del escenario. false si no existe; lanza un
 * error, sin tocar nada, si el correo del dueño es de una cuenta que no lleva la marca.
 */
export const cleanDemoAccount = async (scenario, { mediaDir }) => {
    const owner = await User.findOne({ email: scenario.owner.email }).lean();
    if (!owner) return false;
    const account = await Account.findById(owner.accountId).lean();
    if (account?.plan !== DEMO_PLAN) throw new Error(`${scenario.owner.email} es de una cuenta que no es de demostración: no se toca.`);
    await deleteAccountData(owner.accountId, mediaDir);
    return true;
};

/**
 * Crea la cuenta de demostración del escenario, o la rehace con `reset` (las
 * fechas quedan contadas desde `now` y se pierde lo que se tocó en una demo).
 * `passwordHash`: la contraseña ya hasheada, la misma para el dueño y el agente.
 * `fixturesDir`: de dónde se copian los PDF a `mediaDir`.
 */
export const seedDemoAccount = async (scenario, { passwordHash, now = new Date(), reset = false, mediaDir, fixturesDir }) => {
    const existingOwner = await User.findOne({ email: scenario.owner.email }).lean();
    const existingAccount = existingOwner ? await Account.findById(existingOwner.accountId).lean() : null;
    const existingAgent = await User.findOne({ email: scenario.agent.email }).lean();
    const agentTaken = Boolean(existingAgent) && String(existingAgent.accountId) !== String(existingOwner?.accountId);
    const { action, reason } = demoSeedAction({ owner: existingOwner, account: existingAccount, agentTaken, reset });
    if (action === 'refuse') throw new Error(`${scenario.owner.email}: ${reason}.`);
    if (action === 'reset') await deleteAccountData(existingOwner.accountId, mediaDir);

    const at = (spec) => demoTime(spec, now);

    // La cuenta y su dueño, como el registro; la marca, antes que nada más.
    const owner = await createAccountWithOwner({ name: scenario.owner.name, email: scenario.owner.email, password: passwordHash });
    const accountId = owner.accountId;
    await Account.updateOne({ _id: accountId }, { $set: { name: scenario.accountName, plan: DEMO_PLAN, 'limits.maxUsers': 3 } });

    // La línea, con el servicio de siempre: «Junto con la app», con número y token falsos.
    const { line } = scenario;
    const { lineId } = await applyConnection({
        accountId, waBusinessId: line.waBusinessId, tokenWhatsapp: encrypt('TOKEN-FALSO-DEMOSTRACION'),
        // Sin pedir el historial: el número y el token son falsos, y el worker
        // le pediría a Meta en cuanto la línea lo tuviera (revisión de Codex del PR #132).
        phoneNumberId: line.phoneNumberId, businessApp: true, requestHistory: false,
        details: { phoneNumberId: line.phoneNumberId, displayPhoneNumber: line.display, verifiedName: line.verifiedName },
    });
    await updateLineSettings(accountId, lineId, { name: line.name });
    await Line.updateOne({ _id: lineId }, { $set: { connectedAt: at('90d') } });

    const agent = await User.create({
        name: scenario.agent.name, email: scenario.agent.email, password: passwordHash,
        accountId, role: 'agent', lineIds: [lineId], status: 'active',
    });
    const people = { owner, agent };

    const templates = {};
    for (const t of scenario.templates) {
        templates[t.key] = await Template.create({
            userId: accountId, templateId: `demo-${scenario.key}-${t.name}`, waBusinessId: line.waBusinessId, name: t.name,
            language: 'es', category: t.category, status: 'APPROVED', bodyText: t.bodyText, buttons: [],
            parameterFormat: 'POSITIONAL', header: null,
        });
    }

    const tagIds = new Map();
    for (const name of scenario.tags) tagIds.set(name, (await Tag.create({ userId: accountId, name, key: tagKey(name) }))._id);

    const contactRows = [...scenario.contacts, ...demoBulkContacts(scenario.bulk)];
    const contacts = new Map();
    for (const c of contactRows) {
        const contact = await Contact.create({
            userId: accountId, phone: demoPhone(c.n), name: c.name ?? null,
            profileName: c.profileName ?? (c.name ? c.name.split(' ')[0] : null),
            company: c.company ?? null, source: c.n % 3 ? 'inbound' : 'manual',
            tags: c.tags.map(name => tagIds.get(name)),
            // Contactos ordena a los que no tienen conversación por su alta: de
            // hace dos meses, quedan debajo de los que sí la tienen.
            createdAt: at('60d'),
        });
        contacts.set(c.key, contact);
    }

    for (const note of scenario.notes) {
        const author = people[note.by];
        await ContactNote.create({
            userId: accountId, contactId: contacts.get(note.contact)._id, text: note.text,
            authorId: author._id, authorName: author.name, source: 'manual', createdAt: at(note.at),
        });
    }

    // --- Conversaciones y mensajes ---------------------------------------------
    const conversations = new Map();
    const conversationOf = async (contactKey) => {
        if (!conversations.has(contactKey)) {
            const contact = contacts.get(contactKey);
            conversations.set(contactKey, await Conversation.create({
                userId: accountId, contactId: contact._id, contactPhone: contact.phone,
                phoneNumberId: line.phoneNumberId, lineId,
                lastMessage: '', lastMessageAt: new Date(0), lastInboundAt: null, unreadCount: 0,
            }));
        }
        return conversations.get(contactKey);
    };

    let mediaSeq = 0;
    const documentFields = async ({ file, filename }) => {
        const contenido = await fs.readFile(path.join(fixturesDir, file));
        const mediaId = demoMediaId(line.phoneNumberId, ++mediaSeq);
        const mediaFile = nombreDeArchivo(mediaId, 'application/pdf');
        await guardarArchivo(mediaDir, mediaFile, contenido);
        return { type: 'document', mediaId, mimeType: 'application/pdf', mediaFile, mediaFilename: filename, mediaSize: contenido.length };
    };

    const addMessage = async (conversation, { direction, text, timestamp, status = 'read', extra = {} }) => {
        const outbound = direction === 'outbound';
        const msg = await Message.create({
            conversationId: conversation._id, direction, sender: outbound ? 'me' : 'them',
            waMessageId: wamid(), text, timestamp,
            ...(outbound && {
                status,
                deliveredAt: ['delivered', 'read'].includes(status) ? later(timestamp, 1) : null,
                readAt: status === 'read' ? later(timestamp, 4) : null,
                failedAt: status === 'failed' ? later(timestamp, 1) : null,
            }),
            ...extra,
        });
        const update = {};
        if (timestamp > conversation.lastMessageAt) Object.assign(update, { lastMessage: text, lastMessageAt: timestamp });
        if (!outbound && (!conversation.lastInboundAt || timestamp > conversation.lastInboundAt)) update.lastInboundAt = timestamp;
        Object.assign(conversation, update);
        await Conversation.updateOne({ _id: conversation._id }, { $set: update });
        return msg;
    };

    for (const conv of scenario.conversations) {
        const conversation = await conversationOf(conv.contact);
        for (const m of conv.msgs) {
            const timestamp = at(m.at);
            if (m.from === 'them') {
                await addMessage(conversation, { direction: 'inbound', text: m.text, timestamp });
                continue;
            }
            const person = people[m.from] ?? null;
            const extra = {
                origin: { app: 'businessApp', bot: 'bot' }[m.from] ?? 'chat',
                sentBy: person?._id ?? null, sentByName: person?.name ?? null,
            };
            let { text } = m;
            if (m.from === 'template') {
                const template = templates[m.template];
                text = renderDemoBody(template.bodyText, m.values);
                Object.assign(extra, { sentBy: owner._id, sentByName: owner.name, templateName: template.name, templateParams: m.values });
            }
            if (m.document) {
                Object.assign(extra, await documentFields(m.document));
                text = m.document.filename;
            }
            await addMessage(conversation, { direction: 'outbound', text, timestamp, status: m.status, extra });
        }
        if (conv.unread) await Conversation.updateOne({ _id: conversation._id }, { $set: { unreadCount: conv.unread } });
    }

    // --- La campaña, terminada ----------------------------------------------------
    const plan = scenario.campaign;
    const template = templates[plan.template];
    const recipients = demoCampaignRecipients(contactRows, plan.recipients);
    const results = demoCampaignResults(recipients.length, plan);
    const startedAt = at(plan.at);
    const campaign = await Campaign.create({
        userId: accountId, lineId, name: plan.name,
        template: {
            templateId: template.templateId, name: template.name, language: template.language, category: template.category,
            bodyText: template.bodyText, parameterFormat: template.parameterFormat, buttons: [], header: null, headerMedia: null,
        },
        variables: plan.variables, buttons: [], excludeOptedOut: template.category === 'MARKETING',
        status: 'completed', totalRecipients: recipients.length, startedAt, finishedAt: later(startedAt, 3),
        // La lista la ordena y la fecha por `createdAt`: el día que se lanzó.
        createdAt: startedAt,
    });
    const sentAtOf = new Map();
    for (const [i, row] of recipients.entries()) {
        const contact = contacts.get(row.key);
        const values = plan.values({ firstName: firstNameOf(contact) });
        const sentAt = later(startedAt, i * 0.1);
        const failed = results[i] === 'failed';
        const msg = await addMessage(await conversationOf(row.key), {
            direction: 'outbound', text: renderDemoBody(template.bodyText, values), timestamp: sentAt, status: results[i],
            extra: {
                origin: 'campaign', campaignId: campaign._id, templateName: template.name, templateParams: values,
                ...(failed && { errorCode: '131026', errorDetail: 'Message undeliverable' }),
            },
        });
        sentAtOf.set(row.key, sentAt);
        await CampaignRecipient.create({
            campaignId: campaign._id, userId: accountId, contactId: contact._id, status: 'done',
            messageId: msg._id, processedAt: sentAt, errorCode: failed ? '131026' : null,
        });
    }
    const bulkRecipients = recipients.filter(r => r.key.startsWith('bulk'));
    for (const reply of plan.replies) {
        const key = reply.contact ?? bulkRecipients[reply.bulk]?.key;
        if (!sentAtOf.has(key)) continue;
        await addMessage(await conversationOf(key), { direction: 'inbound', text: reply.text, timestamp: later(sentAtOf.get(key), reply.after) });
    }

    // --- Las respuestas automáticas, encendidas ----------------------------------
    const auto = scenario.autoReplies;
    const settings = defaultAutoReplySettings();
    const day = ([start, end]) => ({ closed: false, ranges: [{ start, end }] });
    await AutoReplySettings.create({
        ...settings, userId: accountId, enabled: true,
        welcome: { ...settings.welcome, enabled: true, text: auto.welcome },
        outOfHours: {
            enabled: true, text: auto.outOfHours,
            schedule: {
                mon: day(auto.hours.weekdays), tue: day(auto.hours.weekdays), wed: day(auto.hours.weekdays),
                thu: day(auto.hours.weekdays), fri: day(auto.hours.weekdays), sat: day(auto.hours.saturday),
                sun: { closed: true, ranges: [] },
            },
        },
        keywordRules: auto.keywordRules.map(rule => ({ ...rule, enabled: true })),
        fallback: { enabled: true, text: auto.fallback },
    });

    return {
        accountId,
        action,
        counts: {
            contacts: contactRows.length,
            conversations: conversations.size,
            messages: await Message.countDocuments({ conversationId: { $in: [...conversations.values()].map(c => c._id) } }),
            campaignRecipients: recipients.length,
        },
    };
};
