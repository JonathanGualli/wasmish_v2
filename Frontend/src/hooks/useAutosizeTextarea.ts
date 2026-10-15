import { useEffect, type RefObject } from "react";

/**
 * Un `<textarea>` que crece con lo escrito hasta `maxHeight` px y, de ahí en
 * adelante, hace scroll. El alto mínimo lo pone su clase (`min-h-…`).
 *
 * También al cambiar de ancho: montado estrecho (mientras se reparte la fila
 * del teléfono), el texto de ejemplo ocupaba varias líneas, Chrome las cuenta
 * en `scrollHeight`, y el campo vacío se quedaba alto hasta escribir.
 */
export const useAutosizeTextarea = (ref: RefObject<HTMLTextAreaElement | null>, value: string, maxHeight: number) => {
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const fit = () => {
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
            el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
        };
        fit();
        let width = el.clientWidth;
        const observer = new ResizeObserver(() => {
            if (el.clientWidth === width) return;
            width = el.clientWidth;
            fit();
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [ref, value, maxHeight]);
};
