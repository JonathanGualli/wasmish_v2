import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAutoRepliesService, previewAutoReplyService, saveAutoRepliesService } from "../services/api.service";
import type { AutoReplySettings } from "../models/autoReply.model";

export const AUTO_REPLIES_QUERY_KEY = ['auto-replies'];

/** La configuración de las respuestas automáticas de la cuenta (owner y admin). */
export const useAutoReplies = () => useQuery({ queryKey: AUTO_REPLIES_QUERY_KEY, queryFn: getAutoRepliesService });

/** Guardar todo junto. La respuesta reemplaza la caché: lleva los ids de las reglas nuevas. */
export const useSaveAutoReplies = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (settings: AutoReplySettings) => saveAutoRepliesService(settings),
        onSuccess: (saved) => queryClient.setQueryData(AUTO_REPLIES_QUERY_KEY, saved),
    });
};

/**
 * Qué respondería `settings` (lo que hay en pantalla, sin guardar) a `text`.
 * Es una consulta: al cambiar algo se vuelve a preguntar sola, y mientras
 * llega se sigue viendo la respuesta anterior. `enabled: false` con errores.
 */
export const usePreviewAutoReply = (settings: AutoReplySettings, text: string, enabled: boolean) => useQuery({
    queryKey: ['auto-reply-preview', settings, text],
    queryFn: () => previewAutoReplyService(settings, text),
    enabled: enabled && text.trim().length > 0,
    placeholderData: keepPreviousData,
    gcTime: 60_000,
});
