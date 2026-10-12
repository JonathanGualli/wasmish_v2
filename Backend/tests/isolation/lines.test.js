// Las líneas de una cuenta. `syncLinesFromOwner` (Fase 2a; desde la 2c solo lo
// usa `migrate:lines` en una cuenta sin líneas): sea cual sea el orden de las
// escrituras, al terminar lo que dicen `Waba`, `Line` y `Account.defaultLineId`
// es lo que dice el owner. Y `findInboundLine`: a qué cuenta y línea va lo que
// entra (desde la 2c, por la línea activa del número).
import test from 'node:test';
import assert from 'node:assert/strict';
import { seedAccount, connectWhatsapp, Account, Line, User, Waba } from './helpers.js';

const { syncLinesFromOwner, findInboundLine } = await import('../../src/services/line.service.js');
const { lineStateIssues } = await import('../../src/utils/line.js');

await Waba.init();
await Line.init();

let seq = 1;
const newAccount = async (label) => seedAccount(label, { seq: seq++ });

const setConnection = (account, fields) => User.updateOne({ _id: account.userId }, { $set: fields });

/** Lo que falta para que la proyección coincida con `User`; [] = al día. */
const issuesOf = async (account) => {
    const owner = await User.findById(account.userId).lean();
    return lineStateIssues({
        owner,
        account: await Account.findById(account.accountId).lean(),
        lines: await Line.find({ accountId: account.accountId }).lean(),
        waba: owner.waBusinessId ? await Waba.findOne({ waBusinessId: owner.waBusinessId }).lean() : null,
    });
};

const activeLines = (account) => Line.find({ accountId: account.accountId, status: 'active' }).lean();

test('sincronizar crea el WABA y la línea activa por defecto, con el token de User', async () => {
    const a = await newAccount('A');
    await setConnection(a, { tokenWhatsapp: 'cifrado-a', phoneNumberId: '7001', waBusinessId: 'waba-a' });
    await syncLinesFromOwner(a.accountId, { details: { phoneNumberId: '7001', displayPhoneNumber: '+1 555 7001', verifiedName: 'Negocio A' } });

    assert.deepEqual(await issuesOf(a), []);
    const [line] = await activeLines(a);
    assert.equal(line.displayPhoneNumber, '+1 555 7001');
    assert.equal(line.verifiedName, 'Negocio A');
    assert.equal((await Waba.findOne({ waBusinessId: 'waba-a' }).lean()).tokenWhatsapp, 'cifrado-a');
});

test('sincronizar dos veces no duplica nada', async () => {
    const b = await newAccount('B');
    await setConnection(b, { tokenWhatsapp: 'cifrado-b', phoneNumberId: '7002', waBusinessId: 'waba-b' });
    await syncLinesFromOwner(b.accountId);
    await syncLinesFromOwner(b.accountId);

    assert.equal(await Waba.countDocuments({ accountId: b.accountId }), 1);
    assert.equal(await Line.countDocuments({ accountId: b.accountId }), 1);
    assert.deepEqual(await issuesOf(b), []);
});

test('otro número en User: la línea anterior queda desconectada y la nueva por defecto', async () => {
    const c = await newAccount('C');
    await setConnection(c, { tokenWhatsapp: 'cifrado-c', phoneNumberId: '7003', waBusinessId: 'waba-c' });
    await syncLinesFromOwner(c.accountId);
    await setConnection(c, { phoneNumberId: '7013' });
    await syncLinesFromOwner(c.accountId);

    assert.deepEqual(await issuesOf(c), []);
    assert.equal((await Line.findOne({ accountId: c.accountId, phoneNumberId: '7003' }).lean()).status, 'disconnected');
    assert.deepEqual((await activeLines(c)).map(line => line.phoneNumberId), ['7013']);
});

// Regresión que vigila (vuelta atrás): la imagen anterior cambió el número solo
// en `User`; al volver, la proyección tiene una línea activa y una línea por
// defecto que ya no son las de `User`.
test('con una línea activa vieja y defaultLineId viejo, sincronizar los corrige', async () => {
    const d = await newAccount('D');
    const stale = await Line.create({ accountId: d.accountId, phoneNumberId: '7004', status: 'active' });
    await Account.updateOne({ _id: d.accountId }, { defaultLineId: stale._id });
    await setConnection(d, { tokenWhatsapp: 'cifrado-d', phoneNumberId: '7014', waBusinessId: 'waba-d' });
    await syncLinesFromOwner(d.accountId);

    assert.deepEqual(await issuesOf(d), []);
    assert.equal((await Line.findById(stale._id).lean()).status, 'disconnected');
});

test('sin conexión en User, ninguna línea activa ni por defecto', async () => {
    const e = await newAccount('E');
    await setConnection(e, { tokenWhatsapp: 'cifrado-e', phoneNumberId: '7005', waBusinessId: 'waba-e' });
    await syncLinesFromOwner(e.accountId);
    await setConnection(e, { tokenWhatsapp: null });
    await syncLinesFromOwner(e.accountId);

    assert.deepEqual(await issuesOf(e), []);
    assert.equal((await activeLines(e)).length, 0);
    assert.equal((await Account.findById(e.accountId).lean()).defaultLineId, null);
});

test('dos renovaciones a la vez: el token final del Waba es el de User', async () => {
    const f = await newAccount('F');
    await setConnection(f, { tokenWhatsapp: 'cifrado-t1', phoneNumberId: '7006', waBusinessId: 'waba-f' });
    // El primer sync lee T1; antes de que escriba, otra conexión deja T2 y sincroniza entera.
    const result = await syncLinesFromOwner(f.accountId, {
        afterRead: async (attempt) => {
            if (attempt !== 1) return;
            await setConnection(f, { tokenWhatsapp: 'cifrado-t2' });
            await syncLinesFromOwner(f.accountId);
        },
    });

    assert.equal(result.attempts, 2);
    assert.equal((await Waba.findOne({ waBusinessId: 'waba-f' }).lean()).tokenWhatsapp, 'cifrado-t2');
    assert.deepEqual(await issuesOf(f), []);
});

// Regresión que vigila (Codex, código de la 2a): al repetir, la primera sincronización
// escribía en la línea nueva el número visible y el nombre del número anterior.
test('dos cambios de número a la vez: una sola línea activa, la de User, con sus datos', async () => {
    const g = await newAccount('G');
    await setConnection(g, { tokenWhatsapp: 'cifrado-g', phoneNumberId: '7007', waBusinessId: 'waba-g' });
    await syncLinesFromOwner(g.accountId, {
        details: { phoneNumberId: '7007', displayPhoneNumber: '+1 555 7007', verifiedName: 'Viejo' },
        afterRead: async (attempt) => {
            if (attempt !== 1) return;
            await setConnection(g, { phoneNumberId: '7017' });
            await syncLinesFromOwner(g.accountId, { details: { phoneNumberId: '7017', displayPhoneNumber: '+1 555 7017', verifiedName: 'Nuevo' } });
        },
    });

    const active = await activeLines(g);
    assert.deepEqual(active.map(line => line.phoneNumberId), ['7017']);
    assert.equal(active[0].displayPhoneNumber, '+1 555 7017');
    assert.equal(active[0].verifiedName, 'Nuevo');
    assert.deepEqual(await issuesOf(g), []);
});

test('un WABA de otra cuenta: el sync lanza E11000 y no toca el Waba ajeno', async () => {
    const h = await newAccount('H');
    const i = await newAccount('I');
    await setConnection(h, { tokenWhatsapp: 'cifrado-h', phoneNumberId: '7008', waBusinessId: 'waba-compartido' });
    await syncLinesFromOwner(h.accountId);
    await setConnection(i, { tokenWhatsapp: 'cifrado-i', phoneNumberId: '7009', waBusinessId: 'waba-compartido' });

    await assert.rejects(syncLinesFromOwner(i.accountId), (error) => error.code === 11000);
    const waba = await Waba.findOne({ waBusinessId: 'waba-compartido' }).lean();
    assert.equal(String(waba.accountId), h.accountId);
    assert.equal(waba.tokenWhatsapp, 'cifrado-h');
});

test('un número activo en una cuenta y desconectado en otra conviven; dos activos, no', async () => {
    const j = await newAccount('J');
    const k = await newAccount('K');
    await Line.create({ accountId: j.accountId, phoneNumberId: '7555', status: 'active' });
    await Line.create({ accountId: k.accountId, phoneNumberId: '7555', status: 'disconnected' });
    const l = await newAccount('L');
    await assert.rejects(Line.create({ accountId: l.accountId, phoneNumberId: '7555', status: 'active' }), (error) => error.code === 11000);
});

// Regresión que vigila (Codex, código de la 2a): tras una vuelta atrás, A pasó de
// X a Y y B conectó X (solo en `User`). La línea X de A seguía activa, y activar
// X en B chocaba con el índice: la migración se quedaba bloqueada.
test('el número actual activo en otra cuenta (obsoleto) se desconecta allí', async () => {
    const n = await newAccount('N');
    const o = await newAccount('O');
    await setConnection(n, { tokenWhatsapp: 'cifrado-n', phoneNumberId: '7020', waBusinessId: 'waba-n' });
    await syncLinesFromOwner(n.accountId);
    // La imagen anterior: N cambia de número y O se queda el de N, solo en User.
    await setConnection(n, { phoneNumberId: '7021' });
    await setConnection(o, { tokenWhatsapp: 'cifrado-o', phoneNumberId: '7020', waBusinessId: 'waba-o' });

    // O se sincroniza ANTES que N.
    await syncLinesFromOwner(o.accountId);
    await syncLinesFromOwner(n.accountId);

    assert.deepEqual(await issuesOf(o), []);
    assert.deepEqual(await issuesOf(n), []);
    assert.equal((await Line.findOne({ accountId: n.accountId, phoneNumberId: '7020' }).lean()).status, 'disconnected');
});

// El webhook encuentra la cuenta y la línea por la línea activa del número, y el
// token sale del WABA de esa línea.
test('findInboundLine: la línea del número, con el token de su WABA', async (t) => {
    const p = await newAccount('P');
    await setConnection(p, { tokenWhatsapp: 'cifrado-p', phoneNumberId: '7030', waBusinessId: 'waba-p' });
    await syncLinesFromOwner(p.accountId);
    const line = await Line.findOne({ accountId: p.accountId, phoneNumberId: '7030' }).lean();
    const logged = t.mock.method(console, 'error', () => {});

    const inbound = await findInboundLine('7030');
    assert.equal(String(inbound.accountId), p.accountId);
    assert.equal(String(inbound.lineId), String(line._id));
    assert.equal(inbound.phoneNumberId, '7030');
    assert.equal(inbound.tokenWhatsapp, 'cifrado-p');
    assert.equal(logged.mock.callCount(), 0);
});

test('findInboundLine: un número que solo es una línea desconectada no recibe', async () => {
    const q = await newAccount('Q');
    await Line.create({ accountId: q.accountId, phoneNumberId: '7040', status: 'disconnected' });
    assert.equal(await findInboundLine('7040'), null);
});

// La reserva del spec: un número sin ninguna `Line` que el `User` de una cuenta
// tiene (conectado con la imagen anterior) se procesa con `User`, nunca se descarta.
test('findInboundLine: sin Line pero con User, la reserva y su console.error', async (t) => {
    const r = await newAccount('R');
    await setConnection(r, { tokenWhatsapp: 'cifrado-r', phoneNumberId: '7050', waBusinessId: 'waba-r' });
    const logged = t.mock.method(console, 'error', () => {});

    const inbound = await findInboundLine('7050');
    assert.equal(String(inbound.accountId), r.accountId);
    assert.equal(inbound.lineId, null);
    assert.equal(inbound.phoneNumberId, '7050');
    assert.equal(inbound.tokenWhatsapp, 'cifrado-r');
    assert.equal(logged.mock.callCount(), 1);
});

// Regresión que vigila (plan de la 2c, Review Focus 2): un número que una cuenta
// soltó y otra conectó. Los entrantes van a la cuenta que lo tiene ACTIVO, y el
// historial de la primera sigue en su línea desconectada.
test('findInboundLine: un número desconectado en S y conectado en U va a U', async () => {
    const s = await newAccount('S');
    const u = await newAccount('U');
    await connectWhatsapp(s, { phoneNumberId: '7060' });
    await connectWhatsapp(s, { phoneNumberId: '7061' });   // maxLines 1: reemplaza, 7060 queda desconectada
    await connectWhatsapp(u, { phoneNumberId: '7060' });

    const inbound = await findInboundLine('7060');
    assert.equal(String(inbound.accountId), u.accountId);
    const uLine = await Line.findOne({ accountId: u.accountId, phoneNumberId: '7060' }).lean();
    assert.equal(String(inbound.lineId), String(uLine._id));
    assert.equal((await Line.findOne({ accountId: s.accountId, phoneNumberId: '7060' }).lean()).status, 'disconnected');
});

// Regresión que vigila (Codex, PR #14): la reserva usaba la línea por defecto,
// que tras un cambio de número a medias es la del número ANTERIOR.
test('findInboundLine: la reserva nunca usa la línea de otro número', async (t) => {
    const v = await newAccount('V');
    await setConnection(v, { tokenWhatsapp: 'cifrado-v', phoneNumberId: '7070', waBusinessId: 'waba-v' });
    await syncLinesFromOwner(v.accountId);
    await setConnection(v, { phoneNumberId: '7071' });   // defaultLineId sigue en la de 7070
    t.mock.method(console, 'error', () => {});

    const inbound = await findInboundLine('7071');
    assert.equal(String(inbound.accountId), v.accountId);
    assert.equal(inbound.lineId, null);
    assert.equal(inbound.phoneNumberId, '7071');
});
