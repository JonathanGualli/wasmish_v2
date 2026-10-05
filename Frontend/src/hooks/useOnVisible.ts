import { useEffect, useRef } from "react";

/**
 * Llama a `onVisible` cuando el elemento del `ref` entra en pantalla: el
 * centinela al final de una lista con scroll infinito. Con `enabled` en false
 * no observa (mientras carga o cuando no hay más). Al volver a activarse
 * observa de nuevo, y si el centinela sigue a la vista avisa otra vez: una
 * página corta no deja la lista atascada.
 */
export const useOnVisible = <T extends Element>(onVisible: () => void, enabled: boolean) => {
    const ref = useRef<T>(null);
    const callback = useRef(onVisible);

    useEffect(() => {
        callback.current = onVisible;
    });

    useEffect(() => {
        const element = ref.current;
        if (!element || !enabled) return;
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) callback.current();
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [enabled]);

    return ref;
};
