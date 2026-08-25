import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getTemplatesService, syncTemplatesService } from "../services/api.service";
import type { AxiosError } from "axios";

interface ErrorItem { message: string }

// El backend responde los errores como [{ message }]. Lo aplanamos aquí para que
// la página no tenga que conocer la forma de la respuesta.
const parseError = (error: unknown, fallback: string) => {
    const items = (error as AxiosError<ErrorItem[]>)?.response?.data;
    return Array.isArray(items) && items.length > 0
        ? items.map(i => i.message).join(' ')
        : fallback;
};

export const useTemplates = () => {
    const queryClient = useQueryClient();

    // Consultar para obtener las plantillas de la BD
    const query = useQuery({
        queryKey: ['templates'],
        queryFn: getTemplatesService,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
    });

    const syncMutation = useMutation({
        mutationFn: () => syncTemplatesService(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['templates'] });
        },
    });

    return {
        templates: query.data ?? [],
        isLoading: query.isLoading,
        isSyncing: syncMutation.isPending,
        sync: syncMutation.mutate,
        syncError: syncMutation.error
        ? parseError(syncMutation.error, 'No se pudieron sincronizar las plantillas.')
        : null,
    }

}