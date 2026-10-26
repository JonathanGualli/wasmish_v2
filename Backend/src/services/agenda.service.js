// La agenda del celular de la app de WhatsApp Business: guardar lo que manda el
// webhook `smb_app_state_sync` (`AgendaEntry`) y copiar su nombre al contacto
// del mismo teléfono (`Contact.agendaName`).
//
// Cada lado escribe antes de buscar al otro: el webhook guarda la entrada y
// después la aplica; todo camino que crea un contacto lo crea y después la
// aplica. Así una agenda que llega mientras se crea el contacto nunca se pierde:
// uno de los dos la encuentra. Spec: docs/superpowers/specs/2026-10-23-historial-coexistencia-design.md (§ 7).

import AgendaEntry from '../models/agenda.entry.model.js';
import Contact from '../models/contact.model.js';
import { describeAgendaChange, agendaDisplayName } from '../utils/agenda.js';

/**
 * Guarda un cambio de la agenda, solo si es más nuevo que el guardado. Un upsert
 * condicionado a la hora: si ya hay uno igual o más nuevo, el filtro no casa, el
 * upsert intenta crear otro y el índice único lo frena (E11000).
 * @returns {Promise<boolean>} si se guardó.
 */
export const storeAgendaChange = async (accountId, change) => {
    try {
        await AgendaEntry.updateOne(
            { userId: accountId, phone: change.phone, syncedAt: { $lt: change.syncedAt } },
            { $set: { fullName: change.fullName, firstName: change.firstName, removed: change.removed, syncedAt: change.syncedAt } },
            { upsert: true },
        );
        return true;
    } catch (error) {
        if (error.code !== 11000) throw error;
        return false;
    }
};

// Lo que la entrada deja en el contacto, y la condición que impide que una
// entrada vieja pise una nueva.
const agendaUpdate = (entry) => ({
    filter: { userId: entry.userId, phone: entry.phone, $or: [{ agendaSyncedAt: null }, { agendaSyncedAt: { $lt: entry.syncedAt } }] },
    update: { $set: { agendaName: entry.removed ? null : agendaDisplayName(entry), agendaSyncedAt: entry.syncedAt } },
});

/**
 * Copia la entrada de la agenda de ese teléfono a su contacto, si los dos
 * existen. Idempotente: repetirlo con la misma entrada no cambia nada.
 * @returns {Promise<import('mongoose').Document|null>} el contacto, si cambió.
 */
export const applyAgendaName = async (accountId, phone) => {
    const entry = await AgendaEntry.findOne({ userId: accountId, phone }).lean();
    if (!entry) return null;
    const { filter, update } = agendaUpdate(entry);
    return Contact.findOneAndUpdate(filter, update, { new: true });
};

/**
 * Lo mismo para una tanda de teléfonos (la importación).
 * @returns {Promise<number>} cuántos contactos cambiaron.
 */
export const applyAgendaNames = async (accountId, phones) => {
    if (phones.length === 0) return 0;
    const entries = await AgendaEntry.find({ userId: accountId, phone: { $in: phones } }).lean();
    if (entries.length === 0) return 0;
    const result = await Contact.bulkWrite(entries.map(entry => ({ updateOne: agendaUpdate(entry) })), { ordered: false });
    return result.modifiedCount;
};

/**
 * Un webhook `smb_app_state_sync`: cada contacto de `value.state_sync[]` se
 * guarda y **después** se aplica. Lo mal formado se salta con un aviso (sin
 * nombres en el log) y el resto sigue. Un fallo de la BD tampoco corta el lote:
 * se cuenta, y `handleWebhook` responde 500 para que Meta lo reentregue, pero
 * avisa de lo que sí cambió (en la reentrega ya no cambiaría: revisión de Codex
 * del PR #131).
 * @returns {Promise<{ renamed: number, failed: number }>} cuántos contactos de
 *   Wasmish cambiaron de nombre y cuántos de la agenda no se pudieron guardar.
 */
export const storeAgendaSync = async (inbound, value) => {
    const items = Array.isArray(value?.state_sync) ? value.state_sync : [];
    const lineId = inbound.lineId ? String(inbound.lineId) : null;
    let malformed = 0;
    let renamed = 0;
    let failed = 0;
    for (const item of items) {
        const change = describeAgendaChange(item);
        if (!change) {
            malformed += 1;
            continue;
        }
        try {
            await storeAgendaChange(inbound.accountId, change);
            // Aunque no se guardara (una reentrega): lo guardado la otra vez pudo
            // quedarse sin aplicar si falló justo después.
            if (await applyAgendaName(inbound.accountId, change.phone)) renamed += 1;
        } catch (error) {
            failed += 1;
            console.error('Contacto de la agenda no guardado:', { lineId, error: error.message });
        }
    }
    if (malformed > 0) {
        console.warn('Contactos de la agenda mal formados; se saltan:', { lineId, contactos: malformed });
    }
    return { renamed, failed };
};
