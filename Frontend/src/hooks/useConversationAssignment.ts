import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import {
    answerTransferService, assignConversationService, getAssigneesService, takeConversationService,
} from "../services/api.service";
import type { Conversation } from "../models/conversation.mode";

type ApiError = AxiosError<{ message: string; code?: string; assignedToName?: string | null }[]>;

/**
 * El código y el texto de un error de la asignación (`assignment_changed`,
 * `transfer_request_changed`…) y, con `assigned_to_other`, quién la atiende.
 */
export const assignmentError = (error: unknown) => {
    const body = (error as ApiError | null)?.response?.data?.[0];
    return {
        code: body?.code ?? null,
        message: body?.message ?? 'No se pudo hacer el cambio. Vuelve a intentarlo.',
        assignedToName: body?.assignedToName ?? null,
    };
};

/**
 * Tomar, asignar y responder solicitudes de una conversación (Fase 4); pedir
 * una ajena es `useTransferRequest`. Lo que
 * devuelve el backend se pone en la bandeja al momento; el SSE lo confirma (y
 * avisa a los demás). `loadAssignees` pide la lista del menú solo al abrirlo.
 */
export const useConversationAssignment = (conversationId: string, { loadAssignees = false } = {}) => {
    const queryClient = useQueryClient();

    const assignees = useQuery({
        queryKey: ['conversation-assignees', conversationId],
        queryFn: () => getAssigneesService(conversationId),
        enabled: loadAssignees && Boolean(conversationId),
        staleTime: 30_000,
    });

    const putInInbox = (updated: Conversation | null) => {
        if (!updated) return;
        queryClient.setQueryData<Conversation[]>(['conversations'], (old = []) =>
            old.map(c => (c.id === updated.id ? { ...c, ...updated } : c)));
    };
    // Si otro la cambió entretanto, la bandeja vuelve a leer cómo está.
    const refreshOnError = () => queryClient.invalidateQueries({ queryKey: ['conversations'] });

    const take = useMutation({
        mutationFn: () => takeConversationService(conversationId),
        onSuccess: putInInbox,
        onError: refreshOnError,
    });
    const assign = useMutation({
        mutationFn: (userId: string | null) => assignConversationService(conversationId, userId),
        onSuccess: putInInbox,
        onError: refreshOnError,
    });
    const answer = useMutation({
        mutationFn: ({ requestId, accept }: { requestId: string; accept: boolean }) =>
            answerTransferService(conversationId, requestId, accept),
        onSuccess: (updated, { accept }) => {
            if (accept) putInInbox(updated);
            else queryClient.setQueryData<Conversation[]>(['conversations'], (old = []) =>
                old.map(c => (c.id === conversationId ? { ...c, transferRequest: null } : c)));
        },
        onError: refreshOnError,
    });

    return { assignees, take, assign, answer };
};
