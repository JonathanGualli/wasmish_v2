import { useEffect } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { useSSE } from "../context/sse.context";
import { useDebouncedValue } from "./useDebouncedValue";
import { useThrottledInvalidate } from "./useThrottledInvalidate";
import {
    campaignActionService, createCampaignService, getCampaignRecipientsService, getCampaignService,
    getCampaignsService, previewCampaignService,
} from "../services/api.service";
import type {
    Campaign, CampaignDraftInput, CampaignFieldError, CampaignPreview, CampaignRecipientsPage, CampaignsPage,
    CreateCampaignInput, RecipientState,
} from "../models/campaign.model";

/**
 * Lista de envíos. `campaign_progress` (máx. uno por segundo y envío) trae la
 * campaña entera con sus estadísticas: se cambia en su sitio, sin pedir nada.
 */
export const useCampaigns = (pageIndex: number, pageSize: number) => {
    const queryClient = useQueryClient();
    const { subscribe } = useSSE();

    useEffect(() => subscribe("campaign_progress", (campaign: Campaign) => {
        queryClient.setQueriesData<CampaignsPage>({ queryKey: ['campaigns', 'list'] }, (old) => old && {
            ...old,
            campaigns: old.campaigns.map(c => (c.id === campaign.id ? campaign : c)),
        });
        queryClient.setQueryData(['campaigns', 'detail', campaign.id], campaign);
    }), [subscribe, queryClient]);

    return useQuery<CampaignsPage>({
        // pageIndex es 0-based (react-table); la API es 1-based
        queryKey: ['campaigns', 'list', pageIndex, pageSize],
        queryFn: () => getCampaignsService(pageIndex + 1, pageSize),
        placeholderData: keepPreviousData,
    });
};

/**
 * Un envío. Además del progreso, escucha los acuses de sus mensajes
 * (`message_status` con su `campaignId`): las entregas y lecturas llegan
 * durante horas después de terminar, y cambian las estadísticas.
 */
export const useCampaign = (id: string | null) => {
    const queryClient = useQueryClient();
    const { subscribe } = useSSE();
    const refreshDetail = useThrottledInvalidate(['campaigns', 'detail', id], 2000);
    const refreshRecipients = useThrottledInvalidate(['campaigns', 'recipients', id], 2000);

    useEffect(() => {
        if (!id) return;
        const unsubProgress = subscribe("campaign_progress", (campaign: Campaign) => {
            if (campaign.id !== id) return;
            queryClient.setQueryData(['campaigns', 'detail', id], campaign);
            refreshRecipients();
        });
        const unsubStatus = subscribe("message_status", (payload: { campaignId?: string }) => {
            if (payload.campaignId !== id) return;
            refreshDetail();
            refreshRecipients();
        });
        return () => {
            unsubProgress();
            unsubStatus();
        };
    }, [id, subscribe, queryClient, refreshDetail, refreshRecipients]);

    return useQuery<Campaign>({
        queryKey: ['campaigns', 'detail', id],
        queryFn: () => getCampaignService(id!),
        enabled: Boolean(id),
    });
};

/** Destinatarios de un envío, filtrables por estado (`null` = todos). */
export const useCampaignRecipients = (id: string | null, state: RecipientState | null, pageIndex: number, pageSize: number) =>
    useQuery<CampaignRecipientsPage>({
        queryKey: ['campaigns', 'recipients', id, state, pageIndex, pageSize],
        queryFn: () => getCampaignRecipientsService(id!, pageIndex + 1, pageSize, state),
        enabled: Boolean(id),
        placeholderData: keepPreviousData,
    });

/**
 * La vista previa del asistente: conteos de destinatarios, reservas que se
 * usarán y el mensaje de ejemplo. Espera a que se deje de escribir (los
 * valores fijos y las reservas se teclean) y mientras recalcula enseña la
 * anterior, para que la pantalla no parpadee. `null` = no pedir.
 */
export const useCampaignPreview = (input: CampaignDraftInput | null) => {
    const debounced = useDebouncedValue(input, 400);
    return useQuery<CampaignPreview>({
        queryKey: ['campaigns', 'preview', debounced],
        queryFn: () => previewCampaignService(debounced!),
        enabled: Boolean(debounced),
        placeholderData: keepPreviousData,
        staleTime: 10_000,
    });
};

/** Crear, pausar, reanudar y cancelar. */
export const useCampaignMutations = () => {
    const queryClient = useQueryClient();

    const create = useMutation<Campaign, unknown, CreateCampaignInput>({
        mutationFn: createCampaignService,
        onSuccess: (campaign) => {
            queryClient.setQueryData(['campaigns', 'detail', campaign.id], campaign);
            queryClient.invalidateQueries({ queryKey: ['campaigns', 'list'] });
        },
    });

    const afterAction = (campaign: Campaign) => {
        queryClient.setQueryData(['campaigns', 'detail', campaign.id], campaign);
        queryClient.invalidateQueries({ queryKey: ['campaigns', 'list'] });
        queryClient.invalidateQueries({ queryKey: ['campaigns', 'recipients', campaign.id] });
    };

    const pause = useMutation<Campaign, unknown, string>({
        mutationFn: (id) => campaignActionService(id, 'pause'),
        onSuccess: afterAction,
    });
    const resume = useMutation<Campaign, unknown, string>({
        mutationFn: (id) => campaignActionService(id, 'resume'),
        onSuccess: afterAction,
    });
    const cancel = useMutation<Campaign, unknown, string>({
        mutationFn: (id) => campaignActionService(id, 'cancel'),
        onSuccess: afterAction,
    });

    return { create, pause, resume, cancel };
};

/**
 * Los errores de una petición de envíos en una forma útil para la UI. Los 400
 * de validación traen varios `{ field, message }` (uno por variable que falta,
 * por ejemplo); el resto, uno solo.
 */
export const campaignErrors = (err: unknown): CampaignFieldError[] => {
    const data = (err as AxiosError<CampaignFieldError[] | { message: string }>).response?.data;
    if (Array.isArray(data) && data.length > 0) {
        return data.map(e => ({ field: e.field ?? '(body)', message: e.message }));
    }
    const message = (data as { message?: string } | undefined)?.message;
    return [{ field: '(body)', message: message ?? 'No se pudo completar. Inténtalo de nuevo.' }];
};
