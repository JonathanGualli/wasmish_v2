import test from 'node:test';
import assert from 'node:assert/strict';

import { attributeTemplateUsage, summarizeTemplateUsage } from '../src/utils/template.usage.js';

test('summarizeTemplateUsage: entregados cuenta también los leídos', () => {
    const usage = summarizeTemplateUsage([
        { status: 'sent', count: 2, lastAt: new Date('2026-11-01T10:00:00Z') },
        { status: 'delivered', count: 3, lastAt: new Date('2026-11-03T10:00:00Z') },
        { status: 'read', count: 4, lastAt: new Date('2026-11-02T10:00:00Z') },
        { status: 'failed', count: 1, lastAt: null },
    ]);
    assert.deepEqual(usage, {
        sent: 10, delivered: 7, read: 4, failed: 1, lastSentAt: new Date('2026-11-03T10:00:00Z'),
    });
});

test('summarizeTemplateUsage: sin envíos, todo en cero', () => {
    assert.deepEqual(summarizeTemplateUsage([]), { sent: 0, delivered: 0, read: 0, failed: 0, lastSentAt: null });
});

test('summarizeTemplateUsage: un estado desconocido cuenta como enviado y nada más', () => {
    const usage = summarizeTemplateUsage([{ status: 'otro', count: 2, lastAt: null }]);
    assert.deepEqual(usage, { sent: 2, delivered: 0, read: 0, failed: 0, lastSentAt: null });
});

// El uso de todas (exportar a Excel, spec § 4.1): las mismas reglas que el
// detalle, repartidas entre las plantillas de la lista.
const templates = [
    { templateId: 'T1', name: 'promo', waBusinessId: 'W1' },
    { templateId: 'T1EN', name: 'promo', waBusinessId: 'W1' },
    { templateId: 'T2', name: 'promo', waBusinessId: 'W2' },
    { templateId: 'T3', name: 'aviso', waBusinessId: 'W1' },
];
const lineWabas = new Map([['L1', 'W1'], ['L2', 'W2']]);
const group = (fields) => ({ templateId: null, templateName: 'promo', lineId: 'L1', status: 'sent', count: 1, lastAt: null, ...fields });
const zero = { sent: 0, delivered: 0, read: 0, failed: 0, lastSentAt: null };

test('attributeTemplateUsage: por templateId, a su plantilla', () => {
    const usage = attributeTemplateUsage([group({ templateId: 'T1', status: 'read', count: 2 })], templates, lineWabas);
    assert.equal(usage.T1.sent, 2);
    assert.equal(usage.T1.read, 2);
    assert.equal(usage.T1.delivered, 2);
    assert.deepEqual(usage.T1EN, zero);
});

test('attributeTemplateUsage: un templateId en una línea de otro WABA no cuenta', () => {
    const usage = attributeTemplateUsage([group({ templateId: 'T1', lineId: 'L2' })], templates, lineWabas);
    assert.deepEqual(usage.T1, zero);
    assert.deepEqual(usage.T2, zero);
});

test('attributeTemplateUsage: los viejos por nombre, solo en su WABA, y suman a cada idioma', () => {
    const inW1 = attributeTemplateUsage([group({ count: 3 })], templates, lineWabas);
    assert.equal(inW1.T1.sent, 3);
    assert.equal(inW1.T1EN.sent, 3);
    assert.deepEqual(inW1.T2, zero);
    assert.deepEqual(inW1.T3, zero);

    const inW2 = attributeTemplateUsage([group({ count: 3, lineId: 'L2' })], templates, lineWabas);
    assert.deepEqual(inW2.T1, zero);
    assert.deepEqual(inW2.T1EN, zero);
    assert.equal(inW2.T2.sent, 3);
});

test('attributeTemplateUsage: una línea que no está en el mapa no cuenta', () => {
    const usage = attributeTemplateUsage(
        [group({ lineId: 'L9' }), group({ templateId: 'T1', lineId: 'L9' })], templates, lineWabas,
    );
    for (const { templateId } of templates) assert.deepEqual(usage[templateId], zero);
});

test('attributeTemplateUsage: sin envíos, todas en cero', () => {
    const usage = attributeTemplateUsage([], templates, lineWabas);
    assert.deepEqual(Object.keys(usage).sort(), ['T1', 'T1EN', 'T2', 'T3']);
    assert.deepEqual(usage.T3, zero);
});

test('attributeTemplateUsage: el último envío es el más reciente de sus grupos, viejos y nuevos', () => {
    const usage = attributeTemplateUsage([
        group({ templateId: 'T1', status: 'delivered', lastAt: new Date('2026-11-02T10:00:00Z') }),
        group({ status: 'failed', lastAt: new Date('2026-11-05T10:00:00Z') }),
        group({ templateId: 'T1', status: 'sent', lastAt: new Date('2026-11-03T10:00:00Z') }),
    ], templates, lineWabas);
    assert.deepEqual(usage.T1, {
        sent: 3, delivered: 1, read: 0, failed: 1, lastSentAt: new Date('2026-11-05T10:00:00Z'),
    });
});
