// Respuestas automáticas: la configuración es de cada cuenta, solo la tocan
// owner y admin, y el «probar» no guarda nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    seedAccount, seedMember, connectWhatsapp, request, onMeta, ANONYMOUS, PNG,
    ApiKey, Campaign, Conversation,
} from './helpers.js';

const { processNext } = await import('../../src/workers/campaign.worker.js');
const { hashApiKey } = await import('../../src/utils/crypto.js');

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
    assert.equal(saved.body.keywordRules.length, 1);
    assert.match(saved.body.keywordRules[0].id, /^[a-f\d]{24}$/);

    const own = await getSettings(a);
    assert.deepEqual(own.body, saved.body);

    const other = await getSettings(b);
    assert.equal(other.status, 200);
    assert.equal(other.body.enabled, false);
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
    assert.deepEqual(nothing.body, { reply: null, parts: [], matchedRuleIndexes: [], outOfHours: false });
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
