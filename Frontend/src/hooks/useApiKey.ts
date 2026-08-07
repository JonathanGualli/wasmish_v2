import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { generatePikeyService, getApiKeysService, revokeApiKeyService } from "../services/api.service";
import type { ApiKey } from "../models/apikey.model";

export const useApiKey = () => {
    const queryClient = useQueryClient();

    const query = useQuery<ApiKey[]>({
        queryKey: ["apiKeys"],
        queryFn: getApiKeysService,
    });

    const generate = useMutation({
        mutationFn: (nameApiKey: string) => generatePikeyService(nameApiKey),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["apiKeys"] }),
    });

    const revoke = useMutation({
        mutationFn: (id: string) => revokeApiKeyService(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["apiKeys"] }),
    });

    return {
        apiKeys: query.data ?? [],
        isLoading: query.isLoading,
        generate,
        revoke,
    };
};
