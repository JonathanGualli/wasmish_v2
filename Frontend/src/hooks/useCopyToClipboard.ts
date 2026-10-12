import { useCallback, useEffect, useRef, useState } from "react";

/** Copiar al portapapeles, con `copied` en true un momento para decir «Copiado». */
export const useCopyToClipboard = (resetMs = 1600) => {
    const [copied, setCopied] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => () => clearTimeout(timer.current), []);

    const copy = useCallback(async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), resetMs);
        } catch {
            // Portapapeles no disponible (http o permiso denegado): no hay nada que hacer.
        }
    }, [resetMs]);

    return { copied, copy };
};
