// `seed:demo` (cuentas de demostración, 2026-10-23) contra Mongo y la app de
// verdad: corre en PRODUCCIÓN, así que lo que importa es que nunca toque otra
// cuenta, y que lo que crea se vea en Wasmish como en una cuenta real.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import {
    seedAccount, request, sessionFrom, ANONYMOUS, assertHasOwn,
    Account, User, Contact, Conversation, Message, Campaign, CampaignRecipient, Line, ContactNote, AutoReplySettings,
} from './helpers.js';

const { seedDemoAccount, cleanDemoAccount } = await import('../../src/services/demo.service.js');
const { DEMO_PLAN } = await import('../../src/utils/demo.js');
const { DEMO_SCENARIOS } = await import('../../scripts/fixtures/demo.scenarios.js');

const mediaDir = process.env.MEDIA_DIR;
const fixturesDir = new URL('../../scripts/fixtures', import.meta.url).pathname;
const PASSWORD = 'demostracion-2026';
const passwordHash = await bcrypt.hash(PASSWORD, 4);
const { imprenta, capacitacion } = DEMO_SCENARIOS;
const seed = (scenario, options = {}) => seedDemoAccount(scenario, { passwordHash, mediaDir, fixturesDir, ...options });

const real = await seedAccount('A', { seq: 1 });
const countsOf = async (accountId) => ({
    contacts: await Contact.countDocuments({ userId: accountId }),
    conversations: await Conversation.countDocuments({ userId: accountId }),
    users: await User.countDocuments({ accountId }),
});
const realBefore = await countsOf(real.accountId);

const login = async (email) => sessionFrom(await request(ANONYMOUS, 'POST', '/login', { email, password: PASSWORD }));

test('crea las dos cuentas con la marca, su número falso «Junto con la app» y el equipo', async () => {
    for (const scenario of [imprenta, capacitacion]) {
        const { action, accountId } = await seed(scenario);
        assert.equal(action, 'create');
        const account = await Account.findById(accountId).lean();
        assert.equal(account.plan, DEMO_PLAN);
        assert.equal(account.name, scenario.accountName);
        const [line] = await Line.find({ accountId }).lean();
        assert.equal(line.phoneNumberId, scenario.line.phoneNumberId);
        assert.equal(line.businessApp, true);
        assert.equal(line.status, 'active');
        // El token es falso: el worker del historial no le puede pedir nada a Meta.
        assert.equal(line.historySync, undefined);
        const agent = await User.findOne({ email: scenario.agent.email }).lean();
        assert.equal(agent.role, 'agent');
        assert.deepEqual(agent.lineIds.map(String), [String(line._id)]);
        assert.equal((await AutoReplySettings.findOne({ userId: accountId }).lean()).enabled, true);
    }
});

test('el dueño entra y ve sus conversaciones, el PDF y la campaña con sus estadísticas', async () => {
    const session = await login(imprenta.owner.email);
    const chats = await request(session, 'GET', '/chats');
    assert.equal(chats.status, 200, chats.text);
    const owner = await User.findOne({ email: imprenta.owner.email }).lean();
    assert.equal(chats.body.length, await Conversation.countDocuments({ userId: owner.accountId }));

    // El PDF de la cotización se descarga como un adjunto de verdad.
    const pdf = await Message.findOne({ mediaFilename: 'Cotizacion-1045-Cafe-Ritual.pdf' }).lean();
    const media = await request(session, 'GET', `/media/${pdf._id}`);
    assert.equal(media.status, 200);
    assert.match(media.text, /^%PDF-/);

    // Lo respondido desde la app y lo del bot, con su origen.
    assert.equal(await Message.countDocuments({ origin: 'businessApp', conversationId: { $in: chats.body.map(c => c.id) } }), 1);
    assert.ok(await Message.countDocuments({ origin: 'bot', conversationId: { $in: chats.body.map(c => c.id) } }) >= 2);

    const [campaign] = await Campaign.find({ userId: owner.accountId }).lean();
    // Terminada y sin nadie en cola: el worker no la toca aunque no sea de prueba.
    assert.equal(campaign.status, 'completed');
    assert.equal(await CampaignRecipient.countDocuments({ campaignId: campaign._id, status: { $ne: 'done' } }), 0);
    assert.equal(campaign.createdAt.toISOString(), campaign.startedAt.toISOString());
    const detail = await request(session, 'GET', `/campaigns/${campaign._id}`);
    assert.equal(detail.status, 200, detail.text);
});

test('las notas llevan su autor', async () => {
    const agent = await User.findOne({ email: capacitacion.agent.email }).lean();
    const notes = await ContactNote.find({ userId: agent.accountId, authorId: agent._id }).lean();
    assert.ok(notes.length >= 2);
    assert.ok(notes.every(n => n.authorName === capacitacion.agent.name));
});

test('sin --reset no la rehace; con --reset la rehace entera y borra su PDF viejo', async () => {
    await assert.rejects(seed(imprenta), /--reset/);
    const oldOwner = await User.findOne({ email: imprenta.owner.email }).lean();
    const oldPdf = await Message.findOne({ mediaFilename: 'Cotizacion-1045-Cafe-Ritual.pdf' }).lean();
    // Algo tocado durante una demo: el reset lo deshace.
    await Contact.create({ userId: oldOwner.accountId, phone: '593000779999', name: 'Creado en la demo' });

    const { action, accountId, counts } = await seed(imprenta, { reset: true });
    assert.equal(action, 'reset');
    assert.notEqual(String(accountId), String(oldOwner.accountId));
    assert.equal(await Account.countDocuments({ _id: oldOwner.accountId }), 0);
    assert.equal(await Contact.countDocuments({ userId: accountId }), counts.contacts);
    // Rehecha con el mismo número, así que el archivo nuevo tiene el mismo
    // nombre: el viejo se borró y el nuevo está.
    assert.equal(await Message.countDocuments({ _id: oldPdf._id }), 0);
    const newPdf = await Message.findOne({ mediaFilename: 'Cotizacion-1045-Cafe-Ritual.pdf' }).lean();
    assert.ok(fs.existsSync(path.join(mediaDir, newPdf.mediaFile)));
});

test('nunca toca una cuenta que no lleva la marca, aunque tenga el correo del escenario', async () => {
    const scenario = { ...capacitacion, owner: { ...capacitacion.owner, email: 'a@pruebas.local' } };
    await assert.rejects(seed(scenario, { reset: true }), /no es de demostración/);
    await assert.rejects(cleanDemoAccount(scenario, { mediaDir }), /no es de demostración/);
    // Ni con el correo del agente en otra cuenta.
    const stolen = { ...imprenta, owner: { ...imprenta.owner, email: 'nueva.demo@pruebas.local' }, agent: { ...imprenta.agent, email: 'a@pruebas.local' } };
    await assert.rejects(seed(stolen), /otra cuenta/);
    assert.equal(await User.countDocuments({ email: 'nueva.demo@pruebas.local' }), 0);
    assert.deepEqual(await countsOf(real.accountId), realBefore);
});

test('rehacerla no borra un archivo enviado que también es de otra cuenta', async () => {
    // Regresión (revisión de Codex del PR #124): lo enviado desde el chat se
    // guarda por su contenido (`outbound/<sha256>`), compartido entre cuentas.
    const shared = 'outbound/compartido-demo.pdf';
    fs.mkdirSync(path.join(mediaDir, 'outbound'), { recursive: true });
    fs.writeFileSync(path.join(mediaDir, shared), '%PDF-1.4 compartido');
    const realConversation = await Conversation.findOne({ userId: real.accountId }).lean();
    await Message.create({ conversationId: realConversation._id, direction: 'outbound', sender: 'me', text: 'precios.pdf', type: 'document', mediaFile: shared, mimeType: 'application/pdf' });
    // El mismo PDF, enviado durante una demo.
    const owner = await User.findOne({ email: imprenta.owner.email }).lean();
    const demoConversation = await Conversation.findOne({ userId: owner.accountId }).lean();
    await Message.create({ conversationId: demoConversation._id, direction: 'outbound', sender: 'me', text: 'precios.pdf', type: 'document', mediaFile: shared, mimeType: 'application/pdf', status: 'failed' });

    await seed(imprenta, { reset: true });
    assert.ok(fs.existsSync(path.join(mediaDir, shared)));
});

test('--clean borra las dos con sus archivos, y la cuenta real sigue entera', async () => {
    const files = await Message.distinct('mediaFile', { mediaFile: /^9900000000009/ });
    assert.ok(files.length >= 2);
    for (const scenario of [imprenta, capacitacion]) assert.equal(await cleanDemoAccount(scenario, { mediaDir }), true);
    for (const scenario of [imprenta, capacitacion]) assert.equal(await cleanDemoAccount(scenario, { mediaDir }), false);
    assert.equal(await Account.countDocuments({ plan: DEMO_PLAN }), 0);
    assert.equal(await Line.countDocuments({ phoneNumberId: /^9900000000009/ }), 0);
    for (const file of files) assert.equal(fs.existsSync(path.join(mediaDir, file)), false);
    assert.deepEqual(await countsOf(real.accountId), realBefore);
    assertHasOwn(await request(real, 'GET', '/contacts'), real);
});
