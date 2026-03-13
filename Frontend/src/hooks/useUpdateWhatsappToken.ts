import { useMutation } from "@tanstack/react-query"
import { updateWhatsAppTokenService } from "../services/api.service"

export const useUpdateWhatsappToken = () => {
    return useMutation({
        mutationFn: ({ tokenWhatsapp, phoneNumberId, waBusinessId }: { tokenWhatsapp: string, phoneNumberId: string, waBusinessId: string }) => updateWhatsAppTokenService(tokenWhatsapp, phoneNumberId, waBusinessId),
    })
}