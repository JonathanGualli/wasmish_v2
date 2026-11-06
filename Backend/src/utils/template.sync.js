// La sincronización de plantillas con Meta, en puro: qué se pide, cómo se pasa
// cada plantilla a los campos de `Template`, cuándo hay otra página, qué
// plantillas dejaron de llegar y cuándo toca volver a sincronizar. La usa
// `syncTemplatesForWaba` (controllers/template.controller.js).
//
// Meta pagina `GET /{waba}/message_templates`: antes de esto solo se leía la
// primera página, y una cuenta con más plantillas no veía las demás.

import { extractTemplateHeader } from './template.header.js';

/** Los campos que se piden a Meta de cada plantilla. */
export const TEMPLATE_FIELDS = [
    'id', 'name', 'language', 'status', 'category', 'components', 'parameter_format',
    'quality_score', 'rejected_reason', 'previous_category', 'sub_category', 'last_updated_time',
].join(',');

/** Plantillas por página. */
export const TEMPLATES_PAGE_LIMIT = 100;

/**
 * Páginas como mucho en un sync: una respuesta rara de Meta (un cursor que no
 * avanza) no lo deja dando vueltas. Llegar al tope cuenta como incompleto.
 */
export const TEMPLATES_MAX_PAGES = 20;

/** Más que esto desde el último sync completo y la página Plantillas vuelve a sincronizar. */
export const TEMPLATE_SYNC_MAX_AGE_MS = 10 * 60 * 1000;

const componentOf = (components, type) => components.find(c => c?.type === type);

// Los ejemplos de las variables, en una forma común: `[{ key, example }]`, con
// `key` = '1', '2'… (posicionales) o el nombre de la variable.
const bodyExamplesOf = (body) => {
    const named = body?.example?.body_text_named_params;
    if (Array.isArray(named)) {
        return named.map(p => ({ key: String(p?.param_name ?? ''), example: String(p?.example ?? '') }));
    }
    const positional = body?.example?.body_text?.[0];
    if (Array.isArray(positional)) {
        return positional.map((example, i) => ({ key: String(i + 1), example: String(example ?? '') }));
    }
    return [];
};

// La cabecera de texto solo admite una variable: su ejemplo, o null.
const headerExampleOf = (header) => {
    if (header?.format !== 'TEXT') return null;
    const named = header.example?.header_text_named_params?.[0]?.example;
    const positional = header.example?.header_text?.[0];
    const example = named ?? positional;
    return example == null ? null : String(example);
};

const dateOrNull = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Los campos de `Template` desde una plantilla tal como la devuelve Meta. El
 * BODY es lo que se renderiza en el chat; de la cabecera se guarda el formato,
 * para saber si al enviar hay que mandar un archivo.
 */
export const toTemplateFields = (tpl) => {
    const components = Array.isArray(tpl?.components) ? tpl.components : [];
    const body = componentOf(components, 'BODY');
    const header = componentOf(components, 'HEADER');
    const footer = componentOf(components, 'FOOTER');
    const buttons = componentOf(components, 'BUTTONS');
    // Meta dice 'NONE' en las que no están rechazadas.
    const rejectedReason = tpl?.rejected_reason && tpl.rejected_reason !== 'NONE' ? tpl.rejected_reason : null;

    return {
        name: tpl?.name,
        category: tpl?.category,
        status: tpl?.status,
        language: tpl?.language,
        bodyText: body?.text ?? '',
        buttons: buttons?.buttons ?? [],
        parameterFormat: tpl?.parameter_format,
        header: extractTemplateHeader(components),
        footerText: footer?.text ?? null,
        bodyExamples: bodyExamplesOf(body),
        headerExample: headerExampleOf(header),
        qualityScore: tpl?.quality_score?.score ?? null,
        rejectedReason,
        previousCategory: tpl?.previous_category ?? null,
        subCategory: tpl?.sub_category ?? null,
        metaUpdatedAt: dateOrNull(tpl?.last_updated_time),
    };
};

/**
 * Qué hacer tras leer una página (`pagesRead` la cuenta): `{ after }` para pedir
 * la siguiente, o `{ done, complete }`. Sin `paging.next` es la última; con
 * `next` pero sin cursor, o en el tope, se para sin saber si faltaba algo.
 */
export const nextTemplatesCursor = (body, pagesRead) => {
    if (!body?.paging?.next) return { done: true, complete: true };
    const after = body.paging.cursors?.after;
    if (!after || pagesRead >= TEMPLATES_MAX_PAGES) return { done: true, complete: false };
    return { after };
};

/** Los ids guardados que no llegaron en el sync. */
export const templatesMissingFromSync = (storedIds, fetchedIds) => {
    const fetched = new Set(fetchedIds.map(String));
    return storedIds.map(String).filter(id => !fetched.has(id));
};

/** Si hace falta volver a sincronizar: nunca se hizo, o fue hace más de 10 minutos. */
export const isTemplateSyncStale = (syncedAt, now) =>
    !syncedAt || now.getTime() - new Date(syncedAt).getTime() > TEMPLATE_SYNC_MAX_AGE_MS;
