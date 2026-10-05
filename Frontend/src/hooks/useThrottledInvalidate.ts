import { useEffect, useMemo } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";

/**
 * Invalida una query como mucho una vez cada `ms`: la primera llamada al
 * momento y, si llegan más mientras tanto, una sola al final del intervalo, así
 * el último cambio nunca se pierde.
 *
 * Una campaña dispara cientos de eventos SSE seguidos (unos 10 por segundo).
 * Sin esto, cada uno pedía la lista entera otra vez, y como invalidar cancela la
 * petición en curso, la lista podía no llegar a pintarse hasta el final.
 */
export const useThrottledInvalidate = (queryKey: QueryKey, ms = 1000) => {
    const queryClient = useQueryClient();
    // La clave llega como array nuevo en cada render: se compara por contenido.
    const keyHash = JSON.stringify(queryKey);

    const throttle = useMemo(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        let pending = false;
        const run = () => queryClient.invalidateQueries({ queryKey: JSON.parse(keyHash) });

        const tick = () => {
            if (pending) {
                pending = false;
                run();
                timer = setTimeout(tick, ms);
            } else {
                timer = null;
            }
        };

        return {
            invalidate: () => {
                if (timer) {
                    pending = true;
                    return;
                }
                run();
                timer = setTimeout(tick, ms);
            },
            cancel: () => {
                if (timer) clearTimeout(timer);
                timer = null;
                pending = false;
            },
        };
    }, [queryClient, keyHash, ms]);

    useEffect(() => throttle.cancel, [throttle]);

    return throttle.invalidate;
};
