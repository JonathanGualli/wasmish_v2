import { z } from 'zod';

export const registerSchema = z.object(
    {
        name: z.string().min(3, 'Name must be at least 3 caracters long'),
        email: z.email(),
        password: z.string().min(6, 'Password must be at least 6 characters long'),
        rol: z.enum(['admin', 'agent']).default('admin'),
        status: z.enum(['active', 'inactive']).default('active'),
    }
);

export const loginSchema = z.object(
    {
        email: z.email(),
        password: z.string().min(6, 'Password must be at least 6 characters long'),
    }
);  