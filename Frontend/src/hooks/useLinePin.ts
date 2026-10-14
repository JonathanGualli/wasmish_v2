import { useEffect, useRef, useState } from "react";
import { getLinePinService } from "../services/api.service";

type PinState =
    | { status: 'hidden' | 'loading' | 'missing' }
    | { status: 'shown'; pin: string }
    | { status: 'error'; error: unknown };

/**
 * El PIN de dos pasos de una línea, pedido solo cuando se va a enseñar. Vive
 * únicamente en el estado de este componente: sin React Query, porque hasta una
 * mutación guarda su resultado en la caché unos minutos (revisión de Codex del
 * PR #31). Al ocultarlo o cerrar «Detalles» desaparece, y una respuesta que
 * llegue después se descarta.
 */
export const useLinePin = (lineId: string) => {
    const [state, setState] = useState<PinState>({ status: 'hidden' });
    // Cada petición lleva su número: solo la última, con el componente montado, puede escribir.
    const lastRequest = useRef(0);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    const reveal = async () => {
        const request = ++lastRequest.current;
        const isCurrent = () => mounted.current && request === lastRequest.current;
        setState({ status: 'loading' });
        try {
            const pin = await getLinePinService(lineId);
            if (isCurrent()) setState(pin === null ? { status: 'missing' } : { status: 'shown', pin });
        } catch (error) {
            if (isCurrent()) setState({ status: 'error', error });
        }
    };

    const hide = () => {
        lastRequest.current += 1;
        setState({ status: 'hidden' });
    };

    return {
        /** El PIN a la vista; `null` mientras está oculto. */
        pin: state.status === 'shown' ? state.pin : null,
        isLoading: state.status === 'loading',
        error: state.status === 'error' ? state.error : null,
        /** El servidor respondió que no hay PIN (se borró entre la lista y la petición). */
        isMissing: state.status === 'missing',
        reveal: () => { void reveal(); },
        hide,
    };
};
