import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { sendMessageService } from "../services/api.service";
import type { Message } from "../models/message.mode.ts";

export const useConversationSendMessages = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ conversationId, message, temporalId }: { conversationId: string, message: string, temporalId?: string }) => sendMessageService(conversationId, message, temporalId),

        onMutate: async ({ conversationId, message, temporalId }) => {
            await queryClient.cancelQueries({ queryKey: ["conversation", conversationId] });

            const previousMessages = queryClient.getQueryData(["conversation", conversationId]);

            if (!temporalId) {
                temporalId = crypto.randomUUID();
            }

            const optimisticMessage: Message = {
                id: temporalId,
                conversationId,
                sender: "me",
                text: message,
                timestamp: new Date().toISOString(),
                status: "sent",
                deliveredAt: undefined,
                readAt: undefined,
                waMessageId: undefined,
                temporalId: temporalId || undefined,
            };
            queryClient.setQueryData<InfiniteData<{ items: Message[], nextCursor: string | undefined }>>(
                ["conversation", conversationId],
                (oldData) => {
                    if (!oldData) {
                        return {
                            pages: [{ items: [optimisticMessage], nextCursor: undefined }],
                            pageParams: [undefined],
                        }
                    }
                    const newPages = [...oldData.pages];
                    newPages[0] = {
                        ...newPages[0],
                        items: [optimisticMessage, ...newPages[0].items],
                    };

                    return {
                        ...oldData,
                        pages: newPages,
                    }
                }
            );

            return { previousMessages, temporalId: optimisticMessage.id };
        },

        onError: (_err, variables, context) => {
            if (context?.previousMessages) {
                queryClient.setQueryData(["conversation", variables.conversationId], context.previousMessages);
            }
        },

        onSuccess: (dataServerResponse, variables, context) => {
            if (context?.temporalId) {
                queryClient.setQueryData<InfiniteData<{ items: Message[], nextCursor: string | undefined }>>(
                    ["conversation", variables.conversationId],
                    (oldData) => {
                        if (!oldData) return oldData;
                        const newPages = [...oldData.pages];
                        newPages[0].items = newPages[0].items.map((msg) =>
                            msg.id === context.temporalId ? { ...msg, ...dataServerResponse } : msg
                        );

                        return { ...oldData, pages: newPages };
                    }
                );
            }
        }
    });
}