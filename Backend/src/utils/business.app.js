// Coexistencia: un número que sigue en la app de WhatsApp Business. Lo que el
// negocio responde desde la app llega como eco (`smb_message_echoes`), y Meta
// avisa cuando retira el acceso (`account_update` con `PARTNER_REMOVED`).
// Spec: docs/superpowers/specs/2026-10-16-coexistencia-design.md.

import { describeInboundMessage } from './inbound.message.js';

// Ediciones y eliminaciones hechas desde la app: esta versión no las aplica.
export const ECHO_IGNORED_TYPES = ['edit', 'revoke'];

/**
 * Un eco listo para guardar, o null si se descarta: sin `id` o sin `to`, una
 * edición o eliminación, o anterior a la conexión de la línea (`connectedAt`:
 * un número que pasó a otra cuenta no recibe ahí ecos viejos de la anterior).
 * `toPhone` es el teléfono del cliente solo con dígitos: Meta no manda su BSUID.
 * `timestamp` es la hora del webhook según Meta, la mejor que da.
 */
export const describeEcho = (echoData, { connectedAt = null } = {}) => {
    if (!echoData?.id || ECHO_IGNORED_TYPES.includes(echoData.type)) return null;
    const toPhone = String(echoData.to ?? '').replace(/\D/g, '');
    if (!toPhone) return null;

    const seconds = Number.parseInt(echoData.timestamp, 10);
    const timestamp = Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
    if (connectedAt && timestamp < connectedAt) return null;

    const entrante = describeInboundMessage(echoData);
    if (!entrante) return null;
    return { waMessageId: echoData.id, toPhone, timestamp, entrante };
};
