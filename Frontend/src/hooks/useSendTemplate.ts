import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendConversationTemplateService } from "../services/api.service";
import type { TemplateButtonParam } from "../models/template.model";

export interface SendTemplateVars {
    conversationId: string;
    templateName: string;
    parameters: (string | { name: string; value: string })[];
    language?: string;
    /** Valores de los botones que los piden (OTP, copiar código, URL dinámica). */
    buttons?: TemplateButtonParam[];
}

/**
 * Envío de plantilla desde el chat.
 *
 * A diferencia de `useConversationSendMessages`, aquí NO hay UI optimista: el
 * mensaje lo inserta el evento `message_created` del SSE. Adelantarlo acá lo
 * duplicaría, porque este envío no lleva `temporalId` con el que deduplicar.
 */
export const useSendTemplate = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (vars: SendTemplateVars) =>
            sendConversationTemplateService(
                vars.conversationId, vars.templateName, vars.parameters, vars.language, vars.buttons,
            ),
        onSuccess: () => {
            // Enviar no reabre la ventana, pero sí cambia el último mensaje
            // y el orden de la bandeja.
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
        },
    });
};
