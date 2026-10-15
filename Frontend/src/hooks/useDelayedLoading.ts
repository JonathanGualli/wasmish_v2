import { useEffect, useRef, useState } from "react";

/** Si los datos llegan antes de esto, no hubo carga: no se enseña nada. */
export const SKELETON_DELAY_MS = 300;
/** Una vez visible, el skeleton se queda al menos esto, para que no parpadee. */
export const SKELETON_MIN_VISIBLE_MS = 400;

/**
 * Cuándo se ve el skeleton de una carga (diseño «Pantallas de carga»).
 * - `pending`: mientras sea true, la pantalla pinta su skeleton y no el
 *   contenido. Dura lo que la carga y, si el skeleton llegó a verse, al menos
 *   `SKELETON_MIN_VISIBLE_MS`.
 * - `visible`: el skeleton se enseña (antes de `SKELETON_DELAY_MS` ocupa su
 *   sitio sin verse).
 */
export const useDelayedLoading = (isLoading: boolean) => {
    const [visible, setVisible] = useState(false);
    const shownAt = useRef(0);

    // Cuándo se pintó: los efectos corren después de pintar, así los 400 ms
    // cuentan desde que se ve, no desde que se decidió enseñarlo.
    useEffect(() => {
        if (visible) shownAt.current = performance.now();
    }, [visible]);

    useEffect(() => {
        if (isLoading) {
            if (visible) return;
            const timer = setTimeout(() => setVisible(true), SKELETON_DELAY_MS);
            return () => clearTimeout(timer);
        }
        if (!visible) return;
        const left = SKELETON_MIN_VISIBLE_MS - (performance.now() - shownAt.current);
        const timer = setTimeout(() => setVisible(false), Math.max(0, left));
        return () => clearTimeout(timer);
    }, [isLoading, visible]);

    return { pending: isLoading || visible, visible };
};
