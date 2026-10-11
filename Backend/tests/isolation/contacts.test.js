// Contactos y etiquetas: B no ve, edita ni borra los de A, y tampoco puede
// colarlos por el cuerpo (`tagIds`, una selección de contactos, `add`), que es
// donde más fácil se olvida el filtro por cuenta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seedAccount, request, assertNoLeak, assertHasOwn, Contact, Tag } from './helpers.js';

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

    const asA = await request(a, 'PATCH', `/contacts/${a.contactId}`, { notes: 'nota de A' });
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
    assert.equal(byQuery.body.matched, await Contact.countDocuments({ userId: b.userId }));
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
    assert.equal(byQuery.body.total, await Contact.countDocuments({ userId: b.userId }));
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
