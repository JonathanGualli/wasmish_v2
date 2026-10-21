import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { sendMessageService } from "../services/api.service";
import type { Message } from "../models/message.mode.ts";
import { AxiosError } from "axios";
import { quoteFromMessage } from "../utils/messageQuote";

export const useConversationSendMessages = () => {
    const queryClient = useQueryClient();

    return useMutation({
        // `replyTo`: el mensaje al que responde citándolo, si lo hay.
        mutationFn: ({ message, conversationId, temporalId, replyTo }: { message: string, conversationId: string, temporalId?: string, replyTo?: Message | null }) =>
            sendMessageService(message, conversationId, temporalId, undefined, undefined, replyTo?.id),

        onMutate: async ({ conversationId, message, temporalId, replyTo }) => {
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
                // La cita se ve al momento; la del servidor la sustituye al volver.
                replyTo: replyTo ? quoteFromMessage(replyTo) : null,
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

        onError: (error, variables, context) => {
            const temporalId = context?.temporalId;
            if (!temporalId) return;

            const errorDetail =
                (error as AxiosError<{ message: string }[]>).response?.data?.[0]?.message
                || error.message
                || "No se pudo enviar (error de conexión)";

            queryClient.setQueryData<InfiniteData<{ items: Message[], nextCursor: string | undefined }>>(
                ["conversation", variables.conversationId],
                (oldData) => {
                    if (!oldData) return oldData;
                    const newPages = oldData.pages.map((page) => ({
                        ...page,
                        items: page.items.map((msg) =>
                            msg.id === temporalId
                                ? { ...msg, status: "failed" as const, errorDetail }
                                : msg
                        ),
                    }));
                    return { ...oldData, pages: newPages };
                }
            );
        },

        onSuccess: (dataServerResponse, variables, context) => {
            if (context?.temporalId) {
                queryClient.setQueryData<InfiniteData<{ items: Message[], nextCursor: string | undefined }>>(
                    ["conversation", variables.conversationId],
                    (oldData) => {
                        if (!oldData) return oldData;
                        const newPages = [...oldData.pages];
                        newPages[0] = {
                            ...newPages[0],
                            items: newPages[0].items.map((msg) => 
                                msg.id === context.temporalId ? { ...msg, ...dataServerResponse } : msg
                            ),
                        };
                        return { ...oldData, pages: newPages };
                    }
                );
            }
        }
    });
}