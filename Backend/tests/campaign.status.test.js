import test from 'node:test';
import assert from 'node:assert/strict';

import { recipientSkipReason, shouldExcludeOptedOut, stoppingErrorMessage, buildCampaignStats } from '../src/utils/campaign.status.js';

// --- a quién no se le envía ----------------------------------------------------

test('un contacto normal se envía', () => {
    assert.equal(recipientSkipReason({ phone: '593991112223' }), null);
});

// Decisión de Jonathan (2026-10-04): por defecto se envía a los dados de baja,
// para que quede el rechazo de Meta registrado. Solo se omiten si se pide.
test('los dados de baja solo se omiten si se pidió excluirlos', () => {
    const optedOut = { phone: '593991112223', marketingOptOut: true };
    assert.equal(recipientSkipReason(optedOut), null);
    assert.equal(recipientSkipReason(optedOut, { excludeOptedOut: true }), 'opted_out');
});

// La baja es de publicidad: un aviso de utilidad le llega igual, y excluirlo
// le quitaría un mensaje que sí quiere.
test('la baja de publicidad solo excluye con plantillas de marketing', () => {
    assert.equal(shouldExcludeOptedOut({ category: 'MARKETING' }, true), true);
    assert.equal(shouldExcludeOptedOut({ category: 'MARKETING' }, false), false);
    assert.equal(shouldExcludeOptedOut({ category: 'UTILITY' }, true), false);
    assert.equal(shouldExcludeOptedOut(null, true), false);
});

test('borrado o sin identidad se omite', () => {
    assert.equal(recipientSkipReason(null), 'contact_deleted');
    assert.equal(recipientSkipReason({ phone: null, waUserId: null }), 'no_identity');
    assert.equal(recipientSkipReason({ waUserId: 'EC.1' }), null);
});

// --- errores que paran la campaña ------------------------------------------------

test('un error de cuenta o de plantilla para la campaña; uno del contacto no', () => {
    assert.ok(stoppingErrorMessage('190'));
    assert.ok(stoppingErrorMessage(132001));
    assert.equal(stoppingErrorMessage('131050'), null); // baja: es de ese contacto
    assert.equal(stoppingErrorMessage('131026'), null); // no entregable: de ese contacto
    assert.equal(stoppingErrorMessage(null), null);
});

// --- estadísticas ------------------------------------------------------------

test('las estadísticas suman la cola y los mensajes sin contar nada dos veces', () => {
    const stats = buildCampaignStats(
        { pending: 3, sending: 1, done: 10, failed: 1, skipped: 2, cancelled: 0, interrupted: 1 },
        { sent: 2, delivered: 3, read: 4, failed: 1 },
    );
    assert.deepEqual(stats, {
        total: 18,
        pending: 4,
        sent: 9,        // aceptados por Meta: sent + delivered + read
        delivered: 7,   // leído implica entregado
        read: 4,
        failed: 2,      // 1 rechazado por Meta + 1 que falló antes de llegar
        skipped: 2,
        cancelled: 0,
        interrupted: 1,
    });
});

test('una campaña sin datos da todo en cero', () => {
    assert.equal(buildCampaignStats().total, 0);
    assert.equal(buildCampaignStats(undefined, undefined).failed, 0);
});
