import { createContext, useContext, useEffect, useRef } from "react";

/**
 * Preguntar antes de salir de una página con cambios sin guardar. La app usa
 * `BrowserRouter`, que no tiene `useBlocker`: el menú lateral (por donde se
 * sale) pasa cada navegación por `guarded`, y la página que tiene cambios deja
 * aquí su guardián, que decide si sigue (`proceed`) o pregunta antes.
 * Recargar o cerrar la pestaña lo pregunta el navegador (`beforeunload`).
 */
export type NavigationGuard = (proceed: () => void) => void;

interface NavigationGuardValue {
    /** El guardián de la página abierta, o `null`. */
    setGuard: (guard: NavigationGuard | null) => void;
    /** Hace `proceed` ya, o cuando el guardián lo deje. */
    guarded: (proceed: () => void) => void;
}

export const NavigationGuardContext = createContext<NavigationGuardValue>({
    setGuard: () => {},
    guarded: (proceed) => proceed(),
});

export const useNavigationGuardValue = (): NavigationGuardValue => {
    const guard = useRef<NavigationGuard | null>(null);
    const value = useRef<NavigationGuardValue>({
        setGuard: (next) => { guard.current = next; },
        guarded: (proceed) => (guard.current ? guard.current(proceed) : proceed()),
    });
    return value.current;
};

export const useGuardedNavigation = () => useContext(NavigationGuardContext).guarded;

/** Mientras `active`, salir por el menú llama a `onLeave(proceed)` y cerrar la pestaña pregunta. */
export const useLeaveGuard = (active: boolean, onLeave: NavigationGuard) => {
    const { setGuard } = useContext(NavigationGuardContext);
    const latest = useRef(onLeave);
    useEffect(() => { latest.current = onLeave; });

    useEffect(() => {
        if (!active) return;
        setGuard((proceed) => latest.current(proceed));
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener('beforeunload', warn);
        return () => {
            setGuard(null);
            window.removeEventListener('beforeunload', warn);
        };
    }, [active, setGuard]);
};
