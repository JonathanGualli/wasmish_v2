import { useMutation } from "@tanstack/react-query"
import { generatePikeyService } from "../services/api.service"

export const useApiKey = () => {
    return useMutation({
        mutationFn: () => generatePikeyService("test"),
    })
}