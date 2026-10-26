// Pedir a Meta la agenda y el historial de un número de la app de WhatsApp
// Business: `applyConnection` lo anota, el worker lo pide (aquí se llama a
// `processPendingHistoryRequests` a mano: el worker no corre en los tests) y
// `POST /lines/:id/history-sync` lo reintenta.
// Spec: docs/superpowers/specs/2026-10-23-historial-coexistencia-design.md (§ 4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { seedAccount, seedMember, request, onMeta, Line } from './helpers.js';

const { applyConnection, disconnectLine } = await import('../../src/services/line.service.js');
const { processPendingHistoryRequests, recoverHistoryRequests } = await import('../../src/services/history.request.service.js');
const { historySyncView } = await import('../../src/utils/history.sync.js');
const { encrypt } = await import('../../src/utils/crypto.js');

// Meta falso para `smb_app_data`: cada pedido queda en `smbCalls` y, por número,
// `behavior` decide la respuesta (por defecto, la acepta).
const smbCalls = [];
const behavior = new Map();
let requestSeq = 0;
onMeta(async (config) => {
    const match = /^\/(\d+)\/smb_app_data$/.exec(config.url);
    if (config.method !== 'post' || !match) return undefined;
    const call = { phoneNumberId: match[1], syncType: JSON.parse(config.data).sync_type, authorization: config.headers.Authorization };
    smbCalls.push(call);
    await behavior.get(call.phoneNumberId)?.(call);
    return { data: { request_id: `req-${++requestSeq}` } };
});
const callsFor = (phoneNumberId) => smbCalls.filter(call => call.phoneNumberId === phoneNumberId).map(call => call.syncType);
const metaError = (code) => Object.assign(new Error('Meta dijo que no'), {
    response: { status: 400, data: { error: { code, message: 'No se puede', error_data: { details: 'Fuera de plazo' } } } },
});
const timeout = () => Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' });

const connect = (account, phoneNumberId, { businessApp = true } = {}) => applyConnection({
    accountId: account.accountId, waBusinessId: `waba-${account.label}`, tokenWhatsapp: encrypt('token-de-pruebas'), phoneNumberId, businessApp,
});
const lineOf = (lineId) => Line.findById(lineId).lean();
const requestsOf = async (lineId) => (await lineOf(lineId)).historySync.requests;
const setSync = (lineId, fields) => Line.updateOne({ _id: lineId }, { $set: Object.fromEntries(
    Object.entries(fields).map(([path, value]) => [`historySync.${path}`, value])) });
const ago = (ms) => new Date(Date.now() - ms);
const HOUR = 60 * 60 * 1000;

// Todo lo que se prepara con `await` va aquí arriba (ver pruebas-y-scripts.md).
const [a, b, c, d, e, f, g, h] = await Promise.all(
    ['PA', 'PB', 'PC', 'PD', 'PE', 'PF', 'PG', 'PH'].map((label, index) => seedAccount(label, { seq: 61 + index })));
const { lineId: retryLine } = await connect(a, '7611');
const agent = await seedMember(a, { role: 'agent', lineIds: [retryLine], label: 'PAagente' });

test('conectar un número de la app deja los dos pedidos pending, ligados a esa conexión', async () => {
    const { lineId } = await connect(b, '7621');
    const line = await lineOf(lineId);
    assert.equal(line.historySync.connectionAt.getTime(), line.connectedAt.getTime());
    assert.deepEqual([line.historySync.requests.contacts.state, line.historySync.requests.history.state], ['pending', 'pending']);

    const lines = await request(b, 'GET', '/lines');
    assert.equal(lines.body.lines.find(item => item.id === String(lineId)).historySync.status, 'pending');
    await processPendingHistoryRequests();
});

test('un número que no es de la app no tiene historySync, y reconectarlo sin la app lo quita', async () => {
    const { lineId: plain } = await connect(c, '7631', { businessApp: false });
    assert.equal((await lineOf(plain)).historySync, undefined);
    const lines = await request(c, 'GET', '/lines');
    assert.equal(lines.body.lines.find(item => item.id === String(plain)).historySync, null);

    const { lineId } = await connect(c, '7632');
    await processPendingHistoryRequests();
    assert.ok((await lineOf(lineId)).historySync);
    await disconnectLine(c.accountId, lineId);
    await connect(c, '7632', { businessApp: false });
    assert.equal((await lineOf(lineId)).historySync, undefined);
});

test('renovar el token no toca historySync', async () => {
    const { lineId } = await connect(d, '7641');
    await processPendingHistoryRequests();
    const before = await lineOf(lineId);
    assert.equal(before.historySync.requests.history.state, 'accepted');

    await connect(d, '7641');
    const after = await lineOf(lineId);
    assert.deepEqual(after.historySync, before.historySync);
    assert.equal(after.connectedAt.getTime(), before.connectedAt.getTime());
    assert.equal((await processPendingHistoryRequests()).length, 0);
});

test('reconectar una línea desconectada lo reinicia, con su nueva conexión', async () => {
    const { lineId } = await connect(e, '7651');
    await processPendingHistoryRequests();
    await setSync(lineId, { firstChunkAt: new Date(), progress: 40 });
    const before = await lineOf(lineId);
    await disconnectLine(e.accountId, lineId);
    await new Promise(resolve => setTimeout(resolve, 5));

    await connect(e, '7651');
    const after = await lineOf(lineId);
    assert.ok(after.historySync.connectionAt > before.historySync.connectionAt);
    assert.equal(after.historySync.connectionAt.getTime(), after.connectedAt.getTime());
    assert.deepEqual([after.historySync.requests.contacts.state, after.historySync.requests.history.state], ['pending', 'pending']);
    assert.equal(after.historySync.firstChunkAt, null);
    await processPendingHistoryRequests();
});

test('el worker pide primero la agenda y después el historial, con el token de la línea, una sola vez', async () => {
    const { lineId } = await connect(f, '7661');
    const changed = await processPendingHistoryRequests();
    assert.ok(changed.some(item => String(item.lineId) === String(lineId) && String(item.accountId) === f.accountId));

    assert.deepEqual(callsFor('7661'), ['smb_app_state_sync', 'history']);
    assert.ok(smbCalls.filter(call => call.phoneNumberId === '7661').every(call => call.authorization === 'Bearer token-de-pruebas'));
    const requests = await requestsOf(lineId);
    assert.equal(requests.contacts.state, 'accepted');
    assert.equal(requests.history.state, 'accepted');
    assert.match(requests.history.requestId, /^req-\d+$/);
    assert.equal(historySyncView((await lineOf(lineId)).historySync).status, 'requested');

    await processPendingHistoryRequests();
    assert.equal(callsFor('7661').length, 2);
});

test('dos procesos a la vez piden cada cosa una sola vez', async () => {
    const { lineId } = await connect(g, '7671');
    behavior.set('7671', () => new Promise(resolve => setTimeout(resolve, 50)));
    await Promise.all([processPendingHistoryRequests(), processPendingHistoryRequests()]);
    assert.deepEqual(callsFor('7671').sort(), ['history', 'smb_app_state_sync']);
    assert.equal((await requestsOf(lineId)).history.state, 'accepted');
});

test('un error de Meta deja rejected, con su error, y la línea se puede reintentar', async () => {
    const { lineId } = await connect(h, '7681');
    behavior.set('7681', (call) => { if (call.syncType === 'history') throw metaError(100); });
    await processPendingHistoryRequests();

    const requests = await requestsOf(lineId);
    assert.equal(requests.contacts.state, 'accepted');
    assert.equal(requests.history.state, 'rejected');
    assert.deepEqual(requests.history.error, { code: '100', detail: 'Fuera de plazo' });
    const view = historySyncView((await lineOf(lineId)).historySync);
    assert.deepEqual([view.status, view.canRetry, view.retryable], ['failed', true, ['history']]);
});

test('sin respuesta de Meta queda uncertain, no se repite solo y se ofrece reintentar a los 30 minutos', async () => {
    const { lineId } = await connect(b, '7622');
    behavior.set('7622', (call) => { if (call.syncType === 'history') throw timeout(); });
    await processPendingHistoryRequests();
    const requests = await requestsOf(lineId);
    assert.equal(requests.history.state, 'uncertain');

    behavior.delete('7622');
    await processPendingHistoryRequests();
    assert.deepEqual(callsFor('7622'), ['smb_app_state_sync', 'history']);

    const sync = (await lineOf(lineId)).historySync;
    const claimedAt = sync.requests.history.claimedAt.getTime();
    assert.equal(historySyncView(sync, new Date(claimedAt + 10 * 60 * 1000)).canRetry, false);
    assert.deepEqual(historySyncView(sync, new Date(claimedAt + 31 * 60 * 1000)).retryable, ['history']);
});

// Review Focus 4 del plan: un reinicio con un pedido a medias.
test('un pedido en curso al arrancar pasa a uncertain y no se pide otra vez', async () => {
    const { lineId } = await connect(c, '7633');
    await setSync(lineId, { 'requests.history.state': 'requesting', 'requests.history.claimedAt': new Date() });
    assert.ok(await recoverHistoryRequests() >= 1);
    const requests = await requestsOf(lineId);
    assert.equal(requests.history.state, 'uncertain');

    await processPendingHistoryRequests();
    assert.deepEqual(callsFor('7633'), ['smb_app_state_sync']);
});

test('pasadas las 24 h de la conexión no se pide nada', async () => {
    const { lineId } = await connect(d, '7642');
    const old = ago(25 * HOUR);
    await Line.updateOne({ _id: lineId }, { $set: { connectedAt: old, 'historySync.connectionAt': old } });
    await processPendingHistoryRequests();
    assert.deepEqual(callsFor('7642'), []);
    assert.equal(historySyncView((await lineOf(lineId)).historySync).status, 'pending');
});

// --- Reintentar: POST /lines/:id/history-sync -------------------------------

test('reintentar la línea de otra cuenta da 404 y no la toca; un agente sin lines.manage, 403', async () => {
    await processPendingHistoryRequests();
    await setSync(retryLine, { 'requests.history.state': 'rejected' });

    const foreign = await request(b, 'POST', `/lines/${retryLine}/history-sync`);
    assert.equal(foreign.status, 404);
    assert.equal((await request(agent, 'POST', `/lines/${retryLine}/history-sync`)).status, 403);
    assert.equal((await requestsOf(retryLine)).history.state, 'rejected');

    // Control: el dueño sí.
    assert.equal((await request(a, 'POST', `/lines/${retryLine}/history-sync`)).status, 204);
    assert.equal((await requestsOf(retryLine)).history.state, 'pending');
});

test('reintentar un rejected lo vuelve a pedir a Meta', async () => {
    const { lineId } = await connect(e, '7652');
    behavior.set('7652', (call) => { if (call.syncType === 'history') throw metaError(131000); });
    await processPendingHistoryRequests();
    behavior.delete('7652');

    assert.equal((await request(e, 'POST', `/lines/${lineId}/history-sync`)).status, 204);
    await processPendingHistoryRequests();
    assert.deepEqual(callsFor('7652'), ['smb_app_state_sync', 'history', 'history']);
    const requests = await requestsOf(lineId);
    assert.equal(requests.history.state, 'accepted');
    assert.equal(requests.history.error, undefined);
});

test('con la agenda rejected y el historial ya llegando, reintentar pide solo la agenda', async () => {
    const { lineId } = await connect(f, '7662');
    behavior.set('7662', (call) => { if (call.syncType === 'smb_app_state_sync') throw metaError(100); });
    await processPendingHistoryRequests();
    behavior.delete('7662');
    await setSync(lineId, { firstChunkAt: new Date(), lastChunkAt: new Date(), progress: 20 });

    assert.equal((await request(f, 'POST', `/lines/${lineId}/history-sync`)).status, 204);
    const requests = await requestsOf(lineId);
    assert.deepEqual([requests.contacts.state, requests.history.state], ['pending', 'accepted']);
    await processPendingHistoryRequests();
    assert.deepEqual(callsFor('7662'), ['smb_app_state_sync', 'history', 'smb_app_state_sync']);
});

test('un uncertain se puede reintentar pasados 30 minutos, y no antes', async () => {
    const { lineId } = await connect(g, '7672');
    await processPendingHistoryRequests();
    await setSync(lineId, { 'requests.history.state': 'uncertain', 'requests.history.claimedAt': ago(10 * 60 * 1000) });
    const early = await request(g, 'POST', `/lines/${lineId}/history-sync`);
    assert.equal(early.status, 409);
    assert.equal(early.body[0].code, 'history_sync_unavailable');

    await setSync(lineId, { 'requests.history.claimedAt': ago(31 * 60 * 1000) });
    assert.equal((await request(g, 'POST', `/lines/${lineId}/history-sync`)).status, 204);
    assert.equal((await requestsOf(lineId)).history.state, 'pending');
    await processPendingHistoryRequests();
});

test('409 si no hay nada que reintentar, si pasaron las 24 h o si la línea no es de la app', async () => {
    const { lineId: accepted } = await connect(h, '7682');
    await processPendingHistoryRequests();
    assert.equal((await request(h, 'POST', `/lines/${accepted}/history-sync`)).status, 409);

    await setSync(accepted, { 'requests.history.state': 'rejected', connectionAt: ago(25 * HOUR) });
    await Line.updateOne({ _id: accepted }, { $set: { connectedAt: ago(25 * HOUR) } });
    assert.equal((await request(h, 'POST', `/lines/${accepted}/history-sync`)).status, 409);
    assert.equal((await requestsOf(accepted)).history.state, 'rejected');

    // Desconectada, aunque su pedido esté rechazado y dentro de plazo.
    const { lineId: gone } = await connect(h, '7684');
    behavior.set('7684', (call) => { if (call.syncType === 'history') throw metaError(100); });
    await processPendingHistoryRequests();
    behavior.delete('7684');
    await disconnectLine(h.accountId, gone);
    assert.equal((await request(h, 'POST', `/lines/${gone}/history-sync`)).status, 409);
    assert.equal((await requestsOf(gone)).history.state, 'rejected');

    const { lineId: plain } = await connect(h, '7683', { businessApp: false });
    assert.equal((await request(h, 'POST', `/lines/${plain}/history-sync`)).status, 409);
});
