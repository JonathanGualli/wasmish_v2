import { useEffect, type RefObject } from "react";

/**
 * Un `<textarea>` que crece con lo escrito hasta `maxHeight` px y, de ahí en
 * adelante, hace scroll. El alto mínimo lo pone su clase (`min-h-…`).
 */
export const useAutosizeTextarea = (ref: RefObject<HTMLTextAreaElement | null>, value: string, maxHeight: number) => {
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
        el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
    }, [ref, value, maxHeight]);
};
