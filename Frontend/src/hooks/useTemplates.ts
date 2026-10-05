import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
    getTemplatesService, removeTemplateHeaderMediaService, syncTemplatesService, uploadTemplateHeaderMediaService,
} from "../services/api.service";
import type { AxiosError } from "axios";
import type { Template } from "../models/template.model";

interface ErrorItem { message: string }

// El backend responde los errores como [{ message }]. Lo aplanamos aquí para que
// la página no tenga que conocer la forma de la respuesta.
export const parseError = (error: unknown, fallback: string) => {
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

    // La respuesta es la plantilla ya actualizada: se cambia en la caché sin
    // volver a pedir la lista.
    const replaceTemplate = (updated: Template) => {
        queryClient.setQueryData<Template[]>(['templates'], (old) =>
            old?.map(t => (t.templateId === updated.templateId ? updated : t)));
    };

    const uploadHeaderMedia = useMutation({
        mutationFn: ({ templateId, file }: { templateId: string; file: File }) =>
            uploadTemplateHeaderMediaService(templateId, file),
        onSuccess: replaceTemplate,
    });

    const removeHeaderMedia = useMutation({
        mutationFn: (templateId: string) => removeTemplateHeaderMediaService(templateId),
        onSuccess: replaceTemplate,
    });

    return {
        templates: query.data ?? [],
        uploadHeaderMedia,
        removeHeaderMedia,
        isLoading: query.isLoading,
        isSyncing: syncMutation.isPending,
        sync: syncMutation.mutate,
        syncError: syncMutation.error
        ? parseError(syncMutation.error, 'No se pudieron sincronizar las plantillas.')
        : null,
    }

}