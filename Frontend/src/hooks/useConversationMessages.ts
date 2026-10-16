/* import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { Message } from "../models/message.mode.ts";
import { createSSEConnection, getConversationsMessagesService } from "../services/api.service.ts";
import { useEffect } from "react";

export const useConversationMessages = (conversationId: string) => {

  const queryClient = useQueryClient();

  const { isLoading, isError, error, data, fetchNextPage, hasNextPage } = useInfiniteQuery<{ items: Message[], nextCursor: string | undefined }>({
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

                if (newMessage.temporalId) {
                  const messageExists = oldData.pages.some(page => page.items.some(msg => msg.temporalId === newMessage.temporalId));

                  if (messageExists) {
                    console.log("Message with temporalId already exists, skipping addition:", newMessage.temporalId);
                    return oldData;
                  }
                }


                const newPages = [...oldData.pages];
                newPages[0] = {
                  ...newPages[0],
                  items: [newMessage, ...newPages[0].items],
                };

                return { ...oldData, pages: newPages }
              });
          }

        } catch (error) {
          console.error("Error parsing SSE event data:", error);
        }
      },

      onMessageStatus: (event) => {
        console.log("SSE Status Event received from messages:", event.data);
        try {
          const updatedMessage = JSON.parse(event.data);

          if (updatedMessage.conversationId === conversationId) {
            queryClient.setQueryData<InfiniteData<{ items: Message[], nextCursor: string | undefined }>>(
              ["conversation", conversationId],
              (oldData) => {
                if (!oldData) return oldData;

                const newPages = oldData.pages.map(page => {
                  const newItems = page.items.map(msg => {
                    return msg.id === updatedMessage.id ? { ...msg, ...updatedMessage } : msg
                  });
                  return { ...page, items: newItems };
                });

                return { ...oldData, pages: newPages };
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
    // Con él, un 404 (la conversación ya no es suya) se distingue de un fallo de red.
    error,
    data: data?.pages.flatMap(page => page.items) ?? [],
    fetchNextPage,
    hasNextPage,
  };
};

 */



import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { Message } from "../models/message.mode.ts";
import { getConversationsMessagesService } from "../services/api.service.ts";
import { useEffect } from "react";
import { useSSE } from "../context/sse.context.ts";

/**
 * La primera página con `message` en su sitio por la hora (lo más nuevo,
 * primero), o `null` si es más viejo que toda la página y hay páginas más
 * antiguas: su sitio está en otra página, y si se metiera en esta, al cargar la
 * siguiente (por su cursor) saldría dos veces. Ahí se vuelve a pedir el hilo
 * (revisión de Codex del PR #80).
 */
const insertByTime = (items: Message[], message: Message, hasOlderPages: boolean): Message[] | null => {
  const at = new Date(message.timestamp).getTime();
  const index = items.findIndex(item => new Date(item.timestamp).getTime() <= at);
  if (index === -1) return hasOlderPages ? null : [...items, message];
  return [...items.slice(0, index), message, ...items.slice(index)];
};

export const useConversationMessages = (conversationId: string) => {
  const queryClient = useQueryClient();
  const { subscribe } = useSSE();

  const { isLoading, isError, error, data, fetchNextPage, hasNextPage } = useInfiniteQuery<{ items: Message[], nextCursor: string | undefined }>({
    queryKey: ["conversation", conversationId],
    queryFn: (context) => getConversationsMessagesService(conversationId, context),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    refetchOnWindowFocus: false,
    initialPageParam: '',
    enabled: !!conversationId,
  });

  useEffect(() => {
    if (!conversationId) return; // sin conversación abierta, no hay nada que escuchar

    // Mensaje nuevo en ESTA conversación
    const unsubCreated = subscribe("message_created", (newMessage) => {
      if (newMessage.conversationId !== conversationId) return;
      let refetch = false;

      queryClient.setQueryData<InfiniteData<{ items: Message[], nextCursor: string | undefined }>>(
        ["conversation", conversationId],
        (oldData) => {
          if (!oldData) {
            return { pages: [{ items: [newMessage], nextCursor: undefined }], pageParams: [undefined] };
          }

          // Dedup de UI optimista: si ya lo insertamos por temporalId, no duplicar
          if (newMessage.temporalId) {
            const exists = oldData.pages.some(p => p.items.some(m => m.temporalId === newMessage.temporalId));
            if (exists) return oldData;
          }

          // En su sitio por la hora (lo más nuevo, primero): Meta no garantiza el
          // orden, y lo respondido desde la app de WhatsApp Business puede llegar
          // después de un mensaje más nuevo.
          const hasOlderPages = oldData.pages.length > 1 || Boolean(oldData.pages[0].nextCursor);
          const items = insertByTime(oldData.pages[0].items, newMessage, hasOlderPages);
          if (!items) {
            refetch = true;
            return oldData;
          }
          const newPages = [...oldData.pages];
          newPages[0] = { ...newPages[0], items };
          return { ...oldData, pages: newPages };
        });
      if (refetch) void queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
    });

    // Cambio de estado (sent → delivered → read → failed) de ESTA conversación
    const unsubStatus = subscribe("message_status", (updatedMessage) => {
      if (updatedMessage.conversationId !== conversationId) return;

      queryClient.setQueryData<InfiniteData<{ items: Message[], nextCursor: string | undefined }>>(
        ["conversation", conversationId],
        (oldData) => {
          if (!oldData) return oldData;
          const newPages = oldData.pages.map(page => ({
            ...page,
            items: page.items.map(msg =>
              msg.id === updatedMessage.id ? { ...msg, ...updatedMessage } : msg
            ),
          }));
          return { ...oldData, pages: newPages };
        });
    });

    return () => {
      unsubCreated();
      unsubStatus();
    };
  }, [subscribe, queryClient, conversationId]);

  return {
    isLoading,
    isError,
    // Con él, un 404 (la conversación ya no es suya) se distingue de un fallo de red.
    error,
    data: data?.pages.flatMap(page => page.items) ?? [],
    fetchNextPage,
    hasNextPage,
  };
};
