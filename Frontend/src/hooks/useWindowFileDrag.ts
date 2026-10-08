import { useEffect, useState } from "react";

const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");

/**
 * Si se está arrastrando un archivo sobre la página: para enseñar dónde
 * soltarlo antes de que llegue ahí. Mientras está activo, soltar un archivo
 * fuera de esa zona no hace nada (sin esto, el navegador lo abriría y se
 * saldría de la app).
 */
export const useWindowFileDrag = (enabled: boolean) => {
    const [dragging, setDragging] = useState(false);

    useEffect(() => {
        if (!enabled) {
            setDragging(false);
            return;
        }
        // `dragenter` y `dragleave` saltan al pasar por cada elemento: se cuentan
        // para saber cuándo se salió de la página de verdad.
        let depth = 0;
        const onEnter = (event: DragEvent) => {
            if (!hasFiles(event)) return;
            depth += 1;
            setDragging(true);
        };
        const onLeave = (event: DragEvent) => {
            if (!hasFiles(event)) return;
            depth = Math.max(0, depth - 1);
            if (depth === 0) setDragging(false);
        };
        const onOver = (event: DragEvent) => {
            if (hasFiles(event)) event.preventDefault();
        };
        const onDrop = (event: DragEvent) => {
            if (hasFiles(event)) event.preventDefault();
            depth = 0;
            setDragging(false);
        };

        window.addEventListener("dragenter", onEnter);
        window.addEventListener("dragleave", onLeave);
        window.addEventListener("dragover", onOver);
        window.addEventListener("drop", onDrop);
        return () => {
            window.removeEventListener("dragenter", onEnter);
            window.removeEventListener("dragleave", onLeave);
            window.removeEventListener("dragover", onOver);
            window.removeEventListener("drop", onDrop);
        };
    }, [enabled]);

    return dragging;
};
