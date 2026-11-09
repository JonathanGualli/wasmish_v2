import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
    getTemplatesService, removeTemplateHeaderMediaService, syncTemplatesService, uploadTemplateHeaderMediaService,
} from "../services/api.service";
import type { AxiosError } from "axios";
import type { Template, TemplateDetail } from "../models/template.model";

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
        queryFn: () => getTemplatesService(),
        staleTime: Infinity,
        refetchOnWindowFocus: false,
    });

    const syncMutation = useMutation({
        mutationFn: () => syncTemplatesService(),
        // Devolver la promesa: la sincronización sigue «en curso» hasta que
        // llega la lista nueva, y la tabla no deja de estar atenuada antes.
        // El detalle abierto (`['template', id]`) también se vuelve a pedir.
        onSuccess: () => Promise.all([
            queryClient.invalidateQueries({ queryKey: ['templates'] }),
            queryClient.invalidateQueries({ queryKey: ['template'] }),
        ]),
    });

    // La respuesta es la plantilla ya actualizada: se cambia en la caché sin
    // volver a pedir la lista, y en su detalle si está abierto.
    const replaceTemplate = (updated: Template) => {
        queryClient.setQueryData<Template[]>(['templates'], (old) =>
            old?.map(t => (t.templateId === updated.templateId ? updated : t)));
        queryClient.setQueryData<TemplateDetail>(['template', updated.templateId], (old) =>
            old && { ...old, template: updated });
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
        /** No llegó la lista (y no hay ninguna en la caché que enseñar). */
        isError: query.isError && !query.data,
        refetch: query.refetch,
        isSyncing: syncMutation.isPending,
        sync: syncMutation.mutate,
        syncError: syncMutation.error
        ? parseError(syncMutation.error, 'No se pudieron sincronizar las plantillas.')
        : null,
    }

}
/**
 * La página Plantillas, al abrirse, pide la lista con `fresh=1` una vez: el
 * backend sincroniza antes los WABA que llevan más de 10 minutos sin hacerlo.
 * Si ya se estaba pidiendo la normal (la primera vez), se cancela para que esta
 * no se quede en la cola. Un fallo no se cuenta: lo de la caché sigue valiendo,
 * y sin caché lo enseña la consulta normal.
 * Devuelve `true` mientras esa petición está en curso.
 */
export const useFreshTemplatesOnMount = () => {
    const queryClient = useQueryClient();
    const [pending, setPending] = useState(true);
    // En desarrollo, StrictMode monta dos veces: que pida una sola.
    const started = useRef(false);
    useEffect(() => {
        if (started.current) return;
        started.current = true;
        void queryClient.cancelQueries({ queryKey: ['templates'] })
            .then(() => queryClient.fetchQuery({
                queryKey: ['templates'],
                queryFn: () => getTemplatesService({ fresh: true }),
                staleTime: 0,
            }))
            .catch(() => undefined)
            .finally(() => setPending(false));
    }, [queryClient]);
    return pending;
};
