import type { User } from "../models/user.mode";

/*
 * Quién entró por última vez en este navegador, para abrir Wasmish al momento
 * mientras /verify comprueba la sesión. No da acceso a nada: la sesión es la
 * cookie httpOnly, y el backend decide con ella. Lo que se guarda es lo que
 * devuelve /verify, y se borra al cerrar sesión o cuando la sesión deja de
 * valer.
 *
 * El storage puede no estar (navegación privada estricta, cuota llena): es una
 * comodidad, así que ante cualquier fallo se sigue sin él.
 */
const KEY = 'wasmish:remembered-user';

export const loadRememberedUser = (): User | undefined => {
    try {
        const raw = localStorage.getItem(KEY);
        const user = raw ? JSON.parse(raw) as User : undefined;
        // Uno roto, o de una versión que guardaba otra cosa: como si no hubiera.
        return typeof user?.id === 'string' ? user : undefined;
    } catch {
        return undefined;
    }
};

export const rememberUser = (user: User) => {
    try {
        localStorage.setItem(KEY, JSON.stringify(user));
    } catch { /* sin storage: la próxima vez se espera a /verify */ }
};

export const forgetRememberedUser = () => {
    try {
        localStorage.removeItem(KEY);
    } catch { /* nada que borrar */ }
};
