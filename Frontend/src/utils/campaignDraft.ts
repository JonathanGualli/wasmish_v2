import type { CampaignButton, CampaignRecipientsInput, CampaignVariable } from "../models/campaign.model";

/**
 * Borrador de «Nuevo envío»: el que se empezó y no se terminó. Hay uno a la
 * vez, y vive en el navegador, nunca en la BD.
 *
 * Por qué localStorage y no sessionStorage (como el borrador de Chats): un
 * envío masivo se prepara con calma y se retoma otro día, así que tiene que
 * sobrevivir a cerrar la pestaña. A cambio se borra al cerrar sesión, para no
 * dejar la lista de destinatarios en un equipo compartido.
 *
 * La clave lleva el id del usuario: otra cuenta en el mismo navegador no ve
 * el borrador de la anterior.
 */
export interface CampaignDraft {
    /** Paso del asistente en el que se quedó: 1 destinatarios, 2 mensaje, 3 revisar. */
    step: 1 | 2 | 3;
    recipients: CampaignRecipientsInput;
    /**
     * Cuántos había al guardar. Con «todos los que coinciden» la búsqueda se
     * repite al reanudar y puede salir otro número: con esto se avisa.
     */
    selectedCount: number;
    templateId: string | null;
    variables: CampaignVariable[];
    buttons: CampaignButton[];
    excludeOptedOut: boolean;
    name: string;
    /** ISO de la última edición, para «editado hace…». */
    updatedAt: string;
}

const PREFIX = 'wasmish:campaign-draft:';

export const newCampaignDraft = (recipients: CampaignRecipientsInput, selectedCount: number): CampaignDraft => ({
    step: 1,
    recipients,
    selectedCount,
    templateId: null,
    variables: [],
    buttons: [],
    excludeOptedOut: false,
    name: '',
    updatedAt: new Date().toISOString(),
});

// El storage puede no estar (navegación privada estricta, cuota llena): el
// borrador es una comodidad, así que ante cualquier fallo se sigue sin él.
export const loadCampaignDraft = (userId: string): CampaignDraft | null => {
    try {
        const raw = localStorage.getItem(PREFIX + userId);
        if (!raw) return null;
        const draft = JSON.parse(raw) as CampaignDraft;
        // Uno guardado por una versión anterior, o roto: no se intenta arreglar.
        return draft?.recipients?.mode ? draft : null;
    } catch {
        return null;
    }
};

export const saveCampaignDraft = (userId: string, draft: CampaignDraft) => {
    try {
        localStorage.setItem(PREFIX + userId, JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }));
    } catch { /* sin storage: el borrador vive solo mientras la página esté abierta */ }
};

export const clearCampaignDraft = (userId: string) => {
    try {
        localStorage.removeItem(PREFIX + userId);
    } catch { /* nada que borrar */ }
};

/** Al cerrar sesión: todos los borradores de envío del navegador, sea de quien sea. */
export const clearAllCampaignDrafts = () => {
    try {
        Object.keys(localStorage)
            .filter(k => k.startsWith(PREFIX))
            .forEach(k => localStorage.removeItem(k));
    } catch { /* nada que borrar */ }
};

/** Título del borrador en la lista de Envíos. */
export const campaignDraftTitle = (draft: CampaignDraft) => draft.name.trim() || 'Sin nombre';
