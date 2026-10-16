import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
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
 * Cómo respondería `settings` (lo que hay en pantalla, sin guardar) a la
 * conversación de prueba `messages`. Es una consulta: al cambiar la
 * configuración (tras 1 s sin cambios) o añadir un mensaje se vuelve a simular entera, y mientras
 * llega se sigue viendo lo anterior. `enabled: false` con errores en pantalla.
 */
export const usePreviewAutoReply = (settings: AutoReplySettings, messages: string[], enabled: boolean) => useQuery({
    queryKey: ['auto-reply-preview', settings, messages],
    queryFn: () => previewAutoReplyService(settings, messages),
    enabled: enabled && messages.length > 0,
    placeholderData: keepPreviousData,
    gcTime: 60_000,
    // Un 429 (o un 400) no se arregla repitiendo: se avisa y se reintenta a mano.
    retry: (count, error) => count < 1 && ![400, 429].includes((error as AxiosError).response?.status ?? 0),
});
