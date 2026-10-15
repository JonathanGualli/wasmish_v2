import { useEffect, useRef } from "react";

/**
 * Una entrada en el historial mientras algo está abierto en el teléfono (un
 * chat, la ficha): «atrás» lo cierra (`onBack`) en vez de salir de la página.
 * Cerrarlo desde la app quita la entrada. `key` marca la entrada en
 * `history.state`; `popstate` solo cierra si se volvió a una sin esa marca.
 *
 * Se escribe sin el router, conservando su estado: para él sigue siendo la
 * misma página. Detalle y porqués en chat.md § Chats en el teléfono.
 */
export const useHistoryEntry = (open: boolean, key: string, onBack: () => void) => {
    const onBackRef = useRef(onBack);
    useEffect(() => {
        onBackRef.current = onBack;
    });

    useEffect(() => {
        if (!open) return;
        window.history.pushState({ ...window.history.state, [key]: true }, '');
        const onPopState = () => {
            if (!window.history.state?.[key]) onBackRef.current();
        };
        window.addEventListener('popstate', onPopState);
        return () => {
            window.removeEventListener('popstate', onPopState);
            // Se cerró desde la app (‹, Esc): la entrada sobra.
            if (window.history.state?.[key]) window.history.back();
        };
    }, [open, key]);
};
