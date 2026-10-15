import { useCallback, useSyncExternalStore } from "react";

/** Si se cumple una media query, y se actualiza al cambiar (girar el teléfono, cambiar el ancho). */
export const useMediaQuery = (query: string) => {
    const subscribe = useCallback((onChange: () => void) => {
        const list = window.matchMedia(query);
        list.addEventListener('change', onChange);
        return () => list.removeEventListener('change', onChange);
    }, [query]);
    return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
};

/** El teléfono: por debajo de `md` (768 px), donde la bandeja y el chat no caben a la vez. */
export const PHONE_QUERY = '(max-width: 767.98px)';
