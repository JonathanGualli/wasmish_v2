// El detalle de una plantilla y su uso (spec del detalle de plantillas, § 4.3
// y § 6): B no ve las de A; el uso cuenta solo lo que la persona puede ver y
// solo en las líneas del WABA de la plantilla; las campañas, solo con
// `campaigns.manage`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seedAccount, seedMember, request, connectWhatsapp, Campaign, Contact, Conversation, Message, Template } from './helpers.js';

let phoneSeq = 0;
// Una conversación de `account` por `lineId`, con un contacto propio.
const conversationOn = async (account, lineId, { assignedTo = null } = {}) => {
    phoneSeq += 1;
    const contact = await Contact.create({ userId: account.accountId, phone: `5939800${String(phoneSeq).padStart(5, '0')}`, name: 'uso' });
    const conversation = await Conversation.create({
        userId: account.accountId, contactId: contact._id, contactPhone: contact.phone,
        phoneNumberId: `uso-${phoneSeq}`, lineId, assignedTo,
    });
    return conversation._id;
};
// Un saliente de plantilla. `templateId: undefined` = de antes del campo.
const sent = (conversationId, { templateName, templateId, status = 'sent', at = new Date() }) => Message.create({
    conversationId, direction: 'outbound', sender: 'me', text: 'plantilla', templateName, templateId, status, timestamp: at,
});

const a = await seedAccount('A', { seq: 31 });
const b = await seedAccount('B', { seq: 32 });

// G: dos líneas del mismo WABA; un agente con la primera.
const g = await seedAccount('G', { seq: 33, maxLines: 2 });
const { lineId: g1 } = await connectWhatsapp(g, { phoneNumberId: '7731' });
const { lineId: g2 } = await connectWhatsapp(g, { phoneNumberId: '7732' });
const agent = await seedMember(g, { role: 'agent', lineIds: [g1], label: 'GAGENTE' });
const supervisor = await seedMember(g, { role: 'supervisor', lineIds: [g1], label: 'GSUPER' });
// Una campaña de la plantilla en cada línea (la sembrada no tiene línea).
const campaignOn = async (lineId, name) => String((await Campaign.create({
    userId: g.accountId, name, lineId, totalRecipients: 1, dryRun: true,
    template: { templateId: g.templateId, name: g.templateName, language: 'es', category: 'MARKETING', bodyText: 'x' },
}))._id);
const campaignG1 = await campaignOn(g1, 'de la línea 1');
const campaignG2 = await campaignOn(g2, 'de la línea 2');
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
const x = await seedAccount('X', { seq: 34, maxLines: 2 });
const { lineId: x1 } = await connectWhatsapp(x, { phoneNumberId: '7741' });
const { lineId: x2 } = await connectWhatsapp(x, { phoneNumberId: '7742', waBusinessId: 'waba-X2' });
await Template.create({
    userId: x.accountId, waBusinessId: 'waba-X2', templateId: 'tpl-x2-mismo-nombre', name: x.templateName,
    language: 'es', category: 'MARKETING', status: 'APPROVED', bodyText: 'x2', header: null, buttons: [],
});
const onX1 = await conversationOn(x, x1);
const onX2 = await conversationOn(x, x2);
await sent(onX1, { templateName: x.templateName });
await sent(onX1, { templateName: x.templateName, status: 'read' });
await sent(onX2, { templateName: x.templateName });
// Uno nuevo de OTRA plantilla con el mismo nombre: no es de ninguna de las dos.
await sent(onX1, { templateName: x.templateName, templateId: 'tpl-otra-con-el-mismo-nombre' });
const xAgent = await seedMember(x, { role: 'agent', lineIds: [x1], label: 'XAGENTE' });

const detail = (account, templateId) => request(account, 'GET', `/templates/${templateId}`);

test('GET /templates/:templateId: B no ve una de A', async () => {
    assert.equal((await detail(b, a.templateId)).status, 404);
    const own = await detail(a, a.templateId);
    assert.equal(own.status, 200, own.text);
    assert.equal(own.body.template.templateId, a.templateId);
    assert.equal(own.body.template.name, a.templateName);
    assert.equal((await detail(a, 'no-existe')).status, 404);
});

test('el owner cuenta todos los envíos de la plantilla en las líneas de su WABA', async () => {
    const res = await detail(g, g.templateId);
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(res.body.usage, {
        sent: 4, delivered: 2, read: 1, failed: 1, lastSentAt: '2026-11-04T10:00:00.000Z',
    });
});

// Review Focus 4 del plan: el agente solo cuenta lo que ve en la bandeja.
test('el agente cuenta solo su línea, las sin asignar y las suyas', async () => {
    const res = await detail(agent, g.templateId);
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(res.body.usage, {
        sent: 2, delivered: 2, read: 1, failed: 0, lastSentAt: '2026-11-02T10:00:00.000Z',
    });
});

// Review Focus 5 del plan: los viejos se cuentan por nombre, dentro del WABA.
test('los mensajes viejos se cuentan por nombre, solo en las líneas de su WABA', async () => {
    const first = await detail(x, x.templateId);
    assert.equal(first.status, 200, first.text);
    assert.equal(first.body.usage.sent, 2);
    assert.equal(first.body.usage.read, 1);
    const second = await detail(x, 'tpl-x2-mismo-nombre');
    assert.equal(second.status, 200, second.text);
    assert.equal(second.body.usage.sent, 1);
});

test('una plantilla de un WABA fuera de su alcance da 404', async () => {
    assert.equal((await detail(xAgent, 'tpl-x2-mismo-nombre')).status, 404);
    assert.equal((await detail(xAgent, x.templateId)).status, 200);
});

test('las campañas solo le llegan a quien tiene campaigns.manage', async () => {
    const owner = await detail(g, g.templateId);
    assert.deepEqual(owner.body.campaigns.map(c => c.id).sort(), [g.campaignId, campaignG1, campaignG2].sort());
    const seeded = owner.body.campaigns.find(c => c.id === g.campaignId);
    assert.equal(seeded.name, `${g.marker} campaña`);
    assert.ok(seeded.status);
    assert.ok(seeded.createdAt);

    const asAgent = await detail(agent, g.templateId);
    assert.equal('campaigns' in asAgent.body, false, asAgent.text);
});

// Revisión de Codex del PR #193. Regresión que vigila: las campañas se
// buscaban solo por cuenta y plantilla, y un supervisor con una línea veía las
// de la otra línea del mismo WABA, que los endpoints de campañas le esconden
// (`campaignScope`).
test('el supervisor solo ve las campañas de sus líneas', async () => {
    const res = await detail(supervisor, g.templateId);
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(res.body.campaigns.map(c => c.id), [campaignG1]);
});

test('una plantilla sin envíos: el uso en cero', async () => {
    const res = await detail(g, g.imageTemplateId);
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(res.body.usage, { sent: 0, delivered: 0, read: 0, failed: 0, lastSentAt: null });
    assert.deepEqual(res.body.campaigns, []);
});
