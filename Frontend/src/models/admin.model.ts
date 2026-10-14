import type { UserRole } from "./user.mode";

export interface AdminStats {
    totalClients: number;
    connectedClients: number;
    messages7d: number;
    failed7d: number;
}

export interface AdminClient {
    id: string;
    /** La cuenta del cliente; `null` en un usuario sin migrar. */
    accountId: string | null;
    name: string;
    email: string;
    rol: UserRole;
    status: 'active' | 'inactive';
    whatsappConnected: boolean;
    waBusinessId: string | null;
    /** Cuántos WABA más tiene con líneas conectadas, además del de `waBusinessId`. */
    extraWabas: number;
    /** Líneas conectadas y máximo del plan. */
    lines: { active: number; max: number };
    /** Personas activas, invitaciones pendientes y máximo del plan (Fase 3). */
    users: { active: number; pending: number; max: number };
    conversations: number;
    messages: number;
    failed: number;
    lastActivityAt: string | null;
    createdAt: string;
}

export interface AdminClientsPage {
    clients: AdminClient[];
    totalCount: number;
    page: number;
    limit: number;
}