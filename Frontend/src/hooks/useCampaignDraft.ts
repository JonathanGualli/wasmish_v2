import { useCallback, useState } from "react";
import { useAuthContext } from "../context/auth.context";
import { clearCampaignDraft, loadCampaignDraft, saveCampaignDraft, type CampaignDraft } from "../utils/campaignDraft";

/**
 * El borrador de «Nuevo envío» del usuario con sesión: el que hay al montar,
 * y cómo guardarlo o descartarlo. Cada página que lo usa lee el suyo al
 * entrar; entre páginas viaja por el storage, no por memoria.
 */
export const useCampaignDraft = () => {
    const { user } = useAuthContext();
    const userId = user?.id ?? '';
    const [draft, setDraft] = useState<CampaignDraft | null>(() => (userId ? loadCampaignDraft(userId) : null));

    const save = useCallback((next: CampaignDraft) => {
        setDraft(saveCampaignDraft(userId, next));
    }, [userId]);

    const discard = useCallback(() => {
        clearCampaignDraft(userId);
        setDraft(null);
    }, [userId]);

    return { draft, save, discard };
};

export type CampaignDraftStore = ReturnType<typeof useCampaignDraft>;
