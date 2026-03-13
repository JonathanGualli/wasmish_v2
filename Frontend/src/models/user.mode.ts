export interface User {
    id: string;
    email: string;
    name: string;
    role: 'user' | 'admin';
    tokenWhatsapp?: string;
    phoneNumberId?: string;
    waBusinessId?: string;
}