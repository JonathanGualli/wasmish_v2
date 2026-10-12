export type UserRole = 'admin' | 'agent' | 'superadmin';
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
}