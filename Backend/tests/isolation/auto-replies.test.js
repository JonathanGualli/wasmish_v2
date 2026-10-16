// Respuestas automáticas: la configuración es de cada cuenta, solo la tocan
// owner y admin, y el «probar» no guarda nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    seedAccount, seedMember, connectWhatsapp, request, onMeta, ANONYMOUS, PNG,
    postWebhook, metaCalls, ApiKey, AutoReplySettings, Campaign, Contact, Conversation, Line, Message,
} from './helpers.js';

const { processNext } = await import('../../src/workers/campaign.worker.js');
const { hashApiKey } = await import('../../src/utils/crypto.js');
const {
    processNextAutoReply, recoverAutoReplyJobs, authorizeBotSend, claimNextAutoReplyJob, resolveAutoReplyJob, markSendStarted,
} = await import('../../src/workers/auto.reply.worker.js');
const { markHumanReply } = await import('../../src/services/auto.reply.service.js');

let seq = 1;
const newAccount = async (label) => {
    const account = await seedAccount(label, { seq: seq++ });
    const { lineId } = await connectWhatsapp(account);
    return { ...account, lineId: String(lineId) };
};

const day = (ranges) => ({ closed: ranges.length === 0, ranges });
const settingsBody = (overrides = {}) => ({
    enabled: true,
    timezone: 'America/Guayaquil',
    handoffHours: 12,
    welcome: { enabled: true, text: '¡Hola! Gracias por escribir', returnAfterDays: 30 },
    outOfHours: {
        enabled: false,
        text: '',
        schedule: {
            mon: day([{ start: '08:00', end: '18:00' }]), tue: day([{ start: '08:00', end: '18:00' }]),
            wed: day([{ start: '08:00', end: '18:00' }]), thu: day([{ start: '08:00', end: '18:00' }]),
            fri: day([{ start: '08:00', end: '18:00' }]), sat: day([]), sun: day([]),
        },
    },
    keywordRules: [{ enabled: true, keywords: ['precio', 'cuánto cuesta'], text: 'Cuesta $10', lineIds: [] }],
    ...overrides,
});

const getSettings = (account) => request(account, 'GET', '/auto-replies');
const saveSettings = (account, body) => request(account, 'PUT', '/auto-replies', body);

test('A guarda su configuración y B no la ve', async () => {
    const a = await newAccount('ARA');
    const b = await newAccount('ARB');

    const saved = await saveSettings(a, settingsBody());
    assert.equal(saved.status, 200);
    assert.equal(saved.body.enabled, true);
    assert.equal(saved.body.configured, true);
    assert.equal(saved.body.keywordRules.length, 1);
    assert.match(saved.body.keywordRules[0].id, /^[a-f\d]{24}$/);

    const own = await getSettings(a);
    assert.deepEqual(own.body, saved.body);

    const other = await getSettings(b);
    assert.equal(other.status, 200);
    assert.equal(other.body.enabled, false);
    // La página abre el asistente solo a quien nunca guardó.
    assert.equal(other.body.configured, false);
    assert.deepEqual(other.body.keywordRules, []);
});

test('guardar otra vez conserva el id de las reglas y estrena el de las nuevas', async () => {
    const a = await newAccount('ARC');
    const first = (await saveSettings(a, settingsBody())).body;
    const [kept] = first.keywordRules;

    const second = await saveSettings(a, settingsBody({
        keywordRules: [kept, { enabled: true, keywords: ['ubicación'], text: 'En el centro', lineIds: [] }],
    }));
    assert.equal(second.status, 200);
    assert.equal(second.body.keywordRules[0].id, kept.id);
    assert.notEqual(second.body.keywordRules[1].id, kept.id);
});

test('solo owner y admin: supervisor y agente reciben 403; sin sesión, 401', async () => {
    const a = await newAccount('ARD');
    const admin = await seedMember(a, { role: 'admin', label: 'ARDA' });
    const supervisor = await seedMember(a, { role: 'supervisor', lineIds: [a.lineId], label: 'ARDS' });
    const agent = await seedMember(a, { role: 'agent', lineIds: [a.lineId], label: 'ARDG' });

    assert.equal((await getSettings(admin)).status, 200);
    for (const member of [supervisor, agent]) {
        assert.equal((await getSettings(member)).status, 403);
        assert.equal((await saveSettings(member, settingsBody())).status, 403);
        assert.equal((await request(member, 'POST', '/auto-replies/preview', { settings: settingsBody(), text: 'hola' })).status, 403);
    }
    assert.equal((await getSettings(ANONYMOUS)).status, 401);
});

test('una regla que apunta a una línea de otra cuenta da 404 y no guarda nada', async () => {
    const a = await newAccount('ARE');
    const b = await newAccount('ARF');

    const response = await saveSettings(a, settingsBody({
        keywordRules: [{ enabled: true, keywords: ['precio'], text: 'Cuesta $10', lineIds: [b.lineId] }],
    }));
    assert.equal(response.status, 404);
    assert.equal((await getSettings(a)).body.enabled, false);

    const ownLine = await saveSettings(a, settingsBody({
        keywordRules: [{ enabled: true, keywords: ['precio'], text: 'Cuesta $10', lineIds: [a.lineId] }],
    }));
    assert.equal(ownLine.status, 200);
    assert.deepEqual(ownLine.body.keywordRules[0].lineIds, [a.lineId]);
});

test('lo que no es una configuración válida da 400', async () => {
    const a = await newAccount('ARG');
    const base = settingsBody();
    const three = [{ start: '08:00', end: '09:00' }, { start: '10:00', end: '11:00' }, { start: '12:00', end: '13:00' }];

    for (const [name, body] of Object.entries({
        tresTramos: { ...base, outOfHours: { ...base.outOfHours, schedule: { ...base.outOfHours.schedule, mon: day(three) } } },
        zonaInvalida: { ...base, timezone: 'Marte/Base' },
        horasRaras: { ...base, handoffHours: 5 },
        bienvenidaSinTexto: { ...base, welcome: { ...base.welcome, text: '  ' } },
        reglaSinFrases: { ...base, keywordRules: [{ enabled: true, keywords: [], text: 'x', lineIds: [] }] },
        textoLargo: { ...base, welcome: { ...base.welcome, text: 'x'.repeat(801) } },
        // Dos reglas con el mismo id se callaban la una a la otra durante 24 h
        // (revisión de Codex del PR #68).
        idsRepetidos: {
            ...base,
            keywordRules: [
                { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', enabled: true, keywords: ['precio'], text: 'Cuesta $10', lineIds: [] },
                { id: 'AAAAAAAAAAAAAAAAAAAAAAAA', enabled: true, keywords: ['direccion'], text: 'En el centro', lineIds: [] },
            ],
        },
        fueraDeHorarioSinDias: {
            ...base,
            outOfHours: {
                enabled: true, text: 'Cerrado',
                schedule: Object.fromEntries(Object.keys(base.outOfHours.schedule).map(d => [d, day([])])),
            },
        },
    })) {
        assert.equal((await saveSettings(a, body)).status, 400, name);
    }
});

test('probar responde con la configuración sin guardar', async () => {
    const a = await newAccount('ARH');
    const response = await request(a, 'POST', '/auto-replies/preview', { settings: settingsBody(), text: '¿Cuánto cuesta?' });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.parts, ['¡Hola! Gracias por escribir', 'Cuesta $10']);
    assert.equal(response.body.reply, '¡Hola! Gracias por escribir\n\nCuesta $10');
    assert.deepEqual(response.body.matchedRuleIndexes, [0]);
    assert.equal(response.body.outOfHours, false);
    assert.equal((await getSettings(a)).body.enabled, false, 'probar no guarda');

    const nothing = await request(a, 'POST', '/auto-replies/preview', {
        settings: settingsBody({ welcome: { enabled: false, text: '', returnAfterDays: 30 } }), text: 'gracias',
    });
    assert.deepEqual(nothing.body, { reply: null, parts: [], matchedRuleIndexes: [], outOfHours: false, fallback: false });
});

// --- La pausa por respuesta manual -----------------------------------------

/** Una cuenta con su línea y la conversación del contacto en ella, con la ventana abierta. */
const accountWithOpenChat = async (label) => {
    const account = await newAccount(label);
    await Conversation.updateOne({ _id: account.conversationId }, { lineId: account.lineId, lastInboundAt: new Date() });
    return account;
};

/** Meta acepta cualquier envío y la subida de archivos. */
const metaAcceptsAll = () => onMeta(async (config) => {
    if (config.method !== 'post') return undefined;
    if (config.url.endsWith('/media')) return { data: { id: `media.${Math.random()}` } };
    if (config.url.endsWith('/messages')) return { data: { messages: [{ id: `wamid.${Math.random()}` }] } };
    return undefined;
});

const humanRepliedAt = async (account) =>
    (await Conversation.findById(account.conversationId).lean()).bot?.humanRepliedAt ?? null;

test('responder a mano desde el chat pausa el bot, por las cinco rutas', async () => {
    const routes = {
        texto: (a) => request(a, 'POST', `/chats/${a.conversationId}/messages`, { text: 'hola', temporalId: 't1' }),
        archivo: (a) => request(a, 'POST', `/chats/${a.conversationId}/media`, PNG, { 'Content-Type': 'image/png', 'X-Filename': 'foto.png' }),
        plantilla: (a) => request(a, 'POST', `/chats/${a.conversationId}/template`, { templateName: a.templateName, language: 'es' }),
        // Sin id, a un número que ya tiene conversación en esa línea: se pausa esa.
        textoSinId: (a) => request(a, 'POST', '/chats/messages', { text: 'hola', temporalId: 't2', destinationNumber: a.phone, lineId: a.lineId }),
        plantillaNueva: (a) => request(a, 'POST', '/chats/template', {
            destinationNumber: a.phone, lineId: a.lineId, templateName: a.templateName, language: 'es',
        }),
    };
    metaAcceptsAll();
    try {
        for (const [name, send] of Object.entries(routes)) {
            const a = await accountWithOpenChat(`ARP${name.toUpperCase()}`);
            assert.equal(await humanRepliedAt(a), null, name);
            const response = await send(a);
            assert.ok(response.status < 300, `${name}: ${response.status} ${response.text}`);
            assert.ok(await humanRepliedAt(a), `${name} no pausó el bot`);
        }
    } finally {
        onMeta(null);
    }
});

test('una campaña y la API pública no pausan el bot', async () => {
    const a = await accountWithOpenChat('ARQ');
    const key = 'wm_arq_bot';
    await ApiKey.create({ userId: a.accountId, keyHash: hashApiKey(key), keyPreview: 'wm_', name: 'v1' });
    metaAcceptsAll();
    try {
        const campaign = await Campaign.findById(a.campaignId).lean();
        while (await processNext(campaign) !== 'idle') { /* hasta vaciar la campaña */ }

        const viaApi = await request(ANONYMOUS, 'POST', '/v1/templates/send',
            { destinationNumber: a.phone, templateName: a.templateName }, { Authorization: `Bearer ${key}` });
        assert.equal(viaApi.status, 200, viaApi.text);
        assert.equal(await humanRepliedAt(a), null);
    } finally {
        onMeta(null);
    }
});

test('un agente sin acceso a la línea recibe 404 y no pausa nada', async () => {
    const a = await accountWithOpenChat('ARR');
    const agent = await seedMember(a, { role: 'agent', lineIds: [], label: 'ARRG' });

    const response = await request(agent, 'POST', `/chats/${a.conversationId}/messages`, { text: 'hola', temporalId: 't3' });
    assert.equal(response.status, 404);
    assert.equal(await humanRepliedAt(a), null);
});

// --- El webhook deja el trabajo en el entrante -----------------------------

const waId = () => `wamid.bot.${Date.now()}.${Math.random().toString(36).slice(2)}`;
const inboundValue = (from, message) => ({
    contacts: [{ profile: { name: 'Cliente' }, wa_id: from }],
    messages: [{ from, id: waId(), timestamp: String(Math.floor(Date.now() / 1000)), ...message }],
});
const textFrom = (from, body) => inboundValue(from, { type: 'text', text: { body } });
const numberOf = (account) => `99${account.seq}`;

/** Una cuenta con su línea y las respuestas encendidas. */
const accountWithBot = async (label, overrides = {}) => {
    const account = await newAccount(label);
    const saved = await saveSettings(account, settingsBody(overrides));
    assert.equal(saved.status, 200, saved.text);
    return account;
};

const inboundsOf = async (account, from) => {
    const contact = await Contact.findOne({ userId: account.accountId, phone: from }).lean();
    const conversations = await Conversation.find({ userId: account.accountId, contactId: contact._id }).select('_id').lean();
    return Message.find({ conversationId: { $in: conversations.map(c => c._id) }, direction: 'inbound' }).sort({ _id: 1 }).lean();
};

test('con las respuestas encendidas, el entrante queda pendiente de bot', async () => {
    const a = await accountWithBot('ARS');
    const from = '593980000001';

    assert.equal((await postWebhook(numberOf(a), textFrom(from, 'hola'))).status, 200);
    const [first] = await inboundsOf(a, from);
    assert.equal(first.bot.status, 'pending');
    assert.equal(first.bot.active, true);
    assert.equal(first.bot.previousInboundAt, null);

    await postWebhook(numberOf(a), textFrom(from, 'precio?'));
    const [, second] = await inboundsOf(a, from);
    assert.equal(second.bot.status, 'pending');
    assert.equal(second.bot.previousInboundAt.getTime(), first.timestamp.getTime());
});

test('apagadas o sin configurar, el entrante no lleva trabajo', async () => {
    const never = await newAccount('ART');
    const off = await accountWithBot('ARU', { enabled: false });
    for (const account of [never, off]) {
        await postWebhook(numberOf(account), textFrom('593980000002', 'hola'));
        const [message] = await inboundsOf(account, '593980000002');
        assert.equal(message.bot, undefined, account.label);
    }
});

test('una reacción no deja trabajo', async () => {
    const a = await accountWithBot('ARV');
    await postWebhook(numberOf(a), inboundValue('593980000003', { type: 'reaction', reaction: { message_id: 'wamid.x', emoji: '👍' } }));
    const [message] = await inboundsOf(a, '593980000003');
    assert.equal(message.type, 'reaction');
    assert.equal(message.bot, undefined);
});

test('Meta reintenta el webhook: un solo mensaje y un solo trabajo', async () => {
    const a = await accountWithBot('ARW');
    const value = textFrom('593980000004', 'hola');
    await postWebhook(numberOf(a), value);
    await postWebhook(numberOf(a), value);
    const messages = await inboundsOf(a, '593980000004');
    assert.equal(messages.length, 1);
    assert.equal(messages[0].bot.status, 'pending');
});

test('quien ya escribió a otra línea de la cuenta no es un contacto nuevo', async () => {
    const account = await seedAccount('ARX', { seq: seq++, maxLines: 2 });
    await connectWhatsapp(account, { phoneNumberId: '8801' });
    await connectWhatsapp(account, { phoneNumberId: '8802' });
    assert.equal((await saveSettings(account, settingsBody())).status, 200);
    const from = '593980000005';

    await postWebhook('8801', textFrom(from, 'hola'));
    await postWebhook('8802', textFrom(from, 'hola otra vez'));
    const [first, second] = await inboundsOf(account, from);
    assert.notEqual(String(first.conversationId), String(second.conversationId));
    assert.equal(second.bot.previousInboundAt.getTime(), first.timestamp.getTime());
});

test('si preparar el trabajo falla, el entrante se guarda igual y el resto del lote también', async () => {
    const a = await accountWithBot('ARY');
    const from = '593980000006';
    const value = textFrom(from, 'uno');
    value.messages.push({ ...value.messages[0], id: waId(), text: { body: 'dos' } });

    const original = AutoReplySettings.findOne;
    AutoReplySettings.findOne = () => { throw new Error('Mongo no responde'); };
    try {
        assert.equal((await postWebhook(numberOf(a), value)).status, 200);
    } finally {
        AutoReplySettings.findOne = original;
    }
    const messages = await inboundsOf(a, from);
    assert.deepEqual(messages.map(m => m.text), ['uno', 'dos']);
    assert.ok(messages.every(m => m.bot === undefined));
});

// --- El worker que responde ------------------------------------------------

const WELCOME = '¡Hola! Gracias por escribir';

// Lo que dejaron en la cola los tests anteriores no se procesa aquí.
const clearQueue = () => Message.updateMany({ 'bot.active': true }, { $set: { 'bot.status': 'skipped' }, $unset: { 'bot.active': '' } });

let wamidSeq = 0;
/** Meta acepta los envíos con un `wamid.bot-N` predecible. `reject(config)` puede lanzar para simular un rechazo. */
const metaForBot = (reject = null) => onMeta(async (config) => {
    if (config.method !== 'post' || !config.url.endsWith('/messages')) return undefined;
    reject?.(config);
    return { data: { messages: [{ id: `wamid.bot-${++wamidSeq}` }] } };
});

/** Procesa la cola hasta vaciarla; los trabajos devueltos por candado se adelantan. */
const drain = async (workers = 1) => {
    const results = [];
    for (let round = 0; round < 50; round++) {
        const batch = await Promise.all(Array.from({ length: workers }, () => processNextAutoReply()));
        results.push(...batch.filter(result => result !== 'idle'));
        if (batch.every(result => result === 'idle')) {
            const waiting = await Message.updateMany(
                { 'bot.active': true, 'bot.status': 'pending' }, { $set: { 'bot.runAfter': new Date() } },
            );
            if (waiting.matchedCount === 0) return results;
        }
    }
    throw new Error('la cola no se vació');
};

const botMessagesOf = (conversationId) => Message.find({ conversationId, origin: 'bot' }).sort({ _id: 1 }).lean();
const metaSendsTo = (account) => metaCalls.filter(call => call.url === `/${numberOf(account)}/messages`).length;

test('un contacto nuevo recibe la bienvenida, sin marcar leída la conversación', async () => {
    await clearQueue();
    const a = await accountWithBot('BWA');
    metaForBot();
    try {
        await postWebhook(numberOf(a), textFrom('593970000001', 'hola'));
        assert.deepEqual(await drain(), ['done']);
    } finally {
        onMeta(null);
    }
    const [inbound] = await inboundsOf(a, '593970000001');
    const [reply] = await botMessagesOf(inbound.conversationId);
    assert.equal(reply.text, WELCOME);
    assert.equal(reply.direction, 'outbound');
    assert.match(reply.waMessageId, /^wamid\.bot-\d+$/);

    const job = (await Message.findById(inbound._id).lean()).bot;
    assert.equal(job.status, 'done');
    assert.equal(job.active, undefined);
    assert.equal(String(job.replyMessageId), String(reply._id));

    const contact = await Contact.findOne({ userId: a.accountId, phone: '593970000001' }).lean();
    assert.ok(contact.autoReply.welcomedAt);
    const conversation = await Conversation.findById(inbound.conversationId).lean();
    assert.equal(conversation.unreadCount, 1, 'el bot no marca leído');
    assert.equal(conversation.bot.recentReplies.length, 1);
});

test('cada cuenta responde con sus reglas', async () => {
    await clearQueue();
    const a = await accountWithBot('BWB');
    const b = await accountWithBot('BWC', { welcome: { enabled: true, text: 'Bienvenido a B', returnAfterDays: 30 } });
    metaForBot();
    try {
        await postWebhook(numberOf(b), textFrom('593970000002', 'hola'));
        await drain();
    } finally {
        onMeta(null);
    }
    const [inbound] = await inboundsOf(b, '593970000002');
    assert.deepEqual((await botMessagesOf(inbound.conversationId)).map(m => m.text), ['Bienvenido a B']);
    assert.equal(metaSendsTo(a), 0);
});

test('ráfaga: «hola» y «precio?» dan la bienvenida y después el precio, nunca dos bienvenidas', async () => {
    await clearQueue();
    const a = await accountWithBot('BWD');
    metaForBot();
    try {
        await postWebhook(numberOf(a), textFrom('593970000003', 'hola'));
        await postWebhook(numberOf(a), textFrom('593970000003', 'precio?'));
        await drain();
    } finally {
        onMeta(null);
    }
    const [inbound] = await inboundsOf(a, '593970000003');
    assert.deepEqual((await botMessagesOf(inbound.conversationId)).map(m => m.text), [WELCOME, 'Cuesta $10']);
});

test('con el contacto ocupado, el trabajo vuelve a la cola para después', async () => {
    await clearQueue();
    const a = await accountWithBot('BWE');
    await postWebhook(numberOf(a), textFrom('593970000004', 'hola'));
    await Contact.updateOne({ userId: a.accountId, phone: '593970000004' },
        { $set: { 'autoReply.lockUntil': new Date(Date.now() + 60_000), 'autoReply.lockToken': 'otro' } });

    assert.equal(await processNextAutoReply(), 'busy');
    const [inbound] = await inboundsOf(a, '593970000004');
    assert.equal(inbound.bot.status, 'pending');
    assert.ok(inbound.bot.runAfter > new Date());
});

test('dos workers a la vez: una sola bienvenida', async () => {
    await clearQueue();
    const a = await accountWithBot('BWF');
    metaForBot();
    try {
        await postWebhook(numberOf(a), textFrom('593970000005', 'hola'));
        await postWebhook(numberOf(a), textFrom('593970000005', 'buenas'));
        // Los dos como de un contacto nuevo, como si los dos webhooks hubieran
        // leído la conversación a la vez: solo el candado evita dos bienvenidas.
        const contact = await Contact.findOne({ userId: a.accountId, phone: '593970000005' }).lean();
        const conversations = await Conversation.find({ contactId: contact._id }).select('_id').lean();
        await Message.updateMany({ conversationId: { $in: conversations.map(c => c._id) }, 'bot.active': true },
            { $set: { 'bot.previousInboundAt': null } });
        await drain(2);
    } finally {
        onMeta(null);
    }
    const [inbound] = await inboundsOf(a, '593970000005');
    assert.deepEqual((await botMessagesOf(inbound.conversationId)).map(m => m.text), [WELCOME]);
});

test('un contacto nuevo que escribe a la vez a dos líneas recibe una sola bienvenida', async () => {
    await clearQueue();
    const account = await seedAccount('BWG', { seq: seq++, maxLines: 2 });
    await connectWhatsapp(account, { phoneNumberId: '8811' });
    await connectWhatsapp(account, { phoneNumberId: '8812' });
    assert.equal((await saveSettings(account, settingsBody())).status, 200);
    metaForBot();
    try {
        await Promise.all([postWebhook('8811', textFrom('593970000006', 'hola')), postWebhook('8812', textFrom('593970000006', 'hola'))]);
        await drain(2);
    } finally {
        onMeta(null);
    }
    const inbounds = await inboundsOf(account, '593970000006');
    const replies = (await Promise.all(inbounds.map(m => botMessagesOf(m.conversationId)))).flat();
    assert.deepEqual(replies.map(m => m.text), [WELCOME]);
});

test('una persona responde antes de que el worker lo tome: el bot se calla', async () => {
    await clearQueue();
    const a = await accountWithBot('BWH');
    metaForBot();
    try {
        await postWebhook(numberOf(a), textFrom('593970000007', 'hola'));
        const [inbound] = await inboundsOf(a, '593970000007');
        const manual = await request(a, 'POST', `/chats/${inbound.conversationId}/messages`, { text: 'hola, te atiendo yo', temporalId: 'h1' });
        assert.equal(manual.status, 201, manual.text);
        await drain();
        const job = (await Message.findById(inbound._id).lean()).bot;
        assert.equal(job.status, 'skipped');
        assert.equal(job.skipReason, 'human');
        assert.deepEqual(await botMessagesOf(inbound.conversationId), []);
    } finally {
        onMeta(null);
    }
});

test('una persona responde mientras el bot decide: la autorización no pasa', async () => {
    const a = await accountWithBot('BWI');
    const now = new Date();
    assert.equal(await authorizeBotSend({ conversationId: a.conversationId, handoffHours: 12, now }), true);
    await markHumanReply(a.conversationId);
    assert.equal(await authorizeBotSend({ conversationId: a.conversationId, handoffHours: 12, now: new Date() }), false);
});

test('apagan las respuestas o borran la regla antes de responder: no sale nada', async () => {
    await clearQueue();
    const noWelcome = { welcome: { enabled: false, text: '', returnAfterDays: 30 } };
    const a = await accountWithBot('BWJ', noWelcome);

    await postWebhook(numberOf(a), textFrom('593970000008', 'precio?'));
    await saveSettings(a, settingsBody({ ...noWelcome, keywordRules: [] }));
    assert.deepEqual(await drain(), ['skipped']);
    assert.equal((await inboundsOf(a, '593970000008'))[0].bot.skipReason, 'no_match');

    await postWebhook(numberOf(a), textFrom('593970000009', 'hola'));
    await saveSettings(a, settingsBody({ enabled: false }));
    assert.deepEqual(await drain(), ['skipped']);
    assert.equal((await inboundsOf(a, '593970000009'))[0].bot.skipReason, 'disabled');

    await postWebhook(numberOf(a), textFrom('593970000010', 'hola'));
    assert.equal((await inboundsOf(a, '593970000010'))[0].bot, undefined, 'con el bot apagado, ni trabajo');
    assert.equal(metaSendsTo(a), 0);
});

test('un entrante de hace 11 minutos caduca sin llamar a Meta', async () => {
    await clearQueue();
    const a = await accountWithBot('BWK');
    await postWebhook(numberOf(a), textFrom('593970000011', 'hola'));
    const [inbound] = await inboundsOf(a, '593970000011');
    await Message.updateOne({ _id: inbound._id }, { $set: { timestamp: new Date(Date.now() - 11 * 60 * 1000) } });

    assert.deepEqual(await drain(), ['expired']);
    assert.equal(metaSendsTo(a), 0);
});

test('Meta rechaza el envío: el mensaje del bot queda fallido y la bienvenida no se marca', async () => {
    await clearQueue();
    const a = await accountWithBot('BWL');
    metaForBot(() => {
        throw Object.assign(new Error('WhatsApp API Error (400): rechazado'), { waErrorCode: 131026, waErrorDetail: 'rechazado' });
    });
    try {
        await postWebhook(numberOf(a), textFrom('593970000012', 'hola'));
        assert.deepEqual(await drain(), ['failed']);
    } finally {
        onMeta(null);
    }
    const [inbound] = await inboundsOf(a, '593970000012');
    const [reply] = await botMessagesOf(inbound.conversationId);
    assert.equal(reply.status, 'failed');
    assert.equal(inbound.bot.status, 'failed');
    assert.equal(inbound.bot.skipReason, 'meta_131026');
    const contact = await Contact.findOne({ userId: a.accountId, phone: '593970000012' }).lean();
    assert.equal(contact.autoReply?.welcomedAt ?? null, null);
});

test('la línea ya no está conectada: falla sin llamar a Meta', async () => {
    await clearQueue();
    const a = await accountWithBot('BWM');
    await postWebhook(numberOf(a), textFrom('593970000013', 'hola'));
    await Line.updateOne({ _id: a.lineId }, { $set: { status: 'disconnected' } });

    assert.deepEqual(await drain(), ['failed']);
    const [inbound] = await inboundsOf(a, '593970000013');
    assert.equal((await Message.findById(inbound._id).lean()).bot.skipReason, 'line_unavailable');
    assert.equal(metaSendsTo(a), 0);
});

test('al arrancar se recoge lo que quedó a medias', async () => {
    await clearQueue();
    const a = await accountWithBot('BWN');
    const job = (status, extra = {}) => Message.create({
        conversationId: a.conversationId, direction: 'inbound', sender: 'them', text: 'x',
        bot: { status, active: true, runAfter: new Date(), ...extra },
    });
    const sending = await job('processing', { sendStartedAt: new Date() });
    const notSent = await job('processing');
    const oldWaiting = await job('waiting');
    const freshWaiting = await job('waiting');
    await Message.collection.updateOne({ _id: oldWaiting._id }, { $set: { createdAt: new Date(Date.now() - 40_000) } });

    assert.deepEqual(await recoverAutoReplyJobs({ startup: true }), { requeued: 2, uncertain: 1 });
    const statusOf = async (message) => (await Message.findById(message._id).lean()).bot.status;
    assert.equal(await statusOf(sending), 'uncertain');
    assert.equal(await statusOf(notSent), 'pending');
    assert.equal(await statusOf(oldWaiting), 'pending');
    assert.equal(await statusOf(freshWaiting), 'waiting');
});

test('un corte antes de guardar la conversación: el barrido la repara y la bienvenida sale', async () => {
    await clearQueue();
    const a = await accountWithBot('BWO');
    await Conversation.updateOne({ _id: a.conversationId }, { $set: { lineId: a.lineId, lastInboundAt: null } });
    const timestamp = new Date(Date.now() - 60_000);
    const inbound = await Message.create({
        conversationId: a.conversationId, direction: 'inbound', sender: 'them', type: 'text', text: 'hola', timestamp,
        bot: { status: 'waiting', active: true, previousInboundAt: null, runAfter: timestamp },
    });
    await Message.collection.updateOne({ _id: inbound._id }, { $set: { createdAt: timestamp } });

    metaForBot();
    try {
        await recoverAutoReplyJobs();
        assert.deepEqual(await drain(), ['done']);
    } finally {
        onMeta(null);
    }
    const conversation = await Conversation.findById(a.conversationId).lean();
    assert.equal(conversation.lastInboundAt.getTime(), timestamp.getTime());
    assert.deepEqual((await botMessagesOf(a.conversationId)).map(m => m.text), [WELCOME]);
});

// --- Revisión de Codex del PR #69 ------------------------------------------

// Una ejecución lenta (más de 60 s antes de enviar) perdía el trabajo en el
// barrido, otra lo enviaba, y la primera volvía y lo enviaba otra vez.
test('un trabajo que el barrido devolvió a la cola ya no lo envía ni lo cierra quien lo tenía', async () => {
    await clearQueue();
    const a = await accountWithBot('BWP');
    metaForBot();
    try {
        await postWebhook(numberOf(a), textFrom('593970000014', 'hola'));
        const slow = await claimNextAutoReplyJob();
        await Message.updateOne({ _id: slow._id }, { $set: { 'bot.leaseUntil': new Date(Date.now() - 1000) } });
        assert.deepEqual(await recoverAutoReplyJobs(), { requeued: 1, uncertain: 0 });
        assert.deepEqual(await drain(), ['done']);

        assert.equal(await resolveAutoReplyJob(slow), 'lost');
        assert.equal(metaSendsTo(a), 1);
        const job = (await Message.findById(slow._id).lean()).bot;
        assert.equal(job.status, 'done');
        assert.ok(job.replyMessageId);
    } finally {
        onMeta(null);
    }
});

test('empezar a enviar solo lo puede quien tiene el trabajo', async () => {
    await clearQueue();
    const a = await accountWithBot('BWQ');
    await postWebhook(numberOf(a), textFrom('593970000015', 'hola'));
    const first = await claimNextAutoReplyJob();
    await Message.updateOne({ _id: first._id }, { $set: { 'bot.leaseUntil': new Date(Date.now() - 1000) } });
    await recoverAutoReplyJobs();
    const second = await claimNextAutoReplyJob();

    assert.equal(await markSendStarted(first), false);
    assert.equal(await markSendStarted(second), true);
});

test('un corte de red al enviar deja el trabajo incierto, no fallido', async () => {
    await clearQueue();
    const a = await accountWithBot('BWR');
    metaForBot(() => { throw new Error('timeout of 10000ms exceeded'); });
    try {
        await postWebhook(numberOf(a), textFrom('593970000016', 'hola'));
        assert.deepEqual(await drain(), ['uncertain']);
    } finally {
        onMeta(null);
    }
    const [inbound] = await inboundsOf(a, '593970000016');
    assert.equal(inbound.bot.skipReason, 'meta_no_response');
    const contact = await Contact.findOne({ userId: a.accountId, phone: '593970000016' }).lean();
    assert.equal(contact.autoReply?.welcomedAt ?? null, null);
});

// --- «Si no entiende» (2026-10-15, spec § 10) -------------------------------

const FALLBACK = 'No te entendí: pregúntame por precios';
const fallbackOn = { enabled: true, text: FALLBACK };
// Sin bienvenida, el primer mensaje que el bot no entiende ya recibe el «no entiendo».
const withFallback = () => ({ welcome: { enabled: false, text: '', returnAfterDays: 30 }, fallback: fallbackOn });

test('guardar y leer el no entiendo; sin él en el cuerpo, apagado', async () => {
    const a = await newAccount('FBA');
    const saved = await saveSettings(a, settingsBody({ fallback: fallbackOn }));
    assert.equal(saved.status, 200, saved.text);
    assert.deepEqual((await getSettings(a)).body.fallback, fallbackOn);

    // Una pestaña con la página de antes no manda `fallback`.
    const legacy = await saveSettings(a, settingsBody());
    assert.equal(legacy.status, 200, legacy.text);
    assert.deepEqual(legacy.body.fallback, { enabled: false, text: '' });

    const empty = await saveSettings(a, settingsBody({ fallback: { enabled: true, text: '  ' } }));
    assert.equal(empty.status, 400);
});

test('una configuración guardada antes del no entiendo se lee con él apagado', async () => {
    const a = await newAccount('FBB');
    await AutoReplySettings.collection.insertOne({ userId: a.accountId, ...settingsBody() });

    assert.deepEqual((await getSettings(a)).body.fallback, { enabled: false, text: '' });
});

test('el worker manda el no entiendo una sola vez', async () => {
    await clearQueue();
    const a = await accountWithBot('FBC', withFallback());
    metaForBot();
    try {
        await postWebhook(numberOf(a), textFrom('593970000101', 'me gusta el café con pan'));
        await drain();
        await postWebhook(numberOf(a), textFrom('593970000101', 'me gusta el café con pan'));
        await drain();
    } finally {
        onMeta(null);
    }
    const [inbound] = await inboundsOf(a, '593970000101');
    assert.deepEqual((await botMessagesOf(inbound.conversationId)).map(m => m.text), [FALLBACK]);
    const conversation = await Conversation.findById(inbound.conversationId).lean();
    assert.ok(conversation.bot.fallbackRepliedAt instanceof Date);
});

test('dos workers a la vez: un solo no entiendo', async () => {
    await clearQueue();
    const a = await accountWithBot('FBD', withFallback());
    metaForBot();
    try {
        await postWebhook(numberOf(a), textFrom('593970000102', 'café'));
        await postWebhook(numberOf(a), textFrom('593970000102', 'pan'));
        await drain(2);
    } finally {
        onMeta(null);
    }
    const [inbound] = await inboundsOf(a, '593970000102');
    assert.deepEqual((await botMessagesOf(inbound.conversationId)).map(m => m.text), [FALLBACK]);
});

test('un rechazo o un envío incierto no marcan el no entiendo', async () => {
    for (const [label, phone, error] of [
        ['FBE', '593970000103', Object.assign(new Error('WhatsApp API Error (400): rechazado'), { waErrorCode: 131026, waErrorDetail: 'rechazado' })],
        ['FBF', '593970000104', new Error('timeout of 10000ms exceeded')],
    ]) {
        await clearQueue();
        const a = await accountWithBot(label, withFallback());
        metaForBot(() => { throw error; });
        try {
            await postWebhook(numberOf(a), textFrom(phone, 'café'));
            await drain();
        } finally {
            onMeta(null);
        }
        const [inbound] = await inboundsOf(a, phone);
        const conversation = await Conversation.findById(inbound.conversationId).lean();
        assert.equal(conversation.bot?.fallbackRepliedAt ?? null, null, label);
    }
});

// --- Probar como conversación (spec § 10) ------------------------------------

const preview = (account, body) => request(account, 'POST', '/auto-replies/preview', body);

test('probar una conversación responde turno a turno, también apagada, sin guardar nada', async () => {
    const a = await newAccount('PCA');
    const settings = settingsBody({ enabled: false, fallback: fallbackOn });
    const response = await preview(a, { settings, messages: ['me gusta el café', 'me gusta el café', 'me gusta el café', 'precio?', 'precio?'] });

    assert.equal(response.status, 200, response.text);
    assert.deepEqual(response.body.turns.map(turn => turn.reply), [WELCOME, FALLBACK, null, 'Cuesta $10', null]);
    assert.deepEqual(response.body.turns[4].repeated, [{ ruleIndex: 0, keyword: 'precio' }]);
    assert.equal((await getSettings(a)).body.configured, false, 'probar no guarda');
});

test('probar una conversación valida los mensajes', async () => {
    const a = await newAccount('PCB');
    const settings = settingsBody();
    for (const [label, body] of [
        ['sin mensajes', { settings, messages: [] }],
        ['un mensaje vacío', { settings, messages: ['   '] }],
        ['más de 1.000 caracteres', { settings, messages: ['a'.repeat(1001)] }],
        ['un número', { settings, messages: [42] }],
        ['más de 20', { settings, messages: Array.from({ length: 21 }, () => 'hola') }],
        ['text y messages a la vez', { settings, text: 'hola', messages: ['hola'] }],
        ['ni text ni messages', { settings }],
    ]) {
        assert.equal((await preview(a, body)).status, 400, label);
    }
});

test('más de 60 pruebas en un minuto dan 429', async () => {
    const a = await newAccount('PCC');
    const body = { settings: settingsBody(), messages: ['hola'] };
    for (let i = 0; i < 60; i++) assert.equal((await preview(a, body)).status, 200, `prueba ${i + 1}`);
    const limited = await preview(a, body);
    assert.equal(limited.status, 429);
    assert.match(limited.body[0].message, /Demasiadas pruebas/);
    // Por cuenta: otra cuenta sigue pudiendo.
    assert.equal((await preview(await newAccount('PCD'), body)).status, 200);
});
