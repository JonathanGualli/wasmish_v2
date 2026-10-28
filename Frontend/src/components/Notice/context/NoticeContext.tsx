import { createContext, useCallback, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * El aviso de arriba (diseño «Avisos de la asignación», 7a): uno solo en toda
 * la app, con color según el tipo. `success` no está en el diseño: lo pidió
 * Jonathan para las confirmaciones («ID de la línea copiado»), que con las
 * flechas de `info` se leerían mal (decisión del 2026-10-28).
 */
export type NoticeKind = 'error' | 'info' | 'new' | 'success';

export interface NoticeAction {
    label: string;
    onClick: () => void;
}

export interface NoticeInput {
    kind: NoticeKind;
    text: string;
    action?: NoticeAction;
}

export interface ShownNotice extends NoticeInput {
    // Cada aviso, uno nuevo: reinicia el temporizador aunque el texto se repita.
    id: number;
    exiting: boolean;
}

export interface NoticeContextValue {
    notice: ShownNotice | null;
    notify: (notice: NoticeInput) => void;
    close: () => void;
    // Para que un clic en el aviso no cuente como «clic fuera» de un diálogo.
    visible: boolean;
}

const NoticeContext = createContext<NoticeContextValue | null>(null);

// Lo que dura la animación de salida (`animate-notice-out`, App.css).
const EXIT_MS = 300;

const NoticeProvider = ({ children }: { children: ReactNode }) => {
    const [notice, setNotice] = useState<ShownNotice | null>(null);
    const nextId = useRef(0);

    // Uno a la vez: el nuevo reemplaza al anterior.
    const notify = useCallback((input: NoticeInput) => {
        nextId.current += 1;
        setNotice({ ...input, id: nextId.current, exiting: false });
    }, []);

    const close = useCallback(() => {
        setNotice(current => (current ? { ...current, exiting: true } : current));
        const closing = nextId.current;
        setTimeout(() => {
            // Si mientras salía llegó otro, ese se queda.
            setNotice(current => (current?.id === closing ? null : current));
        }, EXIT_MS);
    }, []);

    const value = useMemo(() => ({ notice, notify, close, visible: notice !== null }), [notice, notify, close]);

    return <NoticeContext.Provider value={value}>{children}</NoticeContext.Provider>;
};

export {
    NoticeProvider,
    NoticeContext,
};
