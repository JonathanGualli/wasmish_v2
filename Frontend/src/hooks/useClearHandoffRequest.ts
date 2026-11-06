import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clearHandoffRequestService } from "../services/api.service";
import type { Conversation } from "../models/conversation.mode";

/**
 * «Quitar» la marca de «pide una persona» (bot con menús): el bot vuelve a
 * responder enseguida. La bandeja la quita al momento; el SSE
 * (`conversation_updated`) lo confirma y avisa a los demás.
 */
export const useClearHandoffRequest = (conversationId: string) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => clearHandoffRequestService(conversationId),
        onSuccess: () => queryClient.setQueryData<Conversation[]>(["conversations"], (old) =>
            old?.map((c) => (c.id === conversationId ? { ...c, handoffRequest: null } : c))),
    });
};
