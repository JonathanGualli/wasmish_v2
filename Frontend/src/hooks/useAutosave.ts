import { useCallback, useEffect, useRef, useState } from "react";

/** `pending`: hay cambios esperando la pausa; `saving`: van en camino. */
export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface AutosaveOptions<T> {
    /** Lo que hay guardado al empezar: mientras el valor sea ese, no hay nada que guardar. */
    savedValue: T;
    save: (value: T) => Promise<unknown>;
    /** Cuánto esperar sin cambios antes de guardar. */
    delay?: number;
    /** Se desmontó con cambios y guardarlos falló: el valor, para no perderlo. */
    onLost?: (value: T) => void;
}

/**
 * Guardar solo mientras se escribe: al pasar `delay` ms sin cambios, o al
 * llamar a `flush` (al salir del campo, o «Reintentar»).
 *
 * - Nunca hay dos guardados a la vez: si se escribe mientras uno va en camino,
 *   al terminar se guarda lo último.
 * - Desmontarse con algo pendiente (cambiar de conversación, cerrar la ficha)
 *   lo guarda igual. Si eso falla, `onLost` recibe el valor.
 * - Un fallo no se reintenta solo, para no insistir contra un servidor caído:
 *   lo reintentan seguir escribiendo o `flush`.
 */
export const useAutosave = <T,>(value: T, { savedValue, save, delay = 1000, onLost }: AutosaveOptions<T>) => {
    const [status, setStatus] = useState<AutosaveStatus>('idle');
    const latest = useRef(value);
    const saved = useRef(savedValue);
    const saving = useRef(false);
    const mounted = useRef(false);
    const timer = useRef<number | undefined>(undefined);
    // Las funciones del render más reciente, sin que `flush` cambie en cada uno.
    const callbacks = useRef({ save, onLost });
    useEffect(() => { callbacks.current = { save, onLost }; });

    const flush = useCallback(async () => {
        window.clearTimeout(timer.current);
        // El que va en camino mira al terminar si quedó algo más.
        if (saving.current || latest.current === saved.current) return;

        const target = latest.current;
        saving.current = true;
        if (mounted.current) setStatus('saving');
        try {
            await callbacks.current.save(target);
            saved.current = target;
        } catch {
            saving.current = false;
            if (mounted.current) setStatus('error');
            else callbacks.current.onLost?.(target);
            return;
        }
        saving.current = false;
        if (latest.current !== saved.current) void flush();
        else if (mounted.current) setStatus('saved');
    }, []);

    useEffect(() => {
        latest.current = value;
        window.clearTimeout(timer.current);
        if (value !== saved.current) {
            setStatus(current => (current === 'saving' ? current : 'pending'));
            timer.current = window.setTimeout(() => void flush(), delay);
        } else if (!saving.current) {
            // Se volvió a dejar como estaba guardado: no queda nada pendiente.
            setStatus(current => (current === 'pending' ? 'saved' : current));
        }
    }, [value, delay, flush]);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            void flush();
        };
    }, [flush]);

    return { status, flush };
};
