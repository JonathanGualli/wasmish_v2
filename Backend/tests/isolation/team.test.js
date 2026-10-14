// Fase 3 de multi-línea: el equipo de una cuenta. Solo owner y admin lo
// gestionan, nadie toca el equipo de otra cuenta (404), las plazas de
// `maxUsers` nunca se pasan, y una invitación es un enlace de un solo uso.
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
    seedAccount, seedMember, connectWhatsapp, request, sessionFrom, openStream, ANONYMOUS,
    Account, Invitation, User,
} from './helpers.js';

const setMaxUsers = (account, maxUsers) => Account.updateOne({ _id: account.accountId }, { 'limits.maxUsers': maxUsers });
const invite = (account, body) => request(account, 'POST', '/team/invitations', body);
const seats = async (account) => (await request(account, 'GET', '/team')).body.seatsUsed;

let seq = 1;
const newAccount = async (label, maxUsers = 5) => {
    const account = await seedAccount(label, { seq: seq++ });
    const { lineId } = await connectWhatsapp(account);
    await setMaxUsers(account, maxUsers);
    return { ...account, lineId: String(lineId) };
};

test('un agente no gestiona el equipo: 403 en las cuatro rutas', async () => {
    const a = await newAccount('TA');
    const agent = await seedMember(a, { role: 'agent', lineIds: [a.lineId], label: 'TAG' });
    for (const [method, url, body] of [
        ['GET', '/team'],
        ['POST', '/team/invitations', { email: 'x@pruebas.local', role: 'agent', lineIds: [a.lineId] }],
        ['DELETE', '/team/invitations/000000000000000000000000'],
        ['PATCH', `/team/members/${a.userId}`, { status: 'inactive' }],
    ]) {
        const res = await request(agent, method, url, body);
        assert.equal(res.status, 403, `${method} ${url}: ${res.text}`);
    }
});

test('B no ve ni toca el equipo ni las invitaciones de A: 404', async () => {
    const a = await newAccount('TB');
    const b = await newAccount('TC');
    const member = await seedMember(a, { role: 'agent', lineIds: [a.lineId], label: 'TBM' });
    const created = await invite(a, { email: 'para-a@pruebas.local', role: 'agent', lineIds: [a.lineId] });
    assert.equal(created.status, 201, created.text);

    const asB = await request(b, 'GET', '/team');
    assert.ok(!asB.text.includes(member.userId) && !asB.text.includes('para-a@pruebas.local'));
    assert.equal((await request(b, 'PATCH', `/team/members/${member.userId}`, { status: 'inactive' })).status, 404);
    assert.equal((await request(b, 'DELETE', `/team/invitations/${created.body.invitation.id}`)).status, 404);
    // Invitar a B con una línea de A: 404, como una línea que no existe.
    assert.equal((await invite(b, { email: 'cruzada@pruebas.local', role: 'agent', lineIds: [a.lineId] })).status, 404);
    assert.equal((await User.findById(member.userId).lean()).status, 'active');
});

test('invitar: sin plaza, 409; con plaza, 201 y el token solo sale una vez', async () => {
    const a = await newAccount('TD', 1);
    const full = await invite(a, { email: 'lleno@pruebas.local', role: 'agent', lineIds: [a.lineId] });
    assert.equal(full.status, 409, full.text);
    assert.equal(full.body[0].code, 'user_limit');

    await setMaxUsers(a, 2);
    const ok = await invite(a, { email: 'Nueva@Pruebas.local', role: 'agent', lineIds: [a.lineId] });
    assert.equal(ok.status, 201, ok.text);
    assert.equal(ok.body.invitation.email, 'nueva@pruebas.local');
    assert.match(ok.body.token, /^[\w-]{32}$/);
    const team = await request(a, 'GET', '/team');
    assert.equal(team.body.seatsUsed, 2);
    assert.ok(!team.text.includes(ok.body.token));
    assert.ok(!JSON.stringify(await Invitation.findById(ok.body.invitation.id).lean()).includes(ok.body.token));
});

test('invitar: un supervisor o agente necesita al menos una línea; un correo ya registrado, 409', async () => {
    const a = await newAccount('TE');
    assert.equal((await invite(a, { email: 'sinlineas@pruebas.local', role: 'agent', lineIds: [] })).status, 400);
    const taken = await invite(a, { email: 'TE@pruebas.local', role: 'admin' });
    assert.equal(taken.status, 409, taken.text);
    assert.equal(taken.body[0].code, 'email_taken');
});

test('dos invitaciones a la vez con una sola plaza libre: nunca dos 201', async () => {
    const a = await newAccount('TF', 2);
    const results = await Promise.all([
        invite(a, { email: 'uno@pruebas.local', role: 'agent', lineIds: [a.lineId] }),
        invite(a, { email: 'dos@pruebas.local', role: 'agent', lineIds: [a.lineId] }),
    ]);
    assert.deepEqual(results.map(res => res.status).sort(), [201, 409]);
    assert.equal(await seats(a), 2);
});

test('reinvitar el mismo correo reemplaza la invitación: el enlace viejo deja de valer y no ocupa otra plaza', async () => {
    const a = await newAccount('TG', 2);
    const first = await invite(a, { email: 'repetida@pruebas.local', role: 'agent', lineIds: [a.lineId] });
    const second = await invite(a, { email: 'repetida@pruebas.local', role: 'supervisor', lineIds: [a.lineId] });
    assert.equal(second.status, 201, second.text);
    assert.equal(second.body.invitation.id, first.body.invitation.id);
    assert.equal(await seats(a), 2);
    assert.equal((await request(ANONYMOUS, 'GET', `/invitations/${first.body.token}`)).status, 404);
    const current = await request(ANONYMOUS, 'GET', `/invitations/${second.body.token}`);
    assert.equal(current.status, 200, current.text);
    assert.equal(current.body.role, 'supervisor');
});

// Regresión que vigila (spec § 3.3): el admin gestiona el equipo «menos al owner».
test('el admin no cambia ni desactiva al owner; nadie se cambia a sí mismo', async () => {
    const a = await newAccount('TH');
    const admin = await seedMember(a, { role: 'admin', label: 'THA' });
    const toOwner = await request(admin, 'PATCH', `/team/members/${a.userId}`, { status: 'inactive' });
    assert.equal(toOwner.status, 403, toOwner.text);
    assert.equal(toOwner.body[0].code, 'owner_locked');
    const self = await request(admin, 'PATCH', `/team/members/${admin.userId}`, { role: 'agent', lineIds: [a.lineId] });
    assert.equal(self.status, 403, self.text);
    assert.equal(self.body[0].code, 'self_change');
    assert.equal((await User.findById(a.userId).lean()).status ?? 'active', 'active');
    assert.equal((await User.findById(admin.userId).lean()).role, 'admin');
});

test('cambiarle el rol a alguien cierra su SSE con access_changed; desactivarlo lo deja fuera y libera su plaza', async () => {
    const a = await newAccount('TI', 3);
    const agent = await seedMember(a, { role: 'agent', lineIds: [a.lineId], label: 'TIA' });
    const stream = await openStream(agent);
    try {
        const changed = await request(a, 'PATCH', `/team/members/${agent.userId}`, { role: 'supervisor' });
        assert.equal(changed.status, 200, changed.text);
        assert.ok(await stream.waitFor('event: access_changed', 2000), 'no llegó access_changed');
    } finally {
        await stream.close();
    }
    assert.equal(await seats(a), 2);
    const off = await request(a, 'PATCH', `/team/members/${agent.userId}`, { status: 'inactive' });
    assert.equal(off.status, 200, off.text);
    assert.equal((await request(agent, 'GET', '/chats')).status, 401);
    assert.equal(await seats(a), 1);
});

test('reactivar sin plaza, 409; dos reactivaciones a la vez con una plaza, una sola sale', async () => {
    const a = await newAccount('TJ', 2);
    const one = await seedMember(a, { role: 'agent', lineIds: [a.lineId], label: 'TJ1' });
    const two = await seedMember(a, { role: 'agent', lineIds: [a.lineId], label: 'TJ2' });
    await User.updateMany({ _id: { $in: [one.userId, two.userId] } }, { status: 'inactive' });

    const results = await Promise.all([one, two].map(member =>
        request(a, 'PATCH', `/team/members/${member.userId}`, { status: 'active' })));
    assert.deepEqual(results.map(res => res.status).sort(), [200, 409]);
    assert.equal(await seats(a), 2);

    const blocked = await request(a, 'PATCH', `/team/members/${[one, two].find((_, i) => results[i].status === 409).userId}`, { status: 'active' });
    assert.equal(blocked.status, 409, blocked.text);
    assert.equal(blocked.body[0].code, 'user_limit');
});

test('reactivar e invitar a la vez con una plaza libre: como mucho una sale', async () => {
    const a = await newAccount('TK', 2);
    const member = await seedMember(a, { role: 'agent', lineIds: [a.lineId], label: 'TK1' });
    await User.updateOne({ _id: member.userId }, { status: 'inactive' });
    const [reactivate, invited] = await Promise.all([
        request(a, 'PATCH', `/team/members/${member.userId}`, { status: 'active' }),
        invite(a, { email: 'carrera@pruebas.local', role: 'agent', lineIds: [a.lineId] }),
    ]);
    assert.equal([reactivate.status, invited.status].filter(status => status === 200 || status === 201).length, 1);
    assert.equal(await seats(a), 2);
});

test('aceptar: entra con el rol y las líneas de la invitación; el mismo enlace no vale dos veces', async () => {
    const a = await newAccount('TL');
    const { body } = await invite(a, { email: 'acepta@pruebas.local', role: 'supervisor', lineIds: [a.lineId] });

    const info = await request(ANONYMOUS, 'GET', `/invitations/${body.token}`);
    assert.equal(info.status, 200, info.text);
    assert.equal(info.body.email, 'acepta@pruebas.local');
    assert.equal(info.body.role, 'supervisor');
    assert.equal(info.body.lineNames.length, 1);
    assert.ok(!info.text.includes(body.token) && !info.text.includes(a.accountId));

    const accepted = await request(ANONYMOUS, 'POST', `/invitations/${body.token}/accept`, { name: 'Persona Invitada', password: 'secreta1' });
    assert.equal(accepted.status, 200, accepted.text);
    assert.equal(accepted.body.role, 'supervisor');
    assert.deepEqual(accepted.body.lineIds, [a.lineId]);
    const session = sessionFrom(accepted);
    assert.equal((await request(session, 'GET', '/verify')).status, 200);
    const user = await User.findOne({ email: 'acepta@pruebas.local' }).lean();
    assert.equal(String(user.accountId), a.accountId);

    const again = await request(ANONYMOUS, 'POST', `/invitations/${body.token}/accept`, { name: 'Otra Vez', password: 'secreta1' });
    assert.equal(again.status, 404, again.text);
    assert.equal(await User.countDocuments({ email: 'acepta@pruebas.local' }), 1);
});

test('dos aceptaciones a la vez del mismo enlace: un solo usuario', async () => {
    const a = await newAccount('TM');
    const { body } = await invite(a, { email: 'doble@pruebas.local', role: 'agent', lineIds: [a.lineId] });
    await Promise.all([1, 2].map(n => request(ANONYMOUS, 'POST', `/invitations/${body.token}/accept`, { name: `Doble ${n}`, password: 'secreta1' })));
    assert.equal(await User.countDocuments({ email: 'doble@pruebas.local' }), 1);
});

test('un enlace caducado: 410', async () => {
    const a = await newAccount('TN');
    const { body } = await invite(a, { email: 'caducada@pruebas.local', role: 'agent', lineIds: [a.lineId] });
    await Invitation.updateOne({ _id: body.invitation.id }, { expiresAt: new Date(Date.now() - 1000) });
    const res = await request(ANONYMOUS, 'POST', `/invitations/${body.token}/accept`, { name: 'Tarde Llega', password: 'secreta1' });
    assert.equal(res.status, 410, res.text);
    assert.equal(res.body[0].code, 'invitation_expired');
});

// Revisión de Codex del plan: aceptar no libera la plaza ni un instante.
test('mientras se acepta, la invitación sigue ocupando su plaza', async () => {
    const a = await newAccount('TO', 2);
    const { body } = await invite(a, { email: 'reclamada@pruebas.local', role: 'agent', lineIds: [a.lineId] });
    await Invitation.updateOne({ _id: body.invitation.id }, { claimedAt: new Date() });
    const other = await invite(a, { email: 'otra@pruebas.local', role: 'agent', lineIds: [a.lineId] });
    assert.equal(other.status, 409, other.text);
    assert.equal(other.body[0].code, 'user_limit');
});

test('si crear el usuario falla (el correo se registró entretanto), 409 y el enlace sigue valiendo', async () => {
    const a = await newAccount('TP');
    const { body } = await invite(a, { email: 'carrera.correo@pruebas.local', role: 'agent', lineIds: [a.lineId] });
    const intruder = await User.create({
        name: 'Se adelantó', email: 'carrera.correo@pruebas.local', password: 'x',
        accountId: new mongoose.Types.ObjectId(), role: 'owner',
    });
    const failed = await request(ANONYMOUS, 'POST', `/invitations/${body.token}/accept`, { name: 'Invitada', password: 'secreta1' });
    assert.equal(failed.status, 409, failed.text);
    assert.equal(failed.body[0].code, 'email_taken');
    assert.equal((await Invitation.findById(body.invitation.id).lean()).claimedAt, null);

    await User.deleteOne({ _id: intruder._id });
    const ok = await request(ANONYMOUS, 'POST', `/invitations/${body.token}/accept`, { name: 'Invitada', password: 'secreta1' });
    assert.equal(ok.status, 200, ok.text);
});

test('superadmin: sube maxUsers, y la lista de clientes es una fila por cuenta con sus usuarios', async () => {
    const a = await newAccount('TQ', 1);
    await seedMember(a, { role: 'agent', lineIds: [a.lineId], label: 'TQM' });
    const superadmin = await seedAccount('TQS', { seq: seq++, isSuperadmin: true });

    const raised = await request(superadmin, 'PATCH', `/admin/accounts/${a.accountId}/limits`, { maxUsers: 5 });
    assert.equal(raised.status, 200, raised.text);
    assert.equal(raised.body.maxUsers, 5);
    assert.equal((await request(superadmin, 'PATCH', `/admin/accounts/${a.accountId}/limits`, {})).status, 400);

    await invite(a, { email: 'pendiente.tq@pruebas.local', role: 'agent', lineIds: [a.lineId] });
    const clients = await request(superadmin, 'GET', '/admin/clients?limit=50');
    const rows = clients.body.clients.filter(client => client.accountId === a.accountId);
    assert.equal(rows.length, 1, 'el agente salía como otro cliente');
    assert.deepEqual(rows[0].users, { active: 2, pending: 1, max: 5 });
});

// Revisión de Codex del PR #36: mientras alguien acepta (la invitación está
// reclamada), ni anularla ni reinvitar pueden tocarla: anular liberaba una
// plaza que el usuario iba a ocupar, y reinvitar cambiaba el rol de un enlace
// que ya se estaba usando.
test('una invitación que se está aceptando no se anula ni se reemplaza: 409, y sigue igual', async () => {
    const a = await newAccount('TR', 3);
    const { body } = await invite(a, { email: 'en.curso@pruebas.local', role: 'admin' });
    await Invitation.updateOne({ _id: body.invitation.id }, { claimedAt: new Date() });

    const revoke = await request(a, 'DELETE', `/team/invitations/${body.invitation.id}`);
    assert.equal(revoke.status, 409, revoke.text);
    assert.equal(revoke.body[0].code, 'invitation_busy');

    const reinvite = await invite(a, { email: 'en.curso@pruebas.local', role: 'agent', lineIds: [a.lineId] });
    assert.equal(reinvite.status, 409, reinvite.text);
    assert.equal(reinvite.body[0].code, 'invitation_busy');

    const stored = await Invitation.findById(body.invitation.id).lean();
    assert.equal(stored.role, 'admin');
    assert.equal(await seats(a), 2);
});

test('un reclamo viejo (el proceso murió) ya no bloquea anular', async () => {
    const a = await newAccount('TS', 3);
    const { body } = await invite(a, { email: 'reclamo.viejo@pruebas.local', role: 'agent', lineIds: [a.lineId] });
    await Invitation.updateOne({ _id: body.invitation.id }, { claimedAt: new Date(Date.now() - 5 * 60 * 1000) });
    assert.equal((await request(a, 'DELETE', `/team/invitations/${body.invitation.id}`)).status, 204);
});

// Revisión de Codex del PR #36: activar leía el estado antes del candado y,
// si entretanto otro lo desactivaba y se ocupaba la plaza, se pasaba del plan.
test('activar, desactivar e invitar a la vez nunca pasan de maxUsers', async () => {
    const a = await newAccount('TT', 2);
    const member = await seedMember(a, { role: 'agent', lineIds: [a.lineId], label: 'TT1' });
    for (let round = 0; round < 5; round++) {
        await Invitation.deleteMany({ accountId: a.accountId });
        await User.updateOne({ _id: member.userId }, { status: 'active' });
        await Promise.all([
            request(a, 'PATCH', `/team/members/${member.userId}`, { status: 'inactive' }),
            request(a, 'PATCH', `/team/members/${member.userId}`, { status: 'active' }),
            invite(a, { email: `vuelta${round}@pruebas.local`, role: 'agent', lineIds: [a.lineId] }),
        ]);
        assert.ok(await seats(a) <= 2, `vuelta ${round}: ${await seats(a)} plazas con maxUsers 2`);
    }
});
