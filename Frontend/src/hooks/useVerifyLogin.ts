import { useQuery } from "@tanstack/react-query";
import { verifyService } from "../services/api.service";
import type { User } from "../models/user.mode";

export const VERIFY_QUERY_KEY = ['verifyLogin'];

export const useVerifyLogin = () => {
    return useQuery<User, Error>({
        queryKey: VERIFY_QUERY_KEY,
        queryFn: verifyService,
        staleTime: Infinity,
        retry: 1,
        refetchOnWindowFocus: false,
    });
}