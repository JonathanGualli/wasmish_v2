// Coexistencia: un mensaje que se borra o se edita después de enviado. Meta lo
// avisa con un mensaje de `type: 'revoke'` o `type: 'edit'` que apunta al
// original (`original_message_id`), tanto si lo hace el contacto (`messages`)
// como si lo hace el negocio desde la app (`smb_message_echoes`). No es un
// mensaje nuevo: `applyMessageChange` lo aplica sobre el original.
// Spec: docs/superpowers/specs/2026-10-19-mensajes-eliminados-editados-design.md.

import { describeInboundMessage } from './inbound.message.js';
import { serializeReactions, canReactTo, canReplyTo } from './message.actions.js';

// La vista previa de la bandeja cuando el último mensaje está eliminado.
export const DELETED_PREVIEW = 'Mensaje eliminado';

const CHANGE_TYPES = new Set(['revoke', 'edit']);

// Meta solo deja editar los textos y los pies de archivo.
const EDITABLE_TYPES = new Set(['text', 'image', 'video', 'document']);

const cleanId = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/**
 * Si el mensaje es un cambio (borrado o edición), con cualquier contenido. Es
 * lo que decide el camino: un cambio nunca llega a `describeInboundMessage` ni
 * crea un `Message`, aunque venga mal formado (revisión de Codex del spec, 2).
 */
export const isMessageChange = (messageData) => CHANGE_TYPES.has(messageData?.type);

// Lo que dice ahora un mensaje editado: `{ type, text, caption }`, o null si
// no es una edición válida. Se valida ANTES de describirlo: `describeInboundMessage`
// nunca devuelve vacío, y un contenido roto se habría guardado como «Mensaje no
// compatible» encima del texto bueno (revisión de Codex del spec, 3). El
// `context` que trae (`{ id: 'M0' }` en el ejemplo de Meta) no es una respuesta
// citada: no se lee.
const describeEditContent = (message) => {
    const type = message?.type;
    if (!EDITABLE_TYPES.has(type)) return null;
    if (type === 'text' && !cleanId(message.text?.body)) return null;
    const { text, caption } = describeInboundMessage(message);
    return { type, text, caption };
};

/**
 * Un cambio ya identificado (`isMessageChange`), listo para aplicar, o null si
 * viene mal formado: sin `id`, sin `original_message_id` o, en una edición, sin
 * un contenido válido.
 *
 * `timestamp` es la hora del webhook según Meta (no la del original); sin ella,
 * la de ahora. `content` solo en una edición.
 *
 * @returns {{ kind: 'revoke'|'edit', waMessageId: string, originalWaMessageId: string,
 *            timestamp: Date, content: { type: string, text: string, caption: string|null }|null }|null}
 */
export const describeMessageChange = (messageData) => {
    if (!isMessageChange(messageData)) return null;
    const kind = messageData.type;
    const body = messageData[kind];
    const waMessageId = cleanId(messageData.id);
    const originalWaMessageId = cleanId(body?.original_message_id);
    if (!waMessageId || !originalWaMessageId) return null;

    const content = kind === 'edit' ? describeEditContent(body.message) : null;
    if (kind === 'edit' && !content) return null;

    const seconds = Number.parseInt(messageData.timestamp, 10);
    const timestamp = Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
    return { kind, waMessageId, originalWaMessageId, timestamp, content };
};

const iso = (date) => (date ? new Date(date).toISOString() : null);

/**
 * Lo que la UI necesita del borrado y las ediciones de un mensaje. Lo usan la
 * lista del chat (`serializeMessage`) y `message_updated`: recargar da lo
 * mismo que se vio en vivo. `changeVersion` ordena los cambios de un mensaje
 * (la UI descarta uno más viejo que el que ya tiene).
 */
export const serializeMessageChange = (msg) => ({
    deletedAt: iso(msg.deletedAt),
    editedAt: iso(msg.editedAt),
    previousVersions: (msg.previousVersions ?? []).map(version => ({
        text: version.text,
        caption: version.caption ?? null,
        editedAt: iso(version.editedAt),
    })),
    changeVersion: msg.changeVersion ?? 0,
});

/**
 * Lo que lleva `message_updated`: un mensaje que cambió en su sitio (borrado,
 * editado, una reacción). `canReact` y `canReply` van también: un borrado quita
 * «Responder» en vivo (revisión de Codex del plan, 8).
 */
export const serializeMessageUpdate = (msg) => ({
    id: String(msg._id),
    conversationId: String(msg.conversationId),
    text: msg.text,
    caption: msg.caption ?? null,
    ...serializeMessageChange(msg),
    reactions: serializeReactions(msg),
    canReact: canReactTo(msg),
    canReply: canReplyTo(msg),
});
