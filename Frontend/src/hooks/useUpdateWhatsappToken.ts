import { useMutation } from "@tanstack/react-query"
import { updateWhatsAppTokenService } from "../services/api.service"

export const useUpdateWhatsappToken = () => {
    return useMutation({
        mutationFn: ({ tokenWhatsapp }: { tokenWhatsapp: string }) => updateWhatsAppTokenService(tokenWhatsapp),
    })
}