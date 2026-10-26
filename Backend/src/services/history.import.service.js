// Importar una pieza del historial de la app de WhatsApp Business: su contacto,
// su conversación y sus mensajes. Lo llama el worker (`workers/history.worker.js`).
// Spec: docs/superpowers/specs/2026-10-23-historial-coexistencia-design.md (§ 6).

/**
 * Todavía vacío: lo llena el PR 3b del plan (tarea 6). Mientras tanto, las
 * piezas se marcan hechas sin crear nada; en producción no llega ninguna hasta
 * que se pida el historial (PR 5).
 * @returns {Promise<{ created: number, skipped: number }>}
 */
export const importHistoryPiece = async () => ({ created: 0, skipped: 0 });
