import { useMutation } from "@tanstack/react-query";
import { loginService } from "../services/api.service";

export const useLogin = () => {

    return useMutation({
        mutationFn: ({ email, password }: { email: string, password: string }) => loginService(email, password),
    });
}