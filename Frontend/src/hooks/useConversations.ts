import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createSSEConnection, getConversationsService } from "../services/api.service.ts";
import type { Conversation } from "../models/conversation.mode.ts";
import { useEffect } from "react";

export const useConversations = () => {

  const queryClient = useQueryClient();

  const query = useQuery<Conversation[]>({
    queryKey: ["conversations"],
    queryFn: getConversationsService,
  });

  useEffect(() => {
    const { close } = createSSEConnection("stream", {
      onMessageCreated: (event) => {
        console.log("SSE Event received:", event.data);
        try {
          const payload = JSON.parse(event.data);

          queryClient.setQueryData<Conversation[]>(["conversations"], (old = []) =>
            old.map((c) =>
              c.id === payload.conversationId
                ? {
                  ...c,
                  lastMessage: payload.text,
                  updatedAt: payload.timestamp,
                  unreadCount: payload.sender === "them" ? (c.unreadCount ?? 0) + 1 : 0,
                }
                : c
            )
          );
        } catch (error) {
          console.error("Error parsing SSE event data:", error);
        }
      },

      onConversationUpdated: (event) => {
        console.log("SSE Event received for conversation update:", event.data);
        try {
          const updatedConversation = JSON.parse(event.data);
          queryClient.setQueryData<Conversation[]>(["conversations"], (old = []) =>
            old.map((c) =>
              c.id === updatedConversation.id
                ? { ...c, unreadCount: updatedConversation.unreadCount }
                : c
            )
          );

        } catch (error) {
          console.error("Error parsing SSE event data:", error);
        }
      },

      onError: (err) => {
        console.error("SSE connection error:", err);
      }
    });
    return () => close();
  }, [queryClient]);

  return query;
};
