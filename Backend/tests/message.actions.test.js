import test from 'node:test';
import assert from 'node:assert/strict';

import {
    isSingleEmoji, canReactTo, canReplyTo, previewSnippet, reactionPreview,
    serializeReactions, serializeQuoted, REACTION_MAX_AGE_MS,
} from '../src/utils/message.actions.js';

const NOW = new Date('2026-10-20T12:00:00Z');
const daysAgo = (days) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

test('REACTION_MAX_AGE_MS son 30 días', () => {
    assert.equal(REACTION_MAX_AGE_MS, 30 * 24 * 60 * 60 * 1000);
});

test('isSingleEmoji: un emoji, aunque esté compuesto', () => {
    for (const emoji of ['👍', '❤️', '👍🏽', '👨‍👩‍👧', '🇪🇨', '1️⃣']) {
        assert.equal(isSingleEmoji(emoji), true, emoji);
    }
});

test('isSingleEmoji: vacío, texto o dos emojis, no', () => {
    for (const value of ['', 'a', '1', '👍👍', 'hola 👍', null, undefined, 5]) {
        assert.equal(isSingleEmoji(value), false, String(value));
    }
});

const entrante = (extra = {}) => ({
    direction: 'inbound', type: 'text', waMessageId: 'wamid.A', deletedAt: null, timestamp: daysAgo(1), ...extra,
});

test('canReactTo: solo a un entrante con wamid, sin borrar, de menos de 30 días', () => {
    assert.equal(canReactTo(entrante(), NOW), true);
    assert.equal(canReactTo(entrante({ timestamp: daysAgo(29) }), NOW), true);
    assert.equal(canReactTo(entrante({ timestamp: daysAgo(31) }), NOW), false);
    assert.equal(canReactTo(entrante({ direction: 'outbound' }), NOW), false);
    assert.equal(canReactTo(entrante({ waMessageId: null }), NOW), false);
    assert.equal(canReactTo(entrante({ deletedAt: daysAgo(0) }), NOW), false);
    assert.equal(canReactTo(entrante({ type: 'reaction' }), NOW), false);
});

test('canReplyTo: cualquier dirección con wamid, sin borrar y que no sea una reacción', () => {
    assert.equal(canReplyTo(entrante()), true);
    assert.equal(canReplyTo(entrante({ direction: 'outbound', timestamp: daysAgo(90) })), true);
    assert.equal(canReplyTo(entrante({ waMessageId: null })), false);
    assert.equal(canReplyTo(entrante({ deletedAt: daysAgo(0) })), false);
    assert.equal(canReplyTo(entrante({ type: 'reaction' })), false);
});

test('previewSnippet: una línea, recortada a 40 con «…»', () => {
    assert.equal(previewSnippet({ text: 'hola' }), 'hola');
    assert.equal(previewSnippet({ text: 'uno\n\ndos   tres' }), 'uno dos tres');
    assert.equal(
        previewSnippet({ text: 'Te paso la cotización de los volantes de mañana' }),
        'Te paso la cotización de los volantes de…',
    );
});

test('reactionPreview: del contacto y nuestra', () => {
    const original = { text: 'Te paso la cotización de los volantes de mañana' };
    assert.equal(
        reactionPreview({ side: 'them', emoji: '👍', original }),
        'Reaccionó 👍 a: «Te paso la cotización de los volantes de…»',
    );
    assert.equal(reactionPreview({ side: 'me', emoji: '❤️', original: { text: 'ok' } }), 'Reaccionaste ❤️ a: «ok»');
});

test('serializeReactions: sin el campo, o quitadas, salen null', () => {
    assert.deepEqual(serializeReactions({}), { them: null, me: null });
    assert.deepEqual(
        serializeReactions({ reactions: { them: { emoji: null, at: NOW, waMessageId: 'w' } } }),
        { them: null, me: null },
    );
});

test('serializeReactions: los dos lados, con quién puso la nuestra', () => {
    const at = new Date('2026-10-20T10:00:00Z');
    assert.deepEqual(serializeReactions({ reactions: {
        them: { emoji: '👍', at, waMessageId: 'w1' },
        me: {
            emoji: '❤️', previousEmoji: null, at, waMessageId: 'w2', status: 'sent', errorCode: null, errorDetail: null,
            sentBy: 'u1', sentByName: 'Ana', origin: 'chat',
        },
    } }), {
        them: { emoji: '👍', at: at.toISOString() },
        me: {
            emoji: '❤️', previousEmoji: null, at: at.toISOString(), status: 'sent', errorCode: null, errorDetail: null,
            sentBy: { id: 'u1', name: 'Ana' }, origin: 'chat',
        },
    });
});

// Si Meta rechaza quitar una reacción, la UI tiene que poder decirlo: el
// contacto sigue viendo la anterior (revisión de Codex del plan, 6).
test('serializeReactions: quitar la nuestra que falló sale entera', () => {
    const me = serializeReactions({ reactions: { me: {
        emoji: null, previousEmoji: '👍', at: NOW, waMessageId: 'w', status: 'failed', errorCode: '131009', errorDetail: 'x',
        sentBy: null, sentByName: null, origin: 'chat',
    } } }).me;
    assert.equal(me.emoji, null);
    assert.equal(me.previousEmoji, '👍');
    assert.equal(me.status, 'failed');
    assert.equal(me.errorCode, '131009');
});

test('serializeQuoted: sin cita, sin original y con original', () => {
    const replyTo = { waMessageId: 'wamid.Q', messageId: 'm1' };
    assert.equal(serializeQuoted(null, null), null);
    assert.equal(serializeQuoted(undefined, { _id: 'm1' }), null);
    assert.deepEqual(serializeQuoted(replyTo, null), { id: null });
    assert.deepEqual(
        serializeQuoted(replyTo, { _id: 'm1', sender: 'them', type: 'image', text: 'x'.repeat(300), mediaFile: 'a.jpg', deletedAt: null }),
        { id: 'm1', sender: 'them', type: 'image', text: 'x'.repeat(200), hasMedia: true, deleted: false },
    );
    assert.equal(serializeQuoted(replyTo, { _id: 'm1', sender: 'me', text: 'hola', deletedAt: NOW }).deleted, true);
});
