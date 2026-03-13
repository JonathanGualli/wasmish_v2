import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getTemplatesService, syncTemplatesService } from "../services/api.service";

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
        onError: (error: Error) => {
            // const message = (error as AxiosError<ErrorItem[]>)?.response?.data?.map(err => err.message) || ['An error ocurred during login'];
            // queryClient.setQueryData(['error'], message);    
            console.log(error);
        }
    });

    return {
        templates: query.data ?? [],
        isLoading: query.isLoading,
        isSyncing: syncMutation.isPending,
        sync: syncMutation.mutate,
        error: query.error || syncMutation.error,
    }

}