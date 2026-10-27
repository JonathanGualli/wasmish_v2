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
        // La vista previa y el orden solo avanzan con un mensaje más nuevo: uno
        // que llega tarde (un eco de la app de WhatsApp Business, un webhook
        // atrasado) se ve en el hilo, pero no retrocede la bandeja.
        const isNewer = (c: Conversation) => !c.updatedAt || new Date(payload.timestamp) >= new Date(c.updatedAt);
        const updated = old.map((c) =>
          c.id === payload.conversationId 
            ? {
              ...c,
              ...(isNewer(c) && { lastMessage: payload.text, updatedAt: payload.timestamp }),
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

    // Solo los campos que vienen: los no leídos (al abrir la conversación, o un
    // eco de la app) o la vista previa (un borrado o una edición del último
    // mensaje). Sin `unreadCount` no se toca el contador.
    const unsubUpdated = subscribe("conversation_updated", (payload) => {
      queryClient.setQueryData<Conversation[]>(["conversations"], (old = []) =>
        old.map((c) => (c.id === payload.id
          ? {
            ...c,
            ...(payload.unreadCount !== undefined && { unreadCount: payload.unreadCount }),
            ...(payload.lastMessage !== undefined && { lastMessage: payload.lastMessage }),
          }
          : c))
      );
      // Dos avisos de la vista previa cruzados pueden llegar en otro orden; la
      // BD sí queda en el estado final (revisión de Codex del PR #109).
      if (payload.lastMessage !== undefined) refreshList();
    });

    // Un contacto cambió de nombre o de número (o de preferencia de
    // publicidad), uno o muchos a la vez (importar): el título y el teléfono de
    // la bandeja salen de él.
    const unsubContact = subscribe("contact_updated", refreshList);
    const unsubContacts = subscribe("contacts_updated", refreshList);

    // La asignación (Fase 4). Una lectura de la bandeja que ya iba en camino
    // traería la lista de antes del evento y lo desharía (una conversación
    // perdida volvía a aparecer; revisión de Codex del PR #145): se cancela, se
    // aplica el evento y, si se canceló algo, se vuelve a pedir, ya con él.
    const applyToList = async (update: (old: Conversation[]) => Conversation[]) => {
      const wasFetching = queryClient.isFetching({ queryKey: ["conversations"] }) > 0;
      await queryClient.cancelQueries({ queryKey: ["conversations"] });
      queryClient.setQueryData<Conversation[]>(["conversations"], (old = []) => update(old));
      if (wasFetching) refreshList();
    };
    // Cambió de manos y la sigue viendo: la conversación entera, en su sitio (o
    // se pide la lista si no la tenía: la acaba de ganar).
    const unsubAssigned = subscribe("conversation_assigned", (payload) => {
      const known = queryClient.getQueryData<Conversation[]>(["conversations"])?.some((c) => c.id === payload.id);
      if (!known) {
        refreshList();
        return;
      }
      void applyToList((old) => old.map((c) => (c.id === payload.id ? { ...c, ...payload } : c)));
    });
    // La perdió: fuera de la bandeja y fuera de la caché de su hilo.
    const unsubRevoked = subscribe("conversation_revoked", (payload) => {
      void applyToList((old) => old.filter((c) => c.id !== payload.id));
      void queryClient.cancelQueries({ queryKey: ["conversation", payload.id] });
      queryClient.removeQueries({ queryKey: ["conversation", payload.id] });
    });
    const unsubRequested = subscribe("transfer_requested", (payload) => {
      void applyToList((old) => old.map((c) => (c.id === payload.id ? { ...c, transferRequest: payload.transferRequest } : c)));
    });
    // Le quitaron el acceso a alguien y se soltaron sus conversaciones; o a mí
    // me aceptaron una solicitud: la que gané ya me llegó o llega por la lista.
    const unsubReleased = subscribe("conversations_updated", refreshList);
    const unsubAnswered = subscribe("transfer_answered", refreshList);

    // Cleanup: des-suscribir todo al desmontar
    return () => {
      unsubCreated();
      unsubUpdated();
      unsubContact();
      unsubContacts();
      unsubAssigned();
      unsubRevoked();
      unsubRequested();
      unsubReleased();
      unsubAnswered();
    };
  }, [subscribe, queryClient, refreshList]);

  return query;
};
