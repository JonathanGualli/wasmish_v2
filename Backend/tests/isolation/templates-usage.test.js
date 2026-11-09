// El uso de todas las plantillas (exportar a Excel, spec § 4.1 y § 7): B no
// ve lo de A; las cifras de cada plantilla son las de su detalle; el agente
// cuenta solo lo de su bandeja; los viejos por nombre no se cuelan en otro
// WABA; las campañas, solo con `campaigns.manage`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seedAccount, seedMember, request, connectWhatsapp, Campaign, Contact, Conversation, Message, Template } from './helpers.js';

let phoneSeq = 0;
// Una conversación de `account` por `lineId`, con un contacto propio.
const conversationOn = async (account, lineId, { assignedTo = null } = {}) => {
    phoneSeq += 1;
    const contact = await Contact.create({ userId: account.accountId, phone: `5939810${String(phoneSeq).padStart(5, '0')}`, name: 'uso' });
    const conversation = await Conversation.create({
        userId: account.accountId, contactId: contact._id, contactPhone: contact.phone,
        phoneNumberId: `usos-${phoneSeq}`, lineId, assignedTo,
    });
    return conversation._id;
};
// Un saliente de plantilla. `templateId: undefined` = de antes del campo.
const sent = (conversationId, { templateName, templateId, status = 'sent', at = new Date() }) => Message.create({
    conversationId, direction: 'outbound', sender: 'me', text: 'plantilla', templateName, templateId, status, timestamp: at,
});

// A: sin líneas ni WABA, con la campaña que siembra `seedAccount`.
const a = await seedAccount('A', { seq: 41 });
const b = await seedAccount('B', { seq: 42 });

// G: dos líneas del mismo WABA; un agente y un supervisor con la primera.
const g = await seedAccount('G', { seq: 43, maxLines: 2 });
const { lineId: g1 } = await connectWhatsapp(g, { phoneNumberId: '7751' });
const { lineId: g2 } = await connectWhatsapp(g, { phoneNumberId: '7752' });
const agent = await seedMember(g, { role: 'agent', lineIds: [g1], label: 'UAGENTE' });
const supervisor = await seedMember(g, { role: 'supervisor', lineIds: [g1], label: 'USUPER' });
const campaignOn = (lineId, name) => Campaign.create({
    userId: g.accountId, name, lineId, totalRecipients: 1, dryRun: true,
    template: { templateId: g.templateId, name: g.templateName, language: 'es', category: 'MARKETING', bodyText: 'x' },
});
await campaignOn(g1, 'de la línea 1');
await campaignOn(g2, 'de la línea 2');
const free = await conversationOn(g, g1);
const mine = await conversationOn(g, g1, { assignedTo: agent.userId });
const others = await conversationOn(g, g1, { assignedTo: g.userId });
const secondLine = await conversationOn(g, g2);
const byId = { templateName: g.templateName, templateId: g.templateId };
await sent(free, { ...byId, status: 'read', at: new Date('2026-11-01T10:00:00Z') });
await sent(mine, { ...byId, status: 'delivered', at: new Date('2026-11-02T10:00:00Z') });
await sent(others, { ...byId, status: 'failed', at: new Date('2026-11-03T10:00:00Z') });
await sent(secondLine, { ...byId, status: 'sent', at: new Date('2026-11-04T10:00:00Z') });

// X: dos WABA, y en cada uno una plantilla con el mismo nombre. Mensajes
// viejos (sin templateId) en una línea de cada uno.
const x = await seedAccount('X', { seq: 44, maxLines: 2 });
const { lineId: x1 } = await connectWhatsapp(x, { phoneNumberId: '7761' });
const { lineId: x2 } = await connectWhatsapp(x, { phoneNumberId: '7762', waBusinessId: 'waba-X2' });
await Template.create({
    userId: x.accountId, waBusinessId: 'waba-X2', templateId: 'tpl-x2-mismo-nombre-uso', name: x.templateName,
    language: 'es', category: 'MARKETING', status: 'APPROVED', bodyText: 'x2', header: null, buttons: [],
});
const onX1 = await conversationOn(x, x1);
const onX2 = await conversationOn(x, x2);
await sent(onX1, { templateName: x.templateName });
await sent(onX1, { templateName: x.templateName, status: 'read' });
await sent(onX2, { templateName: x.templateName });
// Uno nuevo de OTRA plantilla con el mismo nombre: no es de ninguna de las dos.
await sent(onX1, { templateName: x.templateName, templateId: 'tpl-otra-con-el-mismo-nombre' });

const usageOf = (account) => request(account, 'GET', '/templates/usage');
const detail = (account, templateId) => request(account, 'GET', `/templates/${templateId}`);

// Review Focus 3 del plan: registrada después de `/templates/:templateId`,
// respondería el 404 del detalle («usage» tomado por un id).
test('GET /templates/usage: no la toma la ruta del detalle', async () => {
    const res = await usageOf(g);
    assert.equal(res.status, 200, res.text);
    assert.equal(typeof res.body.usage, 'object');
    assert.equal('template' in res.body, false);
});

test('B no ve las plantillas ni las campañas de A', async () => {
    const res = await usageOf(b);
    assert.equal(res.status, 200, res.text);
    assert.equal(a.templateId in res.body.usage, false);
    assert.equal(a.templateId in res.body.campaigns, false);
    assert.equal(b.templateId in res.body.usage, true);
});

test('las cifras de cada plantilla son las de su detalle', async () => {
    for (const account of [g, agent, supervisor, x, a]) {
        const res = await usageOf(account);
        assert.equal(res.status, 200, res.text);
        const ids = Object.keys(res.body.usage);
        assert.ok(ids.length > 0, account.label);
        for (const templateId of ids) {
            const one = await detail(account, templateId);
            assert.equal(one.status, 200, one.text);
            assert.deepEqual(res.body.usage[templateId], one.body.usage, `${account.label} ${templateId}`);
            if (one.body.campaigns) assert.equal(res.body.campaigns[templateId], one.body.campaigns.length, `${account.label} ${templateId}`);
        }
    }
});

// Review Focus 2 del plan: el agente solo cuenta lo que ve en la bandeja.
test('el agente cuenta solo lo de su bandeja y no recibe las campañas', async () => {
    const res = await usageOf(agent);
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(res.body.usage[g.templateId], {
        sent: 2, delivered: 2, read: 1, failed: 0, lastSentAt: '2026-11-02T10:00:00.000Z',
    });
    assert.equal('campaigns' in res.body, false);
});

// Review Focus 1 del plan: los viejos se cuentan por nombre, dentro del WABA.
test('los viejos por nombre no se cuelan en el otro WABA', async () => {
    const res = await usageOf(x);
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.usage[x.templateId].sent, 2);
    assert.equal(res.body.usage[x.templateId].read, 1);
    assert.equal(res.body.usage['tpl-x2-mismo-nombre-uso'].sent, 1);
});

test('las campañas: el owner todas, el supervisor solo las de sus líneas, y 0 sin ninguna', async () => {
    const owner = await usageOf(g);
    assert.equal(owner.body.campaigns[g.templateId], 3);
    assert.equal(owner.body.campaigns[g.imageTemplateId], 0);
    const asSupervisor = await usageOf(supervisor);
    assert.equal(asSupervisor.body.campaigns[g.templateId], 1);
});

// Revisión de Codex del PR #197. Regresión que vigila: un «sin líneas, ceros»
// temprano se saltaba también las campañas, que el detalle sí cuenta.
test('sin líneas, el uso en cero pero las campañas cuentan', async () => {
    const res = await usageOf(a);
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(res.body.usage[a.templateId], { sent: 0, delivered: 0, read: 0, failed: 0, lastSentAt: null });
    assert.equal(res.body.campaigns[a.templateId], 1);
});
