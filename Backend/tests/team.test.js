import test from 'node:test';
import assert from 'node:assert/strict';
import {
    INVITATION_TTL_DAYS, hasFreeSeat, invitationExpiresAt, memberChangeIssue, seatsUsed, userLimitMessage,
} from '../src/utils/team.js';

test('seatsUsed: los activos (el owner incluido) más las invitaciones pendientes', () => {
    assert.equal(seatsUsed({ activeUsers: 3, pendingInvitations: 1 }), 4);
});

test('hasFreeSeat: 2 activos y 1 pendiente no caben en 3; sí en 4', () => {
    assert.equal(hasFreeSeat({ activeUsers: 2, pendingInvitations: 1, maxUsers: 3 }), false);
    assert.equal(hasFreeSeat({ activeUsers: 2, pendingInvitations: 1, maxUsers: 4 }), true);
    // Bajar el plan por debajo de lo que se usa no rompe nada: solo no hay plaza.
    assert.equal(hasFreeSeat({ activeUsers: 5, pendingInvitations: 0, maxUsers: 2 }), false);
});

test('invitationExpiresAt: a los 7 días', () => {
    const now = new Date('2026-10-14T12:00:00Z');
    assert.equal(INVITATION_TTL_DAYS, 7);
    assert.equal(invitationExpiresAt(now).toISOString(), '2026-10-21T12:00:00.000Z');
});

test('userLimitMessage: con el máximo del plan', () => {
    assert.equal(userLimitMessage(1), 'Tu plan permite 1 usuario. Desactiva a alguien o anula una invitación, o pide más usuarios.');
    assert.equal(userLimitMessage(5), 'Tu plan permite 5 usuarios. Desactiva a alguien o anula una invitación, o pide más usuarios.');
});

const owner = { id: 'o', role: 'owner' };
const admin = { id: 'a', role: 'admin' };
const agent = { id: 'g', role: 'agent' };

// Regresión que vigila (spec § 3.3): el admin gestiona el equipo «menos al owner».
test('memberChangeIssue: el owner no se cambia desde el equipo', () => {
    assert.equal(memberChangeIssue({ actor: admin, target: owner, change: { status: 'inactive' } }), 'owner_locked');
    assert.equal(memberChangeIssue({ actor: admin, target: owner, change: { lineIds: [] } }), 'owner_locked');
});

test('memberChangeIssue: nadie se cambia a sí mismo el rol ni el estado', () => {
    assert.equal(memberChangeIssue({ actor: admin, target: admin, change: { role: 'agent' } }), 'self_change');
    assert.equal(memberChangeIssue({ actor: admin, target: admin, change: { status: 'inactive' } }), 'self_change');
});

test('memberChangeIssue: solo se asignan admin, supervisor y agente', () => {
    assert.equal(memberChangeIssue({ actor: owner, target: agent, change: { role: 'owner' } }), 'invalid_role');
    assert.equal(memberChangeIssue({ actor: owner, target: agent, change: { role: 'superadmin' } }), 'invalid_role');
});

test('memberChangeIssue: lo normal, sin problema', () => {
    assert.equal(memberChangeIssue({ actor: owner, target: agent, change: { role: 'supervisor', lineIds: ['l1'] } }), null);
    assert.equal(memberChangeIssue({ actor: admin, target: agent, change: { status: 'inactive' } }), null);
    assert.equal(memberChangeIssue({ actor: owner, target: admin, change: { role: 'agent' } }), null);
});
