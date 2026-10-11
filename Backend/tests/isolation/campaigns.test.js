// Campañas: B no ve ni controla las de A, y una campaña de B no puede llevar
// contactos, plantilla ni archivo de cabecera de A, ni en la vista previa ni
// al crearla.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seedAccount, request, assertNoLeak, assertHasOwn, connectWhatsapp, Campaign } from './helpers.js';

const a = await seedAccount('A', { seq: 1 });
const b = await seedAccount('B', { seq: 2 });

const statusOf = async (account) => (await Campaign.findById(account.campaignId).lean()).status;
const draft = (account, overrides = {}) => ({
    templateId: account.templateId,
    recipients: { mode: 'ids', contactIds: [account.contactId] },
    ...overrides,
});

test('GET /campaigns: B no ve las campañas de A', async () => {
    assertNoLeak(await request(b, 'GET', '/campaigns'), a);
    assertHasOwn(await request(a, 'GET', '/campaigns'), a);
});

for (const suffix of ['', '/failures', '/recipients']) {
    test(`GET /campaigns/:id${suffix}: B no lo ve en una de A`, async () => {
        const asB = await request(b, 'GET', `/campaigns/${a.campaignId}${suffix}`);
        assert.equal(asB.status, 404);
        assertNoLeak(asB, a);

        const asA = await request(a, 'GET', `/campaigns/${a.campaignId}${suffix}`);
        assert.equal(asA.status, 200, asA.text);
    });
}

test('pausar, reanudar y cancelar: B no cambia el estado de una de A', async () => {
    assert.equal((await request(b, 'POST', `/campaigns/${a.campaignId}/pause`)).status, 404);
    assert.equal((await request(b, 'POST', `/campaigns/${a.campaignId}/cancel`)).status, 404);
    assert.equal(await statusOf(a), 'queued');

    assert.equal((await request(a, 'POST', `/campaigns/${a.campaignId}/pause`)).status, 200);
    assert.equal(await statusOf(a), 'paused');

    assert.equal((await request(b, 'POST', `/campaigns/${a.campaignId}/resume`)).status, 404);
    assert.equal(await statusOf(a), 'paused');

    assert.equal((await request(a, 'POST', `/campaigns/${a.campaignId}/cancel`)).status, 200);
    assert.equal(await statusOf(a), 'cancelled');
});

test('vista previa con contactos de A: no los encuentra', async () => {
    const asB = await request(b, 'POST', '/campaigns/preview', draft(b, { recipients: { mode: 'ids', contactIds: [a.contactId] } }));
    assert.equal(asB.status, 200, asB.text);
    assert.equal(asB.body.recipients.selected, 0);
    assert.equal(asB.body.recipients.notFound, 1);
    assertNoLeak(asB, a);

    const asA = await request(a, 'POST', '/campaigns/preview', draft(a));
    assert.equal(asA.body.recipients.selected, 1, asA.text);
});

test('vista previa con «todos los que coinciden»: solo los de B', async () => {
    const asB = await request(b, 'POST', '/campaigns/preview', draft(b, { recipients: { mode: 'query', filter: 'all' } }));
    assert.equal(asB.status, 200, asB.text);
    assert.ok(asB.body.recipients.selected > 0);
    assertNoLeak(asB, a);
});

test('vista previa con la plantilla de A: no existe para B', async () => {
    const asB = await request(b, 'POST', '/campaigns/preview', draft(b, { templateId: a.templateId }));
    assert.equal(asB.status, 200, asB.text);
    assert.equal(asB.body.template, null);
    assert.ok(asB.body.errors.some(e => e.field === 'templateId'), asB.text);
    assertNoLeak(asB, a);

    const asA = await request(a, 'POST', '/campaigns/preview', draft(a));
    assert.equal(asA.body.template.templateId, a.templateId, asA.text);
});

test('vista previa con el archivo de cabecera de A: no existe para B', async () => {
    const asB = await request(b, 'POST', '/campaigns/preview', draft(b, { templateId: b.imageTemplateId, headerMediaId: a.headerMediaId }));
    assert.equal(asB.status, 200, asB.text);
    assert.ok(asB.body.errors.some(e => e.field === 'headerMedia'), asB.text);

    // Control: el suyo vale.
    const asA = await request(a, 'POST', '/campaigns/preview', draft(a, { templateId: a.imageTemplateId, headerMediaId: a.headerMediaId }));
    assert.ok(!asA.body.errors.some(e => e.field === 'headerMedia'), asA.text);
});

test('POST /campaigns/preview/recipients: B no lista los contactos de A', async () => {
    const asB = await request(b, 'POST', '/campaigns/preview/recipients', { recipients: { mode: 'ids', contactIds: [a.contactId] } });
    assert.equal(asB.status, 200, asB.text);
    assert.equal(asB.body.totalCount, 0);
    assertNoLeak(asB, a);

    const asA = await request(a, 'POST', '/campaigns/preview/recipients', { recipients: { mode: 'ids', contactIds: [a.contactId] } });
    assertHasOwn(asA, a);
});

test('POST /campaigns: B no crea una campaña a los contactos de A', async () => {
    await connectWhatsapp(b);
    const before = await Campaign.countDocuments({ userId: b.userId });

    const asB = await request(b, 'POST', '/campaigns', { ...draft(b, { recipients: { mode: 'ids', contactIds: [a.contactId] } }), name: 'de B' });
    assert.equal(asB.status, 400, asB.text);
    assert.ok(asB.body.some(e => e.field === 'recipients'), asB.text);
    assert.equal(await Campaign.countDocuments({ userId: b.userId }), before);

    // Control: a los suyos sí.
    const own = await request(b, 'POST', '/campaigns', { ...draft(b), name: 'de B' });
    assert.equal(own.status, 201, own.text);
});
