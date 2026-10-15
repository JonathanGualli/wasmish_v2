import { useQuery } from "@tanstack/react-query";
import { verifyService } from "../services/api.service";
import type { User } from "../models/user.mode";
import { loadRememberedUser } from "../utils/rememberedUser";

export const VERIFY_QUERY_KEY = ['verifyLogin'];

/**
 * La sesión según el backend. Mientras responde, el usuario recordado en este
 * navegador (`isPlaceholderData`): la app abre ya, sin esperar a /verify.
 */
export const useVerifyLogin = () => {
    return useQuery<User, Error>({
        queryKey: VERIFY_QUERY_KEY,
        queryFn: verifyService,
        placeholderData: loadRememberedUser,
        staleTime: Infinity,
        retry: 1,
        refetchOnWindowFocus: false,
    });
}