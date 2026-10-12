import type { AxiosError } from 'axios';

/** Un error de la API: el primero de la lista `[{ message, code }]` que devuelve el backend. */
export interface ApiError {
    message: string;
    /** El nuestro (p. ej. `line_busy`); `null` si el backend no lo da. */
    code: string | null;
}

const FALLBACK = 'Ha ocurrido un error, inténtalo de nuevo más tarde.';

export const apiErrorOf = (error: unknown, fallback = FALLBACK): ApiError => {
    const data = (error as AxiosError<{ message?: string; code?: string | null }[]>)?.response?.data;
    const first = Array.isArray(data) ? data[0] : null;
    return { message: first?.message ?? fallback, code: first?.code ?? null };
};
