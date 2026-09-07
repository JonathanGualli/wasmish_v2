import { useEffect, useState } from "react";

const TICK_MS = 60_000;
/** A partir de aquí avisamos: 2 h es tiempo de sobra para responder. */
export const WINDOW_WARNING_MS = 2 * 60 * 60 * 1000;

/** «3 h 12 min», «45 min», «menos de 1 min». */
export const formatRemaining = (ms: number) => {
    const totalMin = Math.floor(ms / 60_000);
    if (totalMin < 1) return "menos de 1 min";
    const h = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    return h > 0 ? `${h} h ${min} min` : `${min} min`;
};

/**
 * Cuenta atrás de la ventana de 24 h de WhatsApp.
 *
 * `expiresAt` lo calcula el backend y es la única autoridad; acá solo se
 * compara con el reloj local para que la UI se refresque sola. Si el reloj
 * del navegador va corrido, lo peor que pasa es que el composer se cierre
 * antes o después de tiempo — Meta rechaza igual con el error 131047.
 */
export const useConversationWindow = (expiresAt?: string | null) => {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        // Sin ventana no hay cuenta atrás: no montamos el intervalo.
        if (!expiresAt) return;
        // Recalculamos ya: si `expiresAt` cambió (llegó un mensaje del
        // contacto), esperar al primer tick dejaría la UI hasta 1 min vieja.
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), TICK_MS);
        return () => clearInterval(id);
    }, [expiresAt]);

    const expiry = expiresAt ? new Date(expiresAt).getTime() : NaN;
    if (Number.isNaN(expiry)) return { hasWindow: false, isOpen: false, msRemaining: 0 };

    const msRemaining = Math.max(0, expiry - now);
    return { hasWindow: true, isOpen: msRemaining > 0, msRemaining };
};
