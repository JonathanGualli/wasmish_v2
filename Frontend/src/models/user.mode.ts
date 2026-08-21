export type UserRole = 'admin' | 'agent' | 'superadmin';
export interface User {
    id: string;
    email: string;
    name: string;
    rol: UserRole;
    tokenWhatsapp?: string;
    phoneNumberId?: string;
    waBusinessId?: string;
}