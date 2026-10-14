export type UserRole = 'admin' | 'agent' | 'superadmin';

/** El rol de la persona en su cuenta (Fase 3 de multi-línea). */
export type AccountRole = 'owner' | 'admin' | 'supervisor' | 'agent';

export interface SessionAccount {
    name: string | null;
    /** Personas activas de la cuenta: con una sola, la UI no enseña el rol ni quién respondió. */
    memberCount: number;
    /** El owner y los admins (solo nombre y rol): a quién pedirle más acceso. */
    managers: { name: string; role: AccountRole }[];
}

export interface User {
    id: string;
    email: string;
    name: string;
    rol: UserRole;
    // El operador de la plataforma (panel de administración). No es un rol de la cuenta.
    isSuperadmin?: boolean;
    whatsappConnected?: boolean;
    phoneNumberId?: string;
    waBusinessId?: string;
    /** Lo que dice el backend sobre su acceso; la UI decide con esto qué enseña (Fase 3). */
    role?: AccountRole;
    permissions?: string[];
    /** Las líneas a su alcance; `null` = todas. */
    lineIds?: string[] | null;
    account?: SessionAccount | null;
}
