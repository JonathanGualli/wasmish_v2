/* import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getConversationsService } from "../services/api.service.ts";
import type { Conversation } from "../models/conversation.mode.ts";
import { useEffect } from "react";
import { useSSE } from "../context/sse.context.ts";

export const useConversations = () => {

  const queryClient = useQueryClient();
  const { subscribe } = useSSE();

  const query = useQuery<Conversation[]>({
    queryKey: ["conversations"],
    queryFn: getConversationsService,
  });

  useEffect(() => {
    // Mensaje nuevo (entranto o propio) -> actualiza la conversacion en la lista
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
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getConversationsService } from "../services/api.service.ts";
import type { Conversation } from "../models/conversation.mode.ts";
import { useEffect } from "react";
import { useSSE } from "../context/sse.context.ts";

export const useConversations = () => {
  const queryClient = useQueryClient();
  const { subscribe } = useSSE();

  const query = useQuery<Conversation[]>({
    queryKey: ["conversations"],
    queryFn: getConversationsService,
  });

  useEffect(() => {
    // Mensaje nuevo (entrante o propio) → actualizar la conversación en la lista
    const unsubCreated = subscribe("message_created", (payload) => {
      queryClient.setQueryData<Conversation[]>(["conversations"], (old = []) => {
        const exists = old.some((c) => c.id === payload.conversationId);

        // Si la conversación NO existe aún (contacto nuevo), refrescamos la lista
        if (!exists) {
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          return old;
        }

        return old.map((c) =>
          c.id === payload.conversationId
            ? {
                ...c,
                lastMessage: payload.text,
                updatedAt: payload.timestamp,
                unreadCount: payload.sender === "them" ? (c.unreadCount ?? 0) + 1 : 0,
              }
            : c
        );
      });
    });

    // Reset de no leídos (cuando abres la conversación)
    const unsubUpdated = subscribe("conversation_updated", (payload) => {
      queryClient.setQueryData<Conversation[]>(["conversations"], (old = []) =>
        old.map((c) => (c.id === payload.id ? { ...c, unreadCount: payload.unreadCount } : c))
      );
    });

    // Cleanup: des-suscribir ambos al desmontar
    return () => {
      unsubCreated();
      unsubUpdated();
    };
  }, [subscribe, queryClient]);

  return query;
};
