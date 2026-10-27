import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthContext } from "../context/auth.context";
import { useSSE } from "../context/sse.context";
import { useNoticeContext } from "../components/Notice/context/UseNoticeContext";
import { requestTransferService } from "../services/api.service";
import type { ChatsNavigationState, ConversationPerson } from "../models/conversation.mode";
import { ChatsPath } from "../models/routes.models";
import { firstName } from "../utils/assignment";
import { assignmentError } from "./useConversationAssignment";

/** Cómo va la solicitud de quien mira para que le pasen una conversación ajena (Fase 4). */
export type TransferRequestState =
    | { status: 'idle' }
    | { status: 'sent' }
    | { status: 'accepted' | 'rejected'; answeredBy: ConversationPerson };

const IDLE: TransferRequestState = { status: 'idle' };

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
 * Pedir que le pasen una conversación que atiende un compañero, desde la ficha,
 * «Conversación nueva» o el chat que ganó otro (diseño, 3a a 3c). Si mientras
 * tanto se quedó sin nadie, o ya es suya, la bandeja y la ficha vuelven a leer.
 */
export const useTransferRequest = (conversationId: string) => {
    const queryClient = useQueryClient();
    const { setState: showNotice, setContent } = useNoticeContext();
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
        onError: (error, _variables, context) => {
            if (context && readState(key).status === 'sent') writeState(key, context.previous);
            const { code, message } = assignmentError(error);
            if (code === 'not_assigned' || code === 'already_yours') {
                void queryClient.invalidateQueries({ queryKey: ['conversations'] });
                void queryClient.invalidateQueries({ queryKey: ['contacts'] });
            }
            setContent(<p className="text-sm text-brand-strong">{message}</p>);
            showNotice(true);
        },
    });

    // Ya la abrió: la próxima vez que se vea la ficha, sin «te pasó la conversación».
    const reset = () => writeState(key, IDLE);

    return { state, request: () => request.mutate(), isPending: request.isPending, reset };
};

/**
 * La respuesta a una solicitud, esté donde esté en Wasmish (diseño, 3d): el
 * aviso global, con «Abrir» si se la pasaron, y el estado de la solicitud para
 * la ficha o el chat que la enseñen. Se monta una vez, en el layout privado.
 */
export const useTransferAnswers = () => {
    const queryClient = useQueryClient();
    const { user } = useAuthContext();
    const userId = user?.id ?? '';
    const { subscribe } = useSSE();
    const { setState: showNotice, setContent } = useNoticeContext();
    const navigate = useNavigate();

    useEffect(() => subscribe("transfer_answered", (payload) => {
        const key = stateKey(userId, payload.id);
        writeState(key, { status: payload.accepted ? 'accepted' : 'rejected', answeredBy: payload.answeredBy });
        // La ficha (también la que usa «Conversación nueva») deja de verla ajena.
        if (payload.accepted) void queryClient.invalidateQueries({ queryKey: ['contacts'] });
        const who = firstName(payload.answeredBy);
        const open = () => {
            showNotice(false);
            writeState(key, IDLE);
            navigate(ChatsPath, { state: { conversationId: payload.id } satisfies ChatsNavigationState });
        };
        setContent(payload.accepted ? (
            <p className="text-sm text-brand-strong pr-6">
                {who} te pasó la conversación con {payload.contactName}.{' '}
                <button type="button" onClick={open}
                    className="font-semibold text-brand-accent-strong hover:underline cursor-pointer">Abrir</button>
            </p>
        ) : (
            <p className="text-sm text-brand-strong pr-6">{who} no te pasó la conversación con {payload.contactName}.</p>
        ));
        showNotice(true);
    }), [subscribe, queryClient, userId, showNotice, setContent, navigate]);
};
