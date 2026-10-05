// Contactos de prueba para probar los envíos masivos en LOCAL, con los casos
// que importan: sin nombre, solo con el nombre de WhatsApp, sin teléfono (solo
// usuario), sin empresa, dados de baja de la publicidad, con conversación y
// ventana abierta o cerrada, y sin conversación.
//
//   npm run seed:contacts                 ← crea 60 (o completa los que falten)
//   npm run seed:contacts -- --count 300
//   npm run seed:contacts -- --acks       ← simula entregados, leídos y fallidos
//   npm run seed:contacts -- --clean      ← borra todo lo de prueba
//
// Opciones: --phone-number-id <id> (a qué cuenta; por defecto la primera con
//           WhatsApp conectado)  --url <http://...> (backend, para --acks)
//
// Se reconocen por el teléfono (59300099xxxx) o el BSUID (EC.SEED.xxxx), así
// que --clean nunca toca un contacto real. Se niega a correr contra una BD que
// no sea local: estos contactos no deben llegar nunca a producción.
//
// --acks manda por el webhook LOCAL (firmado como Meta) los acuses de los
// mensajes de envíos masivos a estos contactos. En modo de prueba
// (CAMPAIGN_DRY_RUN) se quedan en «Enviado» para siempre, porque Meta no
// contesta; con esto el detalle de un envío se mueve en vivo, por SSE.
import 'dotenv/config';
import crypto from 'node:crypto';
import mongoose from 'mongoose';

import User from '../src/models/user.model.js';
import Contact from '../src/models/contact.model.js';
import Conversation from '../src/models/conversation.model.js';
import Message from '../src/models/message.model.js';
import Campaign from '../src/models/campaign.model.js';
import CampaignRecipient from '../src/models/campaign.recipient.model.js';
import { CAMPAIGN_DRY_RUN, CAMPAIGN_MAX_RECIPIENTS } from '../src/config.js';

const PHONE_PREFIX = '59300099';
const BSUID_PREFIX = 'EC.SEED.';
const DEFAULT_COUNT = 60;
const ACKS_PER_REQUEST = 50;
const HOUR_MS = 60 * 60 * 1000;
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', 'mongo', 'mongodb'];

const FIRST_NAMES = ['Carlos', 'Rosa', 'Lucía', 'Pedro', 'Gabriela', 'Diego', 'Paola', 'Fernando', 'Verónica', 'Andrés',
    'Daniela', 'Jorge', 'Mónica', 'Luis', 'Silvia', 'Marco', 'Ana', 'Javier', 'Carmen', 'Ricardo'];
const LAST_NAMES = ['Mena', 'Quishpe', 'Salazar', 'Chiriboga', 'Andrade', 'Guerrero', 'Yépez', 'Cevallos', 'Paredes', 'Ortiz',
    'Proaño', 'Cárdenas', 'Benítez', 'Vinueza', 'Pérez', 'Torres', 'Morales', 'Vega', 'Castro', 'Herrera'];
const COMPANIES = ['Distribuidora Cano', 'Ferretería El Clavo', 'Panadería Mena', 'Taller Salazar', 'Constructora Andrade',
    'Vidriería Yépez', 'Papelería Cevallos', 'Mercado Central', 'Farmacia La Salud', 'Imprenta Rápida'];
const INBOUND_TEXTS = ['Hola, ¿tienen stock?', '¿A qué hora cierran?', 'Gracias por la información', '¿Hacen envíos a Quito?'];

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const fail = (message) => { console.error(message); process.exit(1); };

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/wasmish';
const BACKEND_URL = option('url', 'http://localhost:3001');

// --- Qué contacto es cada índice -------------------------------------------
// Determinista: volver a correrlo crea los mismos, así que solo completa.

const seedPhone = (n) => `${PHONE_PREFIX}${String(n).padStart(4, '0')}`;
const seedBsuid = (n) => `${BSUID_PREFIX}${String(n).padStart(4, '0')}`;
const isSeedFilter = (userId) => ({
    userId,
    $or: [{ phone: { $regex: `^${PHONE_PREFIX}` } }, { waUserId: { $regex: `^${BSUID_PREFIX.replace(/\./g, '\\.')}` } }],
});

/**
 * El contacto número `n` (desde 1). Cada caso sale cada tantos contactos,
 * para que en cualquier selección haya de todo:
 *  - 1 de cada 20 sin nombre (solo teléfono) → la reserva del nombre;
 *  - 2 de cada 20 solo con el nombre de WhatsApp;
 *  - 1 de cada 20 sin teléfono, solo usuario y BSUID;
 *  - 2 de cada 5 sin empresa → la reserva de la empresa;
 *  - 1 de cada 9 dado de baja de la publicidad.
 */
const buildContact = (userId, n) => {
    const first = FIRST_NAMES[n % FIRST_NAMES.length];
    const last = LAST_NAMES[Math.floor(n / FIRST_NAMES.length) % LAST_NAMES.length];
    const fullName = `${first} ${last}`;
    const kind = n % 20;
    const optedOut = n % 9 === 4;
    const optOutAt = new Date(Date.now() - (n % 30) * 24 * HOUR_MS);

    return {
        userId,
        phone: kind === 3 ? null : seedPhone(n),
        waUserId: kind === 3 ? seedBsuid(n) : null,
        username: kind === 3 ? `prueba.${first.toLowerCase()}${n}` : null,
        name: kind === 0 || kind === 1 || kind === 2 || kind === 3 ? null : fullName,
        profileName: kind === 0 ? null : (kind === 1 || kind === 2 || kind === 3 ? first : fullName),
        company: n % 5 < 2 ? null : COMPANIES[n % COMPANIES.length],
        email: n % 3 === 0 && kind !== 0 ? `${first.toLowerCase()}.${last.toLowerCase()}${n}@ejemplo.ec`.normalize('NFD').replace(/[̀-ͯ]/g, '') : null,
        source: n % 2 === 0 ? 'inbound' : 'manual',
        marketingOptOut: optedOut,
        marketingOptOutAt: optedOut ? optOutAt : null,
        marketingPreferenceAt: optedOut ? optOutAt : null,
    };
};

/**
 * 3 de cada 4 tienen conversación, para el filtro «Con conversación»: la
 * mitad con la ventana de 24 h abierta (escribió hace unas horas) y la otra
 * mitad cerrada (hace días). Cada una con su mensaje entrante.
 */
const conversationFor = (contact, n, phoneNumberId) => {
    if (n % 4 === 3) return null;
    const writtenAt = n % 2 === 0
        ? new Date(Date.now() - ((n % 20) + 1) * HOUR_MS)
        : new Date(Date.now() - ((n % 10) + 2) * 24 * HOUR_MS);
    return {
        conversation: {
            userId: contact.userId,
            contactId: contact._id,
            contactPhone: contact.phone,
            phoneNumberId,
            lastMessage: INBOUND_TEXTS[n % INBOUND_TEXTS.length],
            lastMessageAt: writtenAt,
            lastInboundAt: writtenAt,
            unreadCount: 0,
        },
        writtenAt,
    };
};

// --- Comandos ----------------------------------------------------------------

const seed = async (user, count) => {
    const existing = await Contact.find(isSeedFilter(user._id)).select('phone waUserId').lean();
    const taken = new Set(existing.flatMap(c => [c.phone, c.waUserId]).filter(Boolean));

    const toCreate = [];
    for (let n = 1; n <= count; n++) {
        const draft = buildContact(user._id, n);
        if (!taken.has(draft.phone) && !taken.has(draft.waUserId)) toCreate.push({ n, draft });
    }
    if (toCreate.length === 0) {
        console.log(`Ya existen los ${count} contactos de prueba. Nada que crear.`);
        return;
    }

    const contacts = await Contact.insertMany(toCreate.map(c => c.draft));
    let conversations = 0;
    for (const [i, contact] of contacts.entries()) {
        const n = toCreate[i].n;
        const planned = conversationFor(contact, n, user.phoneNumberId);
        if (!planned) continue;
        const conversation = await Conversation.create(planned.conversation);
        await Message.create({
            conversationId: conversation._id,
            direction: 'inbound',
            sender: 'them',
            waMessageId: `wamid.seed.${n}.${conversation._id}`,
            text: planned.conversation.lastMessage,
            timestamp: planned.writtenAt,
        });
        conversations++;
    }

    const optedOut = contacts.filter(c => c.marketingOptOut).length;
    const withoutPhone = contacts.filter(c => !c.phone).length;
    console.log(`Creados ${contacts.length} contactos de prueba (${existing.length} ya existían).`);
    console.log(`  ${conversations} con conversación · ${optedOut} de baja de publicidad · ${withoutPhone} sin teléfono`);
};

const signedPost = async (body) => {
    const secret = process.env.META_APP_SECRET;
    const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
    const res = await fetch(`${BACKEND_URL}/api/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
        body,
    });
    if (res.status !== 200) fail(`El webhook respondió ${res.status}. ¿Coincide META_APP_SECRET con el del backend?`);
};

/**
 * Para cada mensaje de envío masivo a un contacto de prueba que siga en
 * «Enviado»: 6 de cada 10 leídos, 3 entregados y 1 fallido (131026, el de
 * «no se pudo entregar»). Va por el webhook, así que pasa por la misma lógica
 * y el mismo SSE que un acuse real.
 */
const simulateAcks = async (user) => {
    if (!process.env.META_APP_SECRET) fail('Falta META_APP_SECRET en el .env: sin él no se puede firmar como Meta.');

    const contactIds = (await Contact.find(isSeedFilter(user._id)).select('_id').lean()).map(c => c._id);
    const conversationIds = await Conversation.distinct('_id', { contactId: { $in: contactIds } });
    const messages = await Message.find({
        conversationId: { $in: conversationIds },
        campaignId: { $ne: null },
        status: 'sent',
        waMessageId: { $type: 'string' },
    }).select('waMessageId').lean();

    if (messages.length === 0) {
        console.log('No hay mensajes de envíos masivos en «Enviado» para los contactos de prueba. Lanza un envío primero.');
        return;
    }

    const now = Math.floor(Date.now() / 1000);
    const statuses = messages.map((m, i) => {
        const roll = i % 10;
        const status = roll < 6 ? 'read' : roll < 9 ? 'delivered' : 'failed';
        return {
            id: m.waMessageId,
            status,
            timestamp: String(now),
            ...(status === 'failed' && {
                errors: [{ code: 131026, title: 'Message undeliverable', message: 'Message undeliverable' }],
            }),
        };
    });

    for (let i = 0; i < statuses.length; i += ACKS_PER_REQUEST) {
        await signedPost(JSON.stringify({
            entry: [{ changes: [{ value: {
                metadata: { phone_number_id: user.phoneNumberId },
                statuses: statuses.slice(i, i + ACKS_PER_REQUEST),
            } }] }],
        }));
    }
    const count = (status) => statuses.filter(s => s.status === status).length;
    console.log(`Acuses enviados: ${count('read')} leídos, ${count('delivered')} entregados, ${count('failed')} fallidos.`);
};

/**
 * Borra los contactos de prueba, sus conversaciones y mensajes, sus filas en
 * los envíos y los envíos que se quedan sin destinatarios. Un envío que
 * también tenía contactos reales se conserva.
 */
const clean = async (user) => {
    const contactIds = (await Contact.find(isSeedFilter(user._id)).select('_id').lean()).map(c => c._id);
    if (contactIds.length === 0) {
        console.log('No hay contactos de prueba que borrar.');
        return;
    }

    const conversationIds = await Conversation.distinct('_id', { contactId: { $in: contactIds } });
    const campaignIds = await CampaignRecipient.distinct('campaignId', { contactId: { $in: contactIds } });

    const messages = await Message.deleteMany({ conversationId: { $in: conversationIds } });
    const conversations = await Conversation.deleteMany({ _id: { $in: conversationIds } });
    await CampaignRecipient.deleteMany({ contactId: { $in: contactIds } });
    const contacts = await Contact.deleteMany({ _id: { $in: contactIds } });

    const stillUsed = await CampaignRecipient.distinct('campaignId', { campaignId: { $in: campaignIds } });
    const emptyCampaigns = campaignIds.filter(id => !stillUsed.some(used => used.equals(id)));
    const campaigns = await Campaign.deleteMany({ _id: { $in: emptyCampaigns }, userId: user._id });

    console.log(`Borrados: ${contacts.deletedCount} contactos, ${conversations.deletedCount} conversaciones, `
        + `${messages.deletedCount} mensajes y ${campaigns.deletedCount} envíos.`);
};

// --- Arranque ----------------------------------------------------------------

const assertLocalDatabase = () => {
    if (process.env.NODE_ENV === 'production') fail('NODE_ENV=production: este script es solo para local.');
    let host;
    try {
        host = new URL(MONGO_URI.replace(/^mongodb(\+srv)?:/, 'http:')).hostname;
    } catch {
        fail('No pude leer el host de MONGO_URI.');
    }
    if (!LOCAL_HOSTS.includes(host)) {
        fail(`MONGO_URI apunta a «${host}», que no es local. Este script nunca debe tocar la BD de producción.`);
    }
};

// El índice único de antes de los contactos: con él, la segunda conversación
// sin teléfono choca (E11000 con contactPhone null) y el envío a los contactos
// que solo tienen usuario falla. Lo borra el backfill de contactos.
const LEGACY_PHONE_INDEX = 'userId_1_contactPhone_1';

const assertNoLegacyIndex = async () => {
    const indexes = await Conversation.collection.indexes().catch(() => []);
    if (indexes.some(index => index.name === LEGACY_PHONE_INDEX)) {
        fail(`La BD local conserva el índice viejo ${LEGACY_PHONE_INDEX}: los envíos a contactos sin teléfono fallarían.\n`
            + 'Bórralo con:  npm run backfill:contacts');
    }
};

const main = async () => {
    assertLocalDatabase();
    await mongoose.connect(MONGO_URI);
    await assertNoLegacyIndex();

    const phoneNumberId = option('phone-number-id');
    const user = phoneNumberId
        ? await User.findOne({ phoneNumberId }).lean()
        : await User.findOne({ phoneNumberId: { $ne: null } }).lean();
    if (!user) fail('No hay ninguna cuenta con WhatsApp conectado en la BD local.');
    console.log(`Cuenta: ${user.email} (phoneNumberId ${user.phoneNumberId})\n`);

    if (args.includes('--clean')) {
        await clean(user);
    } else if (args.includes('--acks')) {
        await simulateAcks(user);
    } else {
        const count = Number(option('count', DEFAULT_COUNT));
        if (!Number.isInteger(count) || count < 1 || count > CAMPAIGN_MAX_RECIPIENTS) {
            fail(`--count tiene que ser un número entre 1 y ${CAMPAIGN_MAX_RECIPIENTS}.`);
        }
        await seed(user, count);
        if (!CAMPAIGN_DRY_RUN) {
            console.warn('\n⚠ CAMPAIGN_DRY_RUN está apagado: un envío a estos contactos llamaría a Meta con números inventados.');
        }
        console.log('\nPara simular entregas y lecturas tras un envío:  npm run seed:contacts -- --acks');
        console.log('Para borrarlos:                                  npm run seed:contacts -- --clean');
    }

    await mongoose.disconnect();
};

main().catch(async (error) => {
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
});
