/**
 * Borrador de «Conversación nueva», guardado en `sessionStorage`, nunca en la BD.
 *
 * Por qué sessionStorage: sobrevive a abrir otra conversación, a cambiar de
 * página y a recargar, y el navegador lo borra solo al cerrar la pestaña.
 * Lo demás que lo borra es explícito: «Descartar», enviarlo, o cerrar sesión.
 *
 * La clave lleva el id del usuario: si la sesión caduca sin logout y entra otra
 * cuenta en la misma pestaña, no debe ver el borrador de la anterior.
 */
export interface ConversationDraft {
    phone: string;
    name: string;
    templateName: string;
    values: Record<string, string>;
    buttonValues: Record<number, string>;
}

const PREFIX = 'wasmish:conversation-draft:';

export const EMPTY_DRAFT: ConversationDraft = {
    phone: '', name: '', templateName: '', values: {}, buttonValues: {},
};

// El storage puede no estar (navegación privada estricta, cuota llena): el
// borrador es una comodidad, así que ante cualquier fallo se sigue sin él.
export const loadDraft = (userId: string): ConversationDraft | null => {
    try {
        const raw = sessionStorage.getItem(PREFIX + userId);
        return raw ? { ...EMPTY_DRAFT, ...JSON.parse(raw) } : null;
    } catch {
        return null;
    }
};

export const saveDraft = (userId: string, draft: ConversationDraft) => {
    try {
        sessionStorage.setItem(PREFIX + userId, JSON.stringify(draft));
    } catch { /* sin storage: el borrador vive solo en memoria */ }
};

export const clearDraft = (userId: string) => {
    try {
        sessionStorage.removeItem(PREFIX + userId);
    } catch { /* nada que borrar */ }
};

/** Al cerrar sesión: todos los borradores de la pestaña, sea de quien sea. */
export const clearAllDrafts = () => {
    try {
        Object.keys(sessionStorage)
            .filter(k => k.startsWith(PREFIX))
            .forEach(k => sessionStorage.removeItem(k));
    } catch { /* nada que borrar */ }
};

/** Título de la fila «Borrador» en la bandeja. */
export const draftTitle = (draft: ConversationDraft) =>
    draft.name.trim() || draft.phone.replace(/\D/g, '') || 'Conversación nueva';
