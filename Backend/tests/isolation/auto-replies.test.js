// Respuestas automáticas: la configuración es de cada cuenta, solo la tocan
// owner y admin, y el «probar» no guarda nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    seedAccount, seedMember, connectWhatsapp, request, onMeta, ANONYMOUS, PNG,
    postWebhook, metaCalls, ApiKey, AutoReplySettings, Campaign, Contact, Conversation, Line, Message,
    Notification, User, pushCalls, openStream, postEcho, ConversationEvent,
} from './helpers.js';

const { processNext } = await import('../../src/workers/campaign.worker.js');
const { hashApiKey } = await import('../../src/utils/crypto.js');
const {
    processNextAutoReply, recoverAutoReplyJobs, authorizeBotSend, claimNextAutoReplyJob, resolveAutoReplyJob, markSendStarted,
} = await import('../../src/workers/auto.reply.worker.js');
const { markHumanReply, requestHandoff, emitHandoffRequest } = await import('../../src/services/auto.reply.service.js');

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
        assert.equal((await request(member, 'POST', '/auto-replies/preview', { settings: settingsBody(), messages: ['hola'] })).status, 403);
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
    const response = await request(a, 'POST', '/auto-replies/preview', { settings: settingsBody(), messages: ['¿Cuánto cuesta?'] });

    assert.equal(response.status, 200);
    const [turn] = response.body.turns;
    assert.deepEqual(turn.parts.map(part => part.text), ['¡Hola! Gracias por escribir', 'Cuesta $10']);
    assert.equal(turn.reply, '¡Hola! Gracias por escribir\n\nCuesta $10');
    assert.deepEqual(turn.parts.filter(part => part.kind === 'keyword').map(part => part.ruleIndex), [0]);
    assert.equal(turn.parts.some(part => part.kind === 'outOfHours'), false);
    assert.equal((await getSettings(a)).body.enabled, false, 'probar no guarda');

    const nothing = await request(a, 'POST', '/auto-replies/preview', {
        settings: settingsBody({ welcome: { enabled: false, text: '', returnAfterDays: 30 } }), messages: ['gracias'],
    });
    assert.equal(nothing.body.turns[0].reply, null);
    assert.deepEqual(nothing.body.turns[0].parts, []);
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
    assert.deepEqual((await getSettings(a)).body.fallback, { ...fallbackOn, options: [], position: null });

    // Una pestaña con la página de antes no manda `fallback`.
    const legacy = await saveSettings(a, settingsBody());
    assert.equal(legacy.status, 200, legacy.text);
    // Desde los menús (spec 2026-11-05), también sus opciones.
    assert.deepEqual(legacy.body.fallback, { enabled: false, text: '', options: [], position: null });

    const empty = await saveSettings(a, settingsBody({ fallback: { enabled: true, text: '  ' } }));
    assert.equal(empty.status, 400);
});

test('una configuración guardada antes del no entiendo se lee con él apagado', async () => {
    const a = await newAccount('FBB');
    await AutoReplySettings.collection.insertOne({ userId: a.accountId, ...settingsBody() });

    assert.deepEqual((await getSettings(a)).body.fallback, { enabled: false, text: '', options: [], position: null });
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
        ['sin messages', { settings }],
        // La forma de antes (un solo mensaje en `text`) se quitó tras la 1.0.23.
        ['solo text, la forma de antes', { settings, text: 'hola' }],
    ]) {
        assert.equal((await preview(a, body)).status, 400, label);
    }
});

test('más de 120 pruebas en un minuto dan 429', async () => {
    const a = await newAccount('PCC');
    const body = { settings: settingsBody(), messages: ['hola'] };
    for (let i = 0; i < 120; i++) assert.equal((await preview(a, body)).status, 200, `prueba ${i + 1}`);
    const limited = await preview(a, body);
    assert.equal(limited.status, 429);
    assert.match(limited.body[0].message, /Demasiadas pruebas/);
    // Por cuenta: otra cuenta sigue pudiendo.
    assert.equal((await preview(await newAccount('PCD'), body)).status, 200);
});

// --- Bot con menús: la configuración (spec 2026-11-05) ---------------------

const RULE_A = '6729a1b2c3d4e5f6a7b8c9d1';
const RULE_B = '6729a1b2c3d4e5f6a7b8c9d2';
/** Un menú: la bienvenida con dos opciones, «Precios» con frases y «Envíos» sin ellas. */
const menuBody = (overrides = {}) => settingsBody({
    welcome: {
        enabled: true, text: WELCOME, returnAfterDays: 30,
        options: [
            { title: 'Precios', target: 'rule', ruleId: RULE_A },
            { title: 'Hablar con alguien', target: 'person' },
        ],
    },
    keywordRules: [
        { id: RULE_A, name: 'Precios', enabled: true, keywords: ['precio'], text: 'Cuesta $10', lineIds: [],
            options: [{ title: 'Envíos', target: 'rule', ruleId: RULE_B }, { title: 'Volver', target: 'start' }] },
        { id: RULE_B, enabled: true, keywords: [], text: 'Enviamos en 48 h', lineIds: [] },
    ],
    handoff: { text: 'Ya te atiende alguien' },
    ...overrides,
});

test('menús: se guardan las opciones, los ids que pone la página y los nombres', async () => {
    const a = await newAccount('MNA');
    const saved = await saveSettings(a, menuBody());
    assert.equal(saved.status, 200, saved.text);

    const { body } = await getSettings(a);
    assert.deepEqual(body.welcome.options, [
        { title: 'Precios', target: 'rule', ruleId: RULE_A },
        { title: 'Hablar con alguien', target: 'person', ruleId: null },
    ]);
    assert.deepEqual(body.keywordRules.map(rule => rule.id), [RULE_A, RULE_B]);
    assert.equal(body.keywordRules[0].name, 'Precios');
    // Sin nombre: su posición.
    assert.equal(body.keywordRules[1].name, 'Respuesta 2');
    // Una respuesta sin frases (solo por botón) se guarda.
    assert.deepEqual(body.keywordRules[1].keywords, []);
    assert.deepEqual(body.keywordRules[1].options, []);
    assert.deepEqual(body.fallback.options, []);
    assert.deepEqual(body.handoff, { text: 'Ya te atiende alguien', position: null });
});

test('menús: lo que no es un menú válido da 400 y no guarda nada', async () => {
    const a = await newAccount('MNB');
    const b = await newAccount('MNC');
    const foreign = '6729a1b2c3d4e5f6a7b8c9e1';
    assert.equal((await saveSettings(b, settingsBody({
        keywordRules: [{ id: foreign, enabled: true, keywords: ['precio'], text: 'Cuesta $10', lineIds: [] }],
    }))).status, 200);
    const base = menuBody();
    const withWelcomeOptions = (options) => ({ ...base, welcome: { ...base.welcome, options } });
    const eleven = Array.from({ length: 11 }, (_, i) => ({ title: `Opción ${i + 1}`, target: 'start' }));

    // Revisión de Codex del PR #181, 2: sin `ruleId` la validación lanzaba un
    // TypeError y el 400 decía «Cannot read properties of null».
    for (const option of [{ title: 'Sin destino', target: 'rule' }, { title: 'Sin destino', target: 'rule', ruleId: null }]) {
        const response = await saveSettings(a, withWelcomeOptions([option]));
        assert.equal(response.status, 400);
        assert.ok(response.body.some(issue => issue.message === 'Elige a qué respuesta lleva'), JSON.stringify(response.body));
    }

    for (const [name, body] of Object.entries({
        destinoDesconocido: withWelcomeOptions([{ title: 'Otra', target: 'rule', ruleId: '6729a1b2c3d4e5f6a7b8c9ff' }]),
        // La respuesta existe, pero en otra cuenta.
        destinoDeOtraCuenta: withWelcomeOptions([{ title: 'Ajena', target: 'rule', ruleId: foreign }]),
        reglaSinDestino: withWelcomeOptions([{ title: 'Sin destino', target: 'rule' }]),
        titulosRepetidos: withWelcomeOptions([{ title: 'Precios', target: 'start' }, { title: 'precíos', target: 'person' }]),
        personaSinTexto: { ...base, handoff: { text: '  ' } },
        onceOpciones: withWelcomeOptions(eleven),
        tituloLargo: withWelcomeOptions([{ title: 'x'.repeat(21), target: 'start' }]),
        tituloVacio: withWelcomeOptions([{ title: '  ', target: 'start' }]),
        destinoRaro: withWelcomeOptions([{ title: 'Raro', target: 'menu' }]),
        nombreLargo: { ...base, keywordRules: [{ ...base.keywordRules[0], name: 'x'.repeat(41) }, base.keywordRules[1]] },
        cincuentaYUna: {
            ...base,
            welcome: { ...base.welcome, options: [] },
            keywordRules: Array.from({ length: 51 }, (_, i) => ({ enabled: true, keywords: [`frase ${i}`], text: 'x', lineIds: [] })),
        },
    })) {
        assert.equal((await saveSettings(a, body)).status, 400, name);
    }
    assert.equal((await getSettings(a)).body.configured, false);

    // 50 respuestas sí.
    const fifty = await saveSettings(a, {
        ...base,
        welcome: { ...base.welcome, options: [] },
        keywordRules: Array.from({ length: 50 }, (_, i) => ({ enabled: true, keywords: [`frase ${i}`], text: 'x', lineIds: [] })),
    });
    assert.equal(fifty.status, 200, fifty.text);
});

// Decisión G del spec: una pestaña con la página de antes no manda `handoff`
// y guardaba la configuración entera, sin las opciones.
test('menús: una pestaña con la página de antes no borra los menús (409)', async () => {
    const a = await newAccount('MND');
    assert.equal((await saveSettings(a, menuBody())).status, 200);

    const old = await saveSettings(a, settingsBody());
    assert.equal(old.status, 409);
    assert.equal(old.body[0].code, 'auto_replies_outdated');
    assert.equal((await getSettings(a)).body.welcome.options.length, 2);

    // Sin opciones guardadas, la página de antes guarda como siempre.
    const b = await newAccount('MNE');
    assert.equal((await saveSettings(b, settingsBody())).status, 200, 'cuenta sin documento');
    assert.equal((await saveSettings(b, settingsBody())).status, 200, 'cuenta sin opciones');
    assert.deepEqual((await getSettings(b)).body.handoff, { text: 'Enseguida te atiende alguien del equipo', position: null });
});

// Revisión de Codex del plan, 3: comprobar antes y guardar después dejaba un
// hueco en el que la pestaña vieja borraba un menú recién guardado.
test('menús: la pestaña vieja y un menú guardados a la vez nunca dejan la cuenta sin el menú', async () => {
    for (let round = 0; round < 5; round++) {
        const a = await newAccount(`MNG${round}`);
        const [menu, old] = await Promise.all([saveSettings(a, menuBody()), saveSettings(a, settingsBody())]);
        assert.equal(menu.status, 200, menu.text);
        assert.ok([200, 409].includes(old.status), old.text);
        assert.equal((await getSettings(a)).body.welcome.options.length, 2, `ronda ${round}: la pestaña vieja borró el menú`);
    }
});

// Revisión de Codex del plan, 5: con `.lean()` los defaults del modelo no se
// aplican, y una configuración de la v1 llegaba sin `handoff` ni `options`.
test('menús: una configuración guardada antes de los menús se completa al leerla y el bot responde igual', async () => {
    await clearQueue();
    const a = await newAccount('MNF');
    const v1 = settingsBody();
    await AutoReplySettings.collection.insertOne({
        userId: new (await import('mongoose')).default.Types.ObjectId(a.accountId),
        enabled: true, timezone: v1.timezone, handoffHours: 12,
        welcome: { enabled: true, text: WELCOME, returnAfterDays: 30 },
        outOfHours: v1.outOfHours,
        keywordRules: [{ _id: new (await import('mongoose')).default.Types.ObjectId(), enabled: true, keywords: ['precio'], text: 'Cuesta $10', lineIds: [] }],
    });

    const { body } = await getSettings(a);
    assert.deepEqual(body.handoff, { text: 'Enseguida te atiende alguien del equipo', position: null });
    assert.deepEqual(body.welcome.options, []);
    assert.deepEqual(body.keywordRules[0].options, []);
    assert.equal(body.keywordRules[0].name, 'Respuesta 1');
    assert.deepEqual(body.fallback, { enabled: false, text: '', options: [], position: null });

    metaForBot();
    try {
        await postWebhook(numberOf(a), textFrom('593970009001', 'hola'));
        assert.deepEqual(await drain(), ['done']);
    } finally {
        onMeta(null);
    }
    const [inbound] = await inboundsOf(a, '593970009001');
    const [reply] = await botMessagesOf(inbound.conversationId);
    assert.equal(reply.text, WELCOME);
});

test('menús: probar con toques, sin guardar nada', async () => {
    const a = await newAccount('MNI');
    const response = await preview(a, {
        settings: menuBody(),
        messages: ['hola', { optionId: `wasmish:r:${RULE_A}`, title: 'Precios' }, { optionId: 'wasmish:person', title: 'Hablar con alguien' }, 'precio'],
    });
    assert.equal(response.status, 200, response.text);
    const { turns } = response.body;
    assert.equal(turns[0].optionsFormat, 'buttons');
    assert.deepEqual(turns[0].options, [
        { id: `wasmish:r:${RULE_A}`, title: 'Precios' },
        { id: 'wasmish:person', title: 'Hablar con alguien' },
    ]);
    assert.deepEqual(turns[1].parts, [{ kind: 'option', text: 'Cuesta $10', ruleIndex: 0 }]);
    assert.deepEqual(turns[2].parts, [{ kind: 'handoff', text: 'Ya te atiende alguien' }]);
    assert.equal(turns[3].skip, 'handoff');
    assert.equal((await getSettings(a)).body.configured, false);

    for (const bad of [{ optionId: 'x'.repeat(257), title: 'A' }, { optionId: 'wasmish:start', title: '' }, { optionId: 'wasmish:start' }]) {
        assert.equal((await preview(a, { settings: menuBody(), messages: [bad] })).status, 400, JSON.stringify(bad).slice(0, 60));
    }
});

// --- Bot con menús: el envío (spec 2026-11-05 § 4.4) -----------------------

/** Como `metaForBot`, guardando el cuerpo de cada envío. */
const metaCapturing = () => {
    const bodies = [];
    onMeta(async (config) => {
        if (config.method !== 'post' || !config.url.endsWith('/messages')) return undefined;
        bodies.push(JSON.parse(config.data));
        return { data: { messages: [{ id: `wamid.bot-${++wamidSeq}` }] } };
    });
    return bodies;
};
const tapFrom = (from, id, title, kind = 'button_reply') => inboundValue(from, { type: 'interactive', interactive: { type: kind, [kind]: { id, title } } });

test('menús: la bienvenida con dos opciones sale como botones, y el toque responde lo elegido', async () => {
    await clearQueue();
    const a = await newAccount('MSA');
    assert.equal((await saveSettings(a, menuBody())).status, 200);
    const from = '593970009101';
    const bodies = metaCapturing();
    try {
        await postWebhook(numberOf(a), textFrom(from, 'hola'));
        assert.deepEqual(await drain(), ['done']);
        await postWebhook(numberOf(a), tapFrom(from, `wasmish:r:${RULE_A}`, 'Precios'));
        assert.deepEqual(await drain(), ['done']);
    } finally {
        onMeta(null);
    }

    assert.equal(bodies[0].type, 'interactive');
    assert.equal(bodies[0].interactive.type, 'button');
    assert.equal(bodies[0].interactive.body.text, WELCOME);
    assert.deepEqual(bodies[0].interactive.action.buttons.map(button => button.reply), [
        { id: `wasmish:r:${RULE_A}`, title: 'Precios' },
        { id: 'wasmish:person', title: 'Hablar con alguien' },
    ]);
    assert.equal(bodies[1].interactive.body.text, 'Cuesta $10');

    const [inbound] = await inboundsOf(a, from);
    const replies = await botMessagesOf(inbound.conversationId);
    assert.deepEqual(replies.map(m => m.text), [WELCOME, 'Cuesta $10']);
    assert.equal(replies[0].type, 'text');
    assert.equal(replies[0].optionsFormat, 'buttons');
    assert.deepEqual(replies[0].options, [
        { id: `wasmish:r:${RULE_A}`, title: 'Precios' },
        { id: 'wasmish:person', title: 'Hablar con alguien' },
    ]);

    const list = await request(a, 'GET', `/chats/${inbound.conversationId}/messages`);
    const served = list.body.items.find(item => item.id === String(replies[0]._id));
    assert.equal(served.optionsFormat, 'buttons');
    assert.equal(served.options.length, 2);
});

test('menús: una respuesta con cinco opciones sale como lista; sin opciones, texto como siempre', async () => {
    await clearQueue();
    const a = await newAccount('MSB');
    const base = menuBody();
    const five = ['Tarjetas', 'Volantes', 'Lonas', 'Sellos', 'Volver'].map(title => ({ title, target: 'start' }));
    assert.equal((await saveSettings(a, {
        ...base,
        keywordRules: [{ ...base.keywordRules[0], options: five }, base.keywordRules[1]],
    })).status, 200);
    const from = '593970009102';
    const bodies = metaCapturing();
    try {
        await postWebhook(numberOf(a), tapFrom(from, `wasmish:r:${RULE_A}`, 'Precios', 'list_reply'));
        await drain();
        await postWebhook(numberOf(a), tapFrom(from, `wasmish:r:${RULE_B}`, 'Envíos'));
        await drain();
    } finally {
        onMeta(null);
    }

    assert.equal(bodies[0].interactive.type, 'list');
    assert.equal(bodies[0].interactive.action.button, 'Ver opciones');
    assert.deepEqual(bodies[0].interactive.action.sections[0].rows.map(row => row.title), five.map(option => option.title));
    // «Envíos» no tiene opciones: texto, como la v1.
    assert.equal(bodies[1].type, 'text');
    assert.equal(bodies[1].text.body, 'Enviamos en 48 h');
    const [inbound] = await inboundsOf(a, from);
    const [, plain] = await botMessagesOf(inbound.conversationId);
    assert.equal(plain.options, undefined);
    assert.equal(plain.optionsFormat, undefined);
});

// --- Bot con menús: «hablar con una persona» (spec 2026-11-05 § 4.5) -------

const PUSH_KEYS = { p256dh: 'BPcl4Zx-clave-publica-de-pruebas', auth: 'secreto-auth' };
let endpointSeq = 0;
/** Activa los avisos push de `member` en un dispositivo; devuelve su endpoint. */
const subscribePush = async (member) => {
    const endpoint = `https://fcm.googleapis.com/fcm/send/handoff-${Date.now()}-${endpointSeq++}`;
    assert.equal((await request(member, 'POST', '/push/subscriptions', { endpoint, keys: PUSH_KEYS })).status, 200);
    return endpoint;
};
// Solo el de «pide una persona» (con el bot apagado, el toque manda el de entrante).
const pushesTo = (endpoint) => pushCalls.filter(call => call.endpoint === endpoint && / pide hablar con una persona\.$/.test(call.payload.body));
/** El push sale sin esperar: hasta que se cumple `predicate`, o 2 s. */
const eventually = async (predicate, ms = 2000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
        if (await predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    return Boolean(await predicate());
};
const handoffNotices = (conversationId) => Notification.find({ conversationId, type: 'handoff' }).lean();
const personTap = (from) => tapFrom(from, 'wasmish:person', 'Hablar con alguien');

/** Una cuenta con el menú, un agente con la línea y otro sin ella. */
const handoffTeam = async (label) => {
    const owner = await newAccount(label);
    assert.equal((await saveSettings(owner, menuBody())).status, 200);
    const agent = await seedMember(owner, { role: 'agent', lineIds: [owner.lineId], label: `${label}G` });
    const outsider = await seedMember(owner, { role: 'agent', lineIds: [], label: `${label}X` });
    return { owner, agent, outsider };
};
const conversationWith = async (account, from) => {
    const contact = await Contact.findOne({ userId: account.accountId, phone: from }).lean();
    return Conversation.findOne({ userId: account.accountId, contactId: contact._id }).lean();
};

test('pide una persona: responde, marca, avisa en la campanita y por push a quien ve la línea', async () => {
    await clearQueue();
    const { owner, agent, outsider } = await handoffTeam('HPA');
    const [ownerPush, agentPush, outsiderPush] = await Promise.all([subscribePush(owner), subscribePush(agent), subscribePush(outsider)]);
    const from = '593970009201';
    const bodies = metaCapturing();
    const stream = await openStream(owner);
    try {
        await postWebhook(numberOf(owner), personTap(from));
        assert.deepEqual(await drain(), ['done']);
        assert.ok(await stream.waitFor('"handoffRequest":{"at"', 2000), 'la bandeja no recibió la marca');
    } finally {
        onMeta(null);
        await stream.close();
    }
    assert.equal(bodies[0].type, 'text');
    assert.equal(bodies[0].text.body, 'Ya te atiende alguien');

    const conversation = await conversationWith(owner, from);
    assert.ok(conversation.handoffRequest.at);
    const [tap] = await inboundsOf(owner, from);
    assert.equal(String(conversation.handoffRequest.messageId), String(tap._id));

    const notices = await handoffNotices(conversation._id);
    assert.deepEqual(notices.map(n => String(n.recipientId)).sort(), [owner.userId, agent.userId].sort());
    assert.ok(notices.every(n => n.actorId === null));
    assert.ok(await eventually(() => pushesTo(ownerPush).length === 1 && pushesTo(agentPush).length === 1));
    assert.equal(pushesTo(outsiderPush).length, 0);
    assert.match(pushesTo(agentPush)[0].payload.body, /pide hablar con una persona\.$/);

    // La bandeja y la campanita lo traen.
    const list = await request(owner, 'GET', '/chats');
    assert.ok(list.body.find(item => item.id === String(conversation._id)).handoffRequest.at);
    const bell = await request(agent, 'GET', '/notifications');
    const served = bell.body.items.find(item => item.type === 'handoff');
    assert.equal(served.conversation.id, String(conversation._id));
});

test('pide una persona en una conversación asignada: el aviso y el push, solo a quien la atiende', async () => {
    await clearQueue();
    const { owner, agent } = await handoffTeam('HPB');
    const [ownerPush, agentPush] = await Promise.all([subscribePush(owner), subscribePush(agent)]);
    const from = '593970009202';
    metaForBot();
    try {
        await postWebhook(numberOf(owner), textFrom(from, 'hola'));
        await drain();
        const conversation = await conversationWith(owner, from);
        assert.equal((await request(owner, 'POST', `/chats/${conversation._id}/assign`, { userId: agent.userId })).status, 200);
        await Conversation.updateOne({ _id: conversation._id }, { $unset: { 'bot.humanRepliedAt': '' } });
        pushCalls.length = 0;
        await postWebhook(numberOf(owner), personTap(from));
        await drain();
        const notices = await handoffNotices(conversation._id);
        assert.deepEqual(notices.map(n => String(n.recipientId)), [agent.userId]);
        assert.ok(await eventually(() => pushesTo(agentPush).length === 1));
        assert.equal(pushesTo(ownerPush).length, 0);
    } finally {
        onMeta(null);
    }
});

test('dos toques de «persona» seguidos: una marca, un aviso por persona y un push', async () => {
    await clearQueue();
    const { owner } = await handoffTeam('HPC');
    const ownerPush = await subscribePush(owner);
    const from = '593970009203';
    metaForBot();
    try {
        await postWebhook(numberOf(owner), personTap(from));
        await postWebhook(numberOf(owner), personTap(from));
        assert.deepEqual((await drain()).sort(), ['done', 'skipped']);
    } finally {
        onMeta(null);
    }
    const conversation = await conversationWith(owner, from);
    assert.equal((await handoffNotices(conversation._id)).filter(n => String(n.recipientId) === owner.userId).length, 1);
    assert.ok(await eventually(() => pushesTo(ownerPush).length === 1));
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(pushesTo(ownerPush).length, 1);
    const [, second] = await inboundsOf(owner, from);
    assert.equal(second.bot.skipReason, 'handoff');
});

test('con la marca puesta el bot no responde nada, sin llamar a Meta', async () => {
    await clearQueue();
    const { owner } = await handoffTeam('HPD');
    const from = '593970009204';
    metaForBot();
    try {
        await postWebhook(numberOf(owner), personTap(from));
        await drain();
        const sends = metaSendsTo(owner);
        await postWebhook(numberOf(owner), textFrom(from, 'precio'));
        await postWebhook(numberOf(owner), tapFrom(from, `wasmish:r:${RULE_A}`, 'Precios'));
        assert.deepEqual(await drain(), ['skipped', 'skipped']);
        assert.equal(metaSendsTo(owner), sends);
    } finally {
        onMeta(null);
    }
    const inbounds = await inboundsOf(owner, from);
    assert.deepEqual(inbounds.slice(1).map(m => m.bot.skipReason), ['handoff', 'handoff']);
});

// Decisión C del spec: la pausa calla la respuesta, no la marca ni el aviso.
test('pide una persona con el bot en pausa: no responde, pero marca y avisa', async () => {
    await clearQueue();
    const { owner } = await handoffTeam('HPE');
    const from = '593970009205';
    metaForBot();
    try {
        await postWebhook(numberOf(owner), textFrom(from, 'hola'));
        await drain();
        const conversation = await conversationWith(owner, from);
        await Conversation.updateOne({ _id: conversation._id }, { $set: { 'bot.humanRepliedAt': new Date(Date.now() - 60 * 60 * 1000) } });
        const sends = metaSendsTo(owner);
        await postWebhook(numberOf(owner), personTap(from));
        assert.deepEqual(await drain(), ['skipped']);
        assert.equal(metaSendsTo(owner), sends);
        assert.ok((await Conversation.findById(conversation._id).lean()).handoffRequest);
        assert.equal((await handoffNotices(conversation._id)).length, 2, 'el owner y el agente de la línea');
    } finally {
        onMeta(null);
    }
});

// Revisión de Codex del plan, 1: si alguien del equipo responde mientras el
// worker decide, la marca no se queda puesta para siempre.
test('alguien responde después del toque y antes del worker: ni marca ni aviso', async () => {
    await clearQueue();
    const { owner } = await handoffTeam('HPF');
    const from = '593970009206';
    metaForBot();
    try {
        await postWebhook(numberOf(owner), textFrom(from, 'hola'));
        await drain();
        const conversation = await conversationWith(owner, from);
        await Conversation.updateOne({ _id: conversation._id }, { $unset: { 'bot.humanRepliedAt': '' } });
        // El toque, con la hora de Meta de hace 5 s; la respuesta, ahora.
        const value = personTap(from);
        value.messages[0].timestamp = String(Math.floor(Date.now() / 1000) - 5);
        await postWebhook(numberOf(owner), value);
        assert.equal((await request(owner, 'POST', `/chats/${conversation._id}/messages`, { text: 'Hola, te atiendo yo', temporalId: 't-hpf' })).status, 201);
        assert.deepEqual(await drain(), ['skipped']);
        assert.equal((await Conversation.findById(conversation._id).lean()).handoffRequest, null);
        assert.equal((await handoffNotices(conversation._id)).length, 0);
    } finally {
        onMeta(null);
    }

    // Lo mismo llamándola directamente: una respuesta posterior al toque gana.
    const conversation = await conversationWith(owner, from);
    await Conversation.updateOne({ _id: conversation._id }, { $set: { 'bot.humanRepliedAt': new Date() } });
    assert.equal(await requestHandoff({
        accountId: owner.accountId, conversationId: conversation._id, messageId: conversation._id, tapAt: new Date(Date.now() - 60 * 1000),
        contact: { phone: from },
    }), false);
});

test('quitarle la línea a un agente antes de que el worker tome el toque: no le llega nada', async () => {
    await clearQueue();
    const { owner, agent } = await handoffTeam('HPG');
    const agentPush = await subscribePush(agent);
    const from = '593970009207';
    metaForBot();
    try {
        await postWebhook(numberOf(owner), personTap(from));
        await User.updateOne({ _id: agent.userId }, { $set: { lineIds: [] } });
        await drain();
    } finally {
        onMeta(null);
    }
    const conversation = await conversationWith(owner, from);
    assert.deepEqual((await handoffNotices(conversation._id)).map(n => String(n.recipientId)), [owner.userId]);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(pushesTo(agentPush).length, 0);
});

test('responder desde el chat quita la marca y avisa a la bandeja', async () => {
    await clearQueue();
    const { owner } = await handoffTeam('HPH');
    const from = '593970009208';
    metaForBot();
    const stream = await openStream(owner);
    try {
        await postWebhook(numberOf(owner), personTap(from));
        await drain();
        const conversation = await conversationWith(owner, from);
        assert.equal((await request(owner, 'POST', `/chats/${conversation._id}/messages`, { text: 'Aquí estoy', temporalId: 't-hph' })).status, 201);
        assert.ok(await stream.waitFor('"handoffRequest":null', 2000), 'la bandeja no supo que se quitó');
        assert.equal((await Conversation.findById(conversation._id).lean()).handoffRequest, null);
    } finally {
        onMeta(null);
        await stream.close();
    }
});

test('quitar la marca a mano: 404 si no se ve la conversación, 204 y el bot vuelve a responder', async () => {
    await clearQueue();
    const { owner, agent, outsider } = await handoffTeam('HPI');
    const teammate = await seedMember(owner, { role: 'agent', lineIds: [owner.lineId], label: 'HPIT' });
    const other = await newAccount('HPJ');
    const from = '593970009209';
    metaForBot();
    try {
        await postWebhook(numberOf(owner), personTap(from));
        await drain();
        const conversation = await conversationWith(owner, from);
        const clear = (who) => request(who, 'DELETE', `/chats/${conversation._id}/handoff-request`);

        assert.equal((await clear(other)).status, 404);
        assert.equal((await clear(outsider)).status, 404);
        // De un compañero de la misma línea: 404, sin decir quién la atiende.
        assert.equal((await request(owner, 'POST', `/chats/${conversation._id}/assign`, { userId: teammate.userId })).status, 200);
        const foreign = await clear(agent);
        assert.equal(foreign.status, 404);
        assert.equal(JSON.stringify(foreign.body).includes('assigned_to_other'), false);
        assert.ok((await Conversation.findById(conversation._id).lean()).handoffRequest, 'la marca sigue');

        assert.equal((await clear(owner)).status, 204);
        const cleared = await Conversation.findById(conversation._id).lean();
        assert.equal(cleared.handoffRequest, null);
        assert.equal(cleared.bot?.humanRepliedAt ?? null, null, 'quitarla no pausa al bot');

        await postWebhook(numberOf(owner), textFrom(from, 'precio'));
        assert.deepEqual(await drain(), ['done']);
    } finally {
        onMeta(null);
    }
});

// Revisión de Codex del PR #182, 3: `requestHandoff` emitía al final la marca
// que copió al principio; si mientras tanto alguien la quitó (y emitió `null`),
// la bandeja volvía a mostrarla. Ahora se emite lo que hay en la BD al enviar.
test('la marca que se emite es la de la BD en ese momento, no la de antes', async () => {
    await clearQueue();
    const { owner } = await handoffTeam('HPK');
    const from = '593970009211';
    metaForBot();
    try {
        await postWebhook(numberOf(owner), personTap(from));
        await drain();
    } finally {
        onMeta(null);
    }
    const conversation = await conversationWith(owner, from);
    const stream = await openStream(owner);
    try {
        await emitHandoffRequest(owner.accountId, conversation._id);
        assert.ok(await stream.waitFor(`"handoffRequest":{"at":"${conversation.handoffRequest.at.toISOString()}"}`, 2000), 'no emitió la marca de la BD');
        await Conversation.updateOne({ _id: conversation._id }, { $set: { handoffRequest: null } });
        await emitHandoffRequest(owner.accountId, conversation._id);
        assert.ok(await stream.waitFor('"handoffRequest":null', 2000), 'emitió una marca que ya no estaba');
    } finally {
        await stream.close();
    }
});

test('responder desde la app de WhatsApp Business (eco) también quita la marca', async () => {
    await clearQueue();
    const { owner } = await handoffTeam('HPL');
    const from = '593970009212';
    metaForBot();
    try {
        await postWebhook(numberOf(owner), personTap(from));
        await drain();
    } finally {
        onMeta(null);
    }
    const conversation = await conversationWith(owner, from);
    assert.ok(conversation.handoffRequest);
    const echo = { from: '15550000001', to: from, id: `wamid.eco.hpl.${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'Te atiendo desde el celular' } };
    assert.equal((await postEcho(numberOf(owner), [echo])).status, 200);
    assert.equal((await Conversation.findById(conversation._id).lean()).handoffRequest, null);
});

// Revisión de Codex del PR #182, 1: el DELETE leía con el alcance de quien lo
// pide y escribía sin él; una asignación entre medias le dejaba quitarla.
test('el DELETE comprueba el alcance en la misma escritura que quita la marca', async () => {
    await clearQueue();
    const { owner, agent } = await handoffTeam('HPM');
    const teammate = await seedMember(owner, { role: 'agent', lineIds: [owner.lineId], label: 'HPMT' });
    const from = '593970009213';
    metaForBot();
    try {
        await postWebhook(numberOf(owner), personTap(from));
        await drain();
    } finally {
        onMeta(null);
    }
    const conversation = await conversationWith(owner, from);
    await Conversation.updateOne({ _id: conversation._id }, { $set: { assignedTo: teammate.userId } });
    // Sin lectura previa: la condición va en la escritura.
    const queries = [];
    const original = Conversation.findOne;
    Conversation.findOne = function (...args) { queries.push(args[0]); return original.apply(this, args); };
    let response;
    try {
        response = await request(agent, 'DELETE', `/chats/${conversation._id}/handoff-request`);
    } finally {
        Conversation.findOne = original;
    }
    assert.equal(response.status, 404);
    assert.equal(queries.length, 0, 'leyó la conversación antes de escribir');
    assert.ok((await Conversation.findById(conversation._id).lean()).handoffRequest);
});

// --- Bot con menús: lo que pide el diseño de la UI (plan, Tarea 8) ---------

const handoffEventsOf = async (conversationId) => (await ConversationEvent.find({ conversationId, type: { $in: ['handoff', 'handoff_cleared'] } })
    .sort({ at: 1, _id: 1 }).lean()).map(event => ({ type: event.type, actorId: event.actorId ? String(event.actorId) : null }));

test('pedir una persona deja un evento en el hilo, una sola vez; responder la quita sin evento', async () => {
    await clearQueue();
    const { owner } = await handoffTeam('HEA');
    const from = '593970009301';
    metaForBot();
    const stream = await openStream(owner);
    try {
        await postWebhook(numberOf(owner), personTap(from));
        await postWebhook(numberOf(owner), personTap(from));
        await drain();
        assert.ok(await stream.waitFor('"type":"handoff"', 2000), 'el hilo no recibió el evento');
        const conversation = await conversationWith(owner, from);
        assert.deepEqual(await handoffEventsOf(conversation._id), [{ type: 'handoff', actorId: null }]);

        assert.equal((await request(owner, 'POST', `/chats/${conversation._id}/messages`, { text: 'Te atiendo yo', temporalId: 't-hea' })).status, 201);
        assert.equal((await Conversation.findById(conversation._id).lean()).handoffRequest, null);
        assert.deepEqual(await handoffEventsOf(conversation._id), [{ type: 'handoff', actorId: null }], 'responder no deja evento');
    } finally {
        onMeta(null);
        await stream.close();
    }
});

test('quitar la marca a mano deja un evento con quien la quitó; sin marca, ninguno', async () => {
    await clearQueue();
    const { owner, agent } = await handoffTeam('HEB');
    const from = '593970009302';
    metaForBot();
    try {
        await postWebhook(numberOf(owner), personTap(from));
        await drain();
    } finally {
        onMeta(null);
    }
    const conversation = await conversationWith(owner, from);
    const clear = () => request(agent, 'DELETE', `/chats/${conversation._id}/handoff-request`);
    assert.equal((await clear()).status, 204);
    assert.equal((await clear()).status, 204);
    assert.deepEqual(await handoffEventsOf(conversation._id), [
        { type: 'handoff', actorId: null },
        { type: 'handoff_cleared', actorId: agent.userId },
    ]);
    // El hilo los sirve con los de la asignación.
    const page = await request(owner, 'GET', `/chats/${conversation._id}/messages?events=1`);
    const served = page.body.events.filter(event => event.type.startsWith('handoff'));
    assert.deepEqual(served.map(event => event.type).sort(), ['handoff', 'handoff_cleared']);
});

test('el aviso de «pide una persona» dice si sigue pendiente', async () => {
    await clearQueue();
    const { owner } = await handoffTeam('HEC');
    const from = '593970009303';
    metaForBot();
    try {
        await postWebhook(numberOf(owner), personTap(from));
        await drain();
    } finally {
        onMeta(null);
    }
    const handoffOf = async () => (await request(owner, 'GET', '/notifications')).body.items.find(item => item.type === 'handoff');
    assert.deepEqual((await handoffOf()).handoff, { pending: true });
    const conversation = await conversationWith(owner, from);
    assert.equal((await request(owner, 'DELETE', `/chats/${conversation._id}/handoff-request`)).status, 204);
    assert.deepEqual((await handoffOf()).handoff, { pending: false });
});

// Decisión de Jonathan del 2026-11-05: el toque de «persona» mandaba dos push,
// el del entrante y el de «pide una persona».
test('pedir una persona manda un solo push; con el bot apagado, el del entrante', async () => {
    await clearQueue();
    const { owner } = await handoffTeam('HED');
    const ownerPush = await subscribePush(owner);
    const from = '593970009304';
    const allTo = () => pushCalls.filter(call => call.endpoint === ownerPush);
    metaForBot();
    try {
        await postWebhook(numberOf(owner), personTap(from));
        await drain();
        assert.ok(await eventually(() => pushesTo(ownerPush).length === 1));
        await new Promise(resolve => setTimeout(resolve, 100));
        assert.equal(allTo().length, 1, 'solo el de «pide una persona»');

        // Con el bot apagado no hay marca ni su push: sale el del entrante.
        await AutoReplySettings.updateOne({ userId: owner.accountId }, { $set: { enabled: false } });
        const conversation = await conversationWith(owner, from);
        await Conversation.updateOne({ _id: conversation._id }, { $set: { handoffRequest: null } });
        await postWebhook(numberOf(owner), personTap(from));
        assert.ok(await eventually(() => allTo().length === 2));
        assert.equal(pushesTo(ownerPush).length, 1);
        assert.equal(allTo()[1].payload.body, 'Hablar con alguien');
    } finally {
        onMeta(null);
    }
});

// Revisión de Codex del PR #184, 1: el webhook callaba el push de entrante de
// todo toque de «persona» con trabajo del bot, aunque el worker no fuera a
// marcar nada; un botón viejo se quedaba sin ningún push.
test('un toque de «persona» que no marca nada manda el push de entrante', async () => {
    await clearQueue();
    const owner = await newAccount('HEE');
    // Sin opciones a una persona y sin su texto: el toque viejo es un texto escrito.
    const body = menuBody({ handoff: { text: '' } });
    body.welcome.options = body.welcome.options.filter(option => option.target !== 'person');
    assert.equal((await saveSettings(owner, body)).status, 200);
    const ownerPush = await subscribePush(owner);
    const from = '593970009305';
    const allTo = () => pushCalls.filter(call => call.endpoint === ownerPush);
    metaForBot();
    try {
        await postWebhook(numberOf(owner), personTap(from));
        await drain();
        assert.ok(await eventually(() => allTo().length === 1), 'no salió ningún push');
        assert.equal(allTo()[0].payload.body, 'Hablar con alguien');
        assert.equal(pushesTo(ownerPush).length, 0);
    } finally {
        onMeta(null);
    }
});

test('con la marca ya puesta, otro toque de «persona» manda el push de entrante', async () => {
    await clearQueue();
    const { owner } = await handoffTeam('HEF');
    const ownerPush = await subscribePush(owner);
    const from = '593970009306';
    const allTo = () => pushCalls.filter(call => call.endpoint === ownerPush);
    metaForBot();
    try {
        await postWebhook(numberOf(owner), personTap(from));
        await drain();
        assert.ok(await eventually(() => allTo().length === 1));
        await postWebhook(numberOf(owner), personTap(from));
        await drain();
        assert.ok(await eventually(() => allTo().length === 2), 'el segundo toque no avisó');
        assert.equal(pushesTo(ownerPush).length, 1, 'un solo «pide una persona»');
        assert.equal(allTo()[1].payload.body, 'Hablar con alguien');
    } finally {
        onMeta(null);
    }
});

// --- Bot con menús: dónde quedó cada tarjeta del lienzo (plan, Tarea 9) -----

test('las posiciones de las tarjetas se guardan y se leen; sin guardar, null', async () => {
    const owner = await newAccount('POA');
    // Una configuración de antes de las posiciones: todas a null.
    assert.equal((await saveSettings(owner, menuBody())).status, 200);
    const before = (await getSettings(owner)).body;
    assert.equal(before.welcome.position, null);
    assert.equal(before.fallback.position, null);
    assert.equal(before.handoff.position, null);
    assert.ok(before.keywordRules.every(rule => rule.position === null));

    const body = menuBody({ handoff: { text: 'Ya te atiende alguien', position: { x: 400, y: 900 } } });
    body.welcome.position = { x: 36, y: 68 };
    body.keywordRules[0].position = { x: 366, y: 68 };
    body.fallback = { enabled: true, text: 'No te entendí', options: [], position: { x: 0, y: 20000 } };
    const saved = await saveSettings(owner, body);
    assert.equal(saved.status, 200);
    const read = (await getSettings(owner)).body;
    assert.deepEqual(read.welcome.position, { x: 36, y: 68 });
    assert.deepEqual(read.keywordRules[0].position, { x: 366, y: 68 });
    assert.equal(read.keywordRules[1].position, null);
    assert.deepEqual(read.fallback.position, { x: 0, y: 20000 });
    assert.deepEqual(read.handoff.position, { x: 400, y: 900 });

    // Una guardada sin el campo (la v1, en la BD): se lee con null.
    await AutoReplySettings.updateOne({ userId: owner.accountId }, { $unset: { 'welcome.position': '', 'handoff.position': '', 'keywordRules.0.position': '' } });
    const legacy = (await getSettings(owner)).body;
    assert.equal(legacy.welcome.position, null);
    assert.equal(legacy.handoff.position, null);
    assert.equal(legacy.keywordRules[0].position, null);
});

test('una posición fuera de rango o con decimales: 400', async () => {
    const owner = await newAccount('POB');
    for (const position of [{ x: -1, y: 0 }, { x: 0, y: 20001 }, { x: 1.5, y: 3 }, { x: 10 }]) {
        const body = menuBody();
        body.keywordRules[0].position = position;
        assert.equal((await saveSettings(owner, body)).status, 400, JSON.stringify(position));
    }
});
