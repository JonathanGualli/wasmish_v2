// `migrate:notes` (notas del contacto con autor, 2026-10-17) contra Mongo:
// recorre TODAS las cuentas de la BD, así que vive en su propio archivo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import mongoose from 'mongoose';
import { seedAccount, mongoUri, Contact, ContactNote } from './helpers.js';

const { runNoteMigration, runNoteTextDrop } = await import('../../src/services/note.migration.service.js');

await ContactNote.init();

// `Contact.notes` ya no está en el modelo (Mongoose lo descartaría al
// escribir): el texto de antes va directo a la colección, como `createdAt`, que
// Mongoose no deja cambiar.
const oid = (id) => new mongoose.Types.ObjectId(String(id));
const setNotes = (contactId, fields) => Contact.collection.updateOne({ _id: oid(contactId) }, { $set: fields });
const notesOf = async (contactId) => (await Contact.collection.findOne({ _id: oid(contactId) })).notes;

const a = await seedAccount('A', { seq: 1 });
const createdAt = new Date('2026-03-04T05:06:07Z');
await setNotes(a.contactId, { notes: '  Paga a 30 días  ', createdAt });
await setNotes(a.loneContactId, { notes: '   ' });
const b = await seedAccount('B', { seq: 2 });
const c = await seedAccount('C', { seq: 3 });

const run = (...flags) => promisify(execFile)('node', ['scripts/migrate-notes.js', ...flags], {
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
    // Sin `--drop-text`, el texto de antes se queda.
    assert.equal(await notesOf(a.contactId), '  Paga a 30 días  ');
    assert.equal(await ContactNote.countDocuments({ contactId: a.loneContactId }), 0);
});

test('otra pasada no hace nada, y --check sale con 0', async () => {
    assert.deepEqual(await runNoteMigration({}), { pending: 0, migrated: 0 });
    assert.equal(await run('--check'), 0);
});

test('dos pasadas a la vez crean una sola nota de antes por contacto', async () => {
    await setNotes(b.contactId, { notes: 'de B' });
    await Promise.all([runNoteMigration({}), runNoteMigration({})]);
    assert.equal(await ContactNote.countDocuments({ contactId: b.contactId, source: 'legacy' }), 1);
    assert.equal(String((await ContactNote.findOne({ contactId: b.contactId }).lean()).userId), b.accountId);
});

// Cerrar la transición (2026-10-30): borrar `Contact.notes` solo donde ya no
// se pierde nada.
test('runNoteTextDrop borra el texto vacío y el ya pasado a la lista, y deja el que no lo está', async () => {
    await setNotes(c.contactId, { notes: 'de C, sin pasar' });
    assert.deepEqual(await runNoteTextDrop({ dryRun: true }), { dropped: 3, kept: 1 });
    assert.equal(await notesOf(a.contactId), '  Paga a 30 días  ', '--dry-run no escribe');

    assert.deepEqual(await runNoteTextDrop({}), { dropped: 3, kept: 1 });
    for (const id of [a.contactId, a.loneContactId, b.contactId]) assert.equal(await notesOf(id), undefined);
    assert.equal(await notesOf(c.contactId), 'de C, sin pasar', 'sin su nota en la lista, el texto se queda');
});

test('--drop-text pasa antes lo que falta y después borra: no queda ningún texto de antes', async () => {
    assert.equal(await run('--drop-text', '--dry-run'), 0);
    assert.equal(await notesOf(c.contactId), 'de C, sin pasar', '--dry-run no escribe');

    assert.equal(await run('--drop-text'), 0);
    assert.equal(await ContactNote.countDocuments({ contactId: c.contactId, source: 'legacy' }), 1);
    assert.equal(await Contact.collection.countDocuments({ notes: { $exists: true } }), 0);
    assert.equal(await run('--check'), 0);
});

test('una nota de antes que alguien borró no vuelve', async () => {
    // Con el texto ya borrado, la migración no tiene de dónde sacarla.
    await ContactNote.deleteMany({ contactId: a.contactId, source: 'legacy' });
    assert.deepEqual(await runNoteMigration({}), { pending: 0, migrated: 0 });
});
