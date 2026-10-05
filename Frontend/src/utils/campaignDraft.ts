import type { CampaignButton, CampaignRecipientsInput, CampaignVariable } from "../models/campaign.model";

/**
 * Borrador de «Nueva campaña»: el que se empezó y no se terminó. Hay uno a la
 * vez, y vive en el navegador, nunca en la BD.
 *
 * Por qué localStorage y no sessionStorage (como el borrador de Chats): un
 * campaña se prepara con calma y se retoma otro día, así que tiene que
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
    /** Para la lista de Campañas, que no carga las plantillas. */
    templateName: string | null;
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
    templateName: null,
    variables: [],
    buttons: [],
    // Solo cuenta con plantillas de marketing (lo decide el backend).
    excludeOptedOut: true,
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

/** Lo guarda con la hora de ahora y lo devuelve tal como quedó. */
export const saveCampaignDraft = (userId: string, draft: CampaignDraft): CampaignDraft => {
    const saved = { ...draft, updatedAt: new Date().toISOString() };
    try {
        localStorage.setItem(PREFIX + userId, JSON.stringify(saved));
    } catch { /* sin storage: el borrador vive solo mientras la página esté abierta */ }
    return saved;
};

export const clearCampaignDraft = (userId: string) => {
    try {
        localStorage.removeItem(PREFIX + userId);
    } catch { /* nada que borrar */ }
};

/** Al cerrar sesión: todos los borradores de campaña del navegador, sea de quien sea. */
export const clearAllCampaignDrafts = () => {
    try {
        Object.keys(localStorage)
            .filter(k => k.startsWith(PREFIX))
            .forEach(k => localStorage.removeItem(k));
    } catch { /* nada que borrar */ }
};

/** Los pasos del asistente, para «se quedó en el paso 2 · Mensaje». */
export const CAMPAIGN_STEPS = ['Destinatarios', 'Mensaje', 'Revisar y enviar'] as const;

/** Título del borrador en la lista de Campañas. */
export const campaignDraftTitle = (draft: CampaignDraft) => draft.name.trim() || 'Sin nombre';
