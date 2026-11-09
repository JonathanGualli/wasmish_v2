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

/**
 * El uso de todas las plantillas de una lista (exportar a Excel), con las
 * mismas reglas que el detalle, para que den las mismas cifras:
 * - un grupo con `templateId` es de esa plantilla, si su línea es del WABA de
 *   la plantilla;
 * - uno sin `templateId` (de antes del campo) es de **cada** plantilla con ese
 *   nombre en el WABA de su línea: dos idiomas con el mismo nombre suman
 *   juntos sus envíos viejos, como en el detalle.
 * Una línea que no está en `lineWabas` no cuenta.
 *
 * `groups` = `[{ templateId, templateName, lineId, status, count, lastAt }]`;
 * `templates` = `[{ templateId, name, waBusinessId }]`; `lineWabas` =
 * `Map<lineId, waBusinessId>`. Devuelve `{ [templateId]: uso }`, con todas las
 * plantillas de la lista (las sin envíos, en cero).
 */
export const attributeTemplateUsage = (groups, templates, lineWabas) => {
    const byTemplate = new Map(templates.map(template => [template.templateId, []]));
    const wabaOf = new Map(templates.map(template => [template.templateId, template.waBusinessId]));
    const byName = new Map();
    for (const { templateId, name, waBusinessId } of templates) {
        const key = `${waBusinessId}|${name}`;
        byName.set(key, [...(byName.get(key) ?? []), templateId]);
    }

    for (const group of groups) {
        const waBusinessId = lineWabas.get(String(group.lineId));
        if (!waBusinessId) continue;
        const owners = group.templateId
            ? (wabaOf.get(group.templateId) === waBusinessId ? [group.templateId] : [])
            : byName.get(`${waBusinessId}|${group.templateName}`) ?? [];
        for (const templateId of owners) byTemplate.get(templateId).push(group);
    }

    return Object.fromEntries([...byTemplate].map(([templateId, own]) => [templateId, summarizeTemplateUsage(own)]));
};
