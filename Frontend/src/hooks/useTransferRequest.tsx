import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthContext } from "../context/auth.context";
import { useSSE } from "../context/sse.context";
import { useNotice } from "../components/Notice/context/useNotice";
import { requestTransferService } from "../services/api.service";
import type { ConversationPerson } from "../models/conversation.mode";
import { assignmentError } from "./useConversationAssignment";

/** Cómo va la solicitud de quien mira para que le pasen una conversación ajena (Fase 4). */
export type TransferRequestState =
    | { status: 'idle' }
    /** `confirmedAt`: cuándo llegó el 202 (antes, todavía en camino). */
    | { status: 'sent'; confirmedAt?: number }
    | { status: 'accepted' | 'rejected'; answeredBy: ConversationPerson };

const IDLE: TransferRequestState = { status: 'idle' };

/** Lo que dice la ficha: si la solicitud pendiente es de quien mira, y cuándo se leyó. */
export interface ServerTransferState {
    requested: boolean;
    fetchedAt: number;
}

/**
 * Lo que se enseña, con lo que dice la ficha (revisión de Codex del PR #146). El
 * aviso de la respuesta llega por el SSE, y si se corta se pierde; otro agente
 * también puede pedirla después y reemplazar la suya. Por eso:
 * - «enviada» vuelve a «sin enviar» si una ficha leída después del 202 ya no la
 *   tiene pendiente (la rechazaron o la reemplazaron);
 * - «sin enviar» pasa a «enviada» si la ficha la tiene pendiente (por ejemplo,
 *   tras recargar la página).
 * Las respuestas que sí llegaron (`accepted`, `rejected`) mandan.
 */
export const reconcileTransferState = (state: TransferRequestState, server?: ServerTransferState): TransferRequestState => {
    if (!server) return state;
    if (state.status === 'idle') return server.requested ? { status: 'sent' } : state;
    if (state.status === 'sent' && state.confirmedAt !== undefined && server.fetchedAt > state.confirmedAt && !server.requested) return IDLE;
    return state;
};

// Fuera del componente: la ficha se puede cerrar con la solicitud enviada, y la
// respuesta llega igual (`useTransferAnswers`). Tampoco en la caché de React
// Query: al reconectar, el SSE la invalida entera y una `queryFn` la devolvía a
// `idle` (revisión de Codex del PR #146). Por persona: otra sesión en la misma
// pestaña no hereda las solicitudes de la anterior.
const states = new Map<string, TransferRequestState>();
const listeners = new Set<() => void>();
const stateKey = (userId: string, conversationId: string) => `${userId}:${conversationId}`;
const readState = (key: string) => states.get(key) ?? IDLE;
const writeState = (key: string, state: TransferRequestState) => {
    states.set(key, state);
    listeners.forEach(listener => listener());
};
const subscribeStates = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

/**
 * Ya la abrió desde un aviso (el de arriba o la campanita): la ficha deja de
 * decir «te pasó la conversación» o «no te la pasó» (revisión de Codex del plan
 * de los avisos, 13).
 */
export const resetTransferState = (userId: string, conversationId: string) =>
    writeState(stateKey(userId, conversationId), IDLE);

/**
 * Pedir que le pasen una conversación que atiende un compañero, desde la ficha,
 * «Conversación nueva» o el chat que ganó otro (diseño, 3a a 3c). Si mientras
 * tanto se quedó sin nadie, o ya es suya, la bandeja y la ficha vuelven a leer.
 */
export const useTransferRequest = (conversationId: string) => {
    const queryClient = useQueryClient();
    const { notify } = useNotice();
    const { user } = useAuthContext();
    const key = stateKey(user?.id ?? '', conversationId);
    const state = useSyncExternalStore(subscribeStates, useCallback(() => readState(key), [key]));

    const request = useMutation({
        mutationFn: () => requestTransferService(conversationId),
        // «Enviada» antes de mandarla: la respuesta (`transfer_answered`) puede
        // llegar antes que el 202, y el 202 no debe pisarla (revisión de Codex
        // del PR #146). Si falla, vuelve a como estaba.
        onMutate: () => {
            const previous = readState(key);
            writeState(key, { status: 'sent' });
            return { previous };
        },
        // Ya confirmada: la ficha vuelve a leer, y desde ahora manda lo que diga.
        onSuccess: () => {
            if (readState(key).status === 'sent') writeState(key, { status: 'sent', confirmedAt: Date.now() });
            void queryClient.invalidateQueries({ queryKey: ['contacts'] });
        },
        onError: (error, _variables, context) => {
            if (context && readState(key).status === 'sent') writeState(key, context.previous);
            const { code, message } = assignmentError(error);
            if (code === 'not_assigned' || code === 'already_yours') {
                void queryClient.invalidateQueries({ queryKey: ['conversations'] });
                void queryClient.invalidateQueries({ queryKey: ['contacts'] });
            }
            // Ya nadie la atiende o ya es suya: no es un fallo, la ficha se pone al día.
            const settled = code === 'not_assigned' || code === 'already_yours';
            notify({ kind: settled ? 'info' : 'error', text: message });
        },
    });

    // Ya la abrió: la próxima vez que se vea la ficha, sin «te pasó la conversación».
    const reset = () => writeState(key, IDLE);

    return { state, request: () => request.mutate(), isPending: request.isPending, reset };
};

/**
 * La respuesta a una solicitud, esté donde esté en Wasmish (diseño de la Fase 4,
 * 3d): el estado de la solicitud para la ficha o el chat que la enseñen. Se
 * monta una vez, en el layout privado. El aviso de arriba ya no lo abre esto:
 * la respuesta llega también como aviso de la campanita (`useNotificationToasts`).
 */
export const useTransferAnswers = () => {
    const queryClient = useQueryClient();
    const { user } = useAuthContext();
    const userId = user?.id ?? '';
    const { subscribe } = useSSE();

    useEffect(() => subscribe("transfer_answered", (payload) => {
        writeState(stateKey(userId, payload.id), { status: payload.accepted ? 'accepted' : 'rejected', answeredBy: payload.answeredBy });
        // La ficha (también la que usa «Conversación nueva») deja de verla ajena.
        if (payload.accepted) void queryClient.invalidateQueries({ queryKey: ['contacts'] });
    }), [subscribe, queryClient, userId]);
};
