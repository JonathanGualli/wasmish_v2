import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { getTemplateDetailService } from "../services/api.service";
import type { Template } from "../models/template.model";

/**
 * El detalle de una plantilla, con su uso y (con permiso) sus campañas. Pide
 * `fresh`: el backend sincroniza antes su WABA si el último sync tiene más de
 * 10 minutos. Mientras llega, `cached` es la plantilla tal como está en la
 * lista, para enseñarla al momento (diseño 7a): solo el uso espera.
 */
export const useTemplateDetail = (templateId: string) => {
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: ['template', templateId],
        queryFn: () => getTemplateDetailService(templateId, { fresh: true }),
        // Un 404 no se reintenta: la plantilla no está (o ya no) en la cuenta.
        retry: (failureCount, error) => (error as AxiosError)?.response?.status !== 404 && failureCount < 2,
        refetchOnWindowFocus: false,
    });
    const cached = queryClient.getQueryData<Template[]>(['templates'])
        ?.find(t => t.templateId === templateId);

    return {
        detail: query.data,
        template: query.data?.template ?? cached ?? null,
        isLoading: query.isPending,
        isFetching: query.isFetching,
        notFound: (query.error as AxiosError | null)?.response?.status === 404,
        isError: query.isError,
        refetch: query.refetch,
    };
};
