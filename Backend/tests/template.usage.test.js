import test from 'node:test';
import assert from 'node:assert/strict';

import { summarizeTemplateUsage } from '../src/utils/template.usage.js';

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
