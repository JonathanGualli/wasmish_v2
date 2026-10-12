import { useMutation, useQueryClient } from "@tanstack/react-query"
import { updateWhatsAppTokenService } from "../services/api.service"
import { LINES_QUERY_KEY } from "./useLines"

/** El formulario manual de Ajustes: conecta, renueva o reemplaza una línea, como el Embedded Signup. */
export const useUpdateWhatsappToken = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ tokenWhatsapp, phoneNumberId, waBusinessId }: { tokenWhatsapp: string, phoneNumberId: string, waBusinessId: string }) => updateWhatsAppTokenService(tokenWhatsapp, phoneNumberId, waBusinessId),
        onSettled: () => queryClient.invalidateQueries({ queryKey: LINES_QUERY_KEY }),
    })
}
