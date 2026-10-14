import type { AccountRole } from "./user.mode";

/** Los roles que se asignan al invitar o cambiar a alguien: el owner es uno, y no se elige. */
export type AssignableRole = Exclude<AccountRole, 'owner'>;

/** Una persona de la cuenta (`GET /team`, Fase 3). */
export interface TeamMember {
    id: string;
    name: string;
    email: string;
    role: AccountRole;
    /** Sus líneas; vacío para owner y admin, que ven todas. */
    lineIds: string[];
    status: 'active' | 'inactive';
    createdAt: string;
}

/** Una invitación pendiente: ocupa plaza hasta que se acepta, se anula o caduca. */
export interface TeamInvitation {
    id: string;
    email: string;
    role: AssignableRole;
    lineIds: string[];
    expiresAt: string;
    createdAt: string;
    invitedByName: string | null;
}

export interface TeamResponse {
    members: TeamMember[];
    invitations: TeamInvitation[];
    maxUsers: number;
    /** Activas (el owner incluido) más invitaciones pendientes. */
    seatsUsed: number;
}

export interface InvitationInput {
    email: string;
    role: AssignableRole;
    lineIds: string[];
}

export interface MemberChange {
    role?: AssignableRole;
    lineIds?: string[];
    status?: 'active' | 'inactive';
}

/** Lo que enseña la página pública de aceptar (`GET /invitations/:token`). */
export interface InvitationInfo {
    email: string;
    accountName: string | null;
    role: AssignableRole;
    invitedByName: string | null;
    lineNames: string[];
    expiresAt: string;
}

/** El `code` de los errores del equipo (backend: `team.controller.js`). */
export const TEAM_ERROR = {
    emailTaken: 'email_taken',
    userLimit: 'user_limit',
    busy: 'team_busy',
    invitationBusy: 'invitation_busy',
    invalid: 'invitation_invalid',
    expired: 'invitation_expired',
} as const;
