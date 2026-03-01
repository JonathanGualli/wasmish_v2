import { useMutation } from "@tanstack/react-query"
import { signUpService } from "../services/api.service"

export const useSignUp = () => {

    return useMutation({
        mutationFn: ({ name, email, password }: { name: string, email: string, password: string }) => signUpService(name, email, password),
    });
}