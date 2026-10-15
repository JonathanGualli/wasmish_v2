import { useEffect, type RefObject } from "react";

/**
 * Todos los bloques laten a la vez, también los de zonas montadas en otro
 * momento (la bandeja y el hilo): su animación arranca en el cero del
 * documento, no al montarse cada uno. `active`: cuándo hay bloques dentro de
 * `ref` (una zona que siempre está montada, como la tabla, los tiene a ratos).
 */
export const useSyncedPulse = (ref: RefObject<HTMLElement | null>, active = true) => {
    useEffect(() => {
        if (!active) return;
        ref.current?.getAnimations({ subtree: true }).forEach(animation => { animation.startTime = 0; });
    }, [ref, active]);
};

/** Los anchos de las líneas, del diseño: varían sin parecer al azar. */
const WIDTHS = [58, 44, 66, 50, 38, 62, 47, 55, 41, 69];

/** El ancho de una línea según su fila (y su columna, con `offset`), en %. */
export const skeletonWidth = (index: number, offset = 0, extra = 0) =>
    `${WIDTHS[(index + offset) % WIDTHS.length] + extra}%`;
