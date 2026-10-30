// Campañas: B no ve ni controla las de A, y una campaña de B no puede llevar
// contactos, plantilla ni archivo de cabecera de A, ni en la vista previa ni
// al crearla.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    seedAccount, request, assertNoLeak, assertHasOwn, connectWhatsapp, openStream,
    Account, Campaign, CampaignRecipient, Conversation, Line, Message, Template,
} from './helpers.js';

const { processNext } = await import('../../src/workers/campaign.worker.js');

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
    const before = await Campaign.countDocuments({ userId: b.accountId });

    const asB = await request(b, 'POST', '/campaigns', { ...draft(b, { recipients: { mode: 'ids', contactIds: [a.contactId] } }), name: 'de B' });
    assert.equal(asB.status, 400, asB.text);
    assert.ok(asB.body.some(e => e.field === 'recipients'), asB.text);
    assert.equal(await Campaign.countDocuments({ userId: b.accountId }), before);

    // Control: a los suyos sí.
    const own = await request(b, 'POST', '/campaigns', { ...draft(b), name: 'de B' });
    assert.equal(own.status, 201, own.text);
});

// Regresión que vigila: el worker buscaba la conexión con `User.findById(campaign.userId)`,
// que es la cuenta: con una cuenta que no tiene el `_id` de su owner, no la encontraba
// y la campaña no salía. Sin Meta: CAMPAIGN_DRY_RUN está encendido en los helpers.
test('el worker envía la campaña de una cuenta cuyo _id no es el del owner', async () => {
    const c = await seedAccount('C', { seq: 3 });
    await connectWhatsapp(c);

    let campaign = await Campaign.findById(c.campaignId).lean();
    assert.equal(campaign.status, 'queued');
    for (let i = 0; i < 5; i++) {
        if (await processNext(campaign) === 'idle') break;
        campaign = await Campaign.findById(c.campaignId).lean();
    }

    const recipient = await CampaignRecipient.findOne({ campaignId: c.campaignId }).lean();
    assert.equal(recipient.status, 'done');
    const sent = await Message.findOne({ campaignId: c.campaignId }).lean();
    assert.ok(sent, 'la campaña no dejó ningún mensaje');
    // Fase 3: el chat lo enseña como de la campaña, no de una persona.
    assert.equal(sent.origin, 'campaign');
    assert.equal(sent.sentBy ?? null, null);
    assert.ok(await Conversation.exists({ _id: sent.conversationId, userId: c.accountId }));
    // Regresión que vigila (plan de la 2b, Review Focus 6): la campaña sembrada no
    // tiene `lineId` (anterior a las líneas) y sale por la línea del número actual.
    const line = await Line.findOne({ accountId: c.accountId, phoneNumberId: `99${c.seq}` }).lean();
    assert.equal(String((await Conversation.findById(sent.conversationId).lean()).lineId), String(line._id));
});

// El `message_created` de una campaña es el mensaje de siempre (`serializeMessage`)
// más `campaignId`, con el que la bandeja y Contactos agrupan los cientos de una
// campaña. Regresión que vigila: el final del envío se unificó con el del chat
// (`recordOutboundMessage`), y el `campaignId` del evento va aparte del mensaje.
test('el message_created de una campaña lleva su campaignId y su origen', async () => {
    const d = await seedAccount('D', { seq: 11 });
    await connectWhatsapp(d);
    const stream = await openStream(d);
    try {
        let campaign = await Campaign.findById(d.campaignId).lean();
        for (let i = 0; i < 5; i++) {
            if (await processNext(campaign) === 'idle') break;
            campaign = await Campaign.findById(d.campaignId).lean();
        }
        assert.ok(await stream.waitFor(`"campaignId":"${d.campaignId}"`, 2000), 'el message_created de la campaña no trae su campaignId');
        assert.ok(await stream.waitFor('"origin":{"kind":"campaign"', 0));
    } finally {
        await stream.close();
    }
});

test('una campaña de una línea desconectada se pausa con whatsapp_disconnected', async () => {
    const w = await seedAccount('W', { seq: 6 });
    await connectWhatsapp(w);
    const old = await Line.create({ accountId: w.accountId, phoneNumberId: '8814', status: 'disconnected' });
    await Campaign.updateOne({ _id: w.campaignId }, { lineId: old._id });

    let campaign = await Campaign.findById(w.campaignId).lean();
    for (let i = 0; i < 3 && campaign.status !== 'paused'; i++) {
        await processNext(campaign);
        campaign = await Campaign.findById(w.campaignId).lean();
    }
    assert.equal(campaign.status, 'paused');
    assert.equal(campaign.pauseReason.code, 'whatsapp_disconnected');
    assert.equal(await Message.countDocuments({ campaignId: w.campaignId }), 0);
});

// Fase 2a: la campaña nace con la línea por defecto (el worker todavía no la usa).
test('una campaña nueva nace con la línea por defecto de su cuenta', async () => {
    const s = await seedAccount('S', { seq: 5 });
    await connectWhatsapp(s);
    const res = await request(s, 'POST', '/campaigns', { ...draft(s), name: 'con línea' });
    assert.equal(res.status, 201, res.text);
    const { defaultLineId } = await Account.findById(s.accountId).lean();
    assert.ok(defaultLineId);
    const campaign = await Campaign.findOne({ userId: s.accountId, name: 'con línea' }).lean();
    assert.equal(String(campaign.lineId), String(defaultLineId));
    // Fase 2c: la respuesta la dice, para la etiqueta de la lista y el detalle.
    assert.equal(res.body.lineId, String(defaultLineId));
});

// Regresión que vigila (Codex, PR #15): la campaña aceptaba una plantilla de un
// WABA anterior, y el worker la enviaba por la línea nueva sin volver a buscarla.
test('una campaña con una plantilla de otro WABA → 400', async () => {
    const y = await seedAccount('Y', { seq: 7 });
    await connectWhatsapp(y);
    await Template.updateOne({ templateId: y.templateId }, { waBusinessId: 'waba-anterior' });
    const before = await Campaign.countDocuments({ userId: y.accountId });

    const res = await request(y, 'POST', '/campaigns', { ...draft(y), name: 'otro WABA' });
    assert.equal(res.status, 400, res.text);
    assert.ok(res.body.some(error => error.field === 'templateId'), res.text);
    assert.equal(await Campaign.countDocuments({ userId: y.accountId }), before);
});

// --- Fase 2c: la campaña elige su línea -----------------------------------------

test('crear una campaña con el lineId de otra cuenta → 404 y sin campaña', async () => {
    const x = await seedAccount('X', { seq: 8 });
    await connectWhatsapp(x);
    const { lineId: foreign } = await connectWhatsapp(b);
    const before = await Campaign.countDocuments({ userId: x.accountId });
    const res = await request(x, 'POST', '/campaigns', { ...draft(x), name: 'línea ajena', lineId: String(foreign) });
    assert.equal(res.status, 404, res.text);
    assert.equal(await Campaign.countDocuments({ userId: x.accountId }), before);
});

// Regresión que vigila (plan de la 2c, Review Focus 6): las plantillas son de
// cada WABA; la de la primera línea no sale por la de otro WABA.
test('crear una campaña en la línea de otro WABA con una plantilla del primero → 400', async () => {
    const z = await seedAccount('Z', { seq: 9, maxLines: 2 });
    await connectWhatsapp(z);
    const { lineId: other } = await connectWhatsapp(z, { phoneNumberId: '7602', waBusinessId: 'waba-Z2' });
    const res = await request(z, 'POST', '/campaigns', { ...draft(z), name: 'otro WABA', lineId: String(other) });
    assert.equal(res.status, 400, res.text);
    assert.ok(res.body.some(error => error.field === 'templateId'), res.text);
});

test('la campaña sale por la línea elegida', async () => {
    const q = await seedAccount('Q', { seq: 10, maxLines: 2 });
    await connectWhatsapp(q);
    const { lineId: second } = await connectWhatsapp(q, { phoneNumberId: '7612' });   // mismo WABA: mismas plantillas
    const res = await request(q, 'POST', '/campaigns', { ...draft(q), name: 'por la segunda', lineId: String(second) });
    assert.equal(res.status, 201, res.text);
    const created = await Campaign.findOne({ userId: q.accountId, name: 'por la segunda' }).lean();
    assert.equal(String(created.lineId), String(second));

    let campaign = created;
    for (let i = 0; i < 5; i++) {
        if (await processNext(campaign) === 'idle') break;
        campaign = await Campaign.findById(created._id).lean();
    }
    const sent = await Message.findOne({ campaignId: created._id }).lean();
    assert.ok(sent, 'la campaña no dejó ningún mensaje');
    assert.equal(String((await Conversation.findById(sent.conversationId).lean()).lineId), String(second));
});
