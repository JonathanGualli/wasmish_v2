// Contactos y etiquetas: B no ve, edita ni borra los de A, y tampoco puede
// colarlos por el cuerpo (`tagIds`, una selección de contactos, `add`), que es
// donde más fácil se olvida el filtro por cuenta.
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { seedAccount, seedMember, request, openStream, assertNoLeak, assertHasOwn, Contact, Conversation, Message, Tag } from './helpers.js';

const a = await seedAccount('A', { seq: 1 });
const b = await seedAccount('B', { seq: 2 });

const contactOf = (id) => Contact.findById(id).lean();
const tagsOf = async (id) => (await contactOf(id)).tags.map(String);

test('GET /contacts: B no ve los contactos de A, tampoco buscando su número', async () => {
    assertNoLeak(await request(b, 'GET', '/contacts'), a);
    assertNoLeak(await request(b, 'GET', `/contacts?search=${a.phone}`), a);
    assertHasOwn(await request(a, 'GET', '/contacts'), a);
});

test('GET /contacts/:id: B no abre la ficha de un contacto de A', async () => {
    const asB = await request(b, 'GET', `/contacts/${a.contactId}`);
    assert.equal(asB.status, 404);
    assertNoLeak(asB, a);
    assertHasOwn(await request(a, 'GET', `/contacts/${a.contactId}`), a);
});

test('PATCH /contacts/:id: B no edita un contacto de A', async () => {
    const asB = await request(b, 'PATCH', `/contacts/${a.contactId}`, { name: 'cambiado por B' });
    assert.equal(asB.status, 404);
    assert.equal((await contactOf(a.contactId)).name, `${a.marker} contacto`);

    const asA = await request(a, 'PATCH', `/contacts/${a.contactId}`, { company: 'empresa de A' });
    assert.equal(asA.status, 200, asA.text);
});

test('DELETE /contacts/:id: B no borra un contacto de A', async () => {
    const asB = await request(b, 'DELETE', `/contacts/${a.loneContactId}`);
    assert.equal(asB.status, 404);
    assert.ok(await contactOf(a.loneContactId), 'el contacto de A desapareció');

    // Control: A pasa la comprobación de propiedad y lo borra.
    const asA = await request(a, 'DELETE', `/contacts/${a.loneContactId}`);
    assert.equal(asA.status, 204, asA.text);
});

test('POST y PATCH /contacts con una etiqueta de A: 400, B no la usa', async () => {
    const created = await request(b, 'POST', '/contacts', { phone: '593990000999', tagIds: [a.tagId] });
    assert.equal(created.status, 400, created.text);
    assert.equal(await Contact.countDocuments({ phone: '593990000999' }), 0);

    const patched = await request(b, 'PATCH', `/contacts/${b.contactId}`, { tagIds: [a.tagId] });
    assert.equal(patched.status, 400, patched.text);
    assert.deepEqual(await tagsOf(b.contactId), [b.tagId]);

    // Control: con la suya sí.
    const own = await request(b, 'PATCH', `/contacts/${b.contactId}`, { tagIds: [b.tagId] });
    assert.equal(own.status, 200, own.text);
});

test('POST /contacts/tags: B no etiqueta contactos de A ni usa sus etiquetas', async () => {
    // Los contactos de A, elegidos por id: no casan con nada.
    const byIds = await request(b, 'POST', '/contacts/tags', {
        selection: { mode: 'ids', contactIds: [a.contactId] }, remove: [a.tagId],
    });
    assert.equal(byIds.status, 200, byIds.text);
    assert.equal(byIds.body.matched, 0);
    assert.deepEqual(await tagsOf(a.contactId), [a.tagId]);

    // «Todos los que coinciden» son solo los de B.
    const byQuery = await request(b, 'POST', '/contacts/tags', {
        selection: { mode: 'query', search: '', filter: 'all' }, remove: [a.tagId],
    });
    assert.equal(byQuery.status, 200, byQuery.text);
    assert.equal(byQuery.body.matched, await Contact.countDocuments({ userId: b.accountId }));
    assert.deepEqual(await tagsOf(a.contactId), [a.tagId]);

    // Añadir una etiqueta de A: 400.
    const foreignTag = await request(b, 'POST', '/contacts/tags', {
        selection: { mode: 'ids', contactIds: [b.contactId] }, add: [a.tagId],
    });
    assert.equal(foreignTag.status, 400, foreignTag.text);

    // Control: A sí etiqueta los suyos.
    const asA = await request(a, 'POST', '/contacts/tags', {
        selection: { mode: 'ids', contactIds: [a.contactId] }, add: [a.tagId],
    });
    assert.equal(asA.body.matched, 1, asA.text);
});

test('POST /contacts/tags/summary: B no cuenta los contactos de A ni ve sus etiquetas', async () => {
    const byIds = await request(b, 'POST', '/contacts/tags/summary', { selection: { mode: 'ids', contactIds: [a.contactId] } });
    assert.equal(byIds.status, 200, byIds.text);
    assert.equal(byIds.body.total, 0);

    const byQuery = await request(b, 'POST', '/contacts/tags/summary', { selection: { mode: 'query', filter: 'all' } });
    assert.equal(byQuery.body.total, await Contact.countDocuments({ userId: b.accountId }));
    assertNoLeak(byQuery, a);

    const asA = await request(a, 'POST', '/contacts/tags/summary', { selection: { mode: 'ids', contactIds: [a.contactId] } });
    assert.equal(asA.body.total, 1, asA.text);
});

test('GET /tags: B no ve las etiquetas de A', async () => {
    assertNoLeak(await request(b, 'GET', '/tags'), a);
    assertHasOwn(await request(a, 'GET', '/tags'), a);
});

test('PATCH /tags/:id: B no renombra una etiqueta de A', async () => {
    const asB = await request(b, 'PATCH', `/tags/${a.tagId}`, { name: 'de B' });
    assert.equal(asB.status, 404);
    assert.equal((await Tag.findById(a.tagId).lean()).name, `${a.marker} etiqueta`);

    const asA = await request(a, 'PATCH', `/tags/${a.tagId}`, { name: `${a.marker} renombrada` });
    assert.equal(asA.status, 200, asA.text);
});

test('DELETE /tags/:id: B no borra una etiqueta de A ni se la quita a sus contactos', async () => {
    const asB = await request(b, 'DELETE', `/tags/${a.tagId}`);
    assert.equal(asB.status, 404);
    assert.ok(await Tag.findById(a.tagId).lean(), 'la etiqueta de A desapareció');
    assert.deepEqual(await tagsOf(a.contactId), [a.tagId]);

    const asA = await request(a, 'DELETE', `/tags/${a.tagId}`);
    assert.equal(asA.status, 200, asA.text);
});

// Regresión que vigila (Codex, PR #13): el índice por línea excluye las
// conversaciones sin `lineId` (las que nacen si la proyección de la línea
// falló), y dos entrantes a la vez de un contacto nuevo creaban dos.
// Y (Codex, PR #15): son una por contacto y NÚMERO, no por contacto.
test('dos conversaciones sin línea del mismo contacto y número chocan; de números distintos, no', async () => {
    await Conversation.init();
    const e = await seedAccount('E', { seq: 5 });   // su conversación sembrada no tiene línea y es del número 105
    await assert.rejects(
        Conversation.create({ userId: e.accountId, contactId: e.contactId, contactPhone: e.phone, phoneNumberId: '105' }),
        error => error.code === 11000,
    );
    await Conversation.create({ userId: e.accountId, contactId: e.contactId, contactPhone: e.phone, phoneNumberId: '7005' });
});

// Fase 2b de multi-línea: un contacto tiene una conversación por línea.
test('un contacto con dos conversaciones: la ficha las lista y la actividad suma las dos', async () => {
    const c = await seedAccount('C', { seq: 3 });
    const second = await Conversation.create({
        userId: c.accountId, contactId: c.contactId, contactPhone: c.phone, phoneNumberId: '7003',
        lineId: new mongoose.Types.ObjectId(), lastMessageAt: new Date(Date.now() + 60_000), lastInboundAt: new Date(),
    });
    await Message.create({
        conversationId: second._id, direction: 'inbound', sender: 'them', text: 'por la otra línea', timestamp: new Date(),
    });

    const res = await request(c, 'GET', `/contacts/${c.contactId}`);
    assert.equal(res.status, 200, res.text);
    assert.deepEqual(res.body.conversations.map(item => item.conversationId), [String(second._id), c.conversationId]);
    assert.equal(res.body.conversations[0].lineId, String(second.lineId));
    // Los campos sueltos son los de la más reciente (el front los lee hasta la 2c).
    assert.equal(res.body.conversationId, String(second._id));
    assert.ok(res.body.windowExpiresAt);
    assert.equal(res.body.activity.received, 2);
});

test('la lista no repite al contacto con dos conversaciones', async () => {
    const d = await seedAccount('D', { seq: 4 });
    await Conversation.create({
        userId: d.accountId, contactId: d.contactId, contactPhone: d.phone, phoneNumberId: '7004',
        lineId: new mongoose.Types.ObjectId(), lastMessageAt: new Date(Date.now() + 60_000),
    });

    const res = await request(d, 'GET', `/contacts?search=${d.phone}`);
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.contacts.length, 1);
    assert.equal(res.body.contacts[0].conversations.length, 2);
    // «Con conversación» lo sigue contando una vez.
    const withConversation = await request(d, 'GET', '/contacts?filter=with_conversation');
    assert.equal(withConversation.body.contacts.filter(item => item.id === d.contactId).length, 1);
});

// La conversación de otra cuenta que apunta a un contacto de A no debería
// existir; si existiera (un dato roto), la ficha de A no puede enseñarla.
test('las conversaciones de un contacto nunca traen las de otra cuenta', async () => {
    const intruder = await Conversation.create({
        userId: b.accountId, contactId: a.contactId, contactPhone: a.phone, phoneNumberId: '7002',
        lineId: new mongoose.Types.ObjectId(), lastMessage: `${b.marker} intrusa`,
    });

    const detail = await request(a, 'GET', `/contacts/${a.contactId}`);
    assert.equal(detail.status, 200, detail.text);
    assert.ok(!detail.body.conversations.some(item => item.conversationId === String(intruder._id)));
    const list = await request(a, 'GET', `/contacts?search=${a.phone}`);
    assert.ok(!list.text.includes(String(intruder._id)));
});

// Regresión que vigila (2026-10-17): con dos personas en la cuenta, lo que una
// cambiaba en un contacto o en las etiquetas no le llegaba a la otra hasta
// recargar, y el cuadro de notas de la otra podía pisar lo guardado. Los avisos
// van a toda la cuenta de A (también a un agente) y nunca a B.
const streamsOfAandB = async () => {
    const agentA = await seedMember(a, { role: 'agent', label: `A-agente-${Date.now()}` });
    return { streamA: await openStream(agentA), streamB: await openStream(b) };
};

test('editar un contacto de A avisa (contact_updated) al equipo de A y no a B', async () => {
    const { streamA, streamB } = await streamsOfAandB();
    try {
        const edited = await request(a, 'PATCH', `/contacts/${a.contactId}`, { company: 'empresa del owner' });
        assert.equal(edited.status, 200, edited.text);
        assert.ok(await streamA.waitFor(`"id":"${a.contactId}"`, 2000), 'el agente de A no se enteró');
        assert.ok(await streamA.waitFor('event: contact_updated', 0));
        assert.equal(await streamB.waitFor('contact_updated', 300), false, 'B recibió un cambio de A');
    } finally {
        await streamA.close();
        await streamB.close();
    }
});

test('etiquetar varios contactos de A avisa (contacts_updated) a A y no a B', async () => {
    const tag = await Tag.create({ userId: a.accountId, name: 'aviso en bloque', key: 'aviso en bloque' });
    const { streamA, streamB } = await streamsOfAandB();
    try {
        const tagged = await request(a, 'POST', '/contacts/tags', {
            selection: { mode: 'ids', contactIds: [a.contactId] }, add: [String(tag._id)],
        });
        assert.equal(tagged.body.modified, 1, tagged.text);
        assert.ok(await streamA.waitFor('event: contacts_updated', 2000), 'el agente de A no se enteró');
        assert.equal(await streamB.waitFor('contacts_updated', 300), false, 'B recibió un cambio de A');
    } finally {
        await streamA.close();
        await streamB.close();
    }
});

test('crear, renombrar y borrar una etiqueta de A avisa (tags_updated) a A y no a B', async () => {
    const { streamA, streamB } = await streamsOfAandB();
    try {
        const created = await request(a, 'POST', '/tags', { name: 'aviso de etiqueta' });
        assert.equal(created.status, 201, created.text);
        assert.equal((await request(a, 'PATCH', `/tags/${created.body.id}`, { name: 'aviso renombrado' })).status, 200);
        assert.equal((await request(a, 'DELETE', `/tags/${created.body.id}`)).status, 200);
        for (let i = 0; i < 100 && streamA.count('event: tags_updated') < 3; i++) await new Promise(r => setTimeout(r, 20));
        assert.equal(streamA.count('event: tags_updated'), 3, 'el agente de A no se enteró de los tres cambios');
        assert.equal(await streamB.waitFor('tags_updated', 300), false, 'B recibió un cambio de A');
    } finally {
        await streamA.close();
        await streamB.close();
    }
});
