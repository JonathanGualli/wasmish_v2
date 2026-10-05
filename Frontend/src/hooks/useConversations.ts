import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getConversationsService } from "../services/api.service.ts";
import type { Conversation } from "../models/conversation.mode.ts";
import { useEffect } from "react";
import { useSSE } from "../context/sse.context.ts";
import { useThrottledInvalidate } from "./useThrottledInvalidate.ts";

export const useConversations = () => {
  const queryClient = useQueryClient();
  const { subscribe } = useSSE();

  const query = useQuery<Conversation[]>({
    queryKey: ["conversations"],
    queryFn: getConversationsService,
  });

  // Agrupado: una campaña estrena cientos de conversaciones seguidas, y
  // cada una pedía la bandeja entera otra vez.
  const refreshList = useThrottledInvalidate(["conversations"]);

  useEffect(() => {
    // Mensaje nuevo (entrante o propio) → actualizar la conversación en la lista
    const unsubCreated = subscribe("message_created", (payload) => {
      queryClient.setQueryData<Conversation[]>(["conversations"], (old = []) => {
        const exists = old.some((c) => c.id === payload.conversationId);

        // Si la conversación NO existe aún (contacto nuevo), refrescamos la lista
        if (!exists) {
          refreshList();
          return old;
        }
        const updated = old.map((c) =>
          c.id === payload.conversationId 
            ? {
              ...c,
              lastMessage: payload.text,
              updatedAt: payload.timestamp,
              unreadCount:
                payload.sender === "them"
                  ? payload.unreadCount ?? (c.unreadCount ?? 0) + 1
                  : (c.unreadCount ?? 0),
              // Solo los entrantes traen este campo (el webhook lo calcula).
              // En un mensaje propio llega `undefined` y conservamos el actual:
              // enviar no reabre la ventana, solo un mensaje del contacto.
              windowExpiresAt: payload.windowExpiresAt ?? c.windowExpiresAt,

            }
            : c 
        );

        // El backend ordenra por lastMessageAt desc; replicamos ese orden en vivo
        return [...updated].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
      });
    });

    // Reset de no leídos (cuando abres la conversación)
    const unsubUpdated = subscribe("conversation_updated", (payload) => {
      queryClient.setQueryData<Conversation[]>(["conversations"], (old = []) =>
        old.map((c) => (c.id === payload.id ? { ...c, unreadCount: payload.unreadCount } : c))
      );
    });

    // Un contacto cambió de número (o de preferencia de publicidad): el título
    // y el teléfono de la bandeja salen de él.
    const unsubContact = subscribe("contact_updated", refreshList);

    // Cleanup: des-suscribir todo al desmontar
    return () => {
      unsubCreated();
      unsubUpdated();
      unsubContact();
    };
  }, [subscribe, queryClient, refreshList]);

  return query;
};
