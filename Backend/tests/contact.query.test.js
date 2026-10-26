import test from 'node:test';
import assert from 'node:assert/strict';

import {
    pickContactFields, buildContactSearch, buildContactMatch, matchesContactSearch, escapeRegex, summarizeConversations,
} from '../src/utils/contact.query.js';

// Lo que pone WhatsApp no se edita a mano: aunque llegue en el body, se ignora.
test('solo pasan los campos editables', () => {
    const fields = pickContactFields({
        name: 'Ana', profileName: 'Hack', username: 'x', waUserId: 'EC.1',
        source: 'api', marketingOptOut: false, userId: 'otro',
    });

    assert.deepEqual(fields, { name: 'Ana' });
});

test('el texto vacío borra el campo y lo demás se recorta', () => {
    const fields = pickContactFields({ email: '', company: '  Ferretería X  ', name: '   ' });
    assert.deepEqual(fields, { email: null, company: 'Ferretería X', name: null });
});

// En un PATCH, lo que no viene no se toca: no puede aparecer como null.
test('los campos ausentes no aparecen', () => {
    assert.deepEqual(pickContactFields({ name: 'Ana' }), { name: 'Ana' });
    assert.deepEqual(pickContactFields(undefined), {});
});

test('sin búsqueda no hay condición', () => {
    assert.equal(buildContactSearch(''), null);
    assert.equal(buildContactSearch('   '), null);
    assert.equal(buildContactSearch(undefined), null);
});

// Regresión que vigila: sin escapar, «+593» es una expresión regular inválida
// (el + no repite nada) y la consulta entera revienta con un 500.
test('lo que escribe el usuario no se interpreta como expresión regular', () => {
    const search = buildContactSearch('a.b(c');
    const name = search.$or.find(c => c.name).name;

    assert.equal(name.test('a.b(c'), true);
    assert.equal(name.test('axb(c'), false);
    assert.doesNotThrow(() => buildContactSearch('+593 ('));
    assert.equal(escapeRegex('+1'), '\\+1');
});

// En pantalla se ve «+593 99 123 4567»; guardado está «593991234567».
test('el teléfono se busca solo por sus dígitos', () => {
    const search = buildContactSearch('+593 99 123');
    const phone = search.$or.find(c => c.phone).phone;

    assert.equal(phone.test('593991234567'), true);
});

test('sin dígitos no se busca por teléfono', () => {
    const search = buildContactSearch('ana');
    assert.equal(search.$or.some(c => c.phone), false);
});

test('«@usuario» busca el usuario sin la arroba', () => {
    const search = buildContactSearch('@ana.p');
    const username = search.$or.find(c => c.username).username;

    assert.equal(username.test('ana.p'), true);
});

// La lista de destinatarios de una campaña se filtra en memoria: tiene que
// encontrar lo mismo que la búsqueda de Contactos.
test('matchesContactSearch busca lo mismo que la consulta', () => {
    const contact = { name: 'Ana Pérez', username: 'ana.p', phone: '593991234567', company: null };

    assert.equal(matchesContactSearch(contact, 'pérez'), true);
    assert.equal(matchesContactSearch(contact, '@ana.p'), true);
    assert.equal(matchesContactSearch(contact, '+593 99 123'), true);
    assert.equal(matchesContactSearch(contact, 'luis'), false);
    assert.equal(matchesContactSearch(contact, '  '), true);
    assert.equal(matchesContactSearch({ username: 'sin.telefono' }, '099'), false);
});

test('la búsqueda también encuentra por el nombre de la agenda del celular', () => {
    assert.ok(buildContactSearch('pablo').$or.some(condition => condition.agendaName?.test('Pablo Morales')));
    assert.equal(matchesContactSearch({ agendaName: 'Pablo Morales', phone: '16505551234' }, 'morales'), true);
});

test('la selección filtra por la cuenta, la búsqueda y la baja de publicidad', () => {
    const match = buildContactMatch({ userId: 'u1', search: 'ana', filter: 'opted_out' });
    assert.equal(match.userId, 'u1');
    assert.equal(match.marketingOptOut, true);
    assert.ok(match.$or);
});

// «VIP y ESTÁNDAR» en el filtro es mandar a los dos grupos: con $all, una
// campaña a ambos segmentos se quedaría solo con quien tenga las dos.
test('varias etiquetas: basta con tener alguna', () => {
    const match = buildContactMatch({ userId: 'u1', tagIds: ['vip', 'estandar'] });
    assert.deepEqual(match.tags, { $in: ['vip', 'estandar'] });
});

test('sin etiquetas no se filtra por ellas', () => {
    assert.equal('tags' in buildContactMatch({ userId: 'u1' }), false);
    assert.equal('tags' in buildContactMatch({ userId: 'u1', tagIds: [] }), false);
});

test('summarizeConversations: sin conversaciones, latest null e items vacío', () => {
    assert.deepEqual(summarizeConversations([]), { latest: null, items: [] });
    assert.deepEqual(summarizeConversations(undefined), { latest: null, items: [] });
});

// Con varias líneas, un contacto tiene una conversación por línea: los campos
// sueltos del contacto (los que lee el front hasta la 2c) son los de la más reciente.
test('summarizeConversations: la más reciente primero y como latest', () => {
    const vieja = { _id: 'c1', lineId: 'l1', lastMessageAt: new Date('2026-10-10T10:00:00Z'), lastInboundAt: null };
    const nueva = {
        _id: 'c2', lineId: 'l2',
        lastMessageAt: new Date('2026-10-12T10:00:00Z'), lastInboundAt: new Date('2026-10-12T09:00:00Z'),
    };

    const { latest, items } = summarizeConversations([vieja, nueva]);

    assert.equal(latest, nueva);
    assert.deepEqual(items, [
        {
            conversationId: 'c2', lineId: 'l2',
            lastInteractionAt: '2026-10-12T10:00:00.000Z', windowExpiresAt: '2026-10-13T09:00:00.000Z',
        },
        { conversationId: 'c1', lineId: 'l1', lastInteractionAt: '2026-10-10T10:00:00.000Z', windowExpiresAt: null },
    ]);
});

test('summarizeConversations: una conversación sin línea todavía la deja en null', () => {
    const { items } = summarizeConversations([{ _id: 'c1', lastMessageAt: null }]);
    assert.deepEqual(items, [{ conversationId: 'c1', lineId: null, lastInteractionAt: null, windowExpiresAt: null }]);
});
