import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CampaignPaths } from "../models/routes.models";
import type { CampaignDraftStore } from "./useCampaignDraft";

/**
 * Empezar una campaña nueva. Solo hay un borrador a la vez: si ya existe, antes
 * se pregunta si continuarlo o descartarlo. `start` recibe lo que se hace con
 * el camino libre (crear el borrador, ir a elegir contactos…).
 *
 * Recibe el borrador de la página (`useCampaignDraft`) en vez de leer el suyo:
 * así descartarlo aquí o allí se ve en los dos sitios.
 */
export const useNewCampaign = ({ draft, discard }: CampaignDraftStore) => {
    const navigate = useNavigate();
    const [pending, setPending] = useState<(() => void) | null>(null);

    const start = (proceed: () => void) => {
        if (draft) setPending(() => proceed);
        else proceed();
    };

    const conflictDialog = {
        draft,
        open: Boolean(pending && draft),
        onContinueDraft: () => {
            setPending(null);
            navigate(CampaignPaths.create);
        },
        onStartOver: () => {
            discard();
            pending?.();
            setPending(null);
        },
        onClose: () => setPending(null),
    };

    return { start, conflictDialog };
};
