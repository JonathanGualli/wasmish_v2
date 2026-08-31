export type UserRole = 'admin' | 'agent' | 'superadmin';
export interface User {
    id: string;
    email: string;
    name: string;
    rol: UserRole;
    whatsappConnected?: boolean;
    phoneNumberId?: string;
    waBusinessId?: string;
}