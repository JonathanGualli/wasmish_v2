import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import {
    NOTE_TEXT_MAX, canEditNote, serializeNote, cleanNoteText, importKeyFor, pickImportNote, legacyNoteFrom,
} from '../src/utils/contact.notes.js';

const ownerId = new mongoose.Types.ObjectId();
const agentId = new mongoose.Types.ObjectId();
const session = (userId, role) => ({ userId: String(userId), accountId: 'cuenta', role, name: 'Alguien' });
const note = (fields = {}) => ({
    _id: new mongoose.Types.ObjectId(), text: 'Paga a 30 días', authorId: agentId, authorName: 'Ana',
    source: 'manual', createdAt: new Date('2026-10-17T15:00:00Z'), editedAt: null, ...fields,
});

test('canEditNote: el autor sí; otro agente o un supervisor, no', () => {
    assert.equal(canEditNote(session(agentId, 'agent'), note()), true);
    assert.equal(canEditNote(session(new mongoose.Types.ObjectId(), 'agent'), note()), false);
    assert.equal(canEditNote(session(new mongoose.Types.ObjectId(), 'supervisor'), note()), false);
});

test('canEditNote: owner y admin, cualquiera', () => {
    assert.equal(canEditNote(session(ownerId, 'owner'), note()), true);
    assert.equal(canEditNote(session(new mongoose.Types.ObjectId(), 'admin'), note()), true);
});

test('canEditNote: la nota de antes (sin autor) solo owner y admin; la leída al vuelo, nadie', () => {
    const legacy = note({ authorId: null, authorName: null, source: 'legacy' });
    assert.equal(canEditNote(session(ownerId, 'owner'), legacy), true);
    assert.equal(canEditNote(session(agentId, 'agent'), legacy), false);
    assert.equal(canEditNote(session(ownerId, 'owner'), { ...legacy, _id: undefined, id: 'legacy' }), false);
});

test('canEditNote: sin persona en la sesión (API key), nunca', () => {
    assert.equal(canEditNote({ accountId: 'cuenta', role: 'owner' }, note()), false);
});

test('serializeNote: la forma de la API, con y sin autor', () => {
    const withAuthor = note();
    assert.deepEqual(serializeNote(withAuthor, session(agentId, 'agent')), {
        id: String(withAuthor._id), text: 'Paga a 30 días', author: { id: String(agentId), name: 'Ana' },
        source: 'manual', createdAt: '2026-10-17T15:00:00.000Z', editedAt: null, canEdit: true,
    });
    const legacy = note({ authorId: null, authorName: null, source: 'legacy', editedAt: new Date('2026-10-17T16:00:00Z') });
    const serialized = serializeNote(legacy, session(agentId, 'agent'));
    assert.equal(serialized.author, null);
    assert.equal(serialized.editedAt, '2026-10-17T16:00:00.000Z');
    assert.equal(serialized.canEdit, false);
});

test('cleanNoteText: recorta; vacía o de más de 1000, inválida', () => {
    assert.equal(cleanNoteText('  hola  '), 'hola');
    assert.equal(cleanNoteText(' \n '), null);
    assert.equal(cleanNoteText(null), null);
    assert.equal(cleanNoteText('x'.repeat(NOTE_TEXT_MAX)), 'x'.repeat(NOTE_TEXT_MAX));
    assert.equal(cleanNoteText('x'.repeat(NOTE_TEXT_MAX + 1)), null);
});

test('pickImportNote: vacía o ya escrita (sin mirar espacios ni mayúsculas), null; nueva, el texto', () => {
    assert.equal(importKeyFor('  Paga A 30 '), 'paga a 30');
    assert.equal(pickImportNote('', []), null);
    assert.equal(pickImportNote('Paga a 30 días', ['paga a 30 DÍAS ']), null);
    assert.equal(pickImportNote(' Paga a 30 días ', []), 'Paga a 30 días');
});

test('legacyNoteFrom: la nota de antes, leída al vuelo de Contact.notes', () => {
    const createdAt = new Date('2026-01-02T00:00:00Z');
    assert.equal(legacyNoteFrom({ notes: '  ', createdAt }), null);
    assert.equal(legacyNoteFrom({ notes: null, createdAt }), null);
    assert.deepEqual(legacyNoteFrom({ notes: ' vieja ', createdAt }), {
        id: 'legacy', text: 'vieja', authorId: null, authorName: null, source: 'legacy', createdAt, editedAt: null,
    });
});
