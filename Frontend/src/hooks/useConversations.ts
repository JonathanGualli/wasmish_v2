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

    // Reset de no leídos (al abrir la conversación) y sellado de la ventana por
    // un entrante que no es texto (audio, imagen…), que no genera message_created.
    const unsubUpdated = subscribe("conversation_updated", (payload) => {
      queryClient.setQueryData<Conversation[]>(["conversations"], (old = []) => {
        // Contacto nuevo cuyo primer mensaje fue un adjunto: la conversación ya
        // existe en la BD pero todavía no en la lista.
        if (!old.some((c) => c.id === payload.id)) {
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          return old;
        }
        return old.map((c) =>
          c.id === payload.id
            ? {
              ...c,
              unreadCount: payload.unreadCount,
              // El reset de no leídos no manda este campo: conservamos el actual.
              windowExpiresAt: payload.windowExpiresAt ?? c.windowExpiresAt,
            }
            : c
        );
      });
    });

    // Cleanup: des-suscribir ambos al desmontar
    return () => {
      unsubCreated();
      unsubUpdated();
    };
  }, [subscribe, queryClient]);

  return query;
};
