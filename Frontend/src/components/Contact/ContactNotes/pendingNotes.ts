import { useCallback, useSyncExternalStore } from "react";

/** Una nota nueva que se está guardando, o que no se pudo guardar (`error`). */
export interface PendingNote { key: string; text: string; error: string | null }

// Las notas nuevas sin confirmar de cada contacto, fuera del componente: si la
// ficha se cierra o se cambia de chat mientras se guardan, o después de fallar,
// siguen ahí al volver (con «Reintentar»). Viven lo que viva la pestaña
// (revisión de Codex del PR #89).
const store = new Map<string, PendingNote[]>();
const listeners = new Set<() => void>();
const EMPTY: PendingNote[] = [];

export const updatePendingNotes = (contactId: string, change: (notes: PendingNote[]) => PendingNote[]) => {
    const next = change(store.get(contactId) ?? EMPTY);
    if (next.length > 0) store.set(contactId, next);
    else store.delete(contactId);
    listeners.forEach(listener => listener());
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

/** Las notas sin confirmar de un contacto, al día. */
export const usePendingNotes = (contactId: string) => {
    const getSnapshot = useCallback(() => store.get(contactId) ?? EMPTY, [contactId]);
    return useSyncExternalStore(subscribe, getSnapshot);
};
