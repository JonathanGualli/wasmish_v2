import { useMutation } from "@tanstack/react-query";
import { sendMessageService } from "../services/api.service";

export const useConversationSendMessages = () => {
    return useMutation({
        mutationFn: ({ conversationId, message }: { conversationId: string, message: string }) => sendMessageService(conversationId, message),
    });
}