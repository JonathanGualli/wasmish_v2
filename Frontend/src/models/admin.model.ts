import type { UserRole } from "./user.mode";

export interface AdminStats {
    totalClients: number;
    connectedClients: number;
    messages7d: number;
    failed7d: number;
}

export interface AdminClient {
    id: string;
    name: string;
    email: string;
    rol: UserRole;
    status: 'active' | 'inactive';
    whatsappConnected: boolean;
    waBusinessId: string | null;
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