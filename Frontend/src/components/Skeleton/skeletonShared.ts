import { createContext, useEffect, type RefObject } from "react";

/**
 * Si los bloques de esta zona ya se enseñan. Antes de los 300 ms de espera
 * (`useDelayedLoading`) ocupan su sitio sin verse; el texto real que haya
 * alrededor (títulos, etiquetas) se ve desde el principio.
 */
export const SkeletonVisibleContext = createContext(true);

/**
 * Todos los bloques laten a la vez, también los de zonas montadas en otro
 * momento (la bandeja y el hilo): su animación arranca en el cero del
 * documento, no al montarse cada uno.
 */
export const useSyncedPulse = (ref: RefObject<HTMLElement | null>, visible: boolean) => {
    useEffect(() => {
        if (!visible) return;
        ref.current?.getAnimations({ subtree: true }).forEach(animation => { animation.startTime = 0; });
    }, [ref, visible]);
};

/** Los anchos de las líneas, del diseño: varían sin parecer al azar. */
const WIDTHS = [58, 44, 66, 50, 38, 62, 47, 55, 41, 69];

/** El ancho de una línea según su fila (y su columna, con `offset`), en %. */
export const skeletonWidth = (index: number, offset = 0, extra = 0) =>
    `${WIDTHS[(index + offset) % WIDTHS.length] + extra}%`;
