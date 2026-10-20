// Coexistencia: un número que sigue en la app de WhatsApp Business. Lo que el
// negocio responde desde la app llega como eco (`smb_message_echoes`), y Meta
// avisa cuando retira el acceso (`account_update` con `PARTNER_REMOVED`).
// Spec: docs/superpowers/specs/2026-10-16-coexistencia-design.md.

import { describeInboundMessage } from './inbound.message.js';
import { isMessageChange } from './message.change.js';

/**
 * A quién va un eco: `{ phone, waUserId }`, como la identidad de un entrante.
 * `phone` es el teléfono solo con dígitos (`to`) y `waUserId`, su BSUID
 * (`to_user_id`). Meta **omite `to`** si la persona tiene nombre de usuario y no
 * puede compartir su teléfono: antes ese eco se descartaba en silencio, y con
 * solo el teléfono el eco no reconocía al contacto que solo tenía BSUID
 * (2026-10-19).
 */
export const describeEchoRecipient = (echoData) => {
    // Un `to` con letras no es un teléfono (p. ej. un BSUID): quitarle las
    // letras inventaría un número (diagnóstico de Codex, 2026-10-19).
    const rawTo = String(echoData?.to ?? '').trim();
    const phone = /^\+?[\d\s().-]+$/.test(rawTo) ? rawTo.replace(/\D/g, '') || null : null;
    const waUserId = typeof echoData?.to_user_id === 'string' ? echoData.to_user_id.trim() || null : null;
    return { phone, waUserId };
};

/**
 * Un eco listo para guardar, o null si se descarta: sin `id` o sin destinatario
 * (`describeEchoRecipient`), un borrado o una edición (los aplica
 * `applyMessageChange` sobre el original), o anterior a la conexión de la línea
 * (`connectedAt`: un número que pasó a otra cuenta no recibe ahí ecos viejos de
 * la anterior). `timestamp` es la hora del webhook según Meta, la mejor que da.
 */
export const describeEcho = (echoData, { connectedAt = null } = {}) => {
    if (!echoData?.id || isMessageChange(echoData)) return null;
    const { phone: toPhone, waUserId: toUserId } = describeEchoRecipient(echoData);
    if (!toPhone && !toUserId) return null;

    const seconds = Number.parseInt(echoData.timestamp, 10);
    const timestamp = Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
    // En segundos, que es lo que da Meta: `connectedAt` tiene milisegundos, y un
    // eco del mismo segundo de la conexión se conserva (ese segundo es ambiguo,
    // y un número no pasa de una cuenta a otra en un segundo).
    if (connectedAt && Math.floor(timestamp.getTime() / 1000) < Math.floor(new Date(connectedAt).getTime() / 1000)) return null;

    const entrante = describeInboundMessage(echoData);
    if (!entrante) return null;
    return { waMessageId: echoData.id, toPhone, toUserId, timestamp, entrante };
};

// El motivo que se guarda cuando Meta retira el acceso sin decir por qué (sin
// `disconnection_info`): así `Line.disconnectionReason` null queda solo para lo
// que se desconectó desde Wasmish, y la UI distingue las dos cosas.
export const UNKNOWN_DISCONNECTION_REASON = 'UNKNOWN';

/**
 * Meta retiró el acceso a un WABA (`account_update` con `PARTNER_REMOVED`):
 * `{ waBusinessId, reason, initiatedBy, at }`, o null si es otra cosa. El WABA
 * sale de `waba_info.waba_id` y nunca de `entry.id`, que en el ejemplo de Meta
 * es otro id. `reason` e `initiatedBy` solo llegan en la coexistencia
 * (`disconnection_info`); `at` es `entry.time` (segundos).
 */
export const parsePartnerRemoved = (entry, change) => {
    const value = change?.value;
    if (change?.field !== 'account_update' || value?.event !== 'PARTNER_REMOVED') return null;
    const waBusinessId = value.waba_info?.waba_id;
    if (!waBusinessId) return null;
    const seconds = Number.parseInt(entry?.time, 10);
    return {
        waBusinessId: String(waBusinessId),
        reason: value.disconnection_info?.reason ?? null,
        initiatedBy: value.disconnection_info?.initiated_by ?? null,
        at: Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date(),
    };
};

/**
 * Si el aviso de retirada es viejo: anterior (o del mismo segundo) a la última
 * conexión o renovación confirmada del WABA (`Waba.authorizedAt`). Ante la duda
 * se ignora: desconectar por error una conexión nueva es peor que un envío que
 * falla con el error de Meta. Un WABA sin `authorizedAt` (anterior al campo)
 * aplica el aviso.
 */
export const isStalePartnerRemoval = (at, authorizedAt) => {
    if (!authorizedAt) return false;
    return Math.floor(at.getTime() / 1000) <= Math.floor(new Date(authorizedAt).getTime() / 1000);
};
