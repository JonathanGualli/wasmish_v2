// `migrate:notes` (notas del contacto con autor, 2026-10-17) contra Mongo:
// recorre TODAS las cuentas de la BD, así que vive en su propio archivo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import mongoose from 'mongoose';
import { seedAccount, mongoUri, Contact, ContactNote } from './helpers.js';

const { runNoteMigration } = await import('../../src/services/note.migration.service.js');

await ContactNote.init();

const a = await seedAccount('A', { seq: 1 });
const createdAt = new Date('2026-03-04T05:06:07Z');
// Directo a la colección: Mongoose no deja cambiar `createdAt`.
await Contact.collection.updateOne({ _id: new mongoose.Types.ObjectId(a.contactId) }, { $set: { notes: '  Paga a 30 días  ', createdAt } });
await Contact.updateOne({ _id: a.loneContactId }, { $set: { notes: '   ' } });

const run = (flag) => promisify(execFile)('node', ['scripts/migrate-notes.js', ...(flag ? [flag] : [])], {
    cwd: new URL('../..', import.meta.url).pathname, env: { ...process.env, MONGO_URI: mongoUri },
}).then(() => 0, error => error.code);

test('--dry-run no escribe y --check sale con 1 mientras queda alguna', async () => {
    assert.deepEqual(await runNoteMigration({ dryRun: true }), { pending: 1, migrated: 0 });
    assert.equal(await ContactNote.countDocuments({ source: 'legacy' }), 0);
    assert.equal(await run('--check'), 1);
});

test('pasa la nota de antes a la lista: sin autor, recortada y con la fecha del contacto', async () => {
    assert.deepEqual(await runNoteMigration({}), { pending: 1, migrated: 1 });
    const [legacy] = await ContactNote.find({ contactId: a.contactId, source: 'legacy' }).lean();
    assert.equal(legacy.text, 'Paga a 30 días');
    assert.equal(legacy.authorId, null);
    assert.equal(String(legacy.userId), a.accountId);
    assert.equal(legacy.createdAt.toISOString(), createdAt.toISOString());
    // El texto de antes se queda, para poder volver a la versión anterior.
    assert.equal((await Contact.findById(a.contactId).lean()).notes, '  Paga a 30 días  ');
    assert.equal(await ContactNote.countDocuments({ contactId: a.loneContactId }), 0);
});

test('otra pasada no hace nada, y --check sale con 0', async () => {
    assert.deepEqual(await runNoteMigration({}), { pending: 0, migrated: 0 });
    assert.equal(await run('--check'), 0);
});

test('dos pasadas a la vez crean una sola nota de antes por contacto', async () => {
    const b = await seedAccount('B', { seq: 2 });
    await Contact.updateOne({ _id: b.contactId }, { $set: { notes: 'de B' } });
    await Promise.all([runNoteMigration({}), runNoteMigration({})]);
    assert.equal(await ContactNote.countDocuments({ contactId: b.contactId, source: 'legacy' }), 1);
    assert.equal(String((await ContactNote.findOne({ contactId: b.contactId }).lean()).userId), b.accountId);
});

test('una nota de antes que alguien borró no vuelve', async () => {
    // Borrarla vacía Contact.notes (contact.note.controller.js): la migración no la ve.
    await ContactNote.deleteMany({ contactId: a.contactId, source: 'legacy' });
    await Contact.updateOne({ _id: a.contactId }, { $set: { notes: null } });
    assert.deepEqual(await runNoteMigration({}), { pending: 0, migrated: 0 });
});
