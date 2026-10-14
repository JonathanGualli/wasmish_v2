// Fase 3 de multi-línea: cada rol hace lo suyo (403 si no) y ve solo sus
// líneas (404 en lo de una línea ajena, como en lo de otra cuenta).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    seedAccount, seedMember, connectWhatsapp, request, onMeta, metaCalls, ANONYMOUS, PNG,
    Account, ApiKey, Campaign, Conversation, Message,
} from './helpers.js';

const { hashApiKey } = await import('../../src/utils/crypto.js');

// La cuenta A con tres líneas (801 por defecto, 802 y 803), una conversación
// en 801 (su contacto) y otra en 802 (el contacto suelto, que solo habla por
// ahí), un adjunto en la de 802 y una campaña por 802.
const a = await seedAccount('PA', { seq: 1, maxLines: 3 });
const { lineId: l1 } = await connectWhatsapp(a, { phoneNumberId: '801' });
const { lineId: l2 } = await connectWhatsapp(a, { phoneNumberId: '802' });
const { lineId: l3 } = await connectWhatsapp(a, { phoneNumberId: '803' });
const L1 = String(l1);
const L2 = String(l2);

const c1 = await Conversation.create({
    userId: a.accountId, contactId: a.contactId, contactPhone: a.phone, phoneNumberId: '801', lineId: l1, lastInboundAt: new Date(),
});
const c2 = await Conversation.create({
    userId: a.accountId, contactId: a.loneContactId, phoneNumberId: '802', lineId: l2, lastInboundAt: new Date(),
});
const media2 = await Message.create({
    conversationId: c2._id, direction: 'inbound', sender: 'them', text: 'foto', type: 'image',
    mediaId: 'm2', mimeType: 'image/png', mediaFile: '1000.png', timestamp: new Date(),
});
const campaign2 = await Campaign.create({
    userId: a.accountId, name: 'por 802', totalRecipients: 1, dryRun: true, lineId: l2, status: 'queued',
    template: { templateId: a.templateId, name: a.templateName, language: 'es', category: 'MARKETING', bodyText: 'hola' },
});

const agent = await seedMember(a, { role: 'agent', lineIds: [l1], label: 'AG' });
const supervisor = await seedMember(a, { role: 'supervisor', lineIds: [l1], label: 'SU' });

const noMetaCalls = async (fn) => {
    const before = metaCalls.length;
    await fn();
    assert.equal(metaCalls.length, before, 'llamó a Meta');
};

test('un agente no llega a la conversación de una línea que no es suya: 404, sin llamar a Meta', async () => {
    await noMetaCalls(async () => {
        const id = String(c2._id);
        for (const [method, url, body, headers] of [
            ['GET', `/chats/${id}/messages`],
            ['GET', `/media/${media2._id}`],
            ['POST', `/chats/${id}/messages`, { text: 'hola', temporalId: 't1' }],
            ['POST', `/chats/${id}/media`, PNG, { 'Content-Type': 'image/png' }],
            ['POST', `/chats/${id}/template`, { templateName: a.templateName, language: 'es' }],
        ]) {
            const res = await request(agent, method, url, body, headers);
            assert.equal(res.status, 404, `${method} ${url}: ${res.text}`);
        }
    });
});

test('GET /chats: el agente solo ve las de sus líneas; el owner, todas', async () => {
    const asAgent = await request(agent, 'GET', '/chats');
    assert.equal(asAgent.status, 200, asAgent.text);
    assert.deepEqual(asAgent.body.map(chat => chat.id), [String(c1._id)]);

    const asOwner = await request(a, 'GET', '/chats');
    const ids = asOwner.body.map(chat => chat.id);
    assert.ok(ids.includes(String(c1._id)) && ids.includes(String(c2._id)) && ids.includes(a.conversationId));
});

test('GET /lines: el agente solo ve las suyas, sin la siguiente por defecto; gestionarlas, 403', async () => {
    const res = await request(agent, 'GET', '/lines');
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(res.body.lines.map(line => line.id), [L1]);
    assert.equal(res.body.nextDefaultLineId, null);
    for (const [method, url, body] of [
        ['PATCH', `/lines/${L2}`, { name: 'x' }],
        ['POST', `/lines/${L1}/disconnect`],
        ['GET', `/lines/${L1}/pin`],
    ]) {
        const denied = await request(agent, method, url, body);
        assert.equal(denied.status, 403, `${method} ${url}: ${denied.text}`);
        assert.equal(denied.body[0].code, 'forbidden');
    }
});

test('un agente no tiene campañas, API keys, etiquetas, importar, borrar, sincronizar ni conectar: 403', async () => {
    await noMetaCalls(async () => {
        for (const [method, url, body] of [
            ['GET', '/campaigns'],
            ['POST', '/campaigns', { templateId: a.templateId, recipients: { mode: 'ids', contactIds: [a.contactId] }, name: 'x' }],
            ['POST', '/api-key/generate', { nameApiKey: 'del agente' }],
            ['GET', '/api-key'],
            ['POST', '/tags', { name: 'Nueva' }],
            ['DELETE', `/tags/${a.tagId}`],
            ['POST', '/contacts/tags', {}],
            ['POST', '/contacts/import', {}],
            ['DELETE', `/contacts/${a.loneContactId}`],
            ['GET', '/templates/sync'],
            ['DELETE', `/templates/${a.templateId}/header-media`],
            ['POST', '/whatsapp/connect', { code: 'x', phoneNumberId: '899', waBusinessId: 'waba-x' }],
            ['PUT', '/users/update-user-token-whatsapp', { tokenWhatsapp: 'x', phoneNumberId: '899', waBusinessId: 'waba-x' }],
        ]) {
            const res = await request(agent, method, url, body);
            assert.equal(res.status, 403, `${method} ${url}: ${res.text}`);
        }
    });
});

test('el supervisor: campañas solo de sus líneas; la de otra línea, 404', async () => {
    const list = await request(supervisor, 'GET', '/campaigns');
    assert.equal(list.status, 200, list.text);
    assert.ok(!list.body.campaigns.some(campaign => campaign.id === String(campaign2._id)));
    assert.equal(list.body.totalCount, 0);

    for (const [method, url] of [
        ['GET', `/campaigns/${campaign2._id}`],
        ['GET', `/campaigns/${campaign2._id}/failures`],
        ['GET', `/campaigns/${campaign2._id}/recipients`],
        ['POST', `/campaigns/${campaign2._id}/pause`],
    ]) {
        const res = await request(supervisor, method, url);
        assert.equal(res.status, 404, `${method} ${url}: ${res.text}`);
    }
    assert.equal((await Campaign.findById(campaign2._id).lean()).status, 'queued');

    const create = await request(supervisor, 'POST', '/campaigns', {
        templateId: a.templateId, recipients: { mode: 'ids', contactIds: [a.contactId] }, name: 'por la ajena', lineId: L2,
    });
    assert.equal(create.status, 404, create.text);

    const asOwner = await request(a, 'GET', '/campaigns');
    assert.ok(asOwner.body.campaigns.some(campaign => campaign.id === String(campaign2._id)));
});

test('Contactos: el agente ve el contacto, pero no la conversación de otra línea; los filtros miran todas', async () => {
    const all = await request(agent, 'GET', '/contacts?limit=50');
    assert.equal(all.status, 200, all.text);
    const lone = all.body.contacts.find(contact => contact.id === a.loneContactId);
    assert.ok(lone, 'el contacto es de toda la cuenta');
    assert.deepEqual(lone.conversations, []);
    assert.ok(!all.text.includes(String(c2._id)));

    const withConversation = await request(agent, 'GET', '/contacts?filter=with_conversation&limit=50');
    assert.ok(withConversation.body.contacts.some(contact => contact.id === a.loneContactId));
    const withoutConversation = await request(agent, 'GET', '/contacts?filter=without_conversation&limit=50');
    assert.ok(!withoutConversation.body.contacts.some(contact => contact.id === a.loneContactId));

    const one = await request(agent, 'GET', `/contacts/${a.loneContactId}`);
    assert.equal(one.status, 200, one.text);
    assert.deepEqual(one.body.conversations, []);

    const asOwner = await request(a, 'GET', `/contacts/${a.loneContactId}`);
    assert.equal(asOwner.body.conversations.length, 1);
});

test('Plantillas: las de una línea que no es suya, 404', async () => {
    const res = await request(agent, 'GET', `/templates?lineId=${L2}`);
    assert.equal(res.status, 404, res.text);
    const own = await request(agent, 'GET', `/templates?lineId=${L1}`);
    assert.equal(own.status, 200, own.text);
});

// Regresión que vigila: sin elegir línea, la conversación salía por la por
// defecto de la cuenta aunque no fuera de las líneas del agente.
test('empezar una conversación sin elegir línea: la suya, no la por defecto ajena; con varias, que elija', async () => {
    await Account.updateOne({ _id: a.accountId }, { defaultLineId: l2 });
    const sent = [];
    onMeta(async (config) => {
        if (config.method !== 'post' || !config.url.endsWith('/messages')) return undefined;
        sent.push(config.url);
        return { data: { messages: [{ id: `wamid.${sent.length}` }] } };
    });
    try {
        const res = await request(agent, 'POST', '/chats/template', {
            destinationNumber: '593990001234', templateName: a.templateName, language: 'es',
        });
        assert.equal(res.status, 200, res.text);
        assert.deepEqual(sent, ['/801/messages']);

        const toOther = await request(agent, 'POST', '/chats/template', {
            destinationNumber: '593990001235', templateName: a.templateName, language: 'es', lineId: L2,
        });
        assert.equal(toOther.status, 404, toOther.text);

        const two = await seedMember(a, { role: 'agent', lineIds: [l1, l3], label: 'AG2' });
        const choose = await request(two, 'POST', '/chats/template', {
            destinationNumber: '593990001236', templateName: a.templateName, language: 'es',
        });
        assert.equal(choose.status, 400, choose.text);
        assert.equal(sent.length, 1);
    } finally {
        onMeta(null);
        await Account.updateOne({ _id: a.accountId }, { defaultLineId: l1 });
    }
});

test('la API key sigue llegando a todas las líneas: /v1 sin lineId sale por la por defecto', async () => {
    const key = 'wm_permisos';
    await ApiKey.create({ userId: a.accountId, keyHash: hashApiKey(key), keyPreview: 'wm_', name: 'v1' });
    const sent = [];
    onMeta(async (config) => {
        if (config.method !== 'post' || !config.url.endsWith('/messages')) return undefined;
        sent.push(config.url);
        return { data: { messages: [{ id: 'wamid.api' }] } };
    });
    try {
        const res = await request(ANONYMOUS, 'POST', '/v1/templates/send',
            { destinationNumber: a.phone, templateName: a.templateName }, { Authorization: `Bearer ${key}` });
        assert.equal(res.status, 200, res.text);
        assert.deepEqual(sent, ['/801/messages']);
    } finally {
        onMeta(null);
    }
});
