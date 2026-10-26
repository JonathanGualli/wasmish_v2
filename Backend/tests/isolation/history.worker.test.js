// El worker del historial: reclamar una pieza a la vez, recuperar lo que quedó a
// medias, dar por perdida una pieza que falla tres veces y terminar la recepción.
// En su propio archivo (su propio Mongo): «la pieza más vieja» no puede ser la
// de otro test. Spec: docs/superpowers/specs/2026-10-23-historial-coexistencia-design.md (§ 6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { seedAccount, seedMember, connectWhatsapp, openStream, HistoryThread, Line } from './helpers.js';
import { historySyncView } from '../../src/utils/history.sync.js';

const {
    claimNextHistoryThread, processNextHistoryThread, recoverHistoryThreads, finishHistorySyncs, FINISH_QUIET_MS,
} = await import('../../src/workers/history.worker.js');

const MINUTE = 60 * 1000;

// Todo lo que se prepara con `await` va aquí arriba (ver pruebas-y-scripts.md).
const w = await seedAccount('W', { seq: 91 });
const { lineId } = await connectWhatsapp(w, { phoneNumberId: '991' });
const line = await Line.findById(lineId).lean();
const connectionAt = line.connectedAt;
await Line.updateOne({ _id: lineId }, { $set: { historySync: {
    connectionAt, requests: { contacts: { state: 'accepted' }, history: { state: 'accepted' } },
} } });

// Un agente de esa línea (sin `lines.manage`) y otra cuenta: el aviso no es para ellos.
const agentW = await seedMember(w, { role: 'agent', lineIds: [lineId], label: 'AGW' });
const other = await seedAccount('O', { seq: 92 });
await connectWhatsapp(other, { phoneNumberId: '992' });

let seq = 0;
const piece = (overrides = {}) => HistoryThread.create({
    userId: w.accountId, lineId, connectionAt, contactPhone: `5939909${String(++seq).padStart(5, '0')}`,
    phase: 1, chunkOrder: seq, part: 0, messages: [{ id: `wamid.w.${seq}` }], ...overrides,
});
const reload = (doc) => HistoryThread.findById(doc._id).lean();
const sync = async () => (await Line.findById(lineId).lean()).historySync;
// Vacía la cola entre tests: cada uno empieza sin piezas propias pendientes.
const clearQueue = () => HistoryThread.deleteMany({ lineId });
const fails = async () => { throw new Error('fallo simulado'); };

test('dos procesos no reclaman la misma pieza', async () => {
    await clearQueue();
    const only = await piece();
    const claims = await Promise.all([claimNextHistoryThread(), claimNextHistoryThread(), claimNextHistoryThread()]);
    const won = claims.filter(Boolean);
    assert.equal(won.length, 1);
    assert.equal(String(won[0]._id), String(only._id));
    assert.equal(won[0].status, 'processing');
    assert.equal(won[0].attempts, 1);
    assert.ok(won[0].claimToken && won[0].leaseUntil > new Date());
});

test('procesar una pieza la deja done, y sin piezas es idle', async () => {
    await clearQueue();
    const one = await piece();
    const seen = [];
    assert.equal(await processNextHistoryThread({ importPiece: async (p) => { seen.push(String(p._id)); return { created: 1, skipped: 0 }; } }), 'done');
    assert.deepEqual(seen, [String(one._id)]);
    const done = await reload(one);
    assert.equal(done.status, 'done');
    assert.equal(done.leaseUntil, null);
    assert.equal(await processNextHistoryThread(), 'idle');
});

test('al arrancar, una pieza en processing vuelve a pending aunque su lease no haya vencido', async () => {
    await clearQueue();
    const stuck = await piece({ status: 'processing', attempts: 1, leaseUntil: new Date(Date.now() + 10 * MINUTE), claimToken: 'de-otro-proceso' });
    assert.deepEqual(await recoverHistoryThreads(), { requeued: 0, failed: 0 }, 'el barrido normal respeta el lease');
    assert.equal((await reload(stuck)).status, 'processing');
    assert.deepEqual(await recoverHistoryThreads({ startup: true }), { requeued: 1, failed: 0 });
    const back = await reload(stuck);
    assert.equal(back.status, 'pending');
    assert.equal(back.claimToken, null);
});

test('el barrido devuelve a la cola una pieza con el lease vencido', async () => {
    await clearQueue();
    const dead = await piece({ status: 'processing', attempts: 1, leaseUntil: new Date(Date.now() - MINUTE), claimToken: 'muerto' });
    assert.deepEqual(await recoverHistoryThreads(), { requeued: 1, failed: 0 });
    assert.equal((await reload(dead)).status, 'pending');
});

test('una pieza que falla tres veces queda failed y suma failedThreads', async () => {
    await clearQueue();
    await Line.updateOne({ _id: lineId }, { $set: { 'historySync.failedThreads': 0 } });
    const bad = await piece();
    assert.equal(await processNextHistoryThread({ importPiece: fails }), 'retry');
    assert.equal((await reload(bad)).status, 'pending');
    assert.equal(await processNextHistoryThread({ importPiece: fails }), 'retry');
    assert.equal(await processNextHistoryThread({ importPiece: fails }), 'failed');
    const failed = await reload(bad);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.attempts, 3);
    assert.equal(failed.error, 'fallo simulado');
    assert.equal((await sync()).failedThreads, 1);
    assert.equal(await processNextHistoryThread({ importPiece: fails }), 'idle', 'una pieza failed no se vuelve a intentar');
});

test('una pieza que muere en su tercer intento queda failed al recuperarla', async () => {
    await clearQueue();
    await Line.updateOne({ _id: lineId }, { $set: { 'historySync.failedThreads': 0 } });
    const third = await piece({ status: 'processing', attempts: 3, leaseUntil: new Date(Date.now() - MINUTE), claimToken: 'muerto' });
    assert.deepEqual(await recoverHistoryThreads(), { requeued: 0, failed: 1 });
    assert.equal((await reload(third)).status, 'failed');
    assert.equal((await sync()).failedThreads, 1);
});

test('una pieza de otra conexión que falla no suma en la conexión actual', async () => {
    await clearQueue();
    await Line.updateOne({ _id: lineId }, { $set: { 'historySync.failedThreads': 0 } });
    await piece({ connectionAt: new Date('2026-01-01T00:00:00Z'), attempts: 2 });
    assert.equal(await processNextHistoryThread({ importPiece: fails }), 'failed');
    assert.equal((await sync()).failedThreads, 0);
});

// Revisión de Codex del spec: los trozos llegan desordenados y el de
// `progress: 100` puede llegar antes que otros.
test('con progress 100 pero una pieza pendiente, no termina', async () => {
    await clearQueue();
    const old = new Date(Date.now() - FINISH_QUIET_MS - MINUTE);
    await Line.updateOne({ _id: lineId }, { $set: {
        'historySync.historyComplete': true, 'historySync.lastChunkAt': old, 'historySync.finishedAt': null,
    } });
    await piece();
    assert.equal(await finishHistorySyncs(), 0);
    assert.equal((await sync()).finishedAt, null);
});

test('sin historyComplete, o con un trozo hace menos de 10 minutos, no termina', async () => {
    await clearQueue();
    await Line.updateOne({ _id: lineId }, { $set: {
        'historySync.historyComplete': false, 'historySync.lastChunkAt': new Date(Date.now() - FINISH_QUIET_MS - MINUTE), 'historySync.finishedAt': null,
    } });
    assert.equal(await finishHistorySyncs(), 0);
    await Line.updateOne({ _id: lineId }, { $set: { 'historySync.historyComplete': true, 'historySync.lastChunkAt': new Date(Date.now() - 2 * MINUTE) } });
    assert.equal(await finishHistorySyncs(), 0);
});

test('con 10 minutos sin trozos y nada pendiente, finishedAt; con una pieza failed, la vista dice partial', async () => {
    await clearQueue();
    await piece({ status: 'done' });
    await Line.updateOne({ _id: lineId }, { $set: {
        'historySync.historyComplete': true, 'historySync.lastChunkAt': new Date(Date.now() - FINISH_QUIET_MS - MINUTE),
        'historySync.finishedAt': null, 'historySync.failedThreads': 0, 'historySync.firstChunkAt': new Date(Date.now() - 20 * MINUTE),
    } });
    const stream = await openStream(w);
    try {
        assert.equal(await finishHistorySyncs(), 1);
        assert.ok((await sync()).finishedAt);
        assert.equal(historySyncView(await sync()).status, 'done');
        // Hasta 6 s: los tests de arriba ya avisaron de esta línea, y el aviso
        // sale como mucho cada 5 s (el que cae dentro del plazo, al final de él).
        assert.ok(await stream.waitFor('event: history_sync', 6000), 'no avisó por SSE');
        assert.ok(await stream.waitFor(String(lineId), 0));
    } finally {
        await stream.close();
    }
    assert.equal(await finishHistorySyncs(), 0, 'ya terminada');

    await Line.updateOne({ _id: lineId }, { $set: { 'historySync.failedThreads': 2 } });
    assert.equal(historySyncView(await sync()).status, 'partial');
});

test('history_sync llega a quien administra las líneas, no a un agente ni a otra cuenta', async () => {
    await clearQueue();
    await Line.updateOne({ _id: lineId }, { $set: {
        'historySync.historyComplete': true, 'historySync.lastChunkAt': new Date(Date.now() - FINISH_QUIET_MS - MINUTE), 'historySync.finishedAt': null,
    } });
    const owner = await openStream(w);
    const agent = await openStream(agentW);
    const stranger = await openStream(other);
    try {
        assert.equal(await finishHistorySyncs(), 1);
        assert.ok(await owner.waitFor('event: history_sync', 6000), 'el owner no recibió el aviso');
        assert.equal(await agent.waitFor('history_sync', 300), false, 'un agente recibió el aviso');
        assert.equal(await stranger.waitFor('history_sync', 0), false, 'otra cuenta recibió el aviso');
    } finally {
        await Promise.all([owner.close(), agent.close(), stranger.close()]);
    }
});
