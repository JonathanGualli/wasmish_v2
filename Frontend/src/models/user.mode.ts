export interface User {
    id: string;
    email: string;
    name: string;
    tokenWhatsapp?: string;
    role: 'user' | 'admin';
    phoneNumberId?: string;
}