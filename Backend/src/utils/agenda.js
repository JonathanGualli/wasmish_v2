// La agenda del celular de la app de WhatsApp Business: leer lo que manda Meta
// en el webhook `smb_app_state_sync`. Puro, sin BD.
// Spec: docs/superpowers/specs/2026-10-23-historial-coexistencia-design.md (§ 5 y 7).

import { normalizeWaPhone } from './history.sync.js';

const AGENDA_ACTIONS = ['add', 'remove'];

const cleanString = (value) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed.length > 0 ? trimmed : null;
};

/**
 * Un elemento de `value.state_sync[]`. `add` es «añadió o editó un contacto»;
 * `remove`, que lo borró de la agenda. `metadata.timestamp` va en segundos, como
 * número o como texto.
 * @returns {{ phone: string, fullName: string|null, firstName: string|null, removed: boolean, syncedAt: Date }|null}
 *   null si no es un contacto, o le falta un teléfono válido, la acción o la hora.
 */
export const describeAgendaChange = (item) => {
    if (item?.type !== 'contact' || !AGENDA_ACTIONS.includes(item.action)) return null;
    const phone = normalizeWaPhone(item.contact?.phone_number);
    const seconds = Number(item.metadata?.timestamp);
    if (!phone || item.metadata?.timestamp === '' || !Number.isFinite(seconds) || seconds <= 0) return null;

    return {
        phone,
        fullName: cleanString(item.contact?.full_name),
        firstName: cleanString(item.contact?.first_name),
        removed: item.action === 'remove',
        syncedAt: new Date(seconds * 1000),
    };
};

/** El nombre de la agenda que se copia al contacto: el completo o, si no hay, el de pila. */
export const agendaDisplayName = ({ fullName, firstName } = {}) => cleanString(fullName) ?? cleanString(firstName);
