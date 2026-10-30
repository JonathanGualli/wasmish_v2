// Las notas de un contacto (spec `2026-10-17-notas-contacto-design.md`): B no
// lee, crea, edita ni borra las de A (404); dentro de A, cada uno cambia las
// suyas y owner y admin, cualquiera (403 si no).
import test from 'node:test';
import assert from 'node:assert/strict';
import { seedAccount, seedMember, request, openStream, assertNoLeak, Contact, ContactNote, User } from './helpers.js';

const a = await seedAccount('A', { seq: 1 });
const b = await seedAccount('B', { seq: 2 });
const agent = await seedMember(a, { role: 'agent', label: 'A-agente' });
const otherAgent = await seedMember(a, { role: 'agent', label: 'A-otro-agente' });
const supervisor = await seedMember(a, { role: 'supervisor', label: 'A-supervisor' });
const admin = await seedMember(a, { role: 'admin', label: 'A-admin' });

const notesOf = async (account, contactId) => (await request(account, 'GET', `/contacts/${contactId}`)).body.noteList;
const addNote = (account, contactId, text) => request(account, 'POST', `/contacts/${contactId}/notes`, { text });

test('una nota nueva sale a nombre de quien la escribe, la primera de la lista', async () => {
    const created = await addNote(agent, a.contactId, '  Pidió cotización de 500 volantes  ');
    assert.equal(created.status, 201, created.text);
    assert.equal(created.body.text, 'Pidió cotización de 500 volantes');
    assert.deepEqual(created.body.author, { id: agent.userId, name: 'A-agente miembro', active: true });
    assert.equal(created.body.source, 'manual');
    assert.equal(created.body.canEdit, true);

    const detail = await request(a, 'GET', `/contacts/${a.contactId}`);
    assert.equal(detail.body.noteList[0].id, created.body.id);
    // El owner la ve, y puede cambiarla aunque no sea suya.
    assert.equal(detail.body.noteList[0].canEdit, true);
    // La transición se cerró (2026-10-30): el texto de antes ya no se devuelve.
    assert.equal('notes' in detail.body, false);
});

test('B no lee, crea, edita ni borra notas de A', async () => {
    const note = (await addNote(a, a.contactId, `${a.marker} nota privada`)).body;

    const detail = await request(b, 'GET', `/contacts/${a.contactId}`);
    assert.equal(detail.status, 404);
    assertNoLeak(detail, a);
    assert.equal((await addNote(b, a.contactId, 'de B')).status, 404);
    assert.equal((await request(b, 'PATCH', `/contacts/${a.contactId}/notes/${note.id}`, { text: 'de B' })).status, 404);
    assert.equal((await request(b, 'DELETE', `/contacts/${a.contactId}/notes/${note.id}`)).status, 404);
    // Ni por la URL de un contacto suyo.
    assert.equal((await request(b, 'PATCH', `/contacts/${b.contactId}/notes/${note.id}`, { text: 'de B' })).status, 404);

    const stored = await ContactNote.findById(note.id).lean();
    assert.equal(stored.text, `${a.marker} nota privada`);
    assert.equal(await ContactNote.countDocuments({ contactId: a.contactId, text: 'de B' }), 0);
});

test('la nota de un contacto no se cambia por la URL de otro contacto de la cuenta', async () => {
    const note = (await addNote(a, a.contactId, 'del contacto')).body;
    const elsewhere = await request(a, 'PATCH', `/contacts/${a.loneContactId}/notes/${note.id}`, { text: 'cambiada' });
    assert.equal(elsewhere.status, 404);
    assert.equal((await ContactNote.findById(note.id).lean()).text, 'del contacto');
});

test('cada uno cambia las suyas; owner y admin, cualquiera; nadie más', async () => {
    const ownerNote = (await addNote(a, a.contactId, 'del owner')).body;
    const agentNote = (await addNote(agent, a.contactId, 'del agente')).body;

    const notYours = await request(agent, 'PATCH', `/contacts/${a.contactId}/notes/${ownerNote.id}`, { text: 'pisada' });
    assert.equal(notYours.status, 403);
    assert.equal(notYours.body[0].code, 'note_not_yours');
    assert.equal((await request(agent, 'DELETE', `/contacts/${a.contactId}/notes/${ownerNote.id}`)).status, 403);
    assert.equal((await request(otherAgent, 'PATCH', `/contacts/${a.contactId}/notes/${agentNote.id}`, { text: 'pisada' })).status, 403);
    assert.equal((await request(supervisor, 'PATCH', `/contacts/${a.contactId}/notes/${agentNote.id}`, { text: 'pisada' })).status, 403);
    assert.equal((await ContactNote.findById(ownerNote.id).lean()).text, 'del owner');

    // El agente ve que no puede.
    const seen = (await notesOf(agent, a.contactId)).find(note => note.id === ownerNote.id);
    assert.equal(seen.canEdit, false);

    const edited = await request(agent, 'PATCH', `/contacts/${a.contactId}/notes/${agentNote.id}`, { text: 'del agente, corregida' });
    assert.equal(edited.status, 200, edited.text);
    assert.equal(edited.body.text, 'del agente, corregida');
    assert.ok(edited.body.editedAt);

    assert.equal((await request(admin, 'DELETE', `/contacts/${a.contactId}/notes/${agentNote.id}`)).status, 204);
    assert.equal(await ContactNote.exists({ _id: agentNote.id }), null);
});

test('una nota vacía o demasiado larga no se guarda', async () => {
    assert.equal((await addNote(a, a.contactId, '  \n ')).status, 400);
    assert.equal((await addNote(a, a.contactId, 'x'.repeat(1001))).status, 400);
});

test('un contacto con 500 notas no admite otra', async () => {
    await ContactNote.insertMany(Array.from({ length: 500 }, (_, i) => ({
        userId: a.accountId, contactId: a.loneContactId, text: `nota ${i}`, source: 'manual',
    })));
    const full = await addNote(a, a.loneContactId, 'la 501');
    assert.equal(full.status, 409);
    assert.equal(full.body[0].code, 'notes_limit');
    await ContactNote.deleteMany({ contactId: a.loneContactId });
});

// La transición se cerró (2026-10-30): `PATCH /contacts/:id` ya no mira `notes`
// (antes, si cambiaba, daba 400 `notes_moved`). Lo descarta y guarda lo demás.
test('PATCH /contacts/:id descarta notes: guarda lo demás y no toca las notas', async () => {
    const before = await ContactNote.countDocuments({ contactId: a.contactId });
    const res = await request(a, 'PATCH', `/contacts/${a.contactId}`, { name: 'Nombre nuevo', notes: 'distinta' });
    assert.equal(res.status, 200, res.text);
    const contact = await Contact.findById(a.contactId).lean();
    assert.equal(contact.name, 'Nombre nuevo');
    assert.equal(contact.notes, undefined);
    assert.equal(await ContactNote.countDocuments({ contactId: a.contactId }), before);
});

test('la nota de antes (sin autor) solo la borran owner y admin, y borrada no vuelve', async () => {
    const legacy = await ContactNote.create({ userId: a.accountId, contactId: a.contactId, text: 'la de antes', source: 'legacy' });
    assert.equal((await notesOf(a, a.contactId)).filter(note => note.source === 'legacy').length, 1);
    assert.equal((await request(agent, 'DELETE', `/contacts/${a.contactId}/notes/${legacy._id}`)).status, 403);
    assert.equal((await request(a, 'DELETE', `/contacts/${a.contactId}/notes/${legacy._id}`)).status, 204);
    assert.equal((await notesOf(a, a.contactId)).some(note => note.source === 'legacy'), false);
});

test('crear un contacto con notas deja la primera nota a nombre de quien lo crea', async () => {
    const created = await request(agent, 'POST', '/contacts', { phone: '593990005551', notes: 'Viene por recomendación' });
    assert.equal(created.status, 201, created.text);
    const [first] = await notesOf(agent, created.body.id);
    assert.equal(first.text, 'Viene por recomendación');
    assert.equal(first.author.id, agent.userId);
    assert.equal((await Contact.findById(created.body.id).lean()).notes ?? null, null);
});

test('borrar un contacto borra sus notas', async () => {
    await addNote(a, a.loneContactId, 'se va con él');
    assert.equal((await request(a, 'DELETE', `/contacts/${a.loneContactId}`)).status, 204);
    assert.equal(await ContactNote.countDocuments({ contactId: a.loneContactId }), 0);
});

test('una nota nueva llega por SSE al equipo de A y no a B', async () => {
    const streamA = await openStream(agent);
    const streamB = await openStream(b);
    try {
        assert.equal((await addNote(a, a.contactId, 'en vivo')).status, 201);
        assert.ok(await streamA.waitFor(`"id":"${a.contactId}"`, 2000), 'el agente de A no se enteró');
        assert.equal(await streamB.waitFor('contact_updated', 300), false, 'B recibió un cambio de A');
    } finally {
        await streamA.close();
        await streamB.close();
    }
});

test('la nota dice si su autor ya no está en la cuenta y quién la editó', async () => {
    const leaving = await seedMember(a, { role: 'agent', label: 'A-se-va' });
    const note = (await addNote(leaving, a.contactId, 'antes de irme')).body;
    assert.equal(note.author.active, true);
    await User.updateOne({ _id: leaving.userId }, { $set: { status: 'inactive' } });

    const edited = await request(admin, 'PATCH', `/contacts/${a.contactId}/notes/${note.id}`, { text: 'corregida por el admin' });
    assert.equal(edited.status, 200, edited.text);
    assert.deepEqual(edited.body.editedBy, { id: admin.userId, name: 'A-admin miembro' });
    assert.equal(edited.body.author.active, false);

    const listed = (await notesOf(a, a.contactId)).find(item => item.id === note.id);
    assert.equal(listed.author.active, false);
    assert.equal(listed.author.name, 'A-se-va miembro');
    assert.equal(listed.editedBy.name, 'A-admin miembro');
});
