import test from 'node:test';
import assert from 'node:assert/strict';

import {
    toTemplateFields,
    nextTemplatesCursor,
    templatesMissingFromSync,
    isTemplateSyncStale,
    TEMPLATE_FIELDS,
    TEMPLATES_MAX_PAGES,
    TEMPLATE_SYNC_MAX_AGE_MS,
} from '../src/utils/template.sync.js';

const base = { id: 'tpl-1', name: 'aviso', language: 'es', status: 'APPROVED', category: 'UTILITY' };

test('TEMPLATE_FIELDS pide todo lo que guarda Wasmish', () => {
    for (const field of ['id', 'components', 'parameter_format', 'quality_score', 'rejected_reason', 'last_updated_time']) {
        assert.ok(TEMPLATE_FIELDS.split(',').includes(field), field);
    }
});

test('toTemplateFields: lo de siempre (cuerpo, botones, formato y cabecera)', () => {
    const fields = toTemplateFields({
        ...base,
        parameter_format: 'POSITIONAL',
        components: [
            { type: 'HEADER', format: 'IMAGE' },
            { type: 'BODY', text: 'Hola' },
            { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Ver', url: 'https://x.test/{{1}}' }] },
        ],
    });
    assert.equal(fields.name, 'aviso');
    assert.equal(fields.language, 'es');
    assert.equal(fields.status, 'APPROVED');
    assert.equal(fields.category, 'UTILITY');
    assert.equal(fields.bodyText, 'Hola');
    assert.equal(fields.parameterFormat, 'POSITIONAL');
    assert.deepEqual(fields.header, { format: 'IMAGE', text: null });
    assert.deepEqual(fields.buttons, [{ type: 'URL', text: 'Ver', url: 'https://x.test/{{1}}' }]);
});

test('toTemplateFields: el pie y los ejemplos posicionales del cuerpo', () => {
    const fields = toTemplateFields({
        ...base,
        components: [
            { type: 'BODY', text: 'Hola {{1}}, tu pedido {{2}}', example: { body_text: [['Ana', '123']] } },
            { type: 'FOOTER', text: 'Responde BAJA' },
        ],
    });
    assert.equal(fields.footerText, 'Responde BAJA');
    assert.deepEqual(fields.bodyExamples, [{ key: '1', example: 'Ana' }, { key: '2', example: '123' }]);
});

test('toTemplateFields: los ejemplos con nombre', () => {
    const fields = toTemplateFields({
        ...base,
        parameter_format: 'NAMED',
        components: [{
            type: 'BODY', text: 'Hola {{first_name}}',
            example: { body_text_named_params: [{ param_name: 'first_name', example: 'Ana' }] },
        }],
    });
    assert.deepEqual(fields.bodyExamples, [{ key: 'first_name', example: 'Ana' }]);
});

test('toTemplateFields: el ejemplo de la cabecera de texto, posicional y con nombre', () => {
    const positional = toTemplateFields({
        ...base,
        components: [{ type: 'HEADER', format: 'TEXT', text: 'Pedido {{1}}', example: { header_text: ['123'] } }],
    });
    assert.equal(positional.headerExample, '123');

    const named = toTemplateFields({
        ...base,
        components: [{
            type: 'HEADER', format: 'TEXT', text: 'Pedido {{order}}',
            example: { header_text_named_params: [{ param_name: 'order', example: 'A-9' }] },
        }],
    });
    assert.equal(named.headerExample, 'A-9');
});

test('toTemplateFields: sin pie ni ejemplos, todo vacío', () => {
    const fields = toTemplateFields({ ...base, components: [{ type: 'BODY', text: 'Hola' }] });
    assert.equal(fields.footerText, null);
    assert.deepEqual(fields.bodyExamples, []);
    assert.equal(fields.headerExample, null);
    assert.equal(fields.header, null);
    assert.deepEqual(fields.buttons, []);
});

test('toTemplateFields: sin components no revienta', () => {
    const fields = toTemplateFields(base);
    assert.equal(fields.bodyText, '');
    assert.equal(fields.footerText, null);
    assert.deepEqual(fields.bodyExamples, []);
});

test('toTemplateFields: calidad, motivo del rechazo y categorías', () => {
    const fields = toTemplateFields({
        ...base,
        status: 'REJECTED',
        quality_score: { score: 'GREEN', date: 1730000000 },
        rejected_reason: 'INVALID_FORMAT',
        previous_category: 'MARKETING',
        sub_category: 'ORDER_STATUS',
    });
    assert.equal(fields.qualityScore, 'GREEN');
    assert.equal(fields.rejectedReason, 'INVALID_FORMAT');
    assert.equal(fields.previousCategory, 'MARKETING');
    assert.equal(fields.subCategory, 'ORDER_STATUS');
});

test('toTemplateFields: sin calidad ni categorías extra, null', () => {
    const fields = toTemplateFields(base);
    assert.equal(fields.qualityScore, null);
    assert.equal(fields.rejectedReason, null);
    assert.equal(fields.previousCategory, null);
    assert.equal(fields.subCategory, null);
});

test('toTemplateFields: rejected_reason NONE es que no está rechazada', () => {
    assert.equal(toTemplateFields({ ...base, rejected_reason: 'NONE' }).rejectedReason, null);
});

test('toTemplateFields: last_updated_time de Meta como fecha', () => {
    const fields = toTemplateFields({ ...base, last_updated_time: '2026-11-01T10:00:00+0000' });
    assert.ok(fields.metaUpdatedAt instanceof Date);
    assert.equal(fields.metaUpdatedAt.toISOString(), '2026-11-01T10:00:00.000Z');
    assert.equal(toTemplateFields(base).metaUpdatedAt, null);
    assert.equal(toTemplateFields({ ...base, last_updated_time: 'ayer' }).metaUpdatedAt, null);
});

test('nextTemplatesCursor: con siguiente página, su cursor', () => {
    const body = { data: [], paging: { next: 'https://graph.test/next', cursors: { before: 'a', after: 'p2' } } };
    assert.deepEqual(nextTemplatesCursor(body, 1), { after: 'p2' });
});

test('nextTemplatesCursor: sin siguiente página, terminado y completo', () => {
    assert.deepEqual(nextTemplatesCursor({ data: [], paging: { cursors: { after: 'p2' } } }, 1), { done: true, complete: true });
    assert.deepEqual(nextTemplatesCursor({ data: [] }, 1), { done: true, complete: true });
});

test('nextTemplatesCursor: en el tope de páginas, terminado e incompleto', () => {
    const body = { paging: { next: 'https://graph.test/next', cursors: { after: 'pX' } } };
    assert.deepEqual(nextTemplatesCursor(body, TEMPLATES_MAX_PAGES), { done: true, complete: false });
    assert.deepEqual(nextTemplatesCursor(body, TEMPLATES_MAX_PAGES - 1), { after: 'pX' });
});

test('nextTemplatesCursor: con siguiente página pero sin cursor, incompleto', () => {
    assert.deepEqual(nextTemplatesCursor({ paging: { next: 'https://graph.test/next' } }, 1), { done: true, complete: false });
});

test('templatesMissingFromSync: las guardadas que no llegaron', () => {
    assert.deepEqual(templatesMissingFromSync(['a', 'b', 'c'], ['b']), ['a', 'c']);
    assert.deepEqual(templatesMissingFromSync([], ['a']), []);
    assert.deepEqual(templatesMissingFromSync(['a'], ['a']), []);
});

test('isTemplateSyncStale: nunca, o hace más de 10 minutos', () => {
    const now = new Date('2026-11-06T12:00:00Z');
    assert.equal(TEMPLATE_SYNC_MAX_AGE_MS, 10 * 60 * 1000);
    assert.equal(isTemplateSyncStale(null, now), true);
    assert.equal(isTemplateSyncStale(undefined, now), true);
    assert.equal(isTemplateSyncStale(new Date('2026-11-06T11:51:00Z'), now), false);
    assert.equal(isTemplateSyncStale(new Date('2026-11-06T11:49:00Z'), now), true);
});
