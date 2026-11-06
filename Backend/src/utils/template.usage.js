// El uso de una plantilla en Wasmish, en puro: lo que devuelve la agregación
// de sus mensajes salientes por estado (`getTemplateDetailController`) en el
// resumen que enseña el detalle.

/**
 * `groups` = `[{ status, count, lastAt }]`, uno por estado del mensaje. `sent`
 * es el total; `delivered` cuenta los entregados y los leídos (un leído se
 * entregó); `read`, los leídos; `failed`, los fallidos. `lastSentAt`, el más
 * reciente de todos.
 */
export const summarizeTemplateUsage = (groups) => {
    const usage = { sent: 0, delivered: 0, read: 0, failed: 0, lastSentAt: null };
    for (const { status, count, lastAt } of groups) {
        usage.sent += count;
        if (status === 'delivered' || status === 'read') usage.delivered += count;
        if (status === 'read') usage.read += count;
        if (status === 'failed') usage.failed += count;
        if (lastAt && (!usage.lastSentAt || lastAt > usage.lastSentAt)) usage.lastSentAt = lastAt;
    }
    return usage;
};
