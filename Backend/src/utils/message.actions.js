// Citas y reacciones: qué se puede citar o reaccionar, cómo se resume un
// mensaje en la bandeja y lo que ve la UI de las reacciones y de la cita.
// Spec: docs/superpowers/specs/2026-10-20-citas-reacciones-design.md.

import { messageSender } from './message.origin.js';

// Meta no deja reaccionar a un mensaje de más de 30 días.
export const REACTION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// Los de la barra de la UI. El backend acepta cualquier emoji (`isSingleEmoji`).
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// Un emoji puede ocupar varias unidades (tono de piel, familias, banderas):
// 16 cubre los habituales sin dejar pasar un texto.
const MAX_EMOJI_LENGTH = 16;
const EMOJI_PART = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;
const segmenter = new Intl.Segmenter('es', { granularity: 'grapheme' });

/** Un solo emoji (un grafema que lo es): 👍, 👍🏽, 👨‍👩‍👧, 🇪🇨 o 1️⃣. */
export const isSingleEmoji = (value) => {
    if (typeof value !== 'string' || value.length === 0 || value.length > MAX_EMOJI_LENGTH) return false;
    const graphemes = [...segmenter.segment(value)];
    return graphemes.length === 1 && EMOJI_PART.test(value);
};

// Lo que no se puede citar ni reaccionar: lo que nunca llegó a Meta (sin
// `waMessageId`), lo borrado y una reacción suelta.
const isActionable = (msg) => Boolean(msg?.waMessageId) && !msg.deletedAt && msg.type !== 'reaction';

/** Se puede responder citándolo (entrante o saliente). */
export const canReplyTo = (msg) => isActionable(msg);

/** Se puede reaccionar: solo a un mensaje del contacto de menos de 30 días (Meta). */
export const canReactTo = (msg, now = new Date()) =>
    isActionable(msg)
    && msg.direction === 'inbound'
    && now.getTime() - new Date(msg.timestamp).getTime() <= REACTION_MAX_AGE_MS;

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);

/**
 * Un mensaje en una línea y recortado, para la bandeja. `text` ya es el texto,
 * el pie o la etiqueta del archivo («Imagen»): nunca vacío.
 */
export const previewSnippet = (msg, max = 40) => truncate(String(msg?.text ?? '').replace(/\s+/g, ' ').trim(), max);

/** La vista previa de la bandeja con una reacción: del contacto (`them`) o nuestra (`me`). */
export const reactionPreview = ({ side, emoji, original }) =>
    `${side === 'me' ? 'Reaccionaste' : 'Reaccionó'} ${emoji} a: «${previewSnippet(original)}»`;

const iso = (date) => (date ? new Date(date).toISOString() : null);

/**
 * Las reacciones de un mensaje para la UI. Una quitada sale como null, salvo
 * la nuestra si falló: el contacto sigue viendo `previousEmoji`, y la UI tiene
 * que poder decirlo (revisión de Codex del plan, 6).
 */
export const serializeReactions = (msg) => {
    const them = msg?.reactions?.them;
    const me = msg?.reactions?.me;
    return {
        them: them?.emoji ? { emoji: them.emoji, at: iso(them.at) } : null,
        me: me && (me.emoji || me.status === 'failed')
            ? {
                emoji: me.emoji ?? null,
                previousEmoji: me.previousEmoji ?? null,
                at: iso(me.at),
                status: me.status ?? 'sent',
                errorCode: me.errorCode ?? null,
                errorDetail: me.errorDetail ?? null,
                sentBy: messageSender(me),
                origin: me.origin ?? null,
            }
            : null,
    };
};

/**
 * La cita de un mensaje para la UI: null si no responde a nada; `{ id: null }`
 * si Wasmish no tiene el original; si no, su resumen. Se lee al servir, así
 * una edición o un borrado posterior del original se ve.
 */
export const serializeQuoted = (replyTo, original) => {
    if (!replyTo) return null;
    if (!original) return { id: null };
    return {
        id: String(original._id),
        sender: original.sender,
        type: original.type || 'text',
        text: String(original.text ?? '').slice(0, 200),
        hasMedia: Boolean(original.mediaFile),
        deleted: Boolean(original.deletedAt),
    };
};
