import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { Message } from "../models/message.mode.ts";
import { createSSEConnection, getConversationsMessagesService } from "../services/api.service.ts";
import { useEffect } from "react";

export const useConversationMessages = (conversationId: string) => {

  const queryClient = useQueryClient();

  const { isLoading, isError, data, fetchNextPage, hasNextPage } = useInfiniteQuery<{ items: Message[], nextCursor: string | undefined }>({
    queryKey: ["conversation", conversationId],
    queryFn: (context) => getConversationsMessagesService(conversationId, context),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    refetchOnWindowFocus: false,
    initialPageParam: '',
    enabled: !!conversationId,
  });

  useEffect(() => {
    const { close } = createSSEConnection("stream", {
      onMessageCreated: (event) => {
        console.log("SSE Event received from messages:", event.data);
        try {
          const newMessage = JSON.parse(event.data);
          console.log("Parsed new message:", event);

          if (newMessage.conversationId === conversationId) {
            queryClient.setQueryData<InfiniteData<{ items: Message[], nextCursor: string | undefined }>>(
              ["conversation", conversationId],
              (oldData) => {
                if (!oldData) {
                  return {
                    pages: [{ items: [newMessage], nextCursor: undefined }],
                    pageParams: [undefined],
                  }
                }

                const newPages = [...oldData.pages];
                newPages[0] = {
                  ...newPages[0],
                  items: [...newPages[0].items, newMessage],
                };

                return { ...oldData, pages: newPages }
              });
          }

        } catch (error) {
          console.error("Error parsing SSE event data:", error);
        }
      },
      onError: (err) => {
        console.error("SSE connection error:", err);
      }
    });
    return () => close();
  }, [queryClient, conversationId]);

  return {
    isLoading,
    isError,
    data: data?.pages.flatMap(page => page.items) ?? [],
    fetchNextPage,
    hasNextPage,
  };
};

