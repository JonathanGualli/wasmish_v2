// El equipo de una cuenta (Fase 3 de multi-línea): las plazas del plan y lo que
// se puede cambiar de cada persona. Puro; lo usa `team.controller.js`.

export const INVITATION_TTL_DAYS = 7;

/** Los roles que se asignan al invitar o cambiar a alguien: el owner es uno, y no se elige. */
export const ASSIGNABLE_ROLES = ['admin', 'supervisor', 'agent'];

/** Las plazas ocupadas: las personas activas (el owner incluido) y las invitaciones pendientes. */
export const seatsUsed = ({ activeUsers, pendingInvitations }) => activeUsers + pendingInvitations;

/** Si cabe una persona más. Por encima del plan (porque se bajó) no cabe, pero nada se desactiva. */
export const hasFreeSeat = ({ activeUsers, pendingInvitations, maxUsers }) =>
    seatsUsed({ activeUsers, pendingInvitations }) < maxUsers;

export const invitationExpiresAt = (now = new Date()) =>
    new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

export const userLimitMessage = (maxUsers) =>
    `Tu plan permite ${maxUsers} ${maxUsers === 1 ? 'usuario' : 'usuarios'}. Desactiva a alguien o anula una invitación, o pide más usuarios.`;

/**
 * Lo que impide cambiar a una persona del equipo, o null. `actor` y `target`
 * son `{ id, role }`; `change`, `{ role?, lineIds?, status? }`.
 * - `owner_locked`: el owner no se cambia desde aquí (transferir la propiedad es otra cosa).
 * - `self_change`: nadie se cambia a sí mismo el rol ni el estado (se quedaría fuera).
 * - `invalid_role`: solo se asignan admin, supervisor y agente.
 */
export const memberChangeIssue = ({ actor, target, change }) => {
    if (target.role === 'owner') return 'owner_locked';
    if (String(actor.id) === String(target.id) && (change.role !== undefined || change.status !== undefined)) return 'self_change';
    if (change.role !== undefined && !ASSIGNABLE_ROLES.includes(change.role)) return 'invalid_role';
    return null;
};
